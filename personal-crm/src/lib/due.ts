import type { Contact } from "@prisma/client";
import { prisma } from "./db";
import { dueInfo, needsCadencePick } from "./cadence";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface DueBuckets {
  generatedAt: Date;
  /** Strictly due right now (drives the daily nudge). */
  due: Contact[];
  /** Due now OR within the next 7 days, most overdue first — the one list
   *  the dashboard/digest show, since day-precision rarely matters. */
  dueSoon: Contact[];
  /** Meeting booked — reminders paused. */
  scheduled: Contact[];
  /** First outreach done, real cadence not chosen yet — prompt to pick one. */
  needsCadence: Contact[];
  /** Active contacts with no cadence and nothing queued (untracked). */
  noCadenceCount: number;
}

/** The one view that matters: who's due (or nearly), who's booked, who needs a cadence picked. */
export async function getDueBuckets(now = new Date()): Promise<DueBuckets> {
  const contacts = await prisma.contact.findMany({
    where: { archivedAt: null, isCoworker: false },
  });

  const due: Contact[] = [];
  const dueSoon: Contact[] = [];
  const scheduled: Contact[] = [];
  const needsCadence: Contact[] = [];
  let noCadenceCount = 0;

  for (const c of contacts) {
    if (c.scheduled) {
      scheduled.push(c);
      continue;
    }
    if (needsCadencePick(c)) {
      needsCadence.push(c);
      continue;
    }
    const d = dueInfo(c, now);
    if (d.due) {
      due.push(c);
      dueSoon.push(c);
    } else if (d.dueAt && d.dueAt.getTime() - now.getTime() <= 7 * DAY_MS) {
      dueSoon.push(c);
    } else if (c.cadenceDays === null && !c.nextFollowUpAt) {
      noCadenceCount++;
    }
  }

  const byOverdue = (a: Contact, b: Contact) =>
    dueInfo(b, now).overdueDays - dueInfo(a, now).overdueDays;
  due.sort(byOverdue);
  dueSoon.sort(byOverdue);
  needsCadence.sort(
    (a, b) => (b.lastContactAt?.getTime() ?? 0) - (a.lastContactAt?.getTime() ?? 0),
  );

  return { generatedAt: now, due, dueSoon, scheduled, needsCadence, noCadenceCount };
}
