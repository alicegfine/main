import { prisma } from "./db";
import { config } from "./env";
import { GranolaPerson, GranolaNote, getNote, listNotes } from "./granola";
import { extractFollowUps, extractionEnabled } from "./extract";

export interface SyncResult {
  ok: boolean;
  notesSeen: number;
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
    interactionsCreated: 0,
    contactsCreated: 0,
    contactsTouched: 0,
    suggestionsCreated: 0,
  };

  const state = await prisma.syncState.upsert({
    where: { id: "granola" },
    create: { id: "granola" },
    update: {},
  });

  // state.lastSyncAt is kept for bookkeeping/UI; we dedupe by note id rather
  // than server-side filtering, so re-fetching recent notes is harmless.
  void state;

  let notes: GranolaNote[];
  try {
    notes = await listNotes();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.syncState.update({
      where: { id: "granola" },
      data: { lastError: message },
    });
    return { ...result, ok: false, error: message };
  }

  result.notesSeen = notes.length;

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

  for (const note of notes) {
    // The list endpoint sometimes omits attendees; fall back to note detail.
    let attendees = note.attendees;
    let owner = note.owner;
    if (attendees.length === 0) {
      const detail = await getNote(note.id);
      if (detail) {
        attendees = detail.attendees;
        owner = detail.owner ?? owner;
      }
    }

    // Never turn yourself into a contact: skip the note owner + configured emails.
    const owners = new Set(configuredOwners);
    if (owner?.email) owners.add(owner.email.toLowerCase());

    for (const attendee of attendees) {
      const email = attendee.email?.toLowerCase() ?? null;
      if (email && owners.has(email)) continue;

      let contactId = matchAttendee(attendee, byEmail, byName);

      if (!contactId) {
        if (!config.granolaAutoCreateContacts) continue;
        if (!attendee.name && !attendee.email) continue;
        const created = await prisma.contact.create({
          data: {
            name: attendee.name ?? attendee.email ?? "Unknown",
            email: attendee.email ?? undefined,
            status: "connected",
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
        where: {
          contactId_granolaNoteId: {
            contactId,
            granolaNoteId: note.id,
          },
        },
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

      // Bump lastContactAt if this note is newer than what we have.
      await prisma.contact.updateMany({
        where: {
          id: contactId,
          OR: [{ lastContactAt: null }, { lastContactAt: { lt: note.occurredAt } }],
        },
        data: { lastContactAt: note.occurredAt },
      });
      touched.add(contactId);
    }

    // AI: surface people the note says to reach out to (mentions, not attendees).
    if (extractionEnabled() && note.summary) {
      const already = await prisma.processedNote.findUnique({
        where: { noteId: note.id },
        select: { noteId: true },
      });
      if (!already) {
        const attendeeNames = new Set(
          attendees.map((a) => (a.name ? normalizeName(a.name) : "")).filter(Boolean),
        );
        const people = await extractFollowUps(note).catch((err) => {
          console.error("[sync] extraction failed", err);
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
        await prisma.processedNote.create({ data: { noteId: note.id } }).catch(() => {});
      }
    }
  }

  result.contactsTouched = touched.size;

  await prisma.syncState.update({
    where: { id: "granola" },
    data: { lastSyncAt: new Date(), lastError: null },
  });

  return result;
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
