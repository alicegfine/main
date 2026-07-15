import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { parseContact, ValidationError } from "@/lib/validation";
import { isStatus } from "@/lib/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const status = url.searchParams.get("status")?.trim();
  const tag = url.searchParams.get("tag")?.trim();

  const where: Prisma.ContactWhereInput = {};
  if (status && isStatus(status)) where.status = status;
  if (tag) where.tags = { contains: tag };
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { company: { contains: q } },
      { role: { contains: q } },
      { email: { contains: q } },
      { tags: { contains: q } },
    ];
  }

  const contacts = await prisma.contact.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }],
    include: { _count: { select: { interactions: true } } },
  });

  return NextResponse.json({ contacts });
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const data = parseContact(body, false);
    const contact = await prisma.contact.create({
      data: data as Prisma.ContactCreateInput,
    });
    return NextResponse.json({ contact }, { status: 201 });
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
