// Checks for the registration and profile forms. Pure functions, so the unit tests can run them in Node.

export const UNIVERSITIES = ['TUM', 'LMU'] as const;
export const GENDERS = ['female', 'male', 'non_binary', 'not_said'] as const;
export const LANGUAGES = ['en', 'de'] as const;

export interface ProfileInput {
  name: string;
  university: (typeof UNIVERSITIES)[number];
  language: (typeof LANGUAGES)[number];
  linkedin: string | null;
  dateOfBirth: string | null;
  gender: (typeof GENDERS)[number] | null;
  directoryOptIn: boolean;
  mailEvents: boolean;
  mailNewsletter: boolean;
}

export type FieldError =
  | 'name'
  | 'email'
  | 'emailUniversity'
  | 'university'
  | 'language'
  | 'linkedin'
  | 'dateOfBirth'
  | 'gender'
  | 'privacyConsent';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * University mail systems that do not accept mail from neurodiversitum.org (TUM test on
 * 2026-10-10: "Delivery failed"). Subdomains such as in.tum.de count too.
 */
export const BLOCKED_EMAIL_DOMAINS = [
  'tum.de',
  'mytum.de',
  'lmu.de',
  'campus.lmu.de',
] as const;

export function isUniversityEmail(email: string): boolean {
  const domain = email.toLowerCase().split('@')[1] ?? '';
  return BLOCKED_EMAIL_DOMAINS.some(
    (blocked) => domain === blocked || domain.endsWith(`.${blocked}`),
  );
}

export function cleanEmail(value: FormDataEntryValue | null): string | null {
  const email = String(value ?? '')
    .trim()
    .toLowerCase();
  return EMAIL.test(email) && email.length <= 254 ? email : null;
}

function oneOf<T extends readonly string[]>(
  value: FormDataEntryValue | null,
  options: T,
): T[number] | null {
  const text = String(value ?? '');
  return (options as readonly string[]).includes(text)
    ? (text as T[number])
    : null;
}

function checked(value: FormDataEntryValue | null): boolean {
  return value === 'on' || value === '1' || value === 'true';
}

/** A LinkedIn profile address, or null when empty. Anything else is an error. */
export function cleanLinkedin(
  value: FormDataEntryValue | null,
): string | null | 'invalid' {
  const text = String(value ?? '').trim();
  if (!text) return null;
  try {
    const url = new URL(text.startsWith('http') ? text : `https://${text}`);
    const host = url.hostname.replace(/^www\./, '');
    if (host !== 'linkedin.com' && !host.endsWith('.linkedin.com'))
      return 'invalid';
    return `https://www.linkedin.com${url.pathname}`.replace(/\/$/, '');
  } catch {
    return 'invalid';
  }
}

/** YYYY-MM-DD between 1900 and today, or null when empty. */
export function cleanDate(
  value: FormDataEntryValue | null,
): string | null | 'invalid' {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return 'invalid';
  const parsed = new Date(`${text}T00:00:00Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== text
  )
    return 'invalid';
  const year = Number(text.slice(0, 4));
  if (year < 1900 || parsed.getTime() > Date.now()) return 'invalid';
  return text;
}

/** Reads the shared profile fields of the registration and profile forms. */
export function readProfile(form: FormData): {
  input: ProfileInput | null;
  errors: FieldError[];
} {
  const errors: FieldError[] = [];
  const name = String(form.get('name') ?? '')
    .trim()
    .replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 120) errors.push('name');
  const university = oneOf(form.get('university'), UNIVERSITIES);
  if (!university) errors.push('university');
  const language = oneOf(form.get('language'), LANGUAGES);
  if (!language) errors.push('language');
  const linkedin = cleanLinkedin(form.get('linkedin'));
  if (linkedin === 'invalid') errors.push('linkedin');
  const dateOfBirth = cleanDate(form.get('dateOfBirth'));
  if (dateOfBirth === 'invalid') errors.push('dateOfBirth');
  const genderRaw = String(form.get('gender') ?? '');
  const gender = genderRaw ? oneOf(genderRaw, GENDERS) : null;
  if (genderRaw && !gender) errors.push('gender');
  if (errors.length > 0) return { input: null, errors };
  return {
    errors,
    input: {
      name,
      university: university!,
      language: language!,
      linkedin: linkedin as string | null,
      dateOfBirth: dateOfBirth as string | null,
      gender,
      directoryOptIn: checked(form.get('directoryOptIn')),
      mailEvents: checked(form.get('mailEvents')),
      mailNewsletter: checked(form.get('mailNewsletter')),
    },
  };
}

export function readPrivacyConsent(form: FormData): boolean {
  return checked(form.get('privacyConsent'));
}
