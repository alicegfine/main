import { NextResponse } from "next/server";
import { isAuthorizedRequest } from "@/lib/auth";
import { syncGranola } from "@/lib/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function run(req: Request) {
  if (!(await isAuthorizedRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await syncGranola();
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}

// POST for programmatic triggers; GET for convenience (e.g. a browser/cron ping).
export const POST = run;
export const GET = run;
