import { prisma } from "./db";
import { config } from "./env";
import { GranolaPerson, GranolaNote, getNote, listNotesPage } from "./granola";
import { extractFollowUps, extractionEnabled } from "./extract";

export interface SyncResult {
  ok: boolean;
  notesSeen: number;
  notesProcessed: number;
  capped: boolean;
  interactionsCreated: number;
  contactsCreated: number;
  contactsTouched: number;
  suggestionsCreated: number;
  error?: string;
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Pull notes from Granola and fold them into the CRM:
 *  - match each attendee to an existing contact (by email, else by name),
 *  - log a Granola interaction (deduped per contact per note),
 *  - bump the contact's lastContactAt,
 *  - optionally create contacts for attendees you don't have yet.
 */
export async function syncGranola(): Promise<SyncResult> {
  const result: SyncResult = {
    ok: true,
    notesSeen: 0,
    notesProcessed: 0,
    capped: false,
    interactionsCreated: 0,
    contactsCreated: 0,
    contactsTouched: 0,
    suggestionsCreated: 0,
  };

  await prisma.syncState.upsert({
    where: { id: "granola" },
    create: { id: "granola" },
    update: {},
  });

  // Load contacts once and index them for fast matching.
  const contacts = await prisma.contact.findMany({
    select: { id: true, name: true, email: true },
  });
  const byEmail = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const c of contacts) {
    if (c.email) byEmail.set(c.email.toLowerCase(), c.id);
    byName.set(normalizeName(c.name), c.id);
  }

  const configuredOwners = new Set(config.ownerEmails);
  const touched = new Set<string>();
  const cap = config.maxNotesPerSync;
  const maxPages = 40;

  try {
    let cursor: string | undefined;

    pages: for (let page = 0; page < maxPages; page++) {
      const pageRes = await listNotesPage(cursor);

      for (const listItem of pageRes.notes) {
        result.notesSeen++;

        // Skip notes already handled — keeps re-syncs cheap and lets repeated
        // runs walk back through history a chunk at a time.
        const done = await prisma.processedNote.findUnique({
          where: { noteId: listItem.id },
          select: { noteId: true },
        });
        if (done) continue;

        // Cap work per run so a first sync of a big account can't run for ages.
        if (result.notesProcessed >= cap) {
          result.capped = true;
          break pages;
        }
        result.notesProcessed++;

        // The list endpoint returns only basic fields — attendees and the
        // summary come only from the per-note detail.
        const detail = await getNote(listItem.id);
        const note = detail ?? listItem;

        await processNote(note, {
          byEmail,
          byName,
          configuredOwners,
          touched,
          result,
        });

        // Extraction runs alongside import when enabled; extractedAt stays
        // null when disabled (or on failure) so a later sync can backfill.
        let extractedAt: Date | null = null;
        if (extractionEnabled()) {
          const ok = note.summary ? await runExtraction(note, byName, result) : true;
          if (ok) extractedAt = new Date();
        }

        // Only mark handled if the detail fetch actually succeeded, so a
        // transient failure retries on the next sync instead of being skipped.
        if (detail) {
          await prisma.processedNote
            .create({ data: { noteId: note.id, extractedAt } })
            .catch(() => {});
        }
      }

      if (!pageRes.hasMore || !pageRes.cursor) break;
      cursor = pageRes.cursor;
    }

    // Backfill: notes imported before ANTHROPIC_API_KEY was set were never
    // extracted. Run them through extraction now, a bounded chunk per sync.
    if (extractionEnabled()) {
      const pending = await prisma.processedNote.findMany({
        where: { extractedAt: null },
        orderBy: { createdAt: "desc" },
        take: cap,
      });
      for (const pn of pending) {
        const d = await getNote(pn.noteId);
        if (!d) continue;
        const ok = d.summary ? await runExtraction(d, byName, result) : true;
        if (ok) {
          await prisma.processedNote.update({
            where: { noteId: pn.noteId },
            data: { extractedAt: new Date() },
          });
        }
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.syncState.update({
      where: { id: "granola" },
      data: { lastError: message },
    });
    return { ...result, ok: false, error: message };
  }

  result.contactsTouched = touched.size;

  await prisma.syncState.update({
    where: { id: "granola" },
    data: { lastSyncAt: new Date(), lastError: null },
  });

  return result;
}

interface ProcessCtx {
  byEmail: Map<string, string>;
  byName: Map<string, string>;
  configuredOwners: Set<string>;
  touched: Set<string>;
  result: SyncResult;
}

async function processNote(note: GranolaNote, ctx: ProcessCtx): Promise<void> {
  const { byEmail, byName, configuredOwners, touched, result } = ctx;

  // Never turn yourself into a contact: skip the note owner + configured emails.
  const owners = new Set(configuredOwners);
  if (note.owner?.email) owners.add(note.owner.email.toLowerCase());

  for (const attendee of note.attendees) {
    const email = attendee.email?.toLowerCase() ?? null;
    if (email && owners.has(email)) continue;

    let contactId = matchAttendee(attendee, byEmail, byName);

    if (!contactId) {
      if (!config.granolaAutoCreateContacts) continue;
      if (!attendee.name && !attendee.email) continue;
      // People at your own org are coworkers, not networking targets.
      const domain = attendee.email?.toLowerCase().split("@")[1];
      const isCoworker = Boolean(domain && config.coworkerDomains.includes(domain));
      const created = await prisma.contact.create({
        data: {
          name: attendee.name ?? attendee.email ?? "Unknown",
          email: attendee.email ?? undefined,
          status: "connected",
          isCoworker,
          howMet: `Met via Granola: ${note.title}`,
          lastContactAt: note.occurredAt,
        },
        select: { id: true },
      });
      contactId = created.id;
      if (attendee.email) byEmail.set(attendee.email.toLowerCase(), contactId);
      if (attendee.name) byName.set(normalizeName(attendee.name), contactId);
      result.contactsCreated++;
    }

    // Dedupe: one interaction per (contact, note).
    const existing = await prisma.interaction.findUnique({
      where: { contactId_granolaNoteId: { contactId, granolaNoteId: note.id } },
      select: { id: true },
    });
    if (existing) continue;

    await prisma.interaction.create({
      data: {
        contactId,
        channel: "granola",
        occurredAt: note.occurredAt,
        summary: buildSummary(note),
        granolaNoteId: note.id,
        granolaUrl: note.url ?? undefined,
      },
    });
    result.interactionsCreated++;

    await prisma.contact.updateMany({
      where: {
        id: contactId,
        OR: [{ lastContactAt: null }, { lastContactAt: { lt: note.occurredAt } }],
      },
      data: { lastContactAt: note.occurredAt },
    });
    touched.add(contactId);
  }
}

/**
 * AI: surface people the note says to reach out to (mentions, not attendees)
 * as pending Suggestions. Skips attendees and existing contacts by name.
 * Returns false when the model call failed, so the note retries next sync.
 */
async function runExtraction(
  note: GranolaNote,
  byName: Map<string, string>,
  result: SyncResult,
): Promise<boolean> {
  const attendeeNames = new Set(
    note.attendees.map((a) => (a.name ? normalizeName(a.name) : "")).filter(Boolean),
  );
  let failed = false;
  const people = await extractFollowUps(note).catch((err) => {
    console.error("[sync] extraction failed", err);
    failed = true;
    return [];
  });
  for (const p of people) {
    const key = normalizeName(p.name);
    if (attendeeNames.has(key) || byName.has(key)) continue; // already known
    try {
      await prisma.suggestion.create({
        data: {
          name: p.name,
          reason: p.reason || undefined,
          sourceNoteId: note.id,
          sourceNoteTitle: note.title,
          sourceUrl: note.url ?? undefined,
        },
      });
      result.suggestionsCreated++;
    } catch {
      // @@unique([sourceNoteId, name]) — already suggested; ignore
    }
  }
  return !failed;
}

function matchAttendee(
  attendee: GranolaPerson,
  byEmail: Map<string, string>,
  byName: Map<string, string>,
): string | undefined {
  if (attendee.email) {
    const hit = byEmail.get(attendee.email.toLowerCase());
    if (hit) return hit;
  }
  if (attendee.name) {
    const hit = byName.get(normalizeName(attendee.name));
    if (hit) return hit;
  }
  return undefined;
}

function buildSummary(note: GranolaNote): string {
  const parts = [note.title];
  if (note.summary) {
    // Keep the summary reasonably short in the log; full note lives in Granola.
    const trimmed = note.summary.trim();
    parts.push(trimmed.length > 1200 ? `${trimmed.slice(0, 1200)}…` : trimmed);
  }
  return parts.join("\n\n");
}
