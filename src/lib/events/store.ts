// Reads the events that the Worker loaded from Notion (sync.ts). Until the first successful
// run, and when the database is not reachable, the build snapshot (content.json) is used.
import {
  getSnapshotEvents,
  todayInMunich,
  upcomingEvents,
  type Event,
} from '@/lib/content';
import { ensureSchema, getJobState } from '@/lib/members/db';
import { SYNC_ERROR, SYNCED_AT } from './sync';

/** All published events, from D1 when Notion was loaded at least once. */
export async function listEvents(env: Env): Promise<Event[]> {
  try {
    await ensureSchema(env.DB);
    if (!(await getJobState(env.DB, SYNCED_AT))) return getSnapshotEvents();
    const { results } = await env.DB.prepare('SELECT "data" FROM "event"').all<{
      data: string;
    }>();
    return results.map((row) => JSON.parse(row.data) as Event);
  } catch (error) {
    console.error('events from database', error);
    return getSnapshotEvents();
  }
}

/** Published events that have not ended yet, soonest first. */
export async function listUpcomingEvents(env: Env): Promise<Event[]> {
  return upcomingEvents(await listEvents(env), todayInMunich());
}

export async function findUpcomingEvent(
  env: Env,
  eventId: string,
): Promise<Event | undefined> {
  return (await listUpcomingEvents(env)).find((event) => event.id === eventId);
}

export interface SyncStatus {
  /** ISO time of the last successful load from Notion, or null. */
  syncedAt: string | null;
  /** The last failure ("<time> <reason>"), cleared by the next success. */
  error: string | null;
}

export async function syncStatus(env: Env): Promise<SyncStatus> {
  await ensureSchema(env.DB);
  return {
    syncedAt: await getJobState(env.DB, SYNCED_AT),
    error: (await getJobState(env.DB, SYNC_ERROR)) || null,
  };
}
