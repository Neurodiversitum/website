import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  calendarFile,
  calendarFileName,
  escapeText,
  foldLine,
  isAllDay,
} from '../src/lib/members/ics.ts';
import { csv } from '../src/lib/members/csv.ts';
import { roleChangeProblem } from '../src/lib/members/roles.ts';

const now = new Date('2026-10-10T12:00:00Z');

test('all-day events get DATE values and an exclusive end', () => {
  const file = calendarFile(
    {
      id: 'abc',
      title: 'Autumn meetup',
      start: '2026-11-03',
      end: null,
      location: 'TUM, Room 1',
      description: 'Bring a friend, or two',
      url: 'https://neurodiversitum.org/events',
    },
    now,
  );
  assert.ok(file.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.match(file, /UID:abc@neurodiversitum\.org/);
  assert.match(file, /DTSTAMP:20261010T120000Z/);
  assert.match(file, /DTSTART;VALUE=DATE:20261103/);
  assert.match(file, /DTEND;VALUE=DATE:20261104/);
  assert.match(file, /LOCATION:TUM\\, Room 1/);
  assert.match(file, /DESCRIPTION:Bring a friend\\, or two/);
  assert.ok(file.endsWith('END:VCALENDAR\r\n'));
  assert.equal(isAllDay('2026-11-03'), true);
  assert.equal(isAllDay('2026-11-03T18:00:00.000+01:00'), false);
});

test('timed events are written in UTC with start and end', () => {
  const file = calendarFile(
    {
      id: 'x',
      title: 'Talk',
      start: '2026-11-03T18:00:00.000+01:00',
      end: '2026-11-03T19:30:00.000+01:00',
      location: null,
      description: null,
      url: null,
    },
    now,
  );
  assert.match(file, /DTSTART:20261103T170000Z/);
  assert.match(file, /DTEND:20261103T183000Z/);
  assert.doesNotMatch(file, /LOCATION/);
});

test('long lines are folded at 75 octets and text is escaped', () => {
  const folded = foldLine(`SUMMARY:${'a'.repeat(100)}`);
  const parts = folded.split('\r\n ');
  assert.equal(parts.length, 2);
  assert.ok(new TextEncoder().encode(parts[0]).length <= 75);
  assert.equal(escapeText('a;b,c\\d\ne'), 'a\;b\\,c\\\\d\\ne');
  assert.equal(
    calendarFileName('Herbst-Treffen: Café!'),
    'neurodiversitum-herbst-treffen-cafe.ics',
  );
});

test('CSV quotes every cell and neutralises formula characters', () => {
  const body = csv(
    ['Name', 'Note'],
    [
      ['Ada "A" King', '=SUM(1)'],
      ['Bob', null],
    ],
  );
  assert.equal(
    body,
    '﻿"Name","Note"\r\n"Ada ""A"" King","\'=SUM(1)"\r\n"Bob",""\r\n',
  );
});

test('the last admin cannot be demoted', () => {
  const admin = { user_id: 'a', role: 'admin' };
  assert.equal(roleChangeProblem(admin, 'member', 1), 'lastAdmin');
  assert.equal(roleChangeProblem(admin, 'member', 2), null);
  assert.equal(roleChangeProblem(admin, 'admin', 1), null);
  assert.equal(
    roleChangeProblem({ user_id: 'b', role: 'member' }, 'board', 1),
    null,
  );
  assert.equal(
    roleChangeProblem({ user_id: 'b', role: 'member' }, 'owner', 1),
    'unknownRole',
  );
  assert.equal(roleChangeProblem(null, 'board', 1), 'notFound');
});
