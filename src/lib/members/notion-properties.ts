// Property builders for the Notion copy. No runtime imports, so the unit tests can run them in Node.
import type { Member } from './db';

export const text = (value: string | null | undefined) => ({
  rich_text: value ? [{ text: { content: value.slice(0, 2000) } }] : [],
});
export const select = (value: string | null | undefined) => ({
  select: value ? { name: value } : null,
});
export const date = (value: string | null | undefined) => ({
  date: value ? { start: value } : null,
});

const genderLabel: Record<string, string> = {
  female: 'Female',
  male: 'Male',
  non_binary: 'Non-binary',
  not_said: 'Prefer not to say',
};
/** The Notion properties of one member row. */
export function memberProperties(member: Member) {
  return {
    Name: { title: [{ text: { content: member.name } }] },
    Email: { email: member.email },
    'Member ID': text(member.user_id),
    University: select(member.university),
    Language: select(member.language),
    LinkedIn: { url: member.linkedin || null },
    Role: select(member.role),
    Directory: { checkbox: member.directory_opt_in === 1 },
    'Event news': { checkbox: member.mail_events === 1 },
    Newsletter: { checkbox: member.mail_newsletter === 1 },
    'Date of birth': date(member.date_of_birth),
    Gender: select(member.gender ? genderLabel[member.gender] : null),
    Joined: date(member.created_at.slice(0, 10)),
    Status: select('active'),
  };
}
