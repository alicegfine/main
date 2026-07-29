import { prisma } from "./db";
import { config } from "./env";
import { GranolaPerson, GranolaNote, getNote, listNotesPage } from "./granola";
import { extractFollowUps, extractionEnabled } from "./extract";
import { matchName, normalizeName } from "./match";
import { coveredByCadence } from "./cadence";

export interface SyncResult {
  ok: boolean;
  notesSeen: number;
  notesProcessed: number;
  capped: boolean;
  interactionsCreated: number;
  contactsCreated: number;
  contactsTouched: number;
  suggestionsCreated: number;
  /** Whether AI extraction ran at all (ANTHROPIC_API_KEY present). */
  extractionEnabled: boolean;
  /** Model calls that errored this run (bad key, no credits, timeout…). */
  extractionFailures: number;
  /** Notes still awaiting extraction after this run (backfill continues next sync). */
  extractionPending: number;
  /** One-time repair: stale "reach out now" dates dropped in favour of cadence. */
  staleQueuesCleared: number;
  error?: string;
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
    extractionEnabled: extractionEnabled(),
    extractionFailures: 0,
    extractionPending: 0,
    staleQueuesCleared: 0,
  };

  await prisma.syncState.upsert({
    where: { id: "granola" },
    create: { id: "granola" },
    update: {},
  });

  await migrateLegacyQueue(result);

  // Load contacts once and index them for fast matching.
  const contacts = await prisma.contact.findMany({
    select: { id: true, name: true, email: true, isCoworker: true, nextFollowUpAt: true },
  });
  const byEmail = new Map<string, string>();
  const byName = new Map<string, string>();
  const matchables: SyncContact[] = [];
  const byId = new Map<string, SyncContact>();
  for (const c of contacts) {
    if (c.email) byEmail.set(c.email.toLowerCase(), c.id);
    byName.set(normalizeName(c.name), c.id);
    const sc: SyncContact = {
      id: c.id,
      name: c.name,
      email: c.email,
      isCoworker: c.isCoworker,
      queued: c.nextFollowUpAt !== null,
    };
    matchables.push(sc);
    byId.set(c.id, sc);
  }

  // Learned aliases + already-pending suggestions, so extraction never
  // re-suggests someone already resolved or already awaiting review.
  const aliasRows = await prisma.contactAlias.findMany();
  const aliasMap = new Map(aliasRows.map((a) => [a.alias, a.contactId]));
  const pendingRows = await prisma.suggestion.findMany({
    where: { status: "pending" },
    select: { name: true, contactId: true },
  });
  const pendingNames = new Set(pendingRows.map((s) => normalizeName(s.name)));
  const pendingContactIds = new Set(
    pendingRows.map((s) => s.contactId).filter((id): id is string => Boolean(id)),
  );

  const extractCtx: ExtractCtx = { matchables, byId, aliasMap, pendingNames, pendingContactIds };

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
          matchables,
          byId,
          configuredOwners,
          touched,
          result,
        });

        // Extraction runs alongside import when enabled; extractedAt stays
        // null when disabled (or on failure) so a later sync can backfill.
        let extractedAt: Date | null = null;
        if (extractionEnabled()) {
          const ok = note.summary ? await runExtraction(note, extractCtx, result) : true;
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
        const ok = d.summary ? await runExtraction(d, extractCtx, result) : true;
        if (ok) {
          await prisma.processedNote.update({
            where: { noteId: pn.noteId },
            data: { extractedAt: new Date() },
          });
        }
      }
      result.extractionPending = await prisma.processedNote.count({
        where: { extractedAt: null },
      });
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

const STALE_QUEUE_REPAIR_ID = "repair_stale_queues_v1";

/**
 * Legacy pipeline cleanup, plus a one-time repair for the bug where a
 * system-generated "reach out now" date was stamped on people whose cadence
 * already had them covered (so a quarterly contact you spoke to last week
 * showed as due today).
 */
async function migrateLegacyQueue(result: SyncResult): Promise<void> {
  const now = new Date();

  // Old status pipeline → cadence model. Only queue people the cadence isn't
  // already covering; the rest just get their legacy status retired.
  const legacy = await prisma.contact.findMany({
    where: { status: "to_reach_out", nextFollowUpAt: null, archivedAt: null },
  });
  for (const c of legacy) {
    await prisma.contact.update({
      where: { id: c.id },
      data: {
        status: "migrated",
        ...(coveredByCadence(c, now) ? {} : { nextFollowUpAt: now }),
      },
    });
  }

  // One-time repair (marked in SyncState so it never fights a queue date you
  // set deliberately later): drop past-due queued dates where the cadence says
  // the person was contacted recently enough.
  const done = await prisma.syncState.findUnique({ where: { id: STALE_QUEUE_REPAIR_ID } });
  if (!done) {
    const queued = await prisma.contact.findMany({
      where: { nextFollowUpAt: { not: null, lte: now }, archivedAt: null },
    });
    const stale = queued.filter((c) => coveredByCadence(c, now));
    if (stale.length > 0) {
      await prisma.contact.updateMany({
        where: { id: { in: stale.map((c) => c.id) } },
        data: { nextFollowUpAt: null },
      });
    }
    await prisma.syncState.create({ data: { id: STALE_QUEUE_REPAIR_ID } }).catch(() => {});
    result.staleQueuesCleared = stale.length;
  }
}

/** Contact fields the sync needs for matching and coworker checks. */
interface SyncContact {
  id: string;
  name: string;
  email: string | null;
  isCoworker: boolean;
  /** Already queued for outreach (manual follow-up date set). */
  queued: boolean;
}

interface ProcessCtx {
  byEmail: Map<string, string>;
  byName: Map<string, string>;
  matchables: SyncContact[];
  byId: Map<string, SyncContact>;
  configuredOwners: Set<string>;
  touched: Set<string>;
  result: SyncResult;
}

interface ExtractCtx {
  matchables: SyncContact[];
  byId: Map<string, SyncContact>;
  aliasMap: Map<string, string>;
  pendingNames: Set<string>;
  pendingContactIds: Set<string>;
}

async function processNote(note: GranolaNote, ctx: ProcessCtx): Promise<void> {
  const { byEmail, byName, matchables, byId, configuredOwners, touched, result } = ctx;

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
          isCoworker,
          howMet: `Met via Granola: ${note.title}`,
          lastContactAt: note.occurredAt,
        },
        select: { id: true },
      });
      contactId = created.id;
      if (attendee.email) byEmail.set(attendee.email.toLowerCase(), contactId);
      if (attendee.name) byName.set(normalizeName(attendee.name), contactId);
      const sc: SyncContact = {
        id: contactId,
        name: attendee.name ?? attendee.email ?? "Unknown",
        email: attendee.email ?? null,
        isCoworker,
        queued: false,
      };
      matchables.push(sc);
      byId.set(contactId, sc);
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

    // A fresh meeting restarts the cadence loop: bump lastContactAt, clear
    // the "scheduled" snooze, and consume any queued follow-up date now met.
    await prisma.contact.updateMany({
      where: {
        id: contactId,
        OR: [{ lastContactAt: null }, { lastContactAt: { lt: note.occurredAt } }],
      },
      data: { lastContactAt: note.occurredAt, scheduled: false, snoozedUntil: null },
    });
    await prisma.contact.updateMany({
      where: { id: contactId, nextFollowUpAt: { lte: new Date() } },
      data: { nextFollowUpAt: null },
    });
    touched.add(contactId);
  }
}

/**
 * AI: surface people the note says to reach out to (mentions, not attendees)
 * as pending Suggestions. Matching policy:
 *  - a saved alias or an exact multi-token full-name match resolves
 *    automatically (coworkers are skipped silently, others link to the
 *    existing contact — no duplicate is ever created);
 *  - first-name-only or fuzzy matches are NEVER auto-resolved — the
 *    suggestion carries the candidate contacts and the user picks (there may
 *    be several Lesleys); the pick is saved as an alias for next time;
 *  - no match at all → a plain new-person suggestion.
 * Returns false when the model call failed, so the note retries next sync.
 */
async function runExtraction(
  note: GranolaNote,
  ctx: ExtractCtx,
  result: SyncResult,
): Promise<boolean> {
  const { matchables, byId, aliasMap, pendingNames, pendingContactIds } = ctx;
  const attendeeNames = new Set(
    note.attendees.map((a) => (a.name ? normalizeName(a.name) : "")).filter(Boolean),
  );
  let failed = false;
  const people = await extractFollowUps(note).catch((err) => {
    console.error("[sync] extraction failed", err);
    result.extractionFailures++;
    failed = true;
    return [];
  });

  const createSuggestion = async (data: {
    name: string;
    contactId?: string;
    candidates?: string[];
    reason: string;
    context: string;
  }) => {
    try {
      await prisma.suggestion.create({
        data: {
          name: data.name,
          reason: data.reason || undefined,
          context: data.context || undefined,
          contactId: data.contactId,
          candidates:
            data.candidates && data.candidates.length > 0
              ? JSON.stringify(data.candidates)
              : undefined,
          sourceNoteId: note.id,
          sourceNoteTitle: note.title,
          sourceUrl: note.url ?? undefined,
        },
      });
      result.suggestionsCreated++;
      pendingNames.add(normalizeName(data.name));
      if (data.contactId) pendingContactIds.add(data.contactId);
    } catch {
      // @@unique([sourceNoteId, name]) — already suggested from this note; ignore
    }
  };

  for (const p of people) {
    const key = normalizeName(p.name);
    if (!key || attendeeNames.has(key)) continue;

    // 1. Saved alias — the user already told us who this name means.
    const aliasedId = aliasMap.get(key);
    const aliased = aliasedId ? byId.get(aliasedId) : undefined;
    if (aliased) {
      if (aliased.isCoworker) continue; // known coworker mention — drop silently
      if (aliased.queued || pendingContactIds.has(aliased.id)) continue;
      await createSuggestion({
        name: aliased.name,
        contactId: aliased.id,
        reason: p.reason,
        context: p.context,
      });
      continue;
    }

    // 2. Exact multi-token full-name match to exactly one contact — confident.
    const { exact, candidates } = matchName(p.name, matchables);
    if (exact) {
      if (exact.isCoworker) continue;
      if (exact.queued || pendingContactIds.has(exact.id)) continue;
      await createSuggestion({
        name: exact.name,
        contactId: exact.id,
        reason: p.reason,
        context: p.context,
      });
      continue;
    }

    // 3. Ambiguous (first-name-only / fuzzy) — surface candidates, user picks.
    if (pendingNames.has(key)) continue; // already awaiting review under this name
    await createSuggestion({
      name: p.name,
      candidates: candidates.map((c) => c.id),
      reason: p.reason,
      context: p.context,
    });
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
