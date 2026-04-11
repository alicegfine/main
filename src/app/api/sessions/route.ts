import { NextRequest, NextResponse } from "next/server";
import { getAllSessions, createSession } from "@/lib/db";

export async function GET() {
  const sessions = getAllSessions();
  return NextResponse.json(sessions);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { title, description, speaker, room, start_time, duration_minutes, created_by } = body;

  if (!title || !speaker || !room || !start_time || !duration_minutes || !created_by) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const id = createSession({
    title,
    description: description || "",
    speaker,
    room,
    start_time,
    duration_minutes: Number(duration_minutes),
    created_by,
  });

  return NextResponse.json({ id }, { status: 201 });
}
