import { NextRequest, NextResponse } from "next/server";
import { getIdea, deleteIdea } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const idea = getIdea(Number(id));
  if (!idea) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(idea);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  deleteIdea(Number(id));
  return NextResponse.json({ ok: true });
}
