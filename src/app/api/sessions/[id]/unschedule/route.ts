import { NextRequest, NextResponse } from "next/server";
import { unscheduleSession } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const ideaId = await unscheduleSession(Number(params.id));
  if (!ideaId) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  return NextResponse.json({ idea_id: ideaId });
}
