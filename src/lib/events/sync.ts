// Events come from one place: the Notion database Board > Website > Events. The Worker loads
// the published rows into D1 (table `event`) every 10 minutes and when the board opens its
// event page; the public Events page and the member area read that table. Images go to R2.
// Token: secret NOTION_TOKEN, the read-only content integration that also feeds the build.
import { waitUntil } from 'cloudflare:workers';
import {
  databases,
  eventRow,
  file,
  imageProperty,
} from '../../../scripts/notion.mjs';
import type { Event } from '@/lib/content';
import {
  enqueueNotionSync,
  ensureSchema,
  getJobState,
  now,
  setJobState,
} from '@/lib/members/db';
import { detectImageType, type ImageType } from '@/lib/members/files';
import { processNotionQueue } from '@/lib/members/notion';
import { eventChanged, eventSnapshot, imageSource, mediaFile } from './rules';

const API = 'https://api.notion.com/v1';
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const SYNCED_AT = 'events_synced_at';
export const SYNC_ERROR = 'events_sync_error';
const EXTENSION: Record<ImageType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

interface StoredRow {
  id: string;
  data: string;
  image_source: string | null;
}

type NotionPage = Parameters<typeof eventRow>[0];

async function queryPublished(
  token: string,
  databaseId: string,
): Promise<NotionPage[]> {
  const pages: NotionPage[] = [];
  let cursor: string | undefined;
  do {
    const response = await fetch(`${API}/databases/${databaseId}/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        page_size: 100,
        filter: { property: 'Published', checkbox: { equals: true } },
        ...(cursor ? { start_cursor: cursor } : {}),
      }),
    });
    const data = (await response.json()) as {
      results?: NotionPage[];
      has_more?: boolean;
      next_cursor?: string;
      message?: string;
    };
    if (!response.ok) {
      throw new Error(`Notion ${response.status}: ${data.message ?? ''}`);
    }
    pages.push(...(data.results ?? []));
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return pages;
}

/** Copies a new or changed image to R2; returns the site path, or the old one on failure. */
async function storeImage(
  env: Env,
  page: NotionPage,
  stored: { event?: Event; source: string | null },
): Promise<{ image: string | null; source: string | null }> {
  const found = file(page, imageProperty.events);
  if (!found || !env.FILES) return { image: null, source: null };
  const source = imageSource(found.url);
  if (source === stored.source && stored.event?.image) {
    return { image: stored.event.image, source };
  }
  const keep = { image: stored.event?.image ?? null, source: stored.source };
  let buffer: ArrayBuffer;
  try {
    const response = await fetch(found.url);
    if (!response.ok) throw new Error(`status ${response.status}`);
    buffer = await response.arrayBuffer();
  } catch (error) {
    console.warn(`event image ${page.id}`, error);
    return keep;
  }
  // Only JPEG, PNG and WebP, checked by their bytes: the site serves these files itself.
  const type = detectImageType(new Uint8Array(buffer));
  if (!type || buffer.byteLength > MAX_IMAGE_BYTES) {
    console.warn(`event image ${page.id}: not a JPEG, PNG or WebP up to 10 MB`);
    return keep;
  }
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  const hash = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  const name = mediaFile(page.id, hash, EXTENSION[type]);
  await env.FILES.put(`events/${name}`, buffer, {
    httpMetadata: { contentType: type },
  });
  await deleteImage(env, stored.event?.image ?? null, name);
  return { image: `/media/events/${name}`, source };
}

async function deleteImage(
  env: Env,
  image: string | null,
  except?: string,
): Promise<void> {
  const name = image?.startsWith('/media/events/')
    ? image.slice('/media/events/'.length)
    : null;
  if (!name || name === except || !env.FILES) return;
  await env.FILES.delete(`events/${name}`).catch((error) =>
    console.error('event image delete', error),
  );
}

/**
 * Registrations keep a copy of title, dates and place. When the event changes in Notion, the
 * copy follows, and the Notion registration page is updated through the queue.
 */
async function refreshRegistrations(env: Env, event: Event): Promise<number> {
  const snapshot = eventSnapshot(event);
  const { results } = await env.DB.prepare(
    `UPDATE "event_registration" SET "event_title" = ?, "event_start" = ?, "event_end" = ?, "event_location" = ?
     WHERE "event_id" = ? AND NOT ("event_title" IS ? AND "event_start" IS ? AND "event_end" IS ? AND "event_location" IS ?)
     RETURNING "id"`,
  )
    .bind(
      snapshot.title,
      snapshot.start,
      snapshot.end,
      snapshot.location,
      event.id,
      snapshot.title,
      snapshot.start,
      snapshot.end,
      snapshot.location,
    )
    .all<{ id: string }>();
  for (const row of results) {
    await enqueueNotionSync(env.DB, 'registration', row.id);
  }
  return results.length;
}

/** Loads the published events from Notion into D1. Throws when Notion cannot be reached. */
export async function syncEvents(env: Env): Promise<void> {
  if (!env.NOTION_TOKEN) return;
  await ensureSchema(env.DB);
  const pages = await queryPublished(
    env.NOTION_TOKEN,
    env.NOTION_EVENTS_DB || databases.events,
  );
  const { results } = await env.DB.prepare(
    'SELECT "id", "data", "image_source" FROM "event"',
  ).all<StoredRow>();
  const stored = new Map(
    results.map((row) => [
      row.id,
      { event: JSON.parse(row.data) as Event, source: row.image_source },
    ]),
  );
  const stamp = now();
  let queued = 0;
  for (const page of pages) {
    const before = stored.get(page.id);
    const { image, source } = await storeImage(env, page, {
      event: before?.event,
      source: before?.source ?? null,
    });
    const event: Event = { ...(eventRow(page) as Event), image };
    stored.delete(page.id);
    if (!eventChanged(before?.event, event) && source === before?.source) {
      continue;
    }
    await env.DB.prepare(
      `INSERT INTO "event" ("id", "data", "image_source", "synced_at") VALUES (?, ?, ?, ?)
       ON CONFLICT ("id") DO UPDATE SET "data" = excluded."data", "image_source" = excluded."image_source", "synced_at" = excluded."synced_at"`,
    )
      .bind(event.id, JSON.stringify(event), source, stamp)
      .run();
    if (before) queued += await refreshRegistrations(env, event);
  }
  // Unpublished or deleted in Notion: gone from the site. Registrations keep their copy.
  for (const [id, gone] of stored) {
    await env.DB.prepare('DELETE FROM "event" WHERE "id" = ?').bind(id).run();
    await deleteImage(env, gone.event.image);
  }
  await setJobState(env.DB, SYNCED_AT, stamp);
  await setJobState(env.DB, SYNC_ERROR, '');
  if (queued > 0) {
    waitUntil(
      processNotionQueue(env).catch((error) =>
        console.error('notion sync', error),
      ),
    );
  }
}

/** Scheduled run (every 10 minutes). Records a failure for the board page. */
export async function runEventSync(env: Env): Promise<void> {
  try {
    await syncEvents(env);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await setJobState(env.DB, SYNC_ERROR, `${now()} ${reason}`.slice(0, 500));
    throw error;
  }
}

/**
 * Board page: loads Notion again when the last run is older than `maxAgeMs`. Waits at most
 * `waitMs`; a slower run finishes in the background and the page shows the stored list.
 */
export async function refreshEvents(
  env: Env,
  maxAgeMs = 60_000,
  waitMs = 5_000,
): Promise<void> {
  if (!env.NOTION_TOKEN) return;
  await ensureSchema(env.DB);
  const last = await getJobState(env.DB, SYNCED_AT);
  if (last && Date.now() - Date.parse(last) < maxAgeMs) return;
  const run = runEventSync(env).catch((error) =>
    console.error('event sync', error),
  );
  waitUntil(run);
  await Promise.race([
    run,
    new Promise((resolve) => setTimeout(resolve, waitMs)),
  ]);
}
