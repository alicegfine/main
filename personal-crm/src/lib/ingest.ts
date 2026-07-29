import { prisma } from "./db";
import { config } from "./env";

export interface EmailPayload {
  from?: string;
  to?: string;
  cc?: string;
  replyTo?: string;
  subject?: string;
  body?: string;
  date?: string;
  /** Optional: let the automation name the counterpart explicitly. */
  contactEmail?: string;
  contactName?: string;
}

export interface IngestResult {
  ok: boolean;
  matched: boolean;
  created: boolean;
  contactId?: string;
  contactName?: string;
  skipped?: string;
}

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

function extractEmails(text: string | undefined): string[] {
  if (!text) return [];
  return (text.match(EMAIL_RE) ?? []).map((e) => e.toLowerCase());
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Find the display name attached to a specific email address across the
 * provided text, matching `Name <email>` or `email (Name)` — so a forwarded
 * "From: Casey Reed <casey@x.com>" line yields "Casey Reed", not the forwarder.
 */
function nameForEmail(email: string, sources: (string | undefined)[]): string | undefined {
  const e = escapeRe(email);
  const angle = new RegExp(`"?([^"<>\\n,;:]+?)"?\\s*<${e}>`, "i");
  const paren = new RegExp(`${e}\\s*\\(([^)]+)\\)`, "i");
  for (const src of sources) {
    if (!src) continue;
    const m = src.match(angle) ?? src.match(paren);
    if (m) {
      const name = m[1].trim();
      if (name && !name.includes("@")) return name;
    }
  }
  return undefined;
}

/**
 * Turn a forwarded/parsed email into a logged interaction on the right
 * contact. Finds the counterpart by:
 *   1. an explicit contactEmail the automation provided, else
 *   2. the first non-owner email across from/replyTo/to/cc, else
 *   3. the first non-owner email found anywhere in the body (handles the
 *      "From: Name <email>" header of a forwarded message).
 * Owner emails (OWNER_EMAIL) are always skipped so you don't log yourself.
 */
export async function ingestEmail(payload: EmailPayload): Promise<IngestResult> {
  const owners = new Set(config.ownerEmails);

  const candidates: string[] = [];
  if (payload.contactEmail) candidates.push(payload.contactEmail.toLowerCase());
  candidates.push(...extractEmails(payload.from));
  candidates.push(...extractEmails(payload.replyTo));
  candidates.push(...extractEmails(payload.to));
  candidates.push(...extractEmails(payload.cc));
  candidates.push(...extractEmails(payload.body));

  const counterpart = candidates.find((e) => !owners.has(e));
  if (!counterpart) {
    return { ok: true, matched: false, created: false, skipped: "no non-owner email found" };
  }

  const displayName =
    payload.contactName?.trim() ||
    nameForEmail(counterpart, [payload.from, payload.replyTo, payload.to, payload.cc, payload.body]) ||
    counterpart.split("@")[0];

  let contact = await prisma.contact.findFirst({
    where: { email: { equals: counterpart } },
  });

  let created = false;
  if (!contact) {
    contact = await prisma.contact.create({
      data: {
        name: displayName,
        email: counterpart,
        howMet: "Email",
      },
    });
    created = true;
  }

  const occurredAt = payload.date ? new Date(payload.date) : new Date();
  const when = Number.isNaN(occurredAt.getTime()) ? new Date() : occurredAt;

  const summaryParts: string[] = [];
  if (payload.subject) summaryParts.push(payload.subject.trim());
  if (payload.body) {
    const snippet = payload.body.trim().replace(/\s+/g, " ");
    summaryParts.push(snippet.length > 1000 ? `${snippet.slice(0, 1000)}…` : snippet);
  }

  await prisma.interaction.create({
    data: {
      contactId: contact.id,
      channel: "email",
      occurredAt: when,
      summary: summaryParts.join("\n\n") || null,
    },
  });

  // A captured email restarts the cadence loop (see cadence.ts).
  if (!contact.lastContactAt || contact.lastContactAt < when) {
    await prisma.contact.update({
      where: { id: contact.id },
      data: {
        lastContactAt: when,
        scheduled: false,
        ...(contact.nextFollowUpAt && contact.nextFollowUpAt <= when
          ? { nextFollowUpAt: null }
          : {}),
      },
    });
  }

  return {
    ok: true,
    matched: !created,
    created,
    contactId: contact.id,
    contactName: contact.name,
  };
}
