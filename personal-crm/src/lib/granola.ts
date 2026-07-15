import { config } from "./env";

// A normalized Granola note. Granola's public API returns notes with
// summaries, transcripts and attendees; the exact JSON field names aren't
// fully published, so `normalizeNote` accepts several likely shapes and maps
// them onto this stable interface. If Granola's payload differs, adjust the
// key lookups in `normalizeNote` — nothing else needs to change.
export interface GranolaNote {
  id: string;
  title: string;
  occurredAt: Date;
  summary: string | null;
  url: string | null;
  attendees: GranolaAttendee[];
}

export interface GranolaAttendee {
  name: string | null;
  email: string | null;
}

export class GranolaError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "GranolaError";
  }
}

function pick(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return undefined;
}

function toDate(value: unknown): Date {
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

function normalizeAttendees(value: unknown): GranolaAttendee[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw): GranolaAttendee | null => {
      if (typeof raw === "string") {
        // Sometimes attendees are plain strings (name or email).
        return raw.includes("@")
          ? { name: null, email: raw.trim() }
          : { name: raw.trim(), email: null };
      }
      if (raw && typeof raw === "object") {
        const o = raw as Record<string, unknown>;
        const name = pick(o, ["name", "display_name", "displayName", "full_name"]);
        const email = pick(o, ["email", "email_address", "emailAddress"]);
        return {
          name: typeof name === "string" ? name.trim() : null,
          email: typeof email === "string" ? email.trim().toLowerCase() : null,
        };
      }
      return null;
    })
    .filter((a): a is GranolaAttendee => a !== null && (!!a.name || !!a.email));
}

export function normalizeNote(raw: Record<string, unknown>): GranolaNote | null {
  const id = pick(raw, ["id", "document_id", "note_id", "uuid"]);
  if (typeof id !== "string" || id.length === 0) return null;

  const title = pick(raw, ["title", "name", "subject"]);
  const summaryRaw = pick(raw, [
    "summary",
    "summary_markdown",
    "ai_summary",
    "notes",
    "content",
  ]);
  const url = pick(raw, ["url", "share_url", "shareUrl", "public_url", "link"]);
  const occurredAt = pick(raw, [
    "created_at",
    "createdAt",
    "started_at",
    "date",
    "updated_at",
  ]);
  const attendees = pick(raw, [
    "attendees",
    "participants",
    "people",
    "guests",
  ]);

  return {
    id,
    title: typeof title === "string" && title ? title : "Untitled note",
    occurredAt: toDate(occurredAt),
    summary: typeof summaryRaw === "string" && summaryRaw ? summaryRaw : null,
    url: typeof url === "string" && url ? url : null,
    attendees: normalizeAttendees(attendees),
  };
}

interface ListOptions {
  /** Only return notes created/updated after this time, if the API supports it. */
  since?: Date | null;
  /** Safety cap so a first sync of a huge account doesn't run forever. */
  maxPages?: number;
}

/**
 * List notes from the Granola public API, following pagination. Returns
 * normalized notes newest-first is not guaranteed; callers dedupe by id.
 */
export async function listNotes(options: ListOptions = {}): Promise<GranolaNote[]> {
  const apiKey = config.granolaApiKey;
  if (!apiKey) {
    throw new GranolaError("GRANOLA_API_KEY is not set");
  }

  const base = config.granolaApiBase.replace(/\/$/, "");
  const maxPages = options.maxPages ?? 20;
  const notes: GranolaNote[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    const url = new URL(`${base}/notes`);
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("cursor", cursor);
    if (options.since) url.searchParams.set("updated_since", options.since.toISOString());

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      // Never cache API responses.
      cache: "no-store",
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new GranolaError(
        `Granola API returned ${res.status}: ${body.slice(0, 300)}`,
        res.status,
      );
    }

    const json = (await res.json()) as Record<string, unknown>;
    const items = (pick(json, ["notes", "documents", "data", "results", "items"]) ??
      []) as unknown[];

    for (const item of items) {
      if (item && typeof item === "object") {
        const note = normalizeNote(item as Record<string, unknown>);
        if (note) notes.push(note);
      }
    }

    const next = pick(json, ["next_cursor", "nextCursor", "cursor", "next"]);
    if (typeof next === "string" && next.length > 0) {
      cursor = next;
    } else {
      break;
    }
  }

  return notes;
}
