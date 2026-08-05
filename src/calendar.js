// Calendar export.
//
// Sessions are stored as a date plus minutes since midnight Eastern, with no
// timezone attached. A calendar needs real instants, so each wall-clock time is
// converted to UTC using the zone's actual offset for that date — which is what
// keeps this correct across a daylight-saving change rather than only in August.

const TIME_ZONE = 'America/New_York';
const CALENDAR_NAME = 'Jhana Noting Retreat — August 2026';
const UID_DOMAIN = 'jhana-noting-retreat';

// How far the zone was from UTC at a given instant, in milliseconds.
function zoneOffsetMs(utcMs) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs));

  const field = {};
  for (const { type, value } of parts) field[type] = value;

  // Some engines render midnight as hour 24 under hour12: false.
  const hour = field.hour === '24' ? 0 : Number(field.hour);
  const asIfUtc = Date.UTC(
    Number(field.year),
    Number(field.month) - 1,
    Number(field.day),
    hour,
    Number(field.minute),
    Number(field.second),
  );
  return asIfUtc - utcMs;
}

// A wall-clock time in the retreat's zone to the UTC instant it names. The second
// pass matters only on daylight-saving days, where the first guess can land on the
// wrong side of the shift.
function easternToUtcMs({ year, month, day, hour, minute }) {
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  const firstPass = naive - zoneOffsetMs(naive);
  return naive - zoneOffsetMs(firstPass);
}

// Minutes are counted from the day's midnight and may reach 1440, which is the
// following midnight — so the date rolls forward rather than clamping.
function wallClockFor(dayDate, minutes) {
  const [year, month, day] = dayDate.split('-').map(Number);
  const extraDays = Math.floor(minutes / 1440);
  const withinDay = minutes - extraDays * 1440;
  const rolled = new Date(Date.UTC(year, month - 1, day + extraDays));
  return {
    year: rolled.getUTCFullYear(),
    month: rolled.getUTCMonth() + 1,
    day: rolled.getUTCDate(),
    hour: Math.floor(withinDay / 60),
    minute: withinDay % 60,
  };
}

export function utcStampFor(dayDate, minutes) {
  const ms = easternToUtcMs(wallClockFor(dayDate, minutes));
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function escapeText(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

// RFC 5545 caps a content line at 75 octets, continued with a leading space.
// Counted in bytes, not characters, because the retreat name contains an em dash.
function foldLine(line) {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;

  const out = [];
  let current = '';
  let bytes = 0;
  let limit = 75;

  for (const char of line) {
    const size = encoder.encode(char).length;
    if (bytes + size > limit) {
      out.push(current);
      current = char;
      bytes = size + 1; // the continuation space counts toward the next line
      limit = 75;
    } else {
      current += char;
      bytes += size;
    }
  }
  out.push(current);
  return out.join('\r\n ');
}

function summaryFor(block) {
  const leader = block.leading[0];
  return leader ? `Sit — led by ${leader.name}` : 'Sit — no leader yet';
}

function descriptionFor(block, siteUrl) {
  const lines = [
    block.leading.length ? `Leading: ${block.leading.map((s) => s.name).join(', ')}` : 'No one leading yet',
    block.attending.length
      ? `Attending: ${block.attending.map((s) => s.name).join(', ')}`
      : 'No one signed up yet',
  ];
  if (siteUrl) lines.push(`Schedule: ${siteUrl}`);
  return lines.join('\n');
}

export function buildIcs({ schedule, siteUrl, joinUrl, stamp }) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${UID_DOMAIN}//Schedule//EN`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(CALENDAR_NAME)}`,
    `X-WR-TIMEZONE:${TIME_ZONE}`,
    // Hints for how often a subscribed client should re-read the feed.
    'REFRESH-INTERVAL;VALUE=DURATION:PT30M',
    'X-PUBLISHED-TTL:PT30M',
  ];

  for (const day of schedule) {
    for (const block of day.blocks) {
      lines.push(
        'BEGIN:VEVENT',
        `UID:session-${block.id}@${UID_DOMAIN}`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${utcStampFor(day.date, block.start_min)}`,
        `DTEND:${utcStampFor(day.date, block.end_min)}`,
        `SUMMARY:${escapeText(summaryFor(block))}`,
        `DESCRIPTION:${escapeText(descriptionFor(block, siteUrl))}`,
      );
      // The meeting room link doubles as the location, so the calendar entry is
      // clickable straight into the room.
      if (joinUrl) {
        lines.push(`LOCATION:${escapeText(joinUrl)}`, `URL:${escapeText(joinUrl)}`);
      } else if (siteUrl) {
        lines.push(`URL:${escapeText(siteUrl)}`);
      }
      lines.push('END:VEVENT');
    }
  }

  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
