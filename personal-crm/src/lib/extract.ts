import Anthropic from "@anthropic-ai/sdk";
import { config } from "./env";
import { GranolaNote } from "./granola";

export interface ExtractedPerson {
  name: string;
  reason: string;
  context: string;
}

let client: Anthropic | null = null;

function getClient(): Anthropic | null {
  const key = config.anthropicApiKey;
  if (!key) return null;
  // Tight timeout + single retry so a slow model call can't stall a sync.
  if (!client) client = new Anthropic({ apiKey: key, timeout: 30_000, maxRetries: 1 });
  return client;
}

export function extractionEnabled(): boolean {
  return Boolean(config.anthropicApiKey);
}

const SYSTEM = `You read meeting notes and pull out people the note-taker should proactively REACH OUT TO or FOLLOW UP WITH — for example someone mentioned as "I should connect with X", "reach out to Y", "get an intro to Z", or "email A about B".

Rules:
- Only include people who are NOT already attendees of this meeting (attendees are listed for you).
- Only include a person if the notes clearly imply the note-taker should contact them.
- Use the person's name exactly as written in the notes (do not expand or correct it).
- "context" must be a short VERBATIM quote from the notes — the sentence(s) where this person came up — so the note-taker remembers what it was about.
- Do not invent people, reasons, or context. If nobody qualifies, return an empty list.

Respond with ONLY a JSON object, no prose, no markdown fences, of exactly this shape:
{"people": [{"name": "Name As Written", "reason": "one short phrase on why / what to reach out about", "context": "verbatim quote from the notes"}]}`;

/** Best-effort JSON extraction from a model response that should be JSON. */
function parsePeople(text: string): ExtractedPerson[] {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return [];
  try {
    const data = JSON.parse(text.slice(start, end + 1)) as {
      people?: unknown;
    };
    if (!Array.isArray(data.people)) return [];
    return data.people
      .map((p): ExtractedPerson | null => {
        if (p && typeof p === "object") {
          const o = p as Record<string, unknown>;
          const name = typeof o.name === "string" ? o.name.trim() : "";
          const reason = typeof o.reason === "string" ? o.reason.trim() : "";
          const context = typeof o.context === "string" ? o.context.trim().slice(0, 500) : "";
          if (name) return { name, reason, context };
        }
        return null;
      })
      .filter((p): p is ExtractedPerson => p !== null);
  } catch {
    return [];
  }
}

export async function extractFollowUps(note: GranolaNote): Promise<ExtractedPerson[]> {
  const c = getClient();
  if (!c || !note.summary) return [];

  const attendees =
    note.attendees
      .map((a) => a.name ?? a.email)
      .filter(Boolean)
      .join(", ") || "(none listed)";

  const res = await c.messages.create({
    model: config.extractModel,
    max_tokens: 1024,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Meeting: ${note.title}\nAttendees: ${attendees}\n\nNotes:\n${note.summary}`,
      },
    ],
  });

  const block = res.content.find((b) => b.type === "text");
  return block && block.type === "text" ? parsePeople(block.text) : [];
}
