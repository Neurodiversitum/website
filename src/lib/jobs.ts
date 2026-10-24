// Background jobs, started by the cron trigger in wrangler.jsonc (every 10 minutes).
// Events are loaded from Notion on every run, so the site is never more than 10 minutes behind.
// Each job catches its own errors, so one failing job never stops the others.
import { runEventSync } from '@/lib/events/sync';
import { runInboxJobs } from '@/lib/inbox/jobs';
import { retryNotionSync } from '@/lib/members/notion';
import { runRetention } from '@/lib/members/retention';

export async function runScheduledJobs(env: Env, at: Date): Promise<void> {
  const jobs: Array<[string, () => Promise<void>]> = [
    ['events', () => runEventSync(env)],
    ['notion retry', () => retryNotionSync(env)],
    ['club inbox', () => runInboxJobs(env, at)],
    ['retention', () => runRetention(env, at)],
  ];
  for (const [name, job] of jobs) {
    try {
      await job();
    } catch (error) {
      console.error(`scheduled ${name} at ${at.toISOString()}`, error);
    }
  }
}
