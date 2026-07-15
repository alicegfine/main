import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// POST { action: "accept" | "dismiss" }
// accept → create a "to reach out" contact from the suggestion and mark accepted.
// dismiss → mark dismissed.
export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  let action = "";
  try {
    const body = (await req.json()) as { action?: string };
    action = body.action ?? "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const suggestion = await prisma.suggestion.findUnique({ where: { id } });
  if (!suggestion) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (action === "dismiss") {
    await prisma.suggestion.update({ where: { id }, data: { status: "dismissed" } });
    return NextResponse.json({ ok: true });
  }

  if (action === "accept") {
    const howMet = suggestion.sourceNoteTitle
      ? `Mentioned in Granola note: ${suggestion.sourceNoteTitle}`
      : "From Granola notes";
    const contact = await prisma.contact.create({
      data: {
        name: suggestion.name,
        status: "to_reach_out",
        howMet,
        notes: suggestion.reason ?? undefined,
        tags: "from-granola",
      },
    });
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
