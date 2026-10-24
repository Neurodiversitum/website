// The email handler for contact@neurodiversitum.org.
//
// New mail: a row in Notion "Club Inbox", a row in D1, and a forward to every board member.
// Reply from the board (sent as contact@ with contact@ in BCC, or reply-all from a board
// address): the conversation is marked Answered, nothing is forwarded back.
// Follow-up from the sender: forwarded, the conversation goes back to New.
// Own addresses, bounces and automatic mail never create rows (loop protection).
import PostalMime from 'postal-mime';
import { inbox } from '@/data/inbox';
import { ensureSchema, now } from '@/lib/members/db';
import { createInboxPage, inboxConfigured, updateInboxPage } from './notion';
import {
  boardMember,
  cleanAddress,
  cleanMessageId,
  displayName,
  isAutomatic,
  isOwnAddress,
  previewText,
  threadIds,
} from './rules';
import {
  addThreadId,
  findConversation,
  getConversation,
  insertConversation,
  updateConversation,
  type InboxRow,
} from './store';

async function forwardToBoard(
  message: ForwardableEmailMessage,
  except: string[] = [],
): Promise<void> {
  for (const member of inbox.board) {
    if (except.includes(member.email.toLowerCase())) continue;
    try {
      await message.forward(member.email);
    } catch (error) {
      console.error(`inbox forward to ${member.email}`, error);
    }
  }
}

async function markAnswered(
  env: Env,
  row: InboxRow,
  answeredBy: string,
  at: string,
): Promise<void> {
  const replies = row.replies + 1;
  await updateConversation(env.DB, row.id, {
    status: 'answered',
    replies,
    answered_at: at,
  });
  if (row.notion_page_id && inboxConfigured(env)) {
    await updateInboxPage(env, row.notion_page_id, {
      status: 'Answered',
      answeredBy,
      answeredAt: at,
      replies,
    }).catch((error) => console.error('inbox notion answered', error));
  }
}

export async function handleInboundMail(
  message: ForwardableEmailMessage,
  env: Env,
): Promise<void> {
  await ensureSchema(env.DB);
  const headers = message.headers;
  const headerFrom =
    cleanAddress(headers.get('from')) || cleanAddress(message.from);
  const messageId =
    cleanMessageId(headers.get('message-id')) || crypto.randomUUID();
  const thread = threadIds(
    headers.get('in-reply-to'),
    headers.get('references'),
  );
  const subject = (headers.get('subject') ?? '').trim() || '(no subject)';
  const receivedAt = now();
  const conversation = thread.length
    ? await findConversation(env.DB, thread)
    : null;

  // Our own senders: a board reply sent as contact@ (with contact@ in BCC) closes the loop.
  if (isOwnAddress(headerFrom) || isOwnAddress(message.from)) {
    if (conversation) {
      await addThreadId(env.DB, conversation.id, messageId);
      await markAnswered(env, conversation, 'contact@ (board)', receivedAt);
      console.log(
        `inbox: reply from ${headerFrom} marks ${conversation.id} answered`,
      );
    } else {
      console.log(`inbox: ignored mail from own address ${headerFrom}`);
    }
    return;
  }

  // A board member writing to contact@: reply-all on a conversation marks it answered and
  // reaches the other board members; anything else is internal and ignored.
  const member = boardMember(headerFrom);
  if (member) {
    if (conversation) {
      await addThreadId(env.DB, conversation.id, messageId);
      await markAnswered(env, conversation, member.name, receivedAt);
      await forwardToBoard(message, [member.email.toLowerCase()]);
    } else {
      console.log(`inbox: ignored internal mail from ${headerFrom}`);
    }
    return;
  }

  // Bounces, auto-replies and list mail: the board sees them, Notion does not.
  if (isAutomatic(headers, message.from)) {
    await forwardToBoard(message);
    return;
  }

  // Follow-up in a known conversation: forward, reopen, note it in Notion.
  if (conversation) {
    await addThreadId(env.DB, conversation.id, messageId);
    await forwardToBoard(message);
    const reopened =
      conversation.status === 'answered' || conversation.status === 'closed';
    await updateConversation(env.DB, conversation.id, {
      status: reopened ? 'new' : conversation.status,
      reminded_at: reopened ? null : conversation.reminded_at,
    });
    if (conversation.notion_page_id && inboxConfigured(env)) {
      await updateInboxPage(env, conversation.notion_page_id, {
        ...(reopened ? { status: 'New' } : {}),
        notes: `Follow-up from ${headerFrom} received ${receivedAt}`,
      }).catch((error) => console.error('inbox notion follow-up', error));
    }
    return;
  }

  // Duplicate delivery of a message we already hold.
  if (await getConversation(env.DB, messageId)) {
    console.log(`inbox: duplicate ${messageId}`);
    return;
  }

  // New conversation.
  let preview = '';
  let fromName = displayName(headers.get('from'));
  try {
    const parsed = await new PostalMime().parse(
      await new Response(message.raw).arrayBuffer(),
    );
    preview = previewText(parsed.text, parsed.html);
    fromName = parsed.from?.name?.trim() || fromName;
  } catch (error) {
    console.warn('inbox parse', error);
  }
  let pageId: string | null = null;
  if (inboxConfigured(env)) {
    try {
      pageId = await createInboxPage(env, {
        subject,
        fromEmail: headerFrom,
        fromName,
        to: message.to,
        receivedAt,
        preview,
        messageId,
      });
    } catch (error) {
      console.error('inbox notion create', error);
    }
  }
  await insertConversation(env.DB, {
    id: messageId,
    notion_page_id: pageId,
    from_email: headerFrom,
    from_name: fromName || null,
    subject,
    preview: preview || null,
    received_at: receivedAt,
  });
  await forwardToBoard(message);
}
