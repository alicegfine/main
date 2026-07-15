import { NextResponse } from "next/server";
import { isAuthorizedRequest } from "@/lib/auth";
import { ingestEmail, EmailPayload } from "@/lib/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Receives a forwarded email (e.g. from an "Email by Zapier" → Webhook Zap)
// and logs it against the matching contact. Authorize with the CRON_SECRET
// bearer token.
export async function POST(req: Request) {
  if (!(await isAuthorizedRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: EmailPayload;
  try {
    payload = (await req.json()) as EmailPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = await ingestEmail(payload);
  return NextResponse.json(result);
}
