// The cadence model: every active contact has a desired contact frequency;
// what matters day-to-day is simply who is DUE. A booked meeting ("scheduled")
// silences reminders until the next interaction is actually logged, which
// restarts the timer automatically.

const DAY_MS = 24 * 60 * 60 * 1000;

export interface CadenceOption {
  label: string;
  days: number | null;
}

export const CADENCE_OPTIONS: CadenceOption[] = [
  { label: "No reminders", days: null },
  { label: "Weekly", days: 7 },
  { label: "Every 2 weeks", days: 14 },
  { label: "Monthly", days: 30 },
  { label: "Every 6 weeks", days: 42 },
  { label: "Every 2 months", days: 60 },
  { label: "Quarterly", days: 90 },
  { label: "Twice a year", days: 180 },
];

export function cadenceLabel(days: number | null): string {
  const opt = CADENCE_OPTIONS.find((o) => o.days === days);
  if (opt) return opt.label;
  return days === null ? "No reminders" : `Every ${days} days`;
}

export interface CadenceFields {
  cadenceDays: number | null;
  lastContactAt: Date | null;
  nextFollowUpAt: Date | null;
  scheduled: boolean;
  isCoworker: boolean;
  archivedAt: Date | null;
}

export interface DueInfo {
  /** Reach out now (and not snoozed by "scheduled"). */
  due: boolean;
  /** When contact is/was next expected; null when nothing is tracked. */
  dueAt: Date | null;
  /** Positive = days overdue; negative = days until due. */
  overdueDays: number;
  /** What made them due: manual queue date, cadence elapsed, or never contacted. */
  reason: "queued" | "cadence" | "never" | null;
}

/**
 * Due when: not archived/coworker/scheduled AND (a manual follow-up date has
 * passed, OR the cadence has elapsed since last contact, OR they're on a
 * cadence but have never been contacted).
 */
export function dueInfo(c: CadenceFields, now: Date = new Date()): DueInfo {
  const none: DueInfo = { due: false, dueAt: null, overdueDays: 0, reason: null };
  if (c.archivedAt || c.isCoworker) return none;

  const candidates: { at: Date; reason: DueInfo["reason"] }[] = [];
  if (c.nextFollowUpAt) candidates.push({ at: c.nextFollowUpAt, reason: "queued" });
  if (c.cadenceDays !== null) {
    if (c.lastContactAt) {
      candidates.push({
        at: new Date(c.lastContactAt.getTime() + c.cadenceDays * DAY_MS),
        reason: "cadence",
      });
    } else {
      candidates.push({ at: now, reason: "never" });
    }
  }
  if (candidates.length === 0) return none;

  candidates.sort((a, b) => a.at.getTime() - b.at.getTime());
  const { at, reason } = candidates[0];
  const overdueDays = Math.floor((now.getTime() - at.getTime()) / DAY_MS);
  return {
    due: !c.scheduled && at.getTime() <= now.getTime(),
    dueAt: at,
    overdueDays,
    reason,
  };
}

/** Short human label for a contact's due state ("due · 5d overdue"). */
export function dueLabel(c: CadenceFields, now: Date = new Date()): string {
  if (c.archivedAt) return "archived";
  if (c.isCoworker) return "coworker";
  if (c.scheduled) return "scheduled ✓";
  const d = dueInfo(c, now);
  if (!d.dueAt) return "—";
  if (d.due) {
    if (d.reason === "never") return "due · not contacted yet";
    return d.overdueDays <= 0 ? "due today" : `due · ${d.overdueDays}d overdue`;
  }
  const inDays = -d.overdueDays;
  return inDays === 0 ? "due today" : `due in ${inDays}d`;
}
