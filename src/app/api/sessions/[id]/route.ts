import { NextRequest, NextResponse } from "next/server";
import { getSession, updateSession, deleteSession } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  const session = await getSession(Number(id));
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(session);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  const body = await req.json();
  const { edited_by, ...data } = body;

  if (!edited_by) {
    return NextResponse.json({ error: "edited_by is required" }, { status: 400 });
  }

  const session = await updateSession(Number(id), data, edited_by);
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(session);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  await deleteSession(Number(id));
  return NextResponse.json({ ok: true });
}
