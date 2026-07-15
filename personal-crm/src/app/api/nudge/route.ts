import { NextResponse } from "next/server";
import { isAuthorizedRequest } from "@/lib/auth";
import { buildNudgeData, formatNudgeText, runNudge } from "@/lib/nudge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET previews the nudge; ?send=1 sends it. POST always sends.
export async function GET(req: Request) {
  if (!(await isAuthorizedRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  if (url.searchParams.get("send") === "1") {
    return NextResponse.json(await runNudge({ force: url.searchParams.get("force") === "1" }));
  }
  const data = await buildNudgeData();
  return NextResponse.json({ data, preview: formatNudgeText(data) });
}

export async function POST(req: Request) {
  if (!(await isAuthorizedRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let force = false;
  try {
    const body = (await req.json()) as { force?: boolean };
    force = Boolean(body?.force);
  } catch {
    // no body is fine
  }
  return NextResponse.json(await runNudge({ force }));
}
