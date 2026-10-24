// Calendar files (RFC 5545) for event registrations. Pure functions, no library, testable in Node.

export interface CalendarEvent {
  /** Stable id of the event, for example the Notion page id. */
  id: string;
  title: string;
  /** ISO date (YYYY-MM-DD) for all-day events, or an ISO date-time. */
  start: string;
  end: string | null;
  location: string | null;
  description: string | null;
  url: string | null;
}

const DOMAIN = 'neurodiversitum.org';

export function isAllDay(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Escapes text for an iCalendar property value. */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Folds a content line at 75 octets, as the standard requires. */
export function foldLine(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  let currentBytes = 0;
  for (const char of line) {
    const size = new TextEncoder().encode(char).length;
    const limit = parts.length === 0 ? 75 : 74;
    if (currentBytes + size > limit) {
      parts.push(current);
      current = '';
      currentBytes = 0;
    }
    current += char;
    currentBytes += size;
  }
  if (current) parts.push(current);
  return parts.join('\r\n ');
}

function stampUtc(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

function dateOnly(value: string): string {
  return value.replace(/-/g, '');
}

/** The day after an all-day date, because DTEND of an all-day event is exclusive. */
function nextDay(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/** One VCALENDAR with one VEVENT. `now` is injectable for tests. */
export function calendarFile(
  event: CalendarEvent,
  now: Date = new Date(),
): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//Neurodiversitum//Member area//EN`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.id}@${DOMAIN}`,
    `DTSTAMP:${stampUtc(now)}`,
  ];
  if (isAllDay(event.start)) {
    lines.push(`DTSTART;VALUE=DATE:${dateOnly(event.start)}`);
    const end = event.end && isAllDay(event.end) ? event.end : event.start;
    lines.push(`DTEND;VALUE=DATE:${dateOnly(nextDay(end))}`);
  } else {
    lines.push(`DTSTART:${stampUtc(new Date(event.start))}`);
    if (event.end) lines.push(`DTEND:${stampUtc(new Date(event.end))}`);
  }
  lines.push(`SUMMARY:${escapeText(event.title)}`);
  if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
  if (event.description)
    lines.push(`DESCRIPTION:${escapeText(event.description)}`);
  if (event.url) lines.push(`URL:${event.url}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

/** A safe file name such as `neurodiversitum-autumn-meetup.ics`. */
export function calendarFileName(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return `neurodiversitum-${slug || 'event'}.ics`;
}
