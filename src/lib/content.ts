// Content from Notion (team, projects, events), read from src/data/content.json.
// Events are also loaded at runtime by the Worker (src/lib/events); this file is their fallback.
// scripts/fetch-content.mjs refreshes that file before every build; the committed copy is the fallback.
import content from '@/data/content.json';
import type { Language } from '@/lib/i18n';

export interface TextPair {
  en: string;
  de: string;
}
export interface TeamMember {
  id: string;
  name: string;
  role: TextPair;
  bio: TextPair;
  linkedin: string | null;
  group: string | null;
  order: number | null;
  photo: string | null;
}
export interface Project {
  id: string;
  slug: string;
  title: TextPair;
  summary: TextPair;
  status: string | null;
  order: number | null;
  image: string | null;
}
export interface EventDate {
  start: string;
  end: string | null;
  isDatetime: boolean;
}
export interface Event {
  id: string;
  title: TextPair;
  summary: TextPair;
  date: EventDate | null;
  location: string;
  registrationLink: string | null;
  image: string | null;
}
interface Content {
  team: TeamMember[];
  projects: Project[];
  events: Event[];
}

const data = content as Content;

/** The text in the visitor's language; English when the German field is empty. */
export function localized(pair: TextPair, lang: Language): string {
  return (lang === 'de' && pair.de.trim()) || pair.en;
}

export function getTeam(): TeamMember[] {
  return data.team;
}

export function getProjects(): Project[] {
  return data.projects;
}

/** Initials for the avatar when a person has no photo, for example "MM". */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

/** Today's date in Munich as YYYY-MM-DD, so the cut-off does not depend on the server's zone. */
export function todayInMunich(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    dateStyle: 'short',
  }).format(new Date());
}

/** True when the event has a date and has not ended before `today` (YYYY-MM-DD). */
export function isUpcoming(event: Event, today: string): boolean {
  if (!event.date) return false;
  const last = event.date.end ?? event.date.start;
  return last.slice(0, 10) >= today;
}

/** Events that have not ended yet, soonest first. */
export function upcomingEvents(
  events: Event[],
  today = todayInMunich(),
): Event[] {
  return events
    .filter((event) => isUpcoming(event, today))
    .sort((a, b) => a.date!.start.localeCompare(b.date!.start));
}

/**
 * The events of the last build (content.json). Pages read the live list from the database
 * (src/lib/events); this snapshot is the fallback until the Worker has loaded Notion once.
 */
export function getSnapshotEvents(): Event[] {
  return data.events;
}

/** A readable date, with the time only when the Notion entry has one. */
export function formatEventDate(date: EventDate, lang: Language): string {
  const locale = lang === 'de' ? 'de-DE' : 'en-GB';
  const options: Intl.DateTimeFormatOptions = date.isDatetime
    ? { dateStyle: 'full', timeStyle: 'short', timeZone: 'Europe/Berlin' }
    : { dateStyle: 'full', timeZone: 'UTC' };
  const formatter = new Intl.DateTimeFormat(locale, options);
  const start = formatter.format(new Date(date.start));
  if (!date.end) return start;
  const sameDay = date.end.slice(0, 10) === date.start.slice(0, 10);
  if (sameDay && date.isDatetime) {
    const time = new Intl.DateTimeFormat(locale, {
      timeStyle: 'short',
      timeZone: 'Europe/Berlin',
    }).format(new Date(date.end));
    return `${start} – ${time}`;
  }
  return `${start} – ${formatter.format(new Date(date.end))}`;
}
