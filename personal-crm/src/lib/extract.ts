import Anthropic from "@anthropic-ai/sdk";
import { config } from "./env";
import { GranolaNote } from "./granola";

export interface ExtractedPerson {
  name: string;
  reason: string;
}

let client: Anthropic | null = null;

function getClient(): Anthropic | null {
  const key = config.anthropicApiKey;
  if (!key) return null;
  if (!client) client = new Anthropic({ apiKey: key });
  return client;
}

export function extractionEnabled(): boolean {
  return Boolean(config.anthropicApiKey);
}

const SYSTEM = `You read meeting notes and pull out people the note-taker should proactively REACH OUT TO or FOLLOW UP WITH — for example someone mentioned as "I should connect with X", "reach out to Y", "get an intro to Z", or "email A about B".

Rules:
- Only include people who are NOT already attendees of this meeting (attendees are listed for you).
- Only include a person if the notes clearly imply the note-taker should contact them.
- Do not invent people or reasons. If nobody qualifies, return an empty list.

Respond with ONLY a JSON object, no prose, no markdown fences, of exactly this shape:
{"people": [{"name": "Full Name", "reason": "one short phrase on why / what to reach out about"}]}`;

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
          if (name) return { name, reason };
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
