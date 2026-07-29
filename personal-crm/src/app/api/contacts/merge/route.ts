import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { normalizeName } from "@/lib/match";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { keepId: string, mergeIds: string[] }
// Folds each mergeId contact into keepId: moves interactions (deduping
// per-note entries), fills the keeper's empty fields, unions tags, remaps
// suggestions, saves the merged names as aliases of the keeper (so extraction
// learns from the cleanup), then deletes the merged contacts.
export async function POST(req: Request) {
  let body: { keepId?: string; mergeIds?: string[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const keepId = body.keepId ?? "";
  const mergeIds = (body.mergeIds ?? []).filter((id) => id && id !== keepId);
  if (!keepId || mergeIds.length === 0) {
    return NextResponse.json({ error: "keepId and mergeIds required" }, { status: 400 });
  }

  const keeper = await prisma.contact.findUnique({ where: { id: keepId } });
  if (!keeper) return NextResponse.json({ error: "Keeper not found" }, { status: 404 });

  let merged = 0;
  const fill: Record<string, unknown> = {};
  const notesParts: string[] = keeper.notes ? [keeper.notes] : [];
  const tagSet = new Set(
    (keeper.tags ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
  );
  let isCoworker = keeper.isCoworker;
  let lastContactAt = keeper.lastContactAt;

  for (const mergeId of mergeIds) {
    const victim = await prisma.contact.findUnique({
      where: { id: mergeId },
      include: { interactions: true },
    });
    if (!victim) continue;

    // Move interactions; per-note Granola entries are unique per contact, so
    // drop the duplicate when the keeper already logged the same note.
    for (const i of victim.interactions) {
      if (i.granolaNoteId) {
        const clash = await prisma.interaction.findUnique({
          where: {
            contactId_granolaNoteId: { contactId: keepId, granolaNoteId: i.granolaNoteId },
          },
          select: { id: true },
        });
        if (clash) {
          await prisma.interaction.delete({ where: { id: i.id } });
          continue;
        }
      }
      await prisma.interaction.update({ where: { id: i.id }, data: { contactId: keepId } });
    }

    // Point suggestions and learned aliases at the keeper.
    await prisma.suggestion.updateMany({
      where: { contactId: mergeId },
      data: { contactId: keepId },
    });
    await prisma.contactAlias.updateMany({
      where: { contactId: mergeId },
      data: { contactId: keepId },
    });
    // The merged contact's name becomes an alias of the keeper — extraction
    // learns from the cleanup (e.g. the misspelled variant).
    const alias = normalizeName(victim.name);
    if (alias && alias !== normalizeName(keeper.name)) {
      await prisma.contactAlias
        .upsert({ where: { alias }, create: { alias, contactId: keepId }, update: { contactId: keepId } })
        .catch(() => {});
    }

    // Fill the keeper's gaps from the merged contact.
    if (!keeper.email && victim.email && !fill.email) fill.email = victim.email;
    if (!keeper.company && victim.company && !fill.company) fill.company = victim.company;
    if (!keeper.role && victim.role && !fill.role) fill.role = victim.role;
    if (!keeper.linkedinUrl && victim.linkedinUrl && !fill.linkedinUrl) fill.linkedinUrl = victim.linkedinUrl;
    if (!keeper.howMet && victim.howMet && !fill.howMet) fill.howMet = victim.howMet;
    if (victim.notes && !notesParts.includes(victim.notes)) notesParts.push(victim.notes);
    for (const t of (victim.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean)) tagSet.add(t);
    isCoworker = isCoworker || victim.isCoworker;
    if (victim.lastContactAt && (!lastContactAt || victim.lastContactAt > lastContactAt)) {
      lastContactAt = victim.lastContactAt;
    }

    await prisma.contact.delete({ where: { id: mergeId } });
    merged++;
  }

  const contact = await prisma.contact.update({
    where: { id: keepId },
    data: {
      ...fill,
      notes: notesParts.length > 0 ? notesParts.join("\n\n") : undefined,
      tags: tagSet.size > 0 ? [...tagSet].join(", ") : undefined,
      isCoworker,
      lastContactAt,
    },
  });

  return NextResponse.json({ ok: true, merged, contact });
}
