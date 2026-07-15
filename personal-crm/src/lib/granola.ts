import { config } from "./env";

// A normalized Granola note. The public API (https://public-api.granola.ai/v1)
// returns notes with an owner, attendees, a calendar_event, and summary text.
// Field names below follow the documented schema, with a few fallbacks in case
// Granola varies them. If a sync misses data, the `pick(...)` key lists here and
// in `collectAttendees` are the only place to adjust.
export interface GranolaNote {
  id: string;
  title: string;
  occurredAt: Date;
  summary: string | null;
  url: string | null;
  owner: GranolaPerson | null;
  attendees: GranolaPerson[];
}

export interface GranolaPerson {
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

function toPerson(raw: unknown): GranolaPerson | null {
  if (typeof raw === "string") {
    return raw.includes("@")
      ? { name: null, email: raw.trim().toLowerCase() }
      : { name: raw.trim(), email: null };
  }
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const name = pick(o, ["name", "display_name", "displayName", "full_name"]);
    const email = pick(o, ["email", "email_address", "emailAddress"]);
    const person: GranolaPerson = {
      name: typeof name === "string" ? name.trim() : null,
      email: typeof email === "string" ? email.trim().toLowerCase() : null,
    };
    return person.name || person.email ? person : null;
  }
  return null;
}

/**
 * Gather everyone associated with a note: the `attendees` array plus the
 * `calendar_event` invitees/attendees/organizer. Granola's list endpoint
 * sometimes returns only basic fields, so the sync falls back to the per-note
 * detail; this handles either payload.
 */
export function collectAttendees(raw: Record<string, unknown>): GranolaPerson[] {
  const people: GranolaPerson[] = [];
  const seen = new Set<string>();

  const add = (p: GranolaPerson | null) => {
    if (!p) return;
    const key = (p.email ?? p.name ?? "").toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    people.push(p);
  };

  const direct = pick(raw, ["attendees", "participants", "people", "guests"]);
  if (Array.isArray(direct)) direct.forEach((a) => add(toPerson(a)));

  const cal = pick(raw, ["calendar_event", "calendarEvent", "event"]);
  if (cal && typeof cal === "object") {
    const c = cal as Record<string, unknown>;
    const invitees = pick(c, ["invitees", "attendees", "guests"]);
    if (Array.isArray(invitees)) invitees.forEach((a) => add(toPerson(a)));
    add(toPerson(pick(c, ["organizer", "creator"])));
  }

  return people;
}

export function normalizeNote(raw: Record<string, unknown>): GranolaNote | null {
  const id = pick(raw, ["id", "document_id", "note_id", "uuid"]);
  if (typeof id !== "string" || id.length === 0) return null;

  const title = pick(raw, ["title", "name", "subject"]);
  const summaryRaw = pick(raw, [
    "summary_text",
    "summary_markdown",
    "summary",
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

  return {
    id,
    title: typeof title === "string" && title ? title : "Untitled note",
    occurredAt: toDate(occurredAt),
    summary: typeof summaryRaw === "string" && summaryRaw ? summaryRaw : null,
    url: typeof url === "string" && url ? url : null,
    owner: toPerson(pick(raw, ["owner", "user", "author"])),
    attendees: collectAttendees(raw),
  };
}

function authHeaders(): Record<string, string> {
  const apiKey = config.granolaApiKey;
  if (!apiKey) throw new GranolaError("GRANOLA_API_KEY is not set");
  return { Authorization: `Bearer ${apiKey}`, Accept: "application/json" };
}

function base(): string {
  return config.granolaApiBase.replace(/\/$/, "");
}

async function getJson(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, { headers: authHeaders(), cache: "no-store" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new GranolaError(
      `Granola API ${res.status} on ${url}: ${body.slice(0, 300)}`,
      res.status,
    );
  }
  return (await res.json()) as Record<string, unknown>;
}

interface ListOptions {
  /** Safety cap so a first sync of a huge account doesn't run forever. */
  maxPages?: number;
}

/** Fetch a single page of the notes list — used by the debug endpoint. */
export async function listNotesRaw(cursor?: string): Promise<Record<string, unknown>> {
  const url = new URL(`${base()}/notes`);
  url.searchParams.set("limit", "100");
  if (cursor) url.searchParams.set("cursor", cursor);
  return getJson(url.toString());
}

/** Fetch the full detail for one note (includes attendees + summary). */
export async function getNote(id: string): Promise<GranolaNote | null> {
  try {
    const json = await getJson(`${base()}/notes/${encodeURIComponent(id)}`);
    // The note may be at the top level or nested under a `note`/`data` key.
    const noteObj = pick(json, ["note", "data", "document"]) ?? json;
    return normalizeNote(noteObj as Record<string, unknown>);
  } catch {
    return null;
  }
}

/** List notes, following pagination. Callers dedupe by note id. */
export async function listNotes(options: ListOptions = {}): Promise<GranolaNote[]> {
  const maxPages = options.maxPages ?? 20;
  const notes: GranolaNote[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    const json = await listNotesRaw(cursor);
    const items = (pick(json, ["notes", "documents", "data", "results", "items"]) ??
      []) as unknown[];

    for (const item of items) {
      if (item && typeof item === "object") {
        const note = normalizeNote(item as Record<string, unknown>);
        if (note) notes.push(note);
      }
    }

    const hasMore = pick(json, ["hasMore", "has_more"]);
    const next = pick(json, ["cursor", "next_cursor", "nextCursor", "next"]);
    if (hasMore === false) break;
    if (typeof next === "string" && next.length > 0) {
      cursor = next;
    } else {
      break;
    }
  }

  return notes;
}
