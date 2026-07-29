import type { Contact } from "@prisma/client";
import { prisma } from "./db";
import { dueInfo } from "./cadence";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface DueBuckets {
  generatedAt: Date;
  /** Reach out now, most overdue first. */
  due: Contact[];
  /** Due within the next 7 days (heads-up, not nagging). */
  dueSoon: Contact[];
  /** Meeting booked — reminders paused. */
  scheduled: Contact[];
  /** Active contacts with no cadence and nothing queued (untracked). */
  noCadenceCount: number;
}

/** The one view that matters: who's due, who's coming up, who's booked. */
export async function getDueBuckets(now = new Date()): Promise<DueBuckets> {
  const contacts = await prisma.contact.findMany({
    where: { archivedAt: null, isCoworker: false },
  });

  const due: Contact[] = [];
  const dueSoon: Contact[] = [];
  const scheduled: Contact[] = [];
  let noCadenceCount = 0;

  for (const c of contacts) {
    if (c.scheduled) {
      scheduled.push(c);
      continue;
    }
    const d = dueInfo(c, now);
    if (d.due) due.push(c);
    else if (d.dueAt && d.dueAt.getTime() - now.getTime() <= 7 * DAY_MS) dueSoon.push(c);
    else if (c.cadenceDays === null && !c.nextFollowUpAt) noCadenceCount++;
  }

  due.sort((a, b) => dueInfo(b, now).overdueDays - dueInfo(a, now).overdueDays);
  dueSoon.sort(
    (a, b) => (dueInfo(a, now).dueAt?.getTime() ?? 0) - (dueInfo(b, now).dueAt?.getTime() ?? 0),
  );

  return { generatedAt: now, due, dueSoon, scheduled, noCadenceCount };
}
