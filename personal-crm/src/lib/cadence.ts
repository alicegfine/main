// The cadence model: every active contact has a desired contact frequency;
// what matters day-to-day is simply who is DUE. A booked meeting ("scheduled")
// silences reminders until the next interaction is actually logged, which
// restarts the timer automatically.

const DAY_MS = 24 * 60 * 60 * 1000;

export interface CadenceOption {
  label: string;
  days: number | null;
}

/**
 * `days: 0` is the "first outreach" sentinel: remind me until I've actually
 * talked to them — I'll pick a real cadence once I know them.
 */
export const FIRST_OUTREACH = 0;

export const CADENCE_OPTIONS: CadenceOption[] = [
  { label: "No reminders", days: null },
  { label: "First outreach — cadence TBD", days: FIRST_OUTREACH },
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
  snoozedUntil: Date | null;
  isCoworker: boolean;
  archivedAt: Date | null;
}

/** Actively snoozed: "don't bother me about them" until the date passes. */
export function isSnoozed(c: CadenceFields, now: Date = new Date()): boolean {
  return c.snoozedUntil !== null && c.snoozedUntil.getTime() > now.getTime();
}

/**
 * Their cadence says they're fine: a real cadence is set and the interval
 * hasn't elapsed since the last conversation. Used to stop system-generated
 * "reach out now" flags from overriding a cadence that's already satisfied.
 */
export function coveredByCadence(c: CadenceFields, now: Date = new Date()): boolean {
  if (c.cadenceDays === null || c.cadenceDays <= FIRST_OUTREACH) return false;
  if (!c.lastContactAt) return false;
  return c.lastContactAt.getTime() + c.cadenceDays * DAY_MS > now.getTime();
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
    if (!c.lastContactAt) {
      // On a cadence (or queued for first outreach) but never contacted → due.
      candidates.push({ at: now, reason: "never" });
    } else if (c.cadenceDays > FIRST_OUTREACH) {
      candidates.push({
        at: new Date(c.lastContactAt.getTime() + c.cadenceDays * DAY_MS),
        reason: "cadence",
      });
    }
    // cadenceDays === FIRST_OUTREACH after contact: not auto-due — the user
    // should now pick a real cadence (see needsCadencePick).
  }
  if (candidates.length === 0) return none;

  candidates.sort((a, b) => a.at.getTime() - b.at.getTime());
  const { at, reason } = candidates[0];
  const overdueDays = Math.floor((now.getTime() - at.getTime()) / DAY_MS);
  return {
    due: !c.scheduled && !isSnoozed(c, now) && at.getTime() <= now.getTime(),
    dueAt: at,
    overdueDays,
    reason,
  };
}

/**
 * First outreach happened, but no real cadence chosen yet — prompt the user
 * to pick one now that they know the person.
 */
export function needsCadencePick(c: CadenceFields): boolean {
  return (
    !c.archivedAt &&
    !c.isCoworker &&
    c.cadenceDays === FIRST_OUTREACH &&
    c.lastContactAt !== null &&
    c.nextFollowUpAt === null
  );
}

/** Short human label for a contact's due state ("due · 5d overdue"). */
export function dueLabel(c: CadenceFields, now: Date = new Date()): string {
  if (c.archivedAt) return "archived";
  if (c.isCoworker) return "coworker";
  if (c.scheduled) return "scheduled ✓";
  if (isSnoozed(c, now)) {
    const days = Math.ceil((c.snoozedUntil!.getTime() - now.getTime()) / DAY_MS);
    return `snoozed · back in ${days}d`;
  }
  if (needsCadencePick(c)) return "pick a cadence";
  const d = dueInfo(c, now);
  if (!d.dueAt) return "—";
  if (d.due) {
    if (d.reason === "never") {
      return c.cadenceDays === FIRST_OUTREACH ? "due · first outreach" : "due · not contacted yet";
    }
    // Name the driver so a one-off queued date is never confused with cadence.
    const why = d.reason === "queued" ? " · queued" : "";
    return d.overdueDays <= 0
      ? `due today${why}`
      : `due · ${d.overdueDays}d overdue${why}`;
  }
  const inDays = -d.overdueDays;
  return inDays === 0 ? "due today" : `due in ${inDays}d`;
}
