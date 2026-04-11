import { NextRequest, NextResponse } from "next/server";
import { addComment } from "@/lib/db";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  const body = await req.json();
  const { user_name, text } = body;

  if (!user_name || !text) {
    return NextResponse.json({ error: "user_name and text are required" }, { status: 400 });
  }

  const commentId = await addComment("idea", Number(id), user_name, text);
  return NextResponse.json({ id: commentId }, { status: 201 });
}
