// Request handling of the member pages. Each handler reads the request, performs the action and
// returns either a Response (redirect) or the state the view renders. The page files in
// src/pages/members and src/pages/de/members call these, so one implementation serves both languages.
import type { AstroGlobal } from 'astro';
import { env } from 'cloudflare:workers';
import { getAuth, siteOrigin } from './auth';
import {
  allowed,
  deleteAccount,
  register,
  sendLink,
  updateProfile,
} from './service';
import {
  cleanEmail,
  isUniversityEmail,
  readPrivacyConsent,
  readProfile,
  type FieldError,
} from './validate';
import { changeRole, listEventGroups } from './board';
import {
  listDirectory,
  listMembers,
  type DirectoryEntry,
  type Member,
} from './db';
import {
  listRegistrations,
  registerForEvent,
  unregisterFromEvent,
} from './events';
import {
  deleteMaterial,
  listMaterial,
  uploadMaterial,
  type MaterialProblem,
  type MaterialRow,
} from './material';
import { pendingNotionJobs } from './notion';
import { deletePicture, savePicture, type PictureProblem } from './pictures';
import { isBoard, type RoleChangeProblem } from './roles';
import type { Event } from '@/lib/content';
import type { EventGroup } from '@/lib/events/rules';
import {
  findUpcomingEvent,
  listUpcomingEvents,
  syncStatus,
  type SyncStatus,
} from '@/lib/events/store';
import { refreshEvents } from '@/lib/events/sync';
import { asLanguage, localePath } from '@/lib/i18n';
import type { RegistrationRow } from './db';

type Astro = Pick<
  AstroGlobal,
  'request' | 'url' | 'locals' | 'currentLocale' | 'redirect'
>;

function lang(astro: Astro) {
  return asLanguage(astro.currentLocale);
}

async function formValues(request: Request) {
  const form = await request.formData();
  const values: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === 'string') values[key] = value;
  }
  return { form, values };
}

function clientIp(request: Request) {
  return request.headers.get('cf-connecting-ip') ?? 'local';
}

export interface LoginState {
  state: 'form' | 'sent';
  error: '' | 'errorLink' | 'errorRate' | 'errorEmail' | 'errorUniversityEmail';
  email: string;
}

export async function handleLogin(
  astro: Astro,
): Promise<Response | LoginState> {
  if (astro.locals.session)
    return astro.redirect(localePath(lang(astro), '/members'), 303);
  const result: LoginState = {
    state: 'form',
    error: astro.url.searchParams.has('error') ? 'errorLink' : '',
    email: '',
  };
  if (astro.request.method !== 'POST' || !astro.locals.configured)
    return result;
  const form = await astro.request.formData();
  const email = cleanEmail(form.get('email'));
  result.email = String(form.get('email') ?? '').trim();
  if (!email) {
    result.error = 'errorEmail';
  } else if (isUniversityEmail(email)) {
    result.error = 'errorUniversityEmail';
  } else if (!(await allowed(env, `login:${clientIp(astro.request)}`))) {
    result.error = 'errorRate';
  } else {
    const auth = getAuth(env, siteOrigin(astro.url));
    await sendLink(auth, email, lang(astro), astro.request.headers);
    result.state = 'sent';
    result.error = '';
  }
  return result;
}

export interface VerifyState {
  token: string;
}

export async function handleVerify(
  astro: Astro,
): Promise<Response | VerifyState> {
  if (astro.locals.session)
    return astro.redirect(localePath(lang(astro), '/members'), 303);
  return { token: astro.url.searchParams.get('token') ?? '' };
}

export interface RegisterState {
  state: 'form' | 'sent';
  errors: FieldError[];
  rateLimited: boolean;
  values: Record<string, string>;
}

export async function handleRegister(
  astro: Astro,
): Promise<Response | RegisterState> {
  if (astro.locals.session)
    return astro.redirect(localePath(lang(astro), '/members'), 303);
  const result: RegisterState = {
    state: 'form',
    errors: [],
    rateLimited: false,
    values: { language: lang(astro) },
  };
  if (astro.request.method !== 'POST' || !astro.locals.configured)
    return result;
  const { form, values } = await formValues(astro.request);
  result.values = values;
  const email = cleanEmail(form.get('email'));
  const profile = readProfile(form);
  result.errors = [...profile.errors];
  if (!email) result.errors.push('email');
  else if (isUniversityEmail(email)) result.errors.push('emailUniversity');
  if (!readPrivacyConsent(form)) result.errors.push('privacyConsent');
  if (result.errors.length > 0) return result;
  if (!(await allowed(env, `register:${clientIp(astro.request)}`))) {
    result.rateLimited = true;
    return result;
  }
  const auth = getAuth(env, siteOrigin(astro.url));
  await register(env, auth, email!, profile.input!, astro.request.headers);
  result.state = 'sent';
  return result;
}

export interface ProfileState {
  errors: FieldError[];
  saved: boolean;
  values: Record<string, string>;
  picture: '' | 'saved' | 'removed' | PictureProblem;
}

export async function handleProfile(
  astro: Astro,
): Promise<Response | ProfileState> {
  const member = astro.locals.member!;
  if (astro.request.method === 'POST') {
    const { form, values } = await formValues(astro.request);
    const profile = readProfile(form);
    if (profile.input) {
      await updateProfile(env, member, profile.input);
      return astro.redirect(`${astro.url.pathname}?saved=1`, 303);
    }
    return {
      errors: profile.errors,
      saved: false,
      values,
      picture: '',
    };
  }
  const picture = astro.url.searchParams.get('picture') ?? '';
  return {
    errors: [],
    saved: astro.url.searchParams.get('saved') === '1',
    picture:
      (
        [
          'saved',
          'removed',
          'missing',
          'tooBig',
          'notImage',
          'noStorage',
        ] as const
      ).find((value) => value === picture) ?? '',
    values: {
      name: member.name,
      university: member.university,
      language: member.language,
      linkedin: member.linkedin ?? '',
      dateOfBirth: member.date_of_birth ?? '',
      gender: member.gender ?? '',
      mailEvents: member.mail_events ? 'on' : '',
      mailNewsletter: member.mail_newsletter ? 'on' : '',
      directoryOptIn: member.directory_opt_in ? 'on' : '',
    },
  };
}

export interface DeleteState {
  needsConfirm: boolean;
}

export async function handleDelete(
  astro: Astro,
): Promise<Response | DeleteState> {
  if (astro.request.method !== 'POST') return { needsConfirm: false };
  const form = await astro.request.formData();
  if (form.get('confirm') !== 'on') return { needsConfirm: true };
  const headers = await deleteAccount(
    env,
    siteOrigin(astro.url),
    astro.locals.member!,
    astro.request.headers,
  );
  headers.set(
    'Location',
    `${localePath(lang(astro), '/members/logged-out')}?deleted=1`,
  );
  return new Response(null, { status: 303, headers });
}

export interface EventsState {
  events: Event[];
  registrations: RegistrationRow[];
  /** Event ids the member is registered for. */
  registered: Set<string>;
  flash: '' | 'registered' | 'unregistered' | 'gone';
}

export async function handleEvents(
  astro: Astro,
): Promise<Response | EventsState> {
  const member = astro.locals.member!;
  if (astro.request.method === 'POST') {
    const form = await astro.request.formData();
    const action = String(form.get('action') ?? '');
    const eventId = String(form.get('event') ?? '');
    let flash: EventsState['flash'] = 'gone';
    if (action === 'register') {
      const event = await findUpcomingEvent(env, eventId);
      if (event) {
        await registerForEvent(env, member, event);
        flash = 'registered';
      }
    } else if (action === 'unregister' && eventId) {
      await unregisterFromEvent(env, member, eventId);
      flash = 'unregistered';
    }
    return astro.redirect(`${astro.url.pathname}?done=${flash}`, 303);
  }
  const registrations = await listRegistrations(env.DB, member.user_id);
  const done = astro.url.searchParams.get('done');
  return {
    events: await listUpcomingEvents(env),
    registrations,
    registered: new Set(registrations.map((row) => row.event_id)),
    flash:
      done === 'registered' || done === 'unregistered' || done === 'gone'
        ? done
        : '',
  };
}

export interface DirectoryState {
  entries: DirectoryEntry[];
  optedIn: boolean;
}

export async function handleDirectory(astro: Astro): Promise<DirectoryState> {
  const member = astro.locals.member!;
  return {
    entries: await listDirectory(env.DB),
    optedIn: member.directory_opt_in === 1,
  };
}

/** Board pages: members without the role go back to the overview. */
function requireBoard(astro: Astro): Response | null {
  if (isBoard(astro.locals.member?.role)) return null;
  return astro.redirect(localePath(lang(astro), '/members'), 303);
}

export interface BoardState {
  members: Member[];
  pendingNotion: number;
  isAdmin: boolean;
  roleResult: '' | 'saved' | RoleChangeProblem;
}

export async function handleBoard(
  astro: Astro,
): Promise<Response | BoardState> {
  const denied = requireBoard(astro);
  if (denied) return denied;
  const actor = astro.locals.member!;
  if (astro.request.method === 'POST') {
    if (actor.role !== 'admin')
      return astro.redirect(localePath(lang(astro), '/members'), 303);
    const form = await astro.request.formData();
    const problem = await changeRole(
      env,
      String(form.get('member') ?? ''),
      String(form.get('role') ?? ''),
    );
    return astro.redirect(
      `${astro.url.pathname}?role=${problem ?? 'saved'}`,
      303,
    );
  }
  const role = astro.url.searchParams.get('role');
  // Opening the board also loads the events from Notion, in the background.
  await refreshEvents(env, 60_000, 0);
  return {
    members: await listMembers(env.DB),
    pendingNotion: await pendingNotionJobs(env),
    isAdmin: actor.role === 'admin',
    roleResult:
      role === 'saved' ||
      role === 'lastAdmin' ||
      role === 'unknownRole' ||
      role === 'notFound'
        ? role
        : '',
  };
}

export interface BoardEventsState {
  groups: EventGroup[];
  sync: SyncStatus;
  /** False when the Worker has no Notion token; the list then comes from the last build. */
  live: boolean;
}

/** Loads Notion again (at most once a minute), then lists every event with its registrations. */
export async function handleBoardEvents(
  astro: Astro,
): Promise<Response | BoardEventsState> {
  const denied = requireBoard(astro);
  if (denied) return denied;
  await refreshEvents(env);
  return {
    groups: await listEventGroups(env, lang(astro)),
    sync: await syncStatus(env),
    live: Boolean(env.NOTION_TOKEN),
  };
}

/** Picture upload or removal from the profile page; answers with a redirect back to it. */
export async function handlePicture(astro: Astro): Promise<Response> {
  const member = astro.locals.member!;
  const form = await astro.request.formData();
  const back = localePath(
    asLanguage(String(form.get('lang') ?? astro.currentLocale)),
    '/members/profile',
  );
  let result: string;
  if (form.get('action') === 'remove') {
    await deletePicture(env, member);
    result = 'removed';
  } else {
    const file = form.get('picture');
    result =
      (await savePicture(env, member, file instanceof File ? file : null)) ??
      'saved';
  }
  return astro.redirect(`${back}?picture=${result}`, 303);
}

export interface MaterialState {
  items: MaterialRow[];
  canManage: boolean;
  result: '' | 'uploaded' | 'deleted' | MaterialProblem;
  values: { title: string; description: string };
}

export async function handleMaterial(
  astro: Astro,
): Promise<Response | MaterialState> {
  const member = astro.locals.member!;
  const canManage = isBoard(member.role);
  if (astro.request.method === 'POST') {
    if (!canManage) return astro.redirect(astro.url.pathname, 303);
    const form = await astro.request.formData();
    if (form.get('action') === 'delete') {
      await deleteMaterial(env, String(form.get('id') ?? ''));
      return astro.redirect(`${astro.url.pathname}?done=deleted`, 303);
    }
    const file = form.get('file');
    const problem = await uploadMaterial(env, member, {
      title: String(form.get('title') ?? ''),
      description: String(form.get('description') ?? ''),
      file: file instanceof File ? file : null,
    });
    if (problem) {
      return {
        items: await listMaterial(env),
        canManage,
        result: problem,
        values: {
          title: String(form.get('title') ?? ''),
          description: String(form.get('description') ?? ''),
        },
      };
    }
    return astro.redirect(`${astro.url.pathname}?done=uploaded`, 303);
  }
  const done = astro.url.searchParams.get('done');
  return {
    items: await listMaterial(env),
    canManage,
    result: done === 'uploaded' || done === 'deleted' ? done : '',
    values: { title: '', description: '' },
  };
}
