// Pure rules for events from Notion: change detection, the snapshot a registration keeps,
// the board's grouping and the image file names. No bindings here, so unit tests can run them.
import type { Event } from '../content';
import type { RegistrationWithMember } from '../members/db';

/** What a registration stores about its event, so lists stay readable when Notion changes. */
export interface EventSnapshot {
  title: string;
  start: string | null;
  end: string | null;
  location: string | null;
}

export function eventSnapshot(event: Event): EventSnapshot {
  return {
    title: event.title.en,
    start: event.date?.start ?? null,
    end: event.date?.end ?? null,
    location: event.location || null,
  };
}

/** True when a Notion edit changed anything the site shows. */
export function eventChanged(before: Event | undefined, after: Event): boolean {
  return JSON.stringify(before ?? null) !== JSON.stringify(after);
}

/** A Notion file link without its signature, so an unchanged image is not downloaded again. */
export function imageSource(href: string): string {
  const url = new URL(href);
  return `${url.origin}${url.pathname}`;
}

/** Event images in R2 live under events/<file>; the site serves them at /media/events/<file>. */
export const MEDIA_FILE = /^[0-9a-f-]{32,36}-[0-9a-f]{8}\.[a-z0-9]{2,5}$/;

export function mediaFile(eventId: string, hash: string, extension: string) {
  return `${eventId}-${hash.slice(0, 8)}.${extension}`;
}

export interface EventGroup {
  eventId: string;
  title: string;
  start: string | null;
  end: string | null;
  location: string | null;
  /** Published in Notion and not over yet. */
  upcoming: boolean;
  registrations: RegistrationWithMember[];
}

/**
 * The board's list: every upcoming event from Notion (also without registrations), soonest
 * first, then past or unpublished events that have registrations, newest first.
 */
export function boardGroups(
  upcoming: Event[],
  registrations: RegistrationWithMember[],
  titleOf: (event: Event) => string,
): EventGroup[] {
  const byEvent = new Map<string, RegistrationWithMember[]>();
  for (const row of registrations) {
    const rows = byEvent.get(row.event_id) ?? [];
    rows.push(row);
    byEvent.set(row.event_id, rows);
  }
  const groups: EventGroup[] = upcoming.map((event) => ({
    eventId: event.id,
    title: titleOf(event),
    start: event.date?.start ?? null,
    end: event.date?.end ?? null,
    location: event.location || null,
    upcoming: true,
    registrations: byEvent.get(event.id) ?? [],
  }));
  const shown = new Set(groups.map((group) => group.eventId));
  const earlier = [...byEvent.entries()]
    .filter(([eventId]) => !shown.has(eventId))
    .map(([eventId, rows]) => ({
      eventId,
      title: rows[0]!.event_title,
      start: rows[0]!.event_start,
      end: rows[0]!.event_end,
      location: rows[0]!.event_location,
      upcoming: false,
      registrations: rows,
    }))
    .sort((a, b) => (b.start ?? '').localeCompare(a.start ?? ''));
  return [...groups, ...earlier];
}
