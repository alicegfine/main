import { NextRequest, NextResponse } from "next/server";
import { getAgenda, updateAgenda } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const agenda = await getAgenda();
  return NextResponse.json(agenda);
}

export async function PUT(req: NextRequest) {
  const expected = (process.env.ADMIN_PASSWORD || "").trim();
  if (!expected) {
    return NextResponse.json({ error: "Admin password not configured" }, { status: 500 });
  }
  const provided = (req.headers.get("x-admin-password") || "").trim();
  if (provided !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  const { content } = body;
  if (!Array.isArray(content)) {
    return NextResponse.json({ error: "Content must be an array" }, { status: 400 });
  }
  const updated = await updateAgenda(content);
  return NextResponse.json(updated);
}
