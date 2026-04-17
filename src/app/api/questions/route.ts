import { NextRequest, NextResponse } from "next/server";
import { getAllQuestions, createQuestion } from "@/lib/db";

export async function GET(req: NextRequest) {
  const team = req.nextUrl.searchParams.get("team") || undefined;
  const questions = await getAllQuestions(team);
  return NextResponse.json(questions);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { team, text, user_name, is_anonymous } = body;
  if (!team || !text || !text.trim()) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  const id = await createQuestion({
    team,
    text: text.trim(),
    user_name: user_name || null,
    is_anonymous: !!is_anonymous,
  });
  return NextResponse.json({ id }, { status: 201 });
}
