// Date math for the board.
//
// Every date in this app is a plain calendar day ("2026-08-10"), never an
// instant. Mixing the two is how office calendars end up showing people in on
// Sunday: `new Date('2026-08-10')` parses as UTC midnight, which is the 9th in
// Washington. So all arithmetic here happens on a UTC-noon anchor, far enough
// from either midnight that no timezone offset or DST transition can shift the
// calendar date out from under us.

const DAY_MS = 24 * 60 * 60 * 1000;

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** Today's calendar date in the office's timezone, as "YYYY-MM-DD". */
export function todayKey(timezone) {
  // en-CA formats as YYYY-MM-DD, which saves reassembling parts by hand.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** "YYYY-MM-DD" -> UTC-noon anchor Date. */
export function keyToAnchor(key) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

/** UTC-noon anchor Date -> "YYYY-MM-DD". */
export function anchorToKey(anchor) {
  const year = anchor.getUTCFullYear();
  const month = String(anchor.getUTCMonth() + 1).padStart(2, '0');
  const day = String(anchor.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDays(key, days) {
  return anchorToKey(new Date(keyToAnchor(key).getTime() + days * DAY_MS));
}

export function isValidKey(key) {
  return typeof key === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(key) && anchorToKey(keyToAnchor(key)) === key;
}

/** Monday of the week containing `key`. Weeks run Monday–Friday. */
export function mondayOf(key) {
  const weekday = keyToAnchor(key).getUTCDay(); // 0 = Sunday
  return addDays(key, -((weekday + 6) % 7));
}

/**
 * The weekdays the board covers: `weeks` consecutive Mon–Fri blocks starting
 * with the week containing today. Weekends are skipped entirely — nobody is
 * booking a Saturday desk, and dropping them keeps the grid to five columns.
 */
export function buildCalendarShell(timezone, weeks) {
  const today = todayKey(timezone);
  const firstMonday = mondayOf(today);

  return Array.from({ length: weeks }, (_, weekIndex) => {
    const monday = addDays(firstMonday, weekIndex * 7);
    const friday = addDays(monday, 4);

    return {
      label: weekIndex === 0 ? 'This week' : weekIndex === 1 ? 'Next week' : `Week of ${formatShort(monday)}`,
      range: `${formatShort(monday)} – ${formatShort(friday)}`,
      days: Array.from({ length: 5 }, (_, dayIndex) => {
        const key = addDays(monday, dayIndex);
        const anchor = keyToAnchor(key);
        return {
          key,
          weekday: WEEKDAY_NAMES[anchor.getUTCDay()],
          weekdayShort: WEEKDAY_NAMES[anchor.getUTCDay()].slice(0, 3),
          dayOfMonth: anchor.getUTCDate(),
          month: MONTH_NAMES[anchor.getUTCMonth()],
          isToday: key === today,
          isPast: key < today, // ISO date strings sort lexicographically
        };
      }),
    };
  });
}

export function formatShort(key) {
  const anchor = keyToAnchor(key);
  return `${MONTH_NAMES[anchor.getUTCMonth()]} ${anchor.getUTCDate()}`;
}

/** Every day key the board currently covers, flattened. */
export function coveredDayKeys(timezone, weeks) {
  return buildCalendarShell(timezone, weeks).flatMap((week) => week.days.map((day) => day.key));
}
