import { NextRequest, NextResponse } from "next/server";
import { scheduleIdea } from "@/lib/db";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  const body = await req.json();
  const { room, start_time, duration_minutes, scheduled_by } = body;

  if (!room || !start_time || !duration_minutes || !scheduled_by) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const sessionId = scheduleIdea(Number(id), room, start_time, Number(duration_minutes), scheduled_by);
  if (!sessionId) return NextResponse.json({ error: "Idea not found" }, { status: 404 });

  return NextResponse.json({ session_id: sessionId }, { status: 201 });
}
