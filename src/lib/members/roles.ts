// Role rules of the member area. Pure, so the tests can run them in Node.
import type { Role } from './db';

export const ROLES = ['member', 'board', 'admin'] as const;

export function isBoard(role: Role | undefined | null): boolean {
  return role === 'board' || role === 'admin';
}

export type RoleChangeProblem = 'unknownRole' | 'lastAdmin' | 'notFound';

/**
 * Checks a role change. The club must always keep at least one admin, so the last admin
 * cannot be demoted, not even by themselves.
 */
export function roleChangeProblem(
  target: { user_id: string; role: Role } | null,
  newRole: string,
  adminCount: number,
): RoleChangeProblem | null {
  if (!target) return 'notFound';
  if (!(ROLES as readonly string[]).includes(newRole)) return 'unknownRole';
  if (target.role === 'admin' && newRole !== 'admin' && adminCount <= 1)
    return 'lastAdmin';
  return null;
}
