import { NextRequest, NextResponse } from "next/server";
import { getNorms, updateNorms } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const norms = await getNorms();
  return NextResponse.json(norms);
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
  const content = typeof body.content === "string" ? body.content : "";
  const updated = await updateNorms(content);
  return NextResponse.json(updated);
}
