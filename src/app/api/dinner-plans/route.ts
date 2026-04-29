import { NextRequest, NextResponse } from "next/server";
import { getAllDinnerPlans, createDinnerPlan } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const plans = await getAllDinnerPlans();
  return NextResponse.json(plans);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { day, restaurant_name, notes, created_by } = body;

  if (!day || ![2, 3].includes(Number(day))) {
    return NextResponse.json({ error: "Invalid day" }, { status: 400 });
  }
  if (!restaurant_name || !String(restaurant_name).trim()) {
    return NextResponse.json({ error: "Restaurant name required" }, { status: 400 });
  }
  if (!created_by || !String(created_by).trim()) {
    return NextResponse.json({ error: "Name required" }, { status: 400 });
  }

  const id = await createDinnerPlan({
    day: Number(day),
    restaurant_name: String(restaurant_name).trim(),
    notes: typeof notes === "string" ? notes.trim() : "",
    created_by: String(created_by).trim(),
  });

  return NextResponse.json({ id }, { status: 201 });
}
