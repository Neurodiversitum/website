import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  cleanDate,
  cleanEmail,
  cleanLinkedin,
  isUniversityEmail,
  readPrivacyConsent,
  readProfile,
} from '../src/lib/members/validate.ts';

function form(entries) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

test('email addresses are trimmed, lower-cased and checked', () => {
  assert.equal(cleanEmail('  Max@Example.ORG '), 'max@example.org');
  assert.equal(cleanEmail('not an email'), null);
  assert.equal(cleanEmail(''), null);
});

test('university addresses that cannot receive our mail are recognised', () => {
  assert.equal(isUniversityEmail('max@tum.de'), true);
  assert.equal(isUniversityEmail('Max@MyTUM.de'), true);
  assert.equal(isUniversityEmail('max@in.tum.de'), true);
  assert.equal(isUniversityEmail('max@lmu.de'), true);
  assert.equal(isUniversityEmail('max@campus.lmu.de'), true);
  assert.equal(isUniversityEmail('max@gmail.com'), false);
  assert.equal(isUniversityEmail('max@notum.de'), false);
});

test('LinkedIn addresses are normalised and other hosts are rejected', () => {
  assert.equal(
    cleanLinkedin('linkedin.com/in/ada/'),
    'https://www.linkedin.com/in/ada',
  );
  assert.equal(
    cleanLinkedin('https://de.linkedin.com/in/ada'),
    'https://www.linkedin.com/in/ada',
  );
  assert.equal(cleanLinkedin('https://example.com/ada'), 'invalid');
  assert.equal(cleanLinkedin(''), null);
});

test('dates of birth must be real past dates', () => {
  assert.equal(cleanDate('2001-02-28'), '2001-02-28');
  assert.equal(cleanDate('2001-02-30'), 'invalid');
  assert.equal(cleanDate('2999-01-01'), 'invalid');
  assert.equal(cleanDate('1899-12-31'), 'invalid');
  assert.equal(cleanDate(''), null);
});

test('a complete registration passes and optional answers stay optional', () => {
  const { input, errors } = readProfile(
    form({ name: '  Ada   Lovelace ', university: 'LMU', language: 'de' }),
  );
  assert.deepEqual(errors, []);
  assert.equal(input.name, 'Ada Lovelace');
  assert.equal(input.university, 'LMU');
  assert.equal(input.gender, null);
  assert.equal(input.mailEvents, false);
});

test('unknown choices and short names are reported by field', () => {
  const { errors } = readProfile(
    form({ name: 'A', university: 'Harvard', language: 'fr', gender: 'other' }),
  );
  assert.deepEqual(errors, ['name', 'university', 'language', 'gender']);
  assert.equal(readPrivacyConsent(form({})), false);
  assert.equal(readPrivacyConsent(form({ privacyConsent: 'on' })), true);
});

test('the Notion copy of a member carries every field in the expected shape', async () => {
  const { memberProperties } =
    await import('../src/lib/members/notion-properties.ts');
  const properties = memberProperties({
    user_id: 'u1',
    name: 'Ada King',
    email: 'ada@example.org',
    university: 'LMU',
    language: 'de',
    linkedin: null,
    date_of_birth: '2001-02-28',
    gender: 'non_binary',
    privacy_consent_at: '2026-10-10T10:00:00.000Z',
    directory_opt_in: 1,
    mail_events: 1,
    mail_newsletter: 0,
    picture_key: null,
    role: 'member',
    notion_page_id: null,
    created_at: '2026-10-10T10:00:00.000Z',
    updated_at: '2026-10-10T10:00:00.000Z',
  });
  assert.equal(properties.Name.title[0].text.content, 'Ada King');
  assert.equal(properties.Email.email, 'ada@example.org');
  assert.equal(properties.University.select.name, 'LMU');
  assert.equal(properties.Gender.select.name, 'Non-binary');
  assert.equal('Neurodivergence' in properties, false);
  assert.equal(properties.LinkedIn.url, null);
  assert.equal(properties.Directory.checkbox, true);
  assert.equal(properties.Newsletter.checkbox, false);
  assert.deepEqual(properties.Joined.date, { start: '2026-10-10' });
  assert.equal(properties.Status.select.name, 'active');
});

test('pictures are recognised by their first bytes', async () => {
  const { detectImageType, materialContentType, safeFileName, formatBytes } =
    await import('../src/lib/members/files.ts');
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const png = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
  ]);
  const webp = new Uint8Array(
    [...'RIFF']
      .map((c) => c.charCodeAt(0))
      .concat(
        [0, 0, 0, 0],
        [...'WEBP'].map((c) => c.charCodeAt(0)),
      ),
  );
  assert.equal(detectImageType(jpeg), 'image/jpeg');
  assert.equal(detectImageType(png), 'image/png');
  assert.equal(detectImageType(webp), 'image/webp');
  assert.equal(
    detectImageType(
      new Uint8Array([0x47, 0x49, 0x46, 0x38, 0, 0, 0, 0, 0, 0, 0, 0]),
    ),
    null,
  );
  assert.equal(detectImageType(new Uint8Array(3)), null);
  assert.equal(materialContentType('Slides.PDF'), 'application/pdf');
  assert.equal(materialContentType('run.exe'), null);
  assert.equal(materialContentType('noextension'), null);
  assert.equal(safeFileName('../Übungs blatt (1).pdf'), 'Ubungs-blatt-1.pdf');
  assert.equal(safeFileName('???'), 'file');
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(2 * 1024 * 1024), '2.0 MB');
  assert.equal(formatBytes(1536), '1.5 kB');
  assert.equal(formatBytes(25 * 1024 * 1024, 'de'), '25 MB');
});

test('retention periods match the privacy policy and the job runs hourly', async () => {
  const { RETENTION, daysBefore, retentionDue } =
    await import('../src/lib/members/retention-rules.ts');
  assert.equal(RETENTION.unconfirmedDays, 14);
  assert.equal(RETENTION.inactiveDays, 730);
  assert.equal(RETENTION.warningGraceDays, 30);
  assert.equal(RETENTION.registrationDays, 365);
  assert.equal(RETENTION.inboxClosedDays, 365);
  assert.equal(RETENTION.inboxMaxDays, 730);
  assert.equal(
    daysBefore(new Date('2026-10-10T12:00:00Z'), 14),
    '2026-09-26T12:00:00.000Z',
  );
  assert.equal(retentionDue(new Date('2026-10-10T12:05:00Z')), true);
  assert.equal(retentionDue(new Date('2026-10-10T12:15:00Z')), false);
  const { readFileSync } = await import('node:fs');
  const copy = readFileSync(
    new URL('../src/data/copy.ts', import.meta.url),
    'utf8',
  );
  for (const phrase of [
    'after 14 days',
    'for two years',
    'within 30 days',
    'one year after the event',
    '30 days',
  ]) {
    assert.ok(copy.includes(phrase), `privacy policy names "${phrase}"`);
  }
});
