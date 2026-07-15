import { NextResponse } from "next/server";
import { isAuthorizedRequest } from "@/lib/auth";
import { buildDigestData, formatDigestText, runDigest } from "@/lib/digest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// GET previews the digest (no send). Add ?send=1 to actually send it.
export async function GET(req: Request) {
  if (!(await isAuthorizedRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  if (url.searchParams.get("send") === "1") {
    const report = await runDigest({ force: url.searchParams.get("force") === "1" });
    return NextResponse.json(report);
  }
  const data = await buildDigestData();
  return NextResponse.json({ data, preview: formatDigestText(data) });
}

// POST always sends. { force: true } sends even when the digest is empty.
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
  const report = await runDigest({ force });
  return NextResponse.json(report);
}
