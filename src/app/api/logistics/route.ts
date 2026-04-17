import { NextRequest, NextResponse } from "next/server";
import { getLogistics, updateLogistics } from "@/lib/db";

export async function GET() {
  const logistics = await getLogistics();
  return NextResponse.json(logistics);
}

export async function PUT(req: NextRequest) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    return NextResponse.json({ error: "Admin password not configured" }, { status: 500 });
  }
  const provided = req.headers.get("x-admin-password");
  if (provided !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  const { content } = body;
  if (typeof content !== "string") {
    return NextResponse.json({ error: "Content required" }, { status: 400 });
  }
  const updated = await updateLogistics(content);
  return NextResponse.json(updated);
}
