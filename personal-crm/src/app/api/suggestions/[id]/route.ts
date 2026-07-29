import { NextResponse } from "next/server";
import { Prisma, Suggestion } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalizeName } from "@/lib/match";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function contextNote(s: {
  reason: string | null;
  context: string | null;
  sourceNoteTitle: string | null;
}): string {
  const parts: string[] = [];
  if (s.reason) parts.push(s.reason);
  if (s.context) parts.push(`"${s.context}"`);
  if (s.sourceNoteTitle) parts.push(`— from "${s.sourceNoteTitle}"`);
  return parts.join(" ");
}

/** Remember what this mention-name means, so it never has to be asked again. */
async function saveAlias(mentionName: string, contactId: string) {
  const alias = normalizeName(mentionName);
  if (!alias) return;
  await prisma.contactAlias
    .upsert({ where: { alias }, create: { alias, contactId }, update: { contactId } })
    .catch(() => {});
}

/**
 * "This mention IS that existing contact": save the alias, then either
 * dismiss (coworker — nothing to network) or queue the contact and fold the
 * note context into their notes.
 */
async function resolveToContact(suggestion: Suggestion, contactId: string) {
  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  await saveAlias(suggestion.name, contact.id);

  if (contact.isCoworker) {
    await prisma.suggestion.update({
      where: { id: suggestion.id },
      data: { status: "dismissed" },
    });
    return NextResponse.json({ ok: true, coworker: true, contact });
  }

  const note = contextNote(suggestion);
  const updated = await prisma.contact.update({
    where: { id: contact.id },
    data: {
      nextFollowUpAt: new Date(), // due now — clears itself once you talk
      cadenceDays: contact.cadenceDays ?? 30, // default monthly if none set yet
      scheduled: false,
      archivedAt: null, // reaching out revives an archived contact
      notes: contact.notes ? (note ? `${contact.notes}\n\n${note}` : contact.notes) : note || undefined,
    },
  });
  await prisma.suggestion.update({ where: { id: suggestion.id }, data: { status: "accepted" } });
  return NextResponse.json({ ok: true, contact: updated });
}

// POST body:
//   { action: "accept", name?: string }        → create a NEW contact (name editable)
//   { action: "resolve", contactId: string }   → this mention IS an existing contact;
//                                                queues them (unless coworker) + saves alias
//   { action: "dismiss" }                      → drop the suggestion
export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  let body: { action?: string; name?: string; contactId?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const suggestion = await prisma.suggestion.findUnique({ where: { id } });
  if (!suggestion) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (body.action === "dismiss") {
    await prisma.suggestion.update({ where: { id }, data: { status: "dismissed" } });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "resolve") {
    const contactId = body.contactId ?? suggestion.contactId;
    if (!contactId) return NextResponse.json({ error: "contactId required" }, { status: 400 });
    return resolveToContact(suggestion, contactId);
  }

  if (body.action === "accept") {
    // A confidently-linked suggestion accepts into the existing contact.
    if (suggestion.contactId) return resolveToContact(suggestion, suggestion.contactId);

    const name = body.name?.trim() || suggestion.name;
    const howMet = suggestion.sourceNoteTitle
      ? `Mentioned in Granola note: ${suggestion.sourceNoteTitle}`
      : "From Granola notes";
    const contact = await prisma.contact.create({
      data: {
        name,
        cadenceDays: 30, // on a cadence + never contacted → due immediately
        howMet,
        notes: contextNote(suggestion) || undefined,
        tags: "from-granola",
      },
    });
    // Remember the (possibly misspelled) mention name → this new contact.
    await saveAlias(suggestion.name, contact.id);
    if (name !== suggestion.name) await saveAlias(name, contact.id);
    await prisma.suggestion.update({ where: { id }, data: { status: "accepted" } });
    return NextResponse.json({ ok: true, contact });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  try {
    await prisma.suggestion.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw err;
  }
}
