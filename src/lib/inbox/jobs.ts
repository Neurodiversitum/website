// Scheduled work of the club inbox: Notion rows that are still missing, reply detection through
// the Cloudflare GraphQL analytics (when a token exists), the one-hour reminder, the daily summary.
import { inbox } from '@/data/inbox';
import { ensureSchema, now } from '@/lib/members/db';
import { htmlMail, sendMail } from '@/lib/members/mail';
import {
  daysBefore,
  RETENTION,
  retentionDue,
} from '@/lib/members/retention-rules';
import {
  archiveInboxPage,
  createInboxPage,
  getInboxPage,
  inboxConfigured,
  listOpenPages,
  updateInboxPage,
} from './notion';
import {
  formatBerlin,
  notionPageUrl,
  reminderDigest,
  subjectKey,
  summaryDue,
} from './rules';
import {
  deleteConversation,
  getState,
  listExpiredConversations,
  listOpenConversations,
  listReminderCandidates,
  listWithoutPage,
  setState,
  updateConversation,
  type InboxRow,
} from './store';

async function mailBoard(
  env: Env,
  subject: string,
  lines: string[],
  link?: { url: string; label: string },
): Promise<void> {
  // One mail per board member; a failure for one address never stops the others.
  for (const member of inbox.board) {
    try {
      await sendMail(env, {
        to: member.email,
        subject,
        text: `${lines.join('\n\n')}${link ? `\n\n${link.url}` : ''}\n`,
        html: htmlMail(lines, link),
      });
      console.log(`inbox mail "${subject}" sent to ${member.name}`);
    } catch (error) {
      console.error(`inbox mail to ${member.email}`, error);
    }
  }
}

/** Conversations stored while Notion was unreachable get their page now. */
export async function createMissingPages(env: Env): Promise<void> {
  if (!inboxConfigured(env)) return;
  for (const row of await listWithoutPage(env.DB)) {
    try {
      const pageId = await createInboxPage(env, {
        subject: row.subject,
        fromEmail: row.from_email,
        fromName: row.from_name ?? '',
        to: inbox.address,
        receivedAt: row.received_at,
        preview: row.preview ?? '',
        messageId: row.id,
      });
      await updateConversation(env.DB, row.id, { notion_page_id: pageId });
    } catch (error) {
      console.error('inbox missing page', error);
      return;
    }
  }
}

interface SendingEvent {
  datetime: string;
  from: string;
  to: string;
  subject: string;
  messageId: string;
  status: string;
}

/**
 * Board members answer from contact@ through Gmail and Cloudflare SMTP. Those sends appear in
 * the zone's emailSendingAdaptive dataset with sender, recipient and subject, which is enough
 * to mark the matching conversation as answered. Needs CF_ANALYTICS_TOKEN and CF_ZONE_ID.
 */
export async function detectReplies(env: Env, at: Date): Promise<void> {
  if (!env.CF_ANALYTICS_TOKEN || !env.CF_ZONE_ID) return;
  const open = await listOpenConversations(env.DB);
  if (open.length === 0) return;
  const since =
    (await getState(env.DB, 'replies_checked')) ??
    new Date(at.getTime() - 60 * 60 * 1000).toISOString();
  const query = `query Replies($zone: string!, $start: Time!, $end: Time!) {
    viewer { zones(filter: { zoneTag: $zone }) {
      emailSendingAdaptive(filter: { datetime_gt: $start, datetime_leq: $end }, limit: 500, orderBy: [datetime_ASC]) {
        datetime from to subject messageId status
      } } } }`;
  const response = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      variables: { zone: env.CF_ZONE_ID, start: since, end: at.toISOString() },
    }),
  });
  const data = (await response.json()) as {
    errors?: Array<{ message: string }>;
    data?: {
      viewer: { zones: Array<{ emailSendingAdaptive: SendingEvent[] }> };
    };
  };
  if (!response.ok || data.errors?.length) {
    throw new Error(
      `GraphQL ${response.status}: ${data.errors?.map((e) => e.message).join('; ') ?? ''}`,
    );
  }
  const events = data.data?.viewer.zones[0]?.emailSendingAdaptive ?? [];
  const seen = new Set(
    (await getState(env.DB, 'replies_seen'))?.split(' ') ?? [],
  );
  for (const event of events) {
    if (event.from.toLowerCase() !== inbox.address) continue;
    if (event.messageId && seen.has(event.messageId)) continue;
    const recipient = event.to.toLowerCase();
    const candidates = open.filter((row) => row.from_email === recipient);
    const match =
      candidates.find(
        (row) => subjectKey(row.subject) === subjectKey(event.subject),
      ) ?? candidates[0];
    if (!match) continue;
    const replies = match.replies + 1;
    await updateConversation(env.DB, match.id, {
      status: 'answered',
      replies,
      answered_at: event.datetime,
    });
    match.status = 'answered';
    match.replies = replies;
    if (match.notion_page_id && inboxConfigured(env)) {
      const page = await getInboxPage(env, match.notion_page_id).catch(
        () => null,
      );
      await updateInboxPage(env, match.notion_page_id, {
        status: 'Answered',
        answeredBy: page?.owners.join(', ') || 'contact@ (SMTP)',
        answeredAt: event.datetime,
        replies,
      }).catch((error) => console.error('inbox notion reply', error));
    }
    if (event.messageId) seen.add(event.messageId);
  }
  await setState(env.DB, 'replies_seen', [...seen].slice(-200).join(' '));
  await setState(env.DB, 'replies_checked', at.toISOString());
}

/**
 * Conversations that are still New without an Owner after the waiting time get one reminder.
 * All of them go into one mail per board member, so a busy hour sends one mail, not many.
 */
export async function sendReminders(env: Env): Promise<void> {
  const candidates = await listReminderCandidates(
    env.DB,
    inbox.reminderAfterMinutes,
  );
  const due: InboxRow[] = [];
  for (const row of candidates) {
    // The board may have claimed or answered the mail in Notion in the meantime.
    if (row.notion_page_id && inboxConfigured(env)) {
      const page = await getInboxPage(env, row.notion_page_id).catch(
        () => null,
      );
      if (page) {
        const status = page.status.toLowerCase();
        if (status === 'answered' || status === 'closed') {
          await updateConversation(env.DB, row.id, {
            status: status as InboxRow['status'],
          });
          continue;
        }
        if (page.owners.length > 0 || status === 'claimed') {
          await updateConversation(env.DB, row.id, { status: 'claimed' });
          if (status === 'new')
            await updateInboxPage(env, row.notion_page_id, {
              status: 'Claimed',
            }).catch(() => undefined);
          continue;
        }
      }
    }
    due.push(row);
  }
  if (due.length === 0) return;
  const digest = reminderDigest(due);
  await mailBoard(env, digest.subject, digest.lines, {
    url: notionPageUrl(env.NOTION_INBOX_DB),
    label: 'Open the Club Inbox',
  });
  const stamp = now();
  for (const row of due)
    await updateConversation(env.DB, row.id, { reminded_at: stamp });
}

/** Once a day at the summary hour (Munich time): every open conversation, skipped when none. */
export async function sendDailySummary(env: Env, at: Date): Promise<void> {
  if (!inboxConfigured(env)) return;
  const lastSent = await getState(env.DB, 'summary_sent');
  if (!summaryDue(at, lastSent)) return;
  const open = await listOpenPages(env);
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    dateStyle: 'short',
  }).format(at);
  await setState(env.DB, 'summary_sent', today);
  if (open.length === 0) return;
  const lines = [
    `${open.length} open ${open.length === 1 ? 'message' : 'messages'} at ${inbox.address}:`,
    ...open.map(
      (page) =>
        `${page.status}${page.owners.length ? ` (${page.owners.join(', ')})` : ''}: ${page.subject} · ${page.fromName ? `${page.fromName} <${page.from}>` : page.from}${page.received ? ` · ${formatBerlin(page.received)}` : ''}`,
    ),
  ];
  await mailBoard(env, `Club inbox: ${open.length} open`, lines, {
    url: notionPageUrl(env.NOTION_INBOX_DB),
    label: 'Open the Club Inbox',
  });
}

/** Deletes conversations past their retention period, in D1 and in Notion. */
export async function deleteExpiredConversations(
  env: Env,
  at: Date,
): Promise<void> {
  if (!retentionDue(at)) return;
  const expired = await listExpiredConversations(
    env.DB,
    daysBefore(at, RETENTION.inboxClosedDays),
    daysBefore(at, RETENTION.inboxMaxDays),
  );
  for (const row of expired) {
    if (row.notion_page_id && inboxConfigured(env)) {
      try {
        await archiveInboxPage(env, row.notion_page_id);
      } catch (error) {
        // Keep the row, so the next run tries the Notion page again.
        console.error('inbox retention notion', error);
        continue;
      }
    }
    await deleteConversation(env.DB, row.id);
  }
}

export async function runInboxJobs(env: Env, at: Date): Promise<void> {
  if (!env.DB) return;
  await ensureSchema(env.DB);
  const steps: Array<[string, () => Promise<void>]> = [
    ['missing pages', () => createMissingPages(env)],
    ['replies', () => detectReplies(env, at)],
    ['reminders', () => sendReminders(env)],
    ['summary', () => sendDailySummary(env, at)],
    ['retention', () => deleteExpiredConversations(env, at)],
  ];
  for (const [name, step] of steps) {
    try {
      await step();
    } catch (error) {
      console.error(`inbox ${name}`, error);
    }
  }
}
