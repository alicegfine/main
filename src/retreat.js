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

export const MAX_NAME_LENGTH = 60;

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

export function formatTime(minutes) {
  if (minutes === DAY_END_MIN) return '12:00 AM';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
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
