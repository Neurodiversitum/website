import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  eventRow,
  extensionOf,
  file,
  projectRow,
  teamRow,
} from '../scripts/notion.mjs';

const root = new URL('../', import.meta.url);

function page(properties) {
  return { id: 'page-1', properties };
}
const rich = (value) => ({ rich_text: [{ plain_text: value }] });

test('team rows read every property the Team page needs', () => {
  const row = teamRow(
    page({
      Name: { title: [{ plain_text: 'Ada ' }, { plain_text: 'Lovelace' }] },
      'Role (EN)': rich('IT Lead'),
      'Role (DE)': rich(''),
      'Bio (EN)': rich(''),
      'Bio (DE)': rich(''),
      LinkedIn: { url: ' https://www.linkedin.com/in/ada/ ' },
      Group: { select: { name: 'Board' } },
      Order: { number: 2 },
      Photo: { files: [] },
    }),
  );
  assert.deepEqual(row, {
    id: 'page-1',
    name: 'Ada Lovelace',
    role: { en: 'IT Lead', de: '' },
    bio: { en: '', de: '' },
    linkedin: 'https://www.linkedin.com/in/ada/',
    group: 'Board',
    order: 2,
    photo: null,
  });
});

test('missing properties become empty values instead of errors', () => {
  const row = projectRow(page({}));
  assert.equal(row.slug, '');
  assert.equal(row.status, null);
  assert.equal(row.order, null);
  assert.deepEqual(row.title, { en: '', de: '' });
});

test('event dates keep start, end and whether a time was given', () => {
  const dated = eventRow(
    page({
      Date: { date: { start: '2026-11-03T18:00:00.000+01:00', end: null } },
    }),
  );
  assert.deepEqual(dated.date, {
    start: '2026-11-03T18:00:00.000+01:00',
    end: null,
    isDatetime: true,
  });
  const allDay = eventRow(
    page({ Date: { date: { start: '2026-11-03', end: '2026-11-04' } } }),
  );
  assert.deepEqual(allDay.date, {
    start: '2026-11-03',
    end: '2026-11-04',
    isDatetime: false,
  });
  assert.equal(eventRow(page({})).date, null);
});

test('files give a download URL for uploaded and external images', () => {
  const uploaded = file(
    page({
      Photo: {
        files: [
          {
            type: 'file',
            name: 'me.png',
            file: { url: 'https://x/me.png?sig=1' },
          },
        ],
      },
    }),
    'Photo',
  );
  assert.deepEqual(uploaded, { url: 'https://x/me.png?sig=1', name: 'me.png' });
  const external = file(
    page({
      Photo: {
        files: [
          { type: 'external', name: '', external: { url: 'https://y/pic' } },
        ],
      },
    }),
    'Photo',
  );
  assert.equal(external.url, 'https://y/pic');
  assert.equal(file(page({ Photo: { files: [] } }), 'Photo'), null);
  assert.equal(extensionOf('me.PNG', 'https://x/me.png?sig=1'), 'png');
  assert.equal(extensionOf('', 'https://x/dir/photo.webp?x=1'), 'webp');
  assert.equal(extensionOf('', 'https://y/pic'), 'jpg');
});

test('the committed content snapshot has the shape the pages expect', () => {
  const content = JSON.parse(
    readFileSync(new URL('src/data/content.json', root), 'utf8'),
  );
  for (const key of ['team', 'projects', 'events']) {
    assert.ok(Array.isArray(content[key]), `${key} must be a list`);
  }
  for (const person of content.team) {
    assert.ok(person.id && person.name, 'every person has an id and a name');
    assert.equal(typeof person.role.en, 'string');
  }
  for (const project of content.projects) {
    assert.match(project.slug, /^[a-z0-9-]+$/, 'slugs are URL safe');
  }
});
