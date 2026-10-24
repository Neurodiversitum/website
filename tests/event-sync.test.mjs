import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  MEDIA_FILE,
  boardGroups,
  eventChanged,
  eventSnapshot,
  imageSource,
  mediaFile,
} from '../src/lib/events/rules.ts';
import { securityHeaders } from '../src/lib/security-headers.ts';

const pair = (en, de = '') => ({ en, de });

function event(id, start, extra = {}) {
  return {
    id,
    title: pair(`Event ${id}`, `Termin ${id}`),
    summary: pair(''),
    date: { start, end: null, isDatetime: start.includes('T') },
    location: 'TUM',
    registrationLink: null,
    image: null,
    ...extra,
  };
}

function registration(eventId, title, start, name) {
  return {
    id: `${eventId}-${name}`,
    user_id: name,
    event_id: eventId,
    event_title: title,
    event_start: start,
    event_end: null,
    event_location: null,
    notion_page_id: null,
    created_at: '2026-10-01T10:00:00.000Z',
    name,
    email: `${name}@example.org`,
  };
}

test('a registration keeps the English title, dates and place of the event', () => {
  assert.deepEqual(eventSnapshot(event('a', '2026-11-03T18:00:00.000+01:00')), {
    title: 'Event a',
    start: '2026-11-03T18:00:00.000+01:00',
    end: null,
    location: 'TUM',
  });
  assert.equal(
    eventSnapshot(event('b', '2026-11-03', { location: '' })).location,
    null,
  );
});

test('only real edits count as a change', () => {
  const before = event('a', '2026-11-03');
  assert.equal(eventChanged(before, { ...before }), false);
  assert.equal(eventChanged(before, { ...before, location: 'LMU' }), true);
  assert.equal(eventChanged(undefined, before), true);
});

test('image links lose their signature, so an unchanged image is not loaded again', () => {
  assert.equal(
    imageSource('https://files.notion.so/ws/abc/photo.jpg?X-Amz-Signature=1'),
    imageSource('https://files.notion.so/ws/abc/photo.jpg?X-Amz-Signature=2'),
  );
});

test('event image names are safe and match the media route', () => {
  const name = mediaFile(
    '3f52fe73-c76e-81f2-87cb-fa5570b16aa5',
    'a1b2c3d4e5f6',
    'webp',
  );
  assert.equal(name, '3f52fe73-c76e-81f2-87cb-fa5570b16aa5-a1b2c3d4.webp');
  assert.match(name, MEDIA_FILE);
  assert.doesNotMatch('../secret.txt', MEDIA_FILE);
  assert.doesNotMatch('abc-a1b2c3d4.svg/../x', MEDIA_FILE);
});

test('the board lists every upcoming event, then earlier ones with registrations', () => {
  const upcoming = [event('soon', '2026-10-20'), event('later', '2026-12-01')];
  const rows = [
    registration('later', 'Event later', '2026-12-01', 'ada'),
    registration('old', 'Old meetup', '2026-05-01', 'bob'),
    registration('older', 'Older meetup', '2026-03-01', 'cy'),
  ];
  const groups = boardGroups(upcoming, rows, (e) => e.title.de);
  assert.deepEqual(
    groups.map((g) => [g.eventId, g.upcoming, g.registrations.length]),
    [
      ['soon', true, 0],
      ['later', true, 1],
      ['old', false, 1],
      ['older', false, 1],
    ],
  );
  assert.equal(groups[0].title, 'Termin soon');
  assert.equal(groups[2].title, 'Old meetup');
});

test('rendered pages get the same security headers as static files', () => {
  const file = readFileSync(
    new URL('../public/_headers', import.meta.url),
    'utf8',
  );
  const fromFile = Object.fromEntries(
    file
      .split('\n')
      .filter((line) => /^\s+\S+: /.test(line))
      .map((line) => {
        const [name, ...value] = line.trim().split(': ');
        return [name, value.join(': ')];
      }),
  );
  assert.deepEqual(securityHeaders, fromFile);
});
