// Every page of the site, as paths without the language prefix. German pages are `/de` + path.
export const WIDTHS = [320, 375, 390, 768, 1024, 1440, 1920] as const;
export const LANGS = ['en', 'de'] as const;
export type Lang = (typeof LANGS)[number];

export interface PageSpec {
  /** Path without the language prefix. */
  path: string;
  /** Needs a member session (set up in global-setup.ts). */
  member?: boolean;
  /** Expected status code (the 404 page answers 404). */
  status?: number;
}

export const PUBLIC_PAGES: PageSpec[] = [
  { path: '/' },
  { path: '/about' },
  { path: '/projects' },
  { path: '/projects/quiet-zones' },
  { path: '/projects/ambient-lighting' },
  { path: '/projects/shorter-lectures' },
  { path: '/events' },
  { path: '/team' },
  { path: '/join' },
  { path: '/ideas' },
  { path: '/newsletter' },
  { path: '/imprint' },
  { path: '/privacy' },
  { path: '/cookies' },
  { path: '/this-page-does-not-exist', status: 404 },
  { path: '/members/login' },
  { path: '/members/verify' },
  { path: '/members/logged-out' },
  { path: '/members/logged-out?deleted=1' },
];

export const MEMBER_PAGES: PageSpec[] = [
  { path: '/members', member: true },
  { path: '/members/events', member: true },
  { path: '/members/directory', member: true },
  { path: '/members/material', member: true },
  { path: '/members/profile', member: true },
  { path: '/members/delete', member: true },
  { path: '/members/board', member: true },
  { path: '/members/board/events', member: true },
];

export const ALL_PAGES = [...PUBLIC_PAGES, ...MEMBER_PAGES];

export function localized(lang: Lang, path: string): string {
  if (lang === 'en') return path;
  return path === '/' ? '/de' : `/de${path}`;
}

export function slug(lang: Lang, path: string): string {
  const clean = path.split('?')[0].replace(/^\//, '').replace(/\//g, '-');
  const query = path.includes('?')
    ? '-' + path.split('?')[1].replace(/[^a-z0-9]/gi, '')
    : '';
  return `${lang}-${clean || 'home'}${query}`;
}
