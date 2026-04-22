import { NextRequest, NextResponse } from "next/server";
import { createSuggestion, getAllSuggestions } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const expected = (process.env.ADMIN_PASSWORD || "").trim();
  if (!expected) {
    return NextResponse.json({ error: "Admin password not configured" }, { status: 500 });
  }
  const provided = (req.headers.get("x-admin-password") || "").trim();
  if (provided !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const suggestions = await getAllSuggestions();
  return NextResponse.json(suggestions);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { text, user_name, is_anonymous, page_path } = body;

  if (!text || typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "Missing suggestion text" }, { status: 400 });
  }

  const id = await createSuggestion({
    text: text.trim(),
    user_name: user_name ? String(user_name).trim() : null,
    is_anonymous: !!is_anonymous,
    page_path: typeof page_path === "string" ? page_path : "",
  });

  return NextResponse.json({ id }, { status: 201 });
}
