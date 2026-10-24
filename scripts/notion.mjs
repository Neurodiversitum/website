// Pure helpers for the Notion content sync: property readers and the row shapes the site uses.
// No network code here, so the unit tests can run against fixture JSON.

const env = globalThis.process?.env ?? {};

/**
 * The three databases on the Notion page "Website Content". The ids come from the environment
 * (`.env` for the build, Worker vars in `wrangler.jsonc` for the events sync).
 */
export const databases = {
  team: env.NOTION_TEAM_DB ?? 'YOUR_NOTION_TEAM_DB_ID',
  projects: env.NOTION_PROJECTS_DB ?? 'YOUR_NOTION_PROJECTS_DB_ID',
  events: env.NOTION_EVENTS_DB ?? 'YOUR_NOTION_EVENTS_DB_ID',
};

/** Plain text of a title or rich_text property, or an empty string. */
export function text(page, name) {
  const property = page.properties?.[name];
  const parts = property?.title ?? property?.rich_text ?? [];
  return parts
    .map((part) => part.plain_text ?? '')
    .join('')
    .trim();
}

export function number(page, name) {
  const value = page.properties?.[name]?.number;
  return typeof value === 'number' ? value : null;
}

export function checkbox(page, name) {
  return page.properties?.[name]?.checkbox === true;
}

export function url(page, name) {
  const value = page.properties?.[name]?.url;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function select(page, name) {
  return page.properties?.[name]?.select?.name ?? null;
}

export function date(page, name) {
  const value = page.properties?.[name]?.date;
  if (!value?.start) return null;
  return {
    start: value.start,
    end: value.end ?? null,
    // Notion sends a time zone offset only for date-time values.
    isDatetime: value.start.includes('T'),
  };
}

/** The first file of a files property: its temporary download URL and its name. */
export function file(page, name) {
  const first = page.properties?.[name]?.files?.[0];
  if (!first) return null;
  const href =
    first.type === 'external' ? first.external?.url : first.file?.url;
  if (!href) return null;
  return { url: href, name: first.name ?? '' };
}

/** Both languages of a text pair. The site falls back to English when German is empty. */
function pair(page, base) {
  return { en: text(page, `${base} (EN)`), de: text(page, `${base} (DE)`) };
}

export function teamRow(page) {
  return {
    id: page.id,
    name: text(page, 'Name'),
    role: pair(page, 'Role'),
    bio: pair(page, 'Bio'),
    linkedin: url(page, 'LinkedIn'),
    group: select(page, 'Group'),
    order: number(page, 'Order'),
    photo: null,
  };
}

export function projectRow(page) {
  return {
    id: page.id,
    slug: text(page, 'Slug'),
    title: pair(page, 'Title'),
    summary: pair(page, 'Summary'),
    status: select(page, 'Status'),
    order: number(page, 'Order'),
    image: null,
  };
}

export function eventRow(page) {
  return {
    id: page.id,
    title: pair(page, 'Title'),
    summary: pair(page, 'Summary'),
    date: date(page, 'Date'),
    location: text(page, 'Location'),
    registrationLink: url(page, 'Registration link'),
    image: null,
  };
}

/** Image property per collection, used by the downloader. */
export const imageProperty = {
  team: 'Photo',
  projects: 'Image',
  events: 'Image',
};
export const imageField = { team: 'photo', projects: 'image', events: 'image' };
export const rowMappers = {
  team: teamRow,
  projects: projectRow,
  events: eventRow,
};

/** Query sorts per collection. */
export const sorts = {
  team: [{ property: 'Order', direction: 'ascending' }],
  projects: [{ property: 'Order', direction: 'ascending' }],
  events: [{ property: 'Date', direction: 'ascending' }],
};

/** File extension from a Notion file name or URL path. */
export function extensionOf(name, href) {
  const candidates = [name, href ? new URL(href).pathname : ''];
  for (const candidate of candidates) {
    const match = /\.([a-z0-9]{2,5})$/i.exec(candidate ?? '');
    if (match) return match[1].toLowerCase();
  }
  return 'jpg';
}
