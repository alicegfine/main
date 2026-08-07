// Mirrors the board into the shared "DC Office" Google Calendar.
//
// This is what makes the calendar *live* rather than a downloadable .ics.
// Everyone subscribes once to a real Google Calendar; because it's a native
// calendar in the same Workspace, edits land on their phone and desktop within
// seconds. A published .ics feed would instead be re-fetched by Google on its
// own schedule — often 8 to 24 hours late, which is useless for "who's in
// today".
//
// The board (Postgres) is the source of truth. The calendar is a projection of
// it, so a failed sync is always recoverable by re-running the sync for that
// day — see resyncCoveredDays().

import { google } from 'googleapis';
import { config } from './config.js';
import { addDays, coveredDayKeys } from './weeks.js';

const auth = new google.auth.JWT({
  email: config.google.serviceAccount.client_email,
  key: config.google.serviceAccount.private_key,
  scopes: ['https://www.googleapis.com/auth/calendar.events'],
});

const calendar = google.calendar({ version: 'v3', auth });

// syncDay takes its events client as an argument so tests can drive the
// reconcile logic without reaching Google. Production callers pass nothing.
const liveEvents = calendar.events;

// A subscriber's calendar showing twelve overlapping all-day blobs per day is
// how people end up unsubscribing. One rollup event per day instead, with the
// first few names in the title and the full roster in the description.
const NAMES_IN_TITLE = 3;

export function buildEventBody(dayKey, people) {
  const firstNames = people.map((person) => person.name.split(' ')[0]);
  const shown = firstNames.slice(0, NAMES_IN_TITLE).join(', ');
  const overflow = firstNames.length - NAMES_IN_TITLE;
  const summary =
    overflow > 0
      ? `${config.officeName}: ${shown} +${overflow} (${people.length})`
      : `${config.officeName}: ${shown} (${people.length})`;

  const roster = people.map((person) => `• ${person.name} <${person.email}>`).join('\n');

  return {
    summary,
    description: `${people.length} in the ${config.officeName}:\n\n${roster}\n\nUpdated from the office site — edits here will be overwritten.`,
    // All-day events must use `date`, not `dateTime`. `end` is exclusive, so a
    // single day ends on the following date.
    start: { date: dayKey },
    end: { date: addDays(dayKey, 1) },
    transparency: 'transparent', // shows as free, not busy
    reminders: { useDefault: false, overrides: [] },
  };
}

/**
 * Reconcile one day's calendar event with the people on the board for that day.
 * Must be called inside withDayLock() so concurrent RSVPs can't interleave.
 *
 * @param client  the locked pg client from withDayLock
 * @param dayKey  "YYYY-MM-DD"
 * @param events  Calendar events client; overridden only in tests
 */
export async function syncDay(client, dayKey, events = liveEvents) {
  const [{ rows: people }, { rows: existing }] = await Promise.all([
    client.query(
      `SELECT email, name FROM rsvps WHERE day = $1 ORDER BY lower(name)`,
      [dayKey]
    ),
    client.query(`SELECT event_id FROM day_events WHERE day = $1`, [dayKey]),
  ]);

  const eventId = existing[0]?.event_id || null;

  if (people.length === 0) {
    if (eventId) {
      await deleteEvent(eventId, events);
      await client.query(`DELETE FROM day_events WHERE day = $1`, [dayKey]);
    }
    return;
  }

  const body = buildEventBody(dayKey, people);

  if (eventId) {
    try {
      await events.update({
        calendarId: config.officeCalendarId,
        eventId,
        requestBody: body,
      });
      await client.query(`UPDATE day_events SET updated_at = now() WHERE day = $1`, [dayKey]);
      return;
    } catch (error) {
      // Someone deleted the event by hand in Google Calendar. Fall through and
      // recreate it rather than failing every future RSVP for that day.
      if (error?.code !== 404 && error?.code !== 410) throw error;
      await client.query(`DELETE FROM day_events WHERE day = $1`, [dayKey]);
    }
  }

  const created = await events.insert({
    calendarId: config.officeCalendarId,
    requestBody: body,
  });

  await client.query(
    `INSERT INTO day_events (day, event_id) VALUES ($1, $2)
     ON CONFLICT (day) DO UPDATE SET event_id = EXCLUDED.event_id, updated_at = now()`,
    [dayKey, created.data.id]
  );
}

async function deleteEvent(eventId, events) {
  try {
    await events.delete({ calendarId: config.officeCalendarId, eventId });
  } catch (error) {
    // Already gone is the outcome we wanted.
    if (error?.code !== 404 && error?.code !== 410) throw error;
  }
}

/**
 * Re-sync every day the board currently shows. Safe to run repeatedly — useful
 * after a Calendar outage, and as a scheduled job so hand-edits to the shared
 * calendar get corrected instead of silently diverging.
 */
export async function resyncCoveredDays(withDayLock) {
  const results = { synced: 0, failed: [] };
  for (const dayKey of coveredDayKeys(config.timezone, config.weeksShown)) {
    try {
      await withDayLock(dayKey, (client) => syncDay(client, dayKey));
      results.synced += 1;
    } catch (error) {
      console.error(`[calendar] resync failed for ${dayKey}`, error?.message || error);
      results.failed.push(dayKey);
    }
  }
  return results;
}

/** Deep link that subscribes the viewer to the shared calendar in one click. */
export function subscribeUrl() {
  return `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(config.officeCalendarId)}`;
}
