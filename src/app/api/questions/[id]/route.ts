import { NextRequest, NextResponse } from "next/server";
import { updateQuestion, deleteQuestion } from "@/lib/db";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  const body = await req.json();
  const data: { text?: string; is_anonymous?: boolean } = {};
  if (typeof body.text === "string") {
    if (!body.text.trim()) {
      return NextResponse.json({ error: "Text required" }, { status: 400 });
    }
    data.text = body.text.trim();
  }
  if (typeof body.is_anonymous === "boolean") {
    data.is_anonymous = body.is_anonymous;
  }
  const question = await updateQuestion(Number(id), data);
  if (!question) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(question);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  await deleteQuestion(Number(id));
  return NextResponse.json({ ok: true });
}
