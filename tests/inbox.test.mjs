import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  berlinTime,
  boardMember,
  cleanAddress,
  cleanMessageId,
  displayName,
  isAutomatic,
  isOwnAddress,
  previewText,
  reminderDigest,
  subjectKey,
  summaryDue,
  threadIds,
} from '../src/lib/inbox/rules.ts';

const headers = (entries) => new Headers(entries);

test('addresses, names and message ids are cleaned', () => {
  assert.equal(cleanAddress('"Ada King" <Ada@Example.ORG>'), 'ada@example.org');
  assert.equal(cleanAddress(' ada@example.org '), 'ada@example.org');
  assert.equal(displayName('"Ada King" <ada@example.org>'), 'Ada King');
  assert.equal(displayName('Ada King <ada@example.org>'), 'Ada King');
  assert.equal(displayName('ada@example.org'), '');
  assert.equal(cleanMessageId(' <abc@mail.example> '), 'abc@mail.example');
  assert.deepEqual(threadIds('<c@x>', '<a@x> <b@x> <c@x>'), [
    'c@x',
    'a@x',
    'b@x',
  ]);
  assert.deepEqual(threadIds(null, null), []);
});

test('own addresses and board members are recognised', () => {
  assert.equal(isOwnAddress('Contact@neurodiversitum.org'), true);
  assert.equal(isOwnAddress('noreply@neurodiversitum.org'), true);
  assert.equal(isOwnAddress('someone@example.org'), false);
  assert.equal(
    boardMember('Board-Member-1@example.org')?.name,
    'Board Member One',
  );
  assert.equal(boardMember('nobody@gmail.com'), undefined);
});

test('bounces, auto-replies and list mail count as automatic', () => {
  assert.equal(isAutomatic(headers({}), ''), true);
  assert.equal(isAutomatic(headers({}), 'MAILER-DAEMON@mx.example'), true);
  assert.equal(
    isAutomatic(headers({ 'auto-submitted': 'auto-replied' }), 'a@b.c'),
    true,
  );
  assert.equal(
    isAutomatic(headers({ 'auto-submitted': 'no' }), 'a@b.c'),
    false,
  );
  assert.equal(isAutomatic(headers({ precedence: 'bulk' }), 'a@b.c'), true);
  assert.equal(
    isAutomatic(headers({ 'list-id': '<news.example>' }), 'a@b.c'),
    true,
  );
  assert.equal(isAutomatic(headers({ subject: 'Hello' }), 'a@b.c'), false);
});

test('subjects match across reply prefixes', () => {
  assert.equal(
    subjectKey('Re: AW:  Question about  meetups'),
    'question about meetups',
  );
  assert.equal(subjectKey('Fwd: WG: Hi'), 'hi');
  assert.equal(subjectKey(null), '');
});

test('previews drop quoted text and html tags and stay short', () => {
  const text = 'Hello,\n\ncan I join?\n\nOn Mon, Ada wrote:\n> old stuff';
  assert.equal(previewText(text, null), 'Hello, can I join?');
  assert.equal(
    previewText('', '<p>Hi &amp; <b>bye</b></p><style>p{}</style>'),
    'Hi & bye',
  );
  const long = previewText('x'.repeat(500), null);
  assert.equal(long.length, 300);
  assert.ok(long.endsWith('…'));
});

test('the daily summary is due once per day after the summary hour in Munich', () => {
  const summerEvening = new Date('2026-07-01T18:05:00Z'); // 20:05 in Munich (CEST)
  const summerAfternoon = new Date('2026-07-01T17:55:00Z'); // 19:55
  const winterEvening = new Date('2026-12-01T19:05:00Z'); // 20:05 in Munich (CET)
  assert.deepEqual(berlinTime(summerEvening), {
    date: '2026-07-01',
    hour: 20,
    minute: 5,
  });
  assert.equal(summaryDue(summerEvening, null), true);
  assert.equal(summaryDue(summerEvening, '2026-07-01'), false);
  assert.equal(summaryDue(summerEvening, '2026-06-30'), true);
  assert.equal(summaryDue(summerAfternoon, null), false);
  assert.equal(summaryDue(winterEvening, '2026-11-30'), true);
});

test('reminders for several messages are bundled into one mail', () => {
  const row = (n) => ({
    subject: `Question ${n}`,
    from_email: `p${n}@example.org`,
    from_name: n === 1 ? 'Lena' : null,
    received_at: '2026-10-10T11:00:00.000Z',
    preview: n === 1 ? 'Can I join?' : null,
    notion_page_id: n === 1 ? 'abc-def' : null,
  });
  const one = reminderDigest([row(1)]);
  assert.equal(one.subject, 'Unanswered: Question 1');
  assert.ok(one.lines[1].includes('Lena <p1@example.org>'));
  assert.ok(one.lines[1].includes('https://www.notion.so/abcdef'));
  const many = reminderDigest([row(1), row(2), row(3)]);
  assert.equal(
    many.subject,
    '3 unanswered messages at contact@neurodiversitum.org',
  );
  assert.equal(many.lines.length, 5);
  assert.ok(many.lines[2].startsWith('2. Question 2'));
});
