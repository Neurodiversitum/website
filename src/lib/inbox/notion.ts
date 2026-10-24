// Notion database "Club Inbox": one page per conversation. Uses the separate integration
// "Website inbox" (secret NOTION_INBOX_TOKEN), which is connected to this database only.
import { date, select, text } from '@/lib/members/notion-properties';

const API = 'https://api.notion.com/v1';

export interface InboxPage {
  id: string;
  subject: string;
  status: string;
  owners: string[];
  from: string;
  fromName: string;
  received: string | null;
  replies: number;
  notes: string;
}

export function inboxConfigured(env: Env): boolean {
  return Boolean(env.NOTION_INBOX_TOKEN && env.NOTION_INBOX_DB);
}

async function notion(
  env: Env,
  path: string,
  method: 'GET' | 'POST' | 'PATCH',
  body?: unknown,
): Promise<Record<string, unknown>> {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.NOTION_INBOX_TOKEN}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(
      `Notion inbox ${response.status}: ${String(data.message ?? '')}`,
    );
  }
  return data;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export interface NewRow {
  subject: string;
  fromEmail: string;
  fromName: string;
  to: string;
  receivedAt: string;
  preview: string;
  messageId: string;
}

/** Creates the page and returns its id. */
export async function createInboxPage(env: Env, row: NewRow): Promise<string> {
  const page = await notion(env, '/pages', 'POST', {
    parent: { database_id: env.NOTION_INBOX_DB },
    properties: {
      Subject: { title: [{ text: { content: row.subject.slice(0, 200) } }] },
      Status: select('New'),
      From: { email: EMAIL.test(row.fromEmail) ? row.fromEmail : null },
      'From name': text(row.fromName),
      To: text(row.to),
      Received: date(row.receivedAt),
      Preview: text(row.preview),
      'Message ID': text(row.messageId),
      Replies: { number: 0 },
    },
  });
  return String(page.id);
}

type Props = Record<string, Record<string, unknown>>;

function plain(prop: Record<string, unknown> | undefined): string {
  const parts = (prop?.rich_text ?? prop?.title ?? []) as Array<{
    plain_text?: string;
  }>;
  return parts.map((part) => part.plain_text ?? '').join('');
}

function toPage(page: Record<string, unknown>): InboxPage {
  const props = (page.properties ?? {}) as Props;
  const owners = ((props.Owner?.people ?? []) as Array<{ name?: string }>)
    .map((person) => person.name ?? '')
    .filter(Boolean);
  return {
    id: String(page.id),
    subject: plain(props.Subject),
    status: String(
      (props.Status?.select as { name?: string } | null)?.name ?? '',
    ),
    owners,
    from: String(props.From?.email ?? ''),
    fromName: plain(props['From name']),
    received: ((props.Received?.date as { start?: string } | null)?.start ??
      null) as string | null,
    replies: Number(props.Replies?.number ?? 0),
    notes: plain(props.Notes),
  };
}

export async function getInboxPage(
  env: Env,
  pageId: string,
): Promise<InboxPage> {
  return toPage(await notion(env, `/pages/${pageId}`, 'GET'));
}

/** Pages with Status New or Claimed, oldest first. */
export async function listOpenPages(env: Env): Promise<InboxPage[]> {
  const data = await notion(
    env,
    `/databases/${env.NOTION_INBOX_DB}/query`,
    'POST',
    {
      filter: {
        or: [
          { property: 'Status', select: { equals: 'New' } },
          { property: 'Status', select: { equals: 'Claimed' } },
        ],
      },
      sorts: [{ property: 'Received', direction: 'ascending' }],
      page_size: 100,
    },
  );
  return ((data.results ?? []) as Record<string, unknown>[]).map(toPage);
}

export async function updateInboxPage(
  env: Env,
  pageId: string,
  changes: {
    status?: string;
    answeredBy?: string;
    answeredAt?: string;
    replies?: number;
    notes?: string;
  },
): Promise<void> {
  const properties: Props = {};
  if (changes.status) properties.Status = select(changes.status);
  if (changes.answeredBy !== undefined)
    properties['Answered by'] = text(changes.answeredBy);
  if (changes.answeredAt) properties['Answered at'] = date(changes.answeredAt);
  if (changes.replies !== undefined)
    properties.Replies = { number: changes.replies };
  if (changes.notes !== undefined) properties.Notes = text(changes.notes);
  await notion(env, `/pages/${pageId}`, 'PATCH', { properties });
}

/** Moves a conversation page to the Notion trash (retention). */
export async function archiveInboxPage(
  env: Env,
  pageId: string,
): Promise<void> {
  await notion(env, `/pages/${pageId}`, 'PATCH', { in_trash: true });
}
