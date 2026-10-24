import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const root = new URL('../', import.meta.url);
const publicPages = [
  'index',
  'about',
  'team',
  'projects/index',
  'projects/[slug]',
  'events',
  'ideas',
  'join',
  'newsletter',
  'imprint',
  'privacy',
  'cookies',
];

test('every public page exists in English and German', () => {
  for (const page of publicPages) {
    for (const dir of ['src/pages', 'src/pages/de']) {
      const file = `${dir}/${page}.astro`;
      assert.equal(existsSync(new URL(file, root)), true, `${file} is missing`);
    }
  }
  assert.equal(existsSync(new URL('src/pages/404.astro', root)), true);
});

test('font is self-hosted and Google Fonts is absent', () => {
  const layout = readFileSync(
    new URL('src/layouts/BaseLayout.astro', root),
    'utf8',
  );
  const pkg = readFileSync(new URL('package.json', root), 'utf8');
  assert.match(pkg, /@fontsource-variable\/geist/);
  assert.doesNotMatch(layout, /fonts\.googleapis\.com|fonts\.gstatic\.com/);
});

test('Tally forms use the approved form identifiers', () => {
  const site = readFileSync(new URL('src/data/site.ts', root), 'utf8');
  for (const [form, id] of [
    ['ideas', 'zxo1Pq'],
    ['newsletter', 'XxkzLV'],
  ])
    assert.match(site, new RegExp(`${form}: '${id}'`));
});

test('inline scripts never contain src="${…}", which crawlers request as a link', () => {
  const embed = readFileSync(
    new URL('src/components/ConsentEmbed.astro', root),
    'utf8',
  );
  assert.doesNotMatch(embed, /src="\$\{/);
});

test('third-party embeds load only after consent', () => {
  const sources = ['src/views/About.astro', 'src/components/TallyEmbed.astro']
    .map((file) => readFileSync(new URL(file, root), 'utf8'))
    .join('\n');
  // Embeds keep their address in data-src inside <ConsentEmbed>; a plain src would load them on page view.
  assert.doesNotMatch(
    sources,
    /\ssrc=\{?[`'"]https:\/\/(www\.youtube|tally\.so)/,
  );
  assert.match(sources, /<ConsentEmbed provider="youtube">/);
  assert.match(sources, /<ConsentEmbed provider="tally">/);
});

test('security headers are configured', () => {
  const headers = readFileSync(new URL('public/_headers', root), 'utf8');
  for (const name of [
    'Strict-Transport-Security',
    'X-Content-Type-Options',
    'X-Frame-Options',
    'Referrer-Policy',
    'Permissions-Policy',
    "frame-ancestors 'none'",
  ]) {
    assert.match(headers, new RegExp(name));
  }
});

test('the contact address is contact@ everywhere, the imprint keeps Max as responsible person', () => {
  const copy = readFileSync(new URL('src/data/copy.ts', root), 'utf8');
  const site = readFileSync(new URL('src/data/site.ts', root), 'utf8');
  assert.match(site, /email: 'contact@neurodiversitum\.org'/);
  assert.doesNotMatch(copy, /maximilian\.michels@neurodiversitum\.org/);
  assert.match(copy, /Maximilian Michels\\nLeopoldstraße 257/);
});

test('the settings offer no text size option', () => {
  const header = readFileSync(
    new URL('src/components/Header.astro', root),
    'utf8',
  );
  assert.doesNotMatch(header, /textSize|data-pref="scale"/);
});
