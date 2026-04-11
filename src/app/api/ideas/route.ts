import { NextRequest, NextResponse } from "next/server";
import { getAllIdeas, createIdea } from "@/lib/db";

export async function GET() {
  const ideas = getAllIdeas();
  return NextResponse.json(ideas);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { title, description, proposed_by } = body;

  if (!title || !proposed_by) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const id = createIdea({
    title,
    description: description || "",
    proposed_by,
  });

  return NextResponse.json({ id }, { status: 201 });
}
