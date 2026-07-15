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

  if (!partial || "status" in body) {
    const status = str(body.status) ?? "reached_out";
    if (!isStatus(status)) throw new ValidationError(`Invalid status: ${status}`);
    out.status = status;
  }
  if (!partial || "lastContactAt" in body) {
    out.lastContactAt = date(body.lastContactAt, "lastContactAt");
  }
  if (!partial || "nextFollowUpAt" in body) {
    out.nextFollowUpAt = date(body.nextFollowUpAt, "nextFollowUpAt");
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
