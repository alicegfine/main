import { NextRequest, NextResponse } from "next/server";
import { toggleUpvote } from "@/lib/db";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const { user_name } = body;

  if (!user_name) {
    return NextResponse.json({ error: "user_name is required" }, { status: 400 });
  }

  const upvoted = toggleUpvote("session", Number(id), user_name);
  return NextResponse.json({ upvoted });
}
