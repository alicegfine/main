import { NextRequest, NextResponse } from "next/server";
import { getIdea, updateIdea, deleteIdea } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  const idea = await getIdea(Number(id));
  if (!idea) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(idea);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  const body = await req.json();
  const idea = await updateIdea(Number(id), body);
  if (!idea) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(idea);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  await deleteIdea(Number(id));
  return NextResponse.json({ ok: true });
}
