// Site-wide facts in one place: names, addresses, form ids and the lists the pages render.
export const site = {
  name: 'Neurodiversitum',
  url: 'https://neurodiversitum.org',
  email: 'contact@neurodiversitum.org',
  /** The club logo at a stable address (also for Notion): SVG and a 512 px PNG. */
  logo: '/logo.svg',
  logoPng: '/logo-512.png',
  favicon: '/assets/favicon.svg',
  touchIcon: '/apple-touch-icon.png',
  socialImage: '/assets/social.png',
} as const;

/** Tally form ids. Change them here when a form is replaced. */
export const forms = {
  ideas: 'zxo1Pq',
  newsletter: 'XxkzLV',
} as const;

/**
 * Project detail pages. The list of projects comes from Notion (src/data/content.json);
 * a project gets its own page when its slug has detail copy in `dict.projectDetail`.
 */
export const projectDetails = {
  'quiet-zones': 'quietZones',
  'ambient-lighting': 'ambientLighting',
  'shorter-lectures': 'shorterLectures',
} as const;
export type ProjectKey = (typeof projectDetails)[keyof typeof projectDetails];

/** Talks on the About page: YouTube ids with their caption copy key. */
export const videos = [
  {
    id: 'Qvvrme5WIwA',
    title: 'Neurodiversity: the key that unlocked my world',
    credit: 'video1Credit',
  },
  {
    id: 'ALJ3CFRRZpo',
    title: 'What Exactly Is Neurodiversity?',
    credit: 'video2Credit',
  },
  {
    id: 'WprLOcEyh6M',
    title: 'Neurodiversity: The New Normal',
    credit: 'video3Credit',
  },
] as const;

/** External resources on the About page. */
export const resources = [
  {
    key: 'resTum',
    url: 'https://www.tum.de/en/studies/support-and-advice/wellbeing/studying-with-a-disability',
  },
  { key: 'resAsan', url: 'https://autisticadvocacy.org/' },
  { key: 'resAdhs', url: 'https://www.adhs-deutschland.de/' },
  { key: 'resBvl', url: 'https://www.bvl-legasthenie.de/' },
] as const;
