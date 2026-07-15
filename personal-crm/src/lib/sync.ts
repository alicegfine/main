import { prisma } from "./db";
import { config } from "./env";
import { GranolaAttendee, GranolaNote, listNotes } from "./granola";

export interface SyncResult {
  ok: boolean;
  notesSeen: number;
  interactionsCreated: number;
  contactsCreated: number;
  contactsTouched: number;
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
  };

  const state = await prisma.syncState.upsert({
    where: { id: "granola" },
    create: { id: "granola" },
    update: {},
  });

  let notes: GranolaNote[];
  try {
    notes = await listNotes({ since: state.lastSyncAt ?? null });
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

  const owners = new Set(config.ownerEmails);
  const touched = new Set<string>();

  for (const note of notes) {
    for (const attendee of note.attendees) {
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
  }

  result.contactsTouched = touched.size;

  await prisma.syncState.update({
    where: { id: "granola" },
    data: { lastSyncAt: new Date(), lastError: null },
  });

  return result;
}

function matchAttendee(
  attendee: GranolaAttendee,
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
