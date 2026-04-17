import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const expected = (process.env.ADMIN_PASSWORD || "").trim();
  if (!expected) {
    return NextResponse.json({ error: "Admin password not configured" }, { status: 500 });
  }
  const provided = (req.headers.get("x-admin-password") || "").trim();
  if (provided !== expected) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}
