import { NextRequest, NextResponse } from "next/server";
import { deleteSuggestion } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const expected = (process.env.ADMIN_PASSWORD || "").trim();
  if (!expected) {
    return NextResponse.json({ error: "Admin password not configured" }, { status: 500 });
  }
  const provided = (req.headers.get("x-admin-password") || "").trim();
  if (provided !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await deleteSuggestion(Number(params.id));
  return NextResponse.json({ ok: true });
}
