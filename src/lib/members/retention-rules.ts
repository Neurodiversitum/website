// Retention periods of the club's data. Pure values and date math, testable in Node.
// The privacy policy states the same periods; change both together.

const DAY = 24 * 60 * 60 * 1000;

export const RETENTION = {
  /** Accounts whose first sign-in link was never used. */
  unconfirmedDays: 14,
  /** No sign-in or page view for this long starts the inactivity warning. */
  inactiveDays: 730,
  /** After the warning, the account is deleted when the member stays away this long. */
  warningGraceDays: 30,
  /** Event registrations are kept this long after the event. */
  registrationDays: 365,
  /** Answered or closed club inbox conversations are kept this long after the last change. */
  inboxClosedDays: 365,
  /** Any club inbox conversation is deleted this long after it arrived. */
  inboxMaxDays: 730,
  /** Notion sync jobs that never succeeded are dropped after this long. */
  failedSyncDays: 90,
  /** Better Auth rate-limit counters. */
  rateLimitDays: 1,
} as const;

/** The ISO time `days` before `at`. */
export function daysBefore(at: Date, days: number): string {
  return new Date(at.getTime() - days * DAY).toISOString();
}

/** The retention job runs once per hour: in the first cron run of each hour. */
export function retentionDue(at: Date): boolean {
  return at.getUTCMinutes() < 10;
}
