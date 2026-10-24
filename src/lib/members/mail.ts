// Email through the Cloudflare Email Service binding. All mail leaves from noreply@neurodiversitum.org.
import type { Language } from '@/lib/i18n';

export interface MailAttachment {
  /** Text content (for example a calendar file) or base64 for binary files. */
  content: string;
  filename: string;
  type: string;
  disposition: 'attachment' | 'inline';
}

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: MailAttachment[];
}

/** Sends one email. Without the binding (local dev without wrangler) the mail is logged instead. */
export async function sendMail(env: Env, mail: Mail): Promise<void> {
  const from = { email: env.MAIL_FROM, name: 'Neurodiversitum' };
  if (!env.EMAIL) {
    console.log(
      `mail (not sent, no EMAIL binding): to=${mail.to} subject=${mail.subject}\n${mail.text}`,
    );
    return;
  }
  await env.EMAIL.send({
    to: mail.to,
    from,
    replyTo: env.MAIL_REPLY_TO,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    attachments: mail.attachments?.map((file) => ({
      ...file,
      content: toBase64(file.content),
    })),
  });
}

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** A plain, calm HTML version of a text mail: paragraphs, and the link as a button. */
export function htmlMail(
  lines: string[],
  link?: { url: string; label: string },
) {
  const paragraphs = lines
    .map(
      (line) =>
        `<p style="margin:0 0 16px;line-height:1.5">${escapeHtml(line)}</p>`,
    )
    .join('');
  const button = link
    ? `<p style="margin:24px 0"><a href="${escapeHtml(link.url)}" style="display:inline-block;padding:14px 26px;border-radius:999px;background:#2552c4;color:#ffffff;text-decoration:none;font-weight:600">${escapeHtml(link.label)}</a></p><p style="margin:0 0 16px;font-size:13px;color:#555">${escapeHtml(link.url)}</p>`
    : '';
  return `<!doctype html><html><body style="margin:0;padding:32px 16px;background:#f3f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#11212d"><div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:18px;padding:32px"><p style="margin:0 0 24px;font-weight:700;font-size:17px"><img src="https://neurodiversitum.org/logo-512.png" width="36" height="36" alt="" style="display:inline-block;vertical-align:middle;margin-right:10px;border:0">Neurodiversitum</p>${paragraphs}${button}</div></body></html>`;
}

export function loginMail(
  lang: Language,
  url: string,
  minutes: number,
): Omit<Mail, 'to'> {
  if (lang === 'de') {
    const lines = [
      'Hallo,',
      `mit diesem Link meldest du dich bei Neurodiversitum an. Er ist ${minutes} Minuten gültig und funktioniert einmal.`,
      'Wenn du diese E-Mail nicht angefordert hast, ignoriere sie einfach.',
    ];
    return {
      subject: 'Dein Anmeldelink für Neurodiversitum',
      text: `${lines.join('\n\n')}\n\n${url}\n`,
      html: htmlMail(lines, { url, label: 'Jetzt anmelden' }),
    };
  }
  const lines = [
    'Hello,',
    `Use this link to sign in to Neurodiversitum. It is valid for ${minutes} minutes and works once.`,
    'If you did not request this email, you can ignore it.',
  ];
  return {
    subject: 'Your sign-in link for Neurodiversitum',
    text: `${lines.join('\n\n')}\n\n${url}\n`,
    html: htmlMail(lines, { url, label: 'Sign in now' }),
  };
}

export function welcomeMail(
  lang: Language,
  name: string,
  url: string,
  minutes: number,
): Omit<Mail, 'to'> {
  if (lang === 'de') {
    const lines = [
      `Hallo ${name},`,
      'willkommen bei Neurodiversitum. Dein Konto ist angelegt.',
      `Mit diesem Link meldest du dich zum ersten Mal an. Er ist ${minutes} Minuten gültig. Später kannst du dir jederzeit einen neuen Link schicken lassen.`,
    ];
    return {
      subject: 'Willkommen bei Neurodiversitum',
      text: `${lines.join('\n\n')}\n\n${url}\n`,
      html: htmlMail(lines, { url, label: 'Konto öffnen' }),
    };
  }
  const lines = [
    `Hello ${name},`,
    'Welcome to Neurodiversitum. Your account is ready.',
    `Use this link for your first sign-in. It is valid for ${minutes} minutes. Later you can request a new link at any time.`,
  ];
  return {
    subject: 'Welcome to Neurodiversitum',
    text: `${lines.join('\n\n')}\n\n${url}\n`,
    html: htmlMail(lines, { url, label: 'Open my account' }),
  };
}

export function deletedMail(lang: Language, name: string): Omit<Mail, 'to'> {
  if (lang === 'de') {
    const lines = [
      `Hallo ${name},`,
      'dein Konto bei Neurodiversitum wurde gelöscht. Deine Daten sind von der Website entfernt. Die Kopie in Notion wird in den nächsten Minuten entfernt.',
      'Du kannst dich jederzeit neu registrieren.',
    ];
    return {
      subject: 'Dein Konto wurde gelöscht',
      text: lines.join('\n\n'),
      html: htmlMail(lines),
    };
  }
  const lines = [
    `Hello ${name},`,
    'Your Neurodiversitum account has been deleted. Your data is removed from the website. The copy in Notion is removed within the next minutes.',
    'You can register again at any time.',
  ];
  return {
    subject: 'Your account has been deleted',
    text: lines.join('\n\n'),
    html: htmlMail(lines),
  };
}

export interface RegistrationMailEvent {
  title: string;
  when: string;
  location: string | null;
  eventsUrl: string;
}

export function registrationMail(
  lang: Language,
  name: string,
  event: RegistrationMailEvent,
): Omit<Mail, 'to'> {
  const where = event.location ? ` · ${event.location}` : '';
  if (lang === 'de') {
    const lines = [
      `Hallo ${name},`,
      `du bist angemeldet: ${event.title}.`,
      `${event.when}${where}`,
      'Die Kalenderdatei hängt an dieser E-Mail. Abmelden kannst du dich jederzeit im Mitgliederbereich unter Termine.',
    ];
    return {
      subject: `Angemeldet: ${event.title}`,
      text: `${lines.join('\n\n')}\n\n${event.eventsUrl}\n`,
      html: htmlMail(lines, { url: event.eventsUrl, label: 'Termine ansehen' }),
    };
  }
  const lines = [
    `Hello ${name},`,
    `you are registered: ${event.title}.`,
    `${event.when}${where}`,
    'The calendar file is attached to this email. You can cancel at any time in the member area under Events.',
  ];
  return {
    subject: `Registered: ${event.title}`,
    text: `${lines.join('\n\n')}\n\n${event.eventsUrl}\n`,
    html: htmlMail(lines, { url: event.eventsUrl, label: 'See events' }),
  };
}

export function inactivityWarningMail(
  lang: Language,
  name: string,
  loginUrl: string,
  days: number,
): Omit<Mail, 'to'> {
  if (lang === 'de') {
    const lines = [
      `Hallo ${name},`,
      'du hast dich seit zwei Jahren nicht mehr bei Neurodiversitum angemeldet.',
      `Wir speichern Daten nicht länger als nötig. Wenn du dich in den nächsten ${days} Tagen nicht anmeldest, löschen wir dein Konto und alle Daten dazu.`,
      'Du möchtest Mitglied bleiben? Dann melde dich einfach einmal an.',
    ];
    return {
      subject: 'Dein Konto bei Neurodiversitum wird bald gelöscht',
      text: `${lines.join('\n\n')}\n\n${loginUrl}\n`,
      html: htmlMail(lines, { url: loginUrl, label: 'Jetzt anmelden' }),
    };
  }
  const lines = [
    `Hello ${name},`,
    'you have not signed in to Neurodiversitum for two years.',
    `We do not keep data longer than needed. If you do not sign in within the next ${days} days, we delete your account and all data that belongs to it.`,
    'Want to stay a member? Just sign in once.',
  ];
  return {
    subject: 'Your Neurodiversitum account will be deleted soon',
    text: `${lines.join('\n\n')}\n\n${loginUrl}\n`,
    html: htmlMail(lines, { url: loginUrl, label: 'Sign in now' }),
  };
}

export function inactiveDeletedMail(
  lang: Language,
  name: string,
): Omit<Mail, 'to'> {
  if (lang === 'de') {
    const lines = [
      `Hallo ${name},`,
      'du hast dich zwei Jahre lang nicht angemeldet und auf unsere Erinnerung nicht reagiert. Darum haben wir dein Konto bei Neurodiversitum und alle Daten dazu gelöscht.',
      'Du kannst dich jederzeit neu registrieren.',
    ];
    return {
      subject: 'Dein Konto wurde gelöscht',
      text: lines.join('\n\n'),
      html: htmlMail(lines),
    };
  }
  const lines = [
    `Hello ${name},`,
    'you have not signed in for two years and did not react to our reminder. So we deleted your Neurodiversitum account and all data that belongs to it.',
    'You can register again at any time.',
  ];
  return {
    subject: 'Your account has been deleted',
    text: lines.join('\n\n'),
    html: htmlMail(lines),
  };
}
