import { NextRequest, NextResponse } from "next/server";
import { joinDinnerPlan, leaveDinnerPlan, toggleDinnerPointPerson } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const { action, user_name } = body;
  const planId = Number(params.id);

  if (!user_name || !String(user_name).trim()) {
    return NextResponse.json({ error: "Name required" }, { status: 400 });
  }
  const name = String(user_name).trim();

  if (action === "join") {
    await joinDinnerPlan(planId, name);
    return NextResponse.json({ ok: true });
  }
  if (action === "leave") {
    const result = await leaveDinnerPlan(planId, name);
    return NextResponse.json(result);
  }
  if (action === "toggle-pp") {
    const isPP = await toggleDinnerPointPerson(planId, name);
    return NextResponse.json({ is_point_person: isPP });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
