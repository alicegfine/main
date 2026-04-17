import { NextRequest, NextResponse } from "next/server";
import { updateComment, deleteComment } from "@/lib/db";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  const body = await req.json();
  const { text } = body;
  if (!text || !text.trim()) {
    return NextResponse.json({ error: "Text required" }, { status: 400 });
  }
  const comment = await updateComment(Number(id), text.trim());
  if (!comment) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(comment);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  await deleteComment(Number(id));
  return NextResponse.json({ ok: true });
}
