// Shared facts about the retreat and small helpers for working with its times.
//
// Every time on the site is Eastern Time. Rather than doing timezone math, times
// are stored as "minutes since midnight ET" on a given calendar day and always
// rendered with an "ET" label, so the numbers mean the same thing everywhere.

export const DAYS = [
  { date: '2026-08-07', label: 'Friday, August 7' },
  { date: '2026-08-08', label: 'Saturday, August 8' },
  { date: '2026-08-09', label: 'Sunday, August 9' },
  { date: '2026-08-10', label: 'Monday, August 10' },
];

// 8:00 AM through midnight.
export const DAY_START_MIN = 8 * 60;
export const DAY_END_MIN = 24 * 60;

export const ROLES = ['leading', 'attending'];

// Every session is followed by a short debrief. It is derived from the session's
// end rather than stored, so moving a session carries its debrief along.
export const DEBRIEF_MINUTES = 10;

export function debriefFor(block) {
  return { startMin: block.end_min, endMin: block.end_min + DEBRIEF_MINUTES };
}

export const MAX_TITLE_LENGTH = 60;

// A labelled session is something other than a plain sit — a closing circle, say —
// and carries no debrief of its own. Nor does a session whose debrief would run
// into whatever comes next that day: the following session takes precedence.
export function debriefApplies(block, nextBlock) {
  if (block.title) return false;
  if (!nextBlock) return true;
  // A labelled session stands in for the debrief of the session before it, whether
  // or not it follows immediately — a closing circle is the debrief.
  if (nextBlock.title) return false;
  return nextBlock.start_min >= debriefFor(block).endMin;
}

// Today's date in the retreat's timezone, as YYYY-MM-DD, so that a day counts as
// past according to Eastern rather than wherever the server happens to be.
export function todayInEastern(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export const MAX_NAME_LENGTH = 60;

// Generous enough for any plausible info page; the request body limit is above it.
export const MAX_PAGE_LENGTH = 50_000;

export function isValidDay(date) {
  return DAYS.some((day) => day.date === date);
}

export function dayLabel(date) {
  return DAYS.find((day) => day.date === date)?.label ?? date;
}

// Parses an <input type="time"> value ("HH:MM") into minutes since midnight.
// Midnight is the end of the retreat day, not the start, so "00:00" and "24:00"
// both mean 1440.
export function parseTime(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 24 || minutes > 59) return null;
  if (hours === 24 && minutes !== 0) return null;
  const total = hours * 60 + minutes;
  return total === 0 ? DAY_END_MIN : total;
}

// The inverse of parseTime, for pre-filling an <input type="time">.
export function toTimeValue(minutes) {
  const wrapped = minutes % (24 * 60);
  const hours = Math.floor(wrapped / 60);
  return `${String(hours).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}

export function formatTime(minutes) {
  // A debrief can run past midnight into the next day, so wrap before formatting
  // rather than treating hour 24 as the afternoon.
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  const hours = Math.floor(wrapped / 60);
  const mins = wrapped % 60;
  const suffix = hours < 12 ? 'AM' : 'PM';
  const displayHour = hours % 12 === 0 ? 12 : hours % 12;
  return `${displayHour}:${String(mins).padStart(2, '0')} ${suffix}`;
}

export function formatRange(startMin, endMin) {
  return `${formatTime(startMin)} – ${formatTime(endMin)} ET`;
}

export function formatDuration(startMin, endMin) {
  const total = endMin - startMin;
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (hours && mins) return `${hours}h ${mins}m`;
  if (hours) return `${hours}h`;
  return `${mins}m`;
}

// Returns an error message describing why this block is not allowed, or null if
// it is fine. `existing` is every block already on that day.
export function validateBlock({ day, startMin, endMin }, existing) {
  if (!isValidDay(day)) return 'Pick one of the four retreat days.';
  if (startMin === null || endMin === null) return 'Enter a start and end time.';
  if (startMin < DAY_START_MIN) return 'Sessions cannot start before 8:00 AM ET.';
  if (endMin > DAY_END_MIN) return 'Sessions cannot end after 12:00 AM ET.';
  if (endMin <= startMin) return 'The end time must be after the start time.';

  const clash = existing.find(
    (block) => block.start_min < endMin && block.end_min > startMin,
  );
  if (clash) {
    return `That overlaps an existing session (${formatRange(clash.start_min, clash.end_min)}).`;
  }
  return null;
}
