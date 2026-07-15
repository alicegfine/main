// The outreach pipeline. Order matters — it's the natural progression and is
// used to sort the dashboard.
export const STATUSES = [
  "to_reach_out",
  "reached_out",
  "connected",
  "pending_reply",
  "replied",
  "cold",
] as const;

export type Status = (typeof STATUSES)[number];

export const STATUS_LABELS: Record<Status, string> = {
  to_reach_out: "To reach out",
  reached_out: "Reached out",
  connected: "Connected",
  pending_reply: "Pending reply",
  replied: "Replied",
  cold: "Cold",
};

// Tailwind classes for the status pill (works in light + dark).
export const STATUS_STYLES: Record<Status, string> = {
  to_reach_out:
    "bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-200",
  reached_out:
    "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  connected:
    "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200",
  pending_reply:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  replied:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  cold: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

export function isStatus(value: unknown): value is Status {
  return typeof value === "string" && (STATUSES as readonly string[]).includes(value);
}

export const CHANNELS = [
  "linkedin",
  "email",
  "call",
  "meeting",
  "note",
  "granola",
] as const;

export type Channel = (typeof CHANNELS)[number];

export const CHANNEL_LABELS: Record<Channel, string> = {
  linkedin: "LinkedIn",
  email: "Email",
  call: "Call",
  meeting: "Meeting",
  note: "Note",
  granola: "Granola",
};

export function isChannel(value: unknown): value is Channel {
  return typeof value === "string" && (CHANNELS as readonly string[]).includes(value);
}
