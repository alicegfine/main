import { config } from "./env";

const DAY_MS = 24 * 60 * 60 * 1000;

export function daysAgo(days: number, from: Date = new Date()): Date {
  return new Date(from.getTime() - days * DAY_MS);
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / DAY_MS);
}

/** Human date like "Jul 15, 2026" in the server timezone. */
export function formatDate(date: Date | null | undefined): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: config.timezone,
  }).format(date);
}

/** Relative phrase like "3 days ago" / "in 2 days" / "today". */
export function relativeDays(date: Date | null | undefined, now = new Date()): string {
  if (!date) return "—";
  const diff = daysBetween(date, now);
  if (diff === 0) return "today";
  if (diff > 0) return diff === 1 ? "in 1 day" : `in ${diff} days`;
  const ago = -diff;
  return ago === 1 ? "1 day ago" : `${ago} days ago`;
}
