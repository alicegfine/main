// Board reads and writes. Postgres is the source of truth for who's in;
// calendarSync projects it onto the shared Google Calendar.

import { pool, withDayLock } from './db.js';
import { syncDay } from './calendarSync.js';
import { config } from './config.js';
import { buildCalendarShell, coveredDayKeys, isValidKey, todayKey } from './weeks.js';

/**
 * The whole board: the two-week shell plus everyone RSVP'd on each day.
 * One query for the range, grouped in memory — at office scale this is a few
 * dozen rows and not worth a per-day round trip.
 */
export async function getBoard(user) {
  const weeks = buildCalendarShell(config.timezone, config.weeksShown);
  const dayKeys = coveredDayKeys(config.timezone, config.weeksShown);

  const { rows } = await pool.query(
    `SELECT to_char(day, 'YYYY-MM-DD') AS day, email, name
       FROM rsvps
      WHERE day = ANY($1::date[])
      ORDER BY lower(name)`,
    [dayKeys]
  );

  const byDay = new Map(dayKeys.map((key) => [key, []]));
  for (const row of rows) {
    byDay.get(row.day)?.push({
      email: row.email,
      name: row.name,
      isMe: row.email === user.email,
    });
  }

  for (const week of weeks) {
    for (const day of week.days) {
      day.people = byDay.get(day.key) || [];
      day.count = day.people.length;
      day.meIn = day.people.some((person) => person.isMe);
      // Past days stay visible as a record of who was in, but can't be edited.
      day.editable = !day.isPast;
    }
  }

  return {
    weeks,
    today: todayKey(config.timezone),
    timezone: config.timezone,
    officeName: config.officeName,
  };
}

/**
 * Add or remove the signed-in user for one day, then mirror that day to the
 * shared calendar inside the same lock.
 *
 * Returns the day's updated roster plus a `syncWarning` when the RSVP was
 * recorded but the calendar mirror failed. The RSVP is deliberately not rolled
 * back in that case: Postgres is the source of truth, the board stays correct,
 * and resyncCoveredDays() repairs the calendar later. Losing someone's click
 * because Google had a bad minute would be the worse trade.
 */
export async function setAttendance(user, dayKey, going) {
  if (!isValidKey(dayKey)) {
    throw new BoardError('That date is not valid.');
  }
  if (dayKey < todayKey(config.timezone)) {
    throw new BoardError('That day has already passed.');
  }
  if (!coveredDayKeys(config.timezone, config.weeksShown).includes(dayKey)) {
    throw new BoardError('That day is outside the weeks shown on the board.');
  }

  let syncWarning = null;

  const people = await withDayLock(dayKey, async (client) => {
    if (going) {
      await client.query(
        `INSERT INTO rsvps (day, email, name) VALUES ($1, $2, $3)
         ON CONFLICT (day, email) DO UPDATE SET name = EXCLUDED.name`,
        [dayKey, user.email, user.name]
      );
    } else {
      await client.query(`DELETE FROM rsvps WHERE day = $1 AND email = $2`, [dayKey, user.email]);
    }

    try {
      await syncDay(client, dayKey);
    } catch (error) {
      console.error(`[board] calendar sync failed for ${dayKey}`, error?.message || error);
      syncWarning = 'Saved, but the shared calendar did not update. It will catch up shortly.';
    }

    const { rows } = await client.query(
      `SELECT email, name FROM rsvps WHERE day = $1 ORDER BY lower(name)`,
      [dayKey]
    );
    return rows.map((row) => ({ ...row, isMe: row.email === user.email }));
  });

  return {
    day: dayKey,
    people,
    count: people.length,
    meIn: people.some((person) => person.isMe),
    syncWarning,
  };
}

export class BoardError extends Error {}
