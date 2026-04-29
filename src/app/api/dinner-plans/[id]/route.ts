import { NextRequest, NextResponse } from "next/server";
import { updateDinnerPlan, deleteDinnerPlan } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const data: { restaurant_name?: string; notes?: string } = {};
  if (typeof body.restaurant_name === "string") {
    const name = body.restaurant_name.trim();
    if (!name) return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
    data.restaurant_name = name;
  }
  if (typeof body.notes === "string") {
    data.notes = body.notes.trim();
  }
  const updated = await updateDinnerPlan(Number(params.id), data);
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await deleteDinnerPlan(Number(params.id));
  return NextResponse.json({ ok: true });
}
