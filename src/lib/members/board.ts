// Board view: member list, registrations per event and role management. Events are created
// and edited only in Notion; the board sees each published event with its registrations.
import { waitUntil } from 'cloudflare:workers';
import {
  countAdmins,
  enqueueNotionSync,
  getMember,
  listAllRegistrations,
  now,
  type Member,
  type Role,
} from './db';
import { processNotionQueue } from './notion';
import { roleChangeProblem, type RoleChangeProblem } from './roles';
import { localized } from '@/lib/content';
import { boardGroups, type EventGroup } from '@/lib/events/rules';
import { listUpcomingEvents } from '@/lib/events/store';
import type { Language } from '@/lib/i18n';

/** Upcoming events from Notion with their registrations, then earlier events with registrations. */
export async function listEventGroups(
  env: Env,
  lang: Language,
): Promise<EventGroup[]> {
  return boardGroups(
    await listUpcomingEvents(env),
    await listAllRegistrations(env.DB),
    (event) => localized(event.title, lang),
  );
}

/** Changes a member's role (admin only, checked by the caller). Keeps at least one admin. */
export async function changeRole(
  env: Env,
  targetId: string,
  newRole: string,
): Promise<RoleChangeProblem | null> {
  const target = await getMember(env.DB, targetId);
  const problem = roleChangeProblem(target, newRole, await countAdmins(env.DB));
  if (problem) return problem;
  await env.DB.prepare(
    'UPDATE "member" SET "role" = ?, "updated_at" = ? WHERE "user_id" = ?',
  )
    .bind(newRole as Role, now(), targetId)
    .run();
  await enqueueNotionSync(env.DB, 'member', targetId);
  waitUntil(
    processNotionQueue(env).catch((error) =>
      console.error('notion sync', error),
    ),
  );
  return null;
}

export type { EventGroup, Member };
