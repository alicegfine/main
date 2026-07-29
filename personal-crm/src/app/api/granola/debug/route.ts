import { NextResponse } from "next/server";
import { isAuthorizedRequest } from "@/lib/auth";
import { listNotesRaw, normalizeNote, getNoteRaw } from "@/lib/granola";
import { config } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Diagnostic: shows what the Granola API actually returns for your account, so
 * we can confirm field names and see why a sync did/didn't capture anything.
 * Auth-protected (login cookie or CRON_SECRET bearer). Returns only the first
 * page and a single sample note.
 */
export async function GET(req: Request) {
  if (!(await isAuthorizedRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!config.granolaApiKey) {
    return NextResponse.json({ error: "GRANOLA_API_KEY is not set" }, { status: 400 });
  }

  try {
    const raw = await listNotesRaw();
    const topKeys = Object.keys(raw);
    const listKey = ["notes", "documents", "data", "results", "items"].find(
      (k) => Array.isArray((raw as Record<string, unknown>)[k]),
    );
    const items = (listKey ? (raw as Record<string, unknown>)[listKey] : []) as unknown[];
    const first = (items[0] ?? null) as Record<string, unknown> | null;
    const firstId = first && typeof first.id === "string" ? first.id : null;

    // Attendees + summary come only from the per-note detail — fetch it so we
    // can confirm those fields are present and named as expected.
    let detailKeys: string[] = [];
    let detailNormalized: unknown = null;
    let detailError: string | null = null;
    if (firstId) {
      try {
        const detail = await getNoteRaw(firstId);
        detailKeys = Object.keys(detail);
        detailNormalized = normalizeNote(detail);
      } catch (err) {
        detailError = err instanceof Error ? err.message : String(err);
      }
    }

    return NextResponse.json({
      ok: true,
      topLevelKeys: topKeys,
      listKey,
      noteCount: items.length,
      pagination: {
        hasMore: raw.hasMore ?? raw.has_more ?? null,
        cursor: raw.cursor ?? raw.next_cursor ?? null,
      },
      firstNoteKeys: first ? Object.keys(first) : [],
      firstNoteRaw: first,
      firstNoteNormalized: first ? normalizeNote(first) : null,
      firstNoteDetailKeys: detailKeys,
      firstNoteDetailNormalized: detailNormalized,
      firstNoteDetailError: detailError,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
