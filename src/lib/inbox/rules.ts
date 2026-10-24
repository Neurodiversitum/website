// Pure rules of the club inbox: address and header checks, thread matching, time windows.
// No runtime imports, so the unit tests can run them in Node.
import { inbox } from '../../data/inbox.ts';

export function cleanAddress(value: string | null | undefined): string {
  const text = String(value ?? '').trim();
  const inBrackets = text.match(/<([^>]+)>/);
  return (inBrackets ? inBrackets[1]! : text).trim().toLowerCase();
}

/** The display name of a From header, or '' when it only holds the address. */
export function displayName(value: string | null | undefined): string {
  const text = String(value ?? '').trim();
  const match = text.match(/^\s*"?([^"<]*?)"?\s*<[^>]+>\s*$/);
  return match ? match[1]!.trim() : '';
}

/** Message ids without angle brackets and surrounding space. */
export function cleanMessageId(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .replace(/^<|>$/g, '')
    .trim();
}

/** Every id in In-Reply-To and References, newest first, without duplicates. */
export function threadIds(
  inReplyTo: string | null | undefined,
  references: string | null | undefined,
): string[] {
  const ids: string[] = [];
  for (const raw of [inReplyTo ?? '', ...(references ?? '').split(/\s+/)]) {
    const id = cleanMessageId(raw);
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

export function isOwnAddress(address: string): boolean {
  return (inbox.ownAddresses as readonly string[]).includes(
    cleanAddress(address),
  );
}

export function boardMember(
  address: string,
): (typeof inbox.board)[number] | undefined {
  const clean = cleanAddress(address);
  return inbox.board.find((member) => member.email.toLowerCase() === clean);
}

/** Bounces, auto-replies and list mail: forwarded to the board, but never a row or a reminder. */
export function isAutomatic(
  headers: { get(name: string): string | null },
  envelopeFrom: string,
): boolean {
  const from = cleanAddress(envelopeFrom);
  if (
    !from ||
    from.startsWith('mailer-daemon@') ||
    from.startsWith('postmaster@')
  )
    return true;
  const auto = (headers.get('auto-submitted') ?? '').trim().toLowerCase();
  if (auto && auto !== 'no') return true;
  const precedence = (headers.get('precedence') ?? '').trim().toLowerCase();
  if (['bulk', 'junk', 'list', 'auto_reply'].includes(precedence)) return true;
  if (headers.get('x-auto-response-suppress')) return true;
  if (headers.get('list-id') || headers.get('list-unsubscribe')) return true;
  return false;
}

/** A subject without reply and forward prefixes, lower-cased, for loose matching. */
export function subjectKey(subject: string | null | undefined): string {
  return String(subject ?? '')
    .replace(/^(\s*((re|aw|fwd?|wg|sv|vs)\s*:)\s*)+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** The first characters of a message body as plain text, for the Notion preview. */
export function previewText(
  text: string | null | undefined,
  html: string | null | undefined,
): string {
  let body = (text ?? '').trim();
  if (!body && html) {
    body = html
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }
  // Drop quoted earlier messages ("On ... wrote:" or "> ..." lines).
  const lines = body.split(/\r?\n/).filter((line) => !line.startsWith('>'));
  const quoteStart = lines.findIndex((line) =>
    /^(On .+ wrote:|Am .+ schrieb .*:|-----Original Message-----|-----Ursprüngliche Nachricht-----)$/i.test(
      line.trim(),
    ),
  );
  const own = (quoteStart >= 0 ? lines.slice(0, quoteStart) : lines).join(' ');
  const compact = own.replace(/\s+/g, ' ').trim();
  return compact.length > inbox.previewLength
    ? `${compact.slice(0, inbox.previewLength - 1).trimEnd()}…`
    : compact;
}

/** Date, hour and minute in Munich time for a moment. */
export function berlinTime(at: Date): {
  date: string;
  hour: number;
  minute: number;
} {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? '00';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    hour: Number(get('hour')),
    minute: Number(get('minute')),
  };
}

/** True once per day: the first run at or after the summary hour, Munich time. */
export function summaryDue(at: Date, lastSentDate: string | null): boolean {
  const { date, hour } = berlinTime(at);
  return hour >= inbox.summaryHour && lastSentDate !== date;
}

export function notionPageUrl(pageId: string): string {
  return `https://www.notion.so/${pageId.replace(/-/g, '')}`;
}

export function formatBerlin(iso: string, lang: 'en' | 'de' = 'en'): string {
  return new Intl.DateTimeFormat(lang === 'de' ? 'de-DE' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Berlin',
  }).format(new Date(iso));
}

export interface DigestRow {
  subject: string;
  from_email: string;
  from_name: string | null;
  received_at: string;
  preview: string | null;
  notion_page_id: string | null;
}

/** One reminder mail for all conversations that waited too long. */
export function reminderDigest(rows: DigestRow[]): {
  subject: string;
  lines: string[];
} {
  const count = rows.length;
  const subject =
    count === 1
      ? `Unanswered: ${rows[0]!.subject}`
      : `${count} unanswered messages at ${inbox.address}`;
  const intro =
    count === 1
      ? `A message at ${inbox.address} has had no owner and no answer for ${inbox.reminderAfterMinutes} minutes.`
      : `${count} messages at ${inbox.address} have had no owner and no answer for ${inbox.reminderAfterMinutes} minutes.`;
  const items = rows.map((row, index) => {
    const from = row.from_name
      ? `${row.from_name} <${row.from_email}>`
      : row.from_email;
    const parts = [
      `${count > 1 ? `${index + 1}. ` : ''}${row.subject}`,
      `From: ${from} · Received: ${formatBerlin(row.received_at)}`,
    ];
    if (row.preview) parts.push(`Preview: ${row.preview}`);
    if (row.notion_page_id) parts.push(notionPageUrl(row.notion_page_id));
    return parts.join('\n');
  });
  return {
    subject,
    lines: [
      intro,
      ...items,
      'Claim a message by setting yourself as Owner in Notion, or answer it from contact@.',
    ],
  };
}
