// Loads Team, Projects and Events from Notion and writes src/data/content.json plus the images
// under public/content/. Runs before every build (npm run build) and with npm run content.
//
// Only rows with "Published" checked are used. When Notion cannot be reached or the token is
// missing, the committed content.json stays as it is and the build continues (exit code 0).
// With --strict a failure exits with code 1.
//
// The token comes from NOTION_TOKEN and the database ids from NOTION_TEAM_DB, NOTION_PROJECTS_DB
// and NOTION_EVENTS_DB (a local .env file, see .env.example, or build secrets).

import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  databases,
  extensionOf,
  file,
  imageField,
  imageProperty,
  rowMappers,
  sorts,
} from './notion.mjs';

const root = path.resolve(import.meta.dirname, '..');
const contentFile = path.join(root, 'src/data/content.json');
const imageRoot = path.join(root, 'public/content');
const strict = process.argv.includes('--strict');
const token = process.env.NOTION_TOKEN?.trim();

const headers = {
  'Notion-Version': '2022-06-28',
  'Content-Type': 'application/json',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
};

async function queryAll(databaseId, sort) {
  const pages = [];
  let cursor;
  do {
    const response = await fetch(
      `https://api.notion.com/v1/databases/${databaseId}/query`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          page_size: 100,
          filter: { property: 'Published', checkbox: { equals: true } },
          sorts: sort,
          ...(cursor ? { start_cursor: cursor } : {}),
        }),
      },
    );
    if (!response.ok) {
      throw new Error(
        `Notion answered ${response.status} for database ${databaseId}: ${await response.text()}`,
      );
    }
    const data = await response.json();
    pages.push(...data.results);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return pages;
}

/** Downloads one image to public/content/<collection>/<id>-<hash>.<ext>; returns the site path. */
async function saveImage(collection, page, previousPath) {
  const source = file(page, imageProperty[collection]);
  if (!source) return previousPath;
  const response = await fetch(source.url);
  if (!response.ok) {
    console.warn(
      `content: image for ${collection} ${page.id} answered ${response.status}, keeping the previous one`,
    );
    return previousPath;
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 8);
  const extension = extensionOf(source.name, source.url);
  const directory = path.join(imageRoot, collection);
  await mkdir(directory, { recursive: true });
  const fileName = `${page.id}-${hash}.${extension}`;
  // Remove older versions of the same image so the folder does not grow.
  for (const existing of await readdir(directory)) {
    if (existing.startsWith(`${page.id}-`) && existing !== fileName) {
      await rm(path.join(directory, existing));
    }
  }
  await writeFile(path.join(directory, fileName), bytes);
  return `/content/${collection}/${fileName}`;
}

/**
 * The image of the previous run that stays when Notion has none. Team photos may be the
 * committed portraits under /assets/; projects and events only keep images that came from Notion.
 */
function keptImage(collection, previous) {
  if (!previous) return null;
  if (collection === 'team' || previous.startsWith('/content/'))
    return previous;
  return null;
}

async function readPrevious() {
  try {
    return JSON.parse(await readFile(contentFile, 'utf8'));
  } catch {
    return { team: [], projects: [], events: [] };
  }
}

async function main() {
  const previous = await readPrevious();
  const next = {};
  for (const collection of Object.keys(databases)) {
    const pages = await queryAll(databases[collection], sorts[collection]);
    const field = imageField[collection];
    const previousById = new Map(
      (previous[collection] ?? []).map((row) => [row.id, row]),
    );
    next[collection] = [];
    for (const page of pages) {
      const row = rowMappers[collection](page);
      row[field] = await saveImage(
        collection,
        page,
        keptImage(collection, previousById.get(page.id)?.[field]),
      );
      next[collection].push(row);
    }
  }
  await writeFile(contentFile, `${JSON.stringify(next, null, 2)}\n`);
  console.log(
    `content: ${next.team.length} team, ${next.projects.length} projects, ${next.events.length} events from Notion`,
  );
}

try {
  await main();
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error);
  if (strict) {
    console.error(`content: sync failed: ${reason}`);
    process.exit(1);
  }
  console.warn(
    `content: Notion not available (${reason.split('\n')[0]}). Building from the committed content.json.`,
  );
}
