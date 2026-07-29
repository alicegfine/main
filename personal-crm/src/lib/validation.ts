import { isChannel, isStatus } from "./status";

export interface ContactInput {
  name: string;
  email: string | null;
  company: string | null;
  role: string | null;
  linkedinUrl: string | null;
  howMet: string | null;
  tags: string | null;
  status: string;
  notes: string | null;
  isCoworker: boolean;
  archivedAt: Date | null;
  cadenceDays: number | null;
  scheduled: boolean;
  snoozedUntil: Date | null;
  lastContactAt: Date | null;
  nextFollowUpAt: Date | null;
}

export class ValidationError extends Error {}

function str(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s.length ? s : null;
}

function date(value: unknown, field: string): Date | null {
  if (value === undefined || value === null || value === "") return null;
  const d = new Date(value as string);
  if (Number.isNaN(d.getTime())) throw new ValidationError(`Invalid date for ${field}`);
  return d;
}

/** Parse a contact payload. `partial` allows missing fields for PATCH. */
export function parseContact(
  body: Record<string, unknown>,
  partial = false,
): Partial<ContactInput> {
  const out: Partial<ContactInput> = {};

  if (!partial || "name" in body) {
    const name = str(body.name);
    if (!name) throw new ValidationError("Name is required");
    out.name = name;
  }
  if (!partial || "email" in body) out.email = str(body.email);
  if (!partial || "company" in body) out.company = str(body.company);
  if (!partial || "role" in body) out.role = str(body.role);
  if (!partial || "linkedinUrl" in body) out.linkedinUrl = str(body.linkedinUrl);
  if (!partial || "howMet" in body) out.howMet = str(body.howMet);
  if (!partial || "tags" in body) out.tags = str(body.tags);
  if (!partial || "notes" in body) out.notes = str(body.notes);

  // Legacy field — cadence replaced statuses in the UI, but stay tolerant.
  if ("status" in body && body.status != null && body.status !== "") {
    const status = str(body.status) ?? "";
    if (!isStatus(status)) throw new ValidationError(`Invalid status: ${status}`);
    out.status = status;
  }
  if (!partial || "lastContactAt" in body) {
    out.lastContactAt = date(body.lastContactAt, "lastContactAt");
  }
  if (!partial || "nextFollowUpAt" in body) {
    out.nextFollowUpAt = date(body.nextFollowUpAt, "nextFollowUpAt");
  }
  // Only applied when explicitly sent (both create and PATCH).
  if ("isCoworker" in body) out.isCoworker = Boolean(body.isCoworker);
  if ("archived" in body) out.archivedAt = body.archived ? new Date() : null;
  if ("scheduled" in body) out.scheduled = Boolean(body.scheduled);
  // snoozeDays: N → "don't bother me for N days"; 0/null → unsnooze.
  if ("snoozeDays" in body) {
    const v = body.snoozeDays;
    if (v === null || v === 0 || v === "0" || v === "") {
      out.snoozedUntil = null;
    } else {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1 || n > 365) {
        throw new ValidationError("snoozeDays must be 1–365 or 0/null to unsnooze");
      }
      out.snoozedUntil = new Date(Date.now() + n * 24 * 60 * 60 * 1000);
    }
  }
  if ("cadenceDays" in body) {
    const v = body.cadenceDays;
    if (v === null || v === "" || v === undefined) {
      out.cadenceDays = null;
    } else {
      const n = Number(v);
      // 0 is the "first outreach — cadence TBD" sentinel.
      if (!Number.isInteger(n) || n < 0 || n > 3650) {
        throw new ValidationError("cadenceDays must be a whole number of days (0–3650) or null");
      }
      out.cadenceDays = n;
    }
  }

  return out;
}

export interface InteractionInput {
  contactId: string;
  channel: string;
  summary: string | null;
  occurredAt: Date;
}

export function parseInteraction(body: Record<string, unknown>): InteractionInput {
  const contactId = str(body.contactId);
  if (!contactId) throw new ValidationError("contactId is required");

  const channel = str(body.channel) ?? "note";
  if (!isChannel(channel)) throw new ValidationError(`Invalid channel: ${channel}`);

  const occurredAt = date(body.occurredAt, "occurredAt") ?? new Date();

  return {
    contactId,
    channel,
    summary: str(body.summary),
    occurredAt,
  };
}
