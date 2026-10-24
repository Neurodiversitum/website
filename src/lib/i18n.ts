// Language helpers. The site has one page tree per language: English at `/…`, German at `/de/…`.
// Astro's i18n routing sets `Astro.currentLocale` for every page; the helpers below turn that
// into text and links. Easy-read variants are swapped in the browser (see BaseLayout).

export const LOCALES = ['en', 'de'] as const;
export type Language = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Language = 'en';

export type CopyField = Partial<
  Record<'en' | 'de' | 'enEasy' | 'deEasy', string>
>;

/** The text of a copy field in the requested language, falling back to English. */
export function pick(
  field: CopyField | undefined,
  lang: Language,
  easy = false,
): string {
  if (!field) return '';
  if (easy) {
    const key = `${lang}Easy` as keyof CopyField;
    if (field[key]) return field[key];
  }
  return field[lang] || field.en || '';
}

/** Walks a dot path such as `projectDetail.quietZones.goals.0.title` through a nested copy object. */
export function resolveCopy(
  root: unknown,
  path: string,
): CopyField | undefined {
  let node: unknown = root;
  for (const part of path.split('.')) {
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node && typeof node === 'object' ? (node as CopyField) : undefined;
}

export function asLanguage(value: string | undefined): Language {
  return LOCALES.includes(value as Language)
    ? (value as Language)
    : DEFAULT_LOCALE;
}

/** The site-relative URL of `path` in the given language, for example `/about` or `/de/about`. */
export function localePath(lang: Language, path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  if (lang === DEFAULT_LOCALE) return clean;
  return clean === '/' ? `/${lang}` : `/${lang}${clean}`;
}

/** The address of a page as visitors see it. Static pages are built as files (`about.html`,
 *  astro.config.mjs), and during the build `Astro.url` carries that file name. */
export function pagePath(pathname: string): string {
  return pathname.replace(/(\/index)?\.html$/, '') || '/';
}

/** The path without a language prefix, for example `/de/about` becomes `/about`. */
export function stripLocale(pathname: string): string {
  for (const lang of LOCALES) {
    if (lang === DEFAULT_LOCALE) continue;
    if (pathname === `/${lang}`) return '/';
    if (pathname.startsWith(`/${lang}/`))
      return pathname.slice(lang.length + 1);
  }
  return pathname || '/';
}

export function otherLanguage(lang: Language): Language {
  return lang === 'en' ? 'de' : 'en';
}

/** Reads one copy field by dot path for use in attributes and page metadata. */
export function copyText(root: unknown, lang: Language, path: string): string {
  return pick(resolveCopy(root, path), lang);
}
