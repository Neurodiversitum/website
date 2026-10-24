// Every image and video of the fixed pages, in one place. The pages render these entries through
// the Picture and ClipVideo components, which add the "AI-generated" or "placeholder" note by
// themselves. To put a real photo on a page later: export it with `npm run media` (or drop the
// files into public/assets), change `src` and set `kind: 'photo'` here. Nothing else changes.
//
// Team portraits, project images and event images come from Notion (src/data/content.json) and
// are real by definition; they are not listed here.

export type MediaKind = 'photo' | 'ai' | 'placeholder';

export interface MediaImage {
  kind: MediaKind;
  /** Base path without size suffix and extension; the files are `<src>-640.webp`, `<src>-960.webp` and `<src>-1280.webp`. */
  src: string | null;
  width: number;
  height: number;
  alt: { en: string; de: string };
  /** Which placeholder pattern to draw when `kind` is 'placeholder' or `src` is null. */
  pattern?: 'orbits' | 'grid' | 'waves';
}

export interface MediaVideo {
  kind: MediaKind;
  src: string;
  poster: string;
  width: number;
  height: number;
  /** Seconds, so the component can say how long the clip is. */
  duration: number;
  alt: { en: string; de: string };
}

export const images = {
  about: {
    kind: 'ai',
    src: '/assets/scene-library',
    width: 1280,
    height: 720,
    alt: {
      en: 'A student with headphones studies in a quiet library',
      de: 'Eine Studentin mit Kopfhörern lernt in einer ruhigen Bibliothek',
    },
  },
  projects: {
    kind: 'ai',
    src: '/assets/scene-model',
    width: 1280,
    height: 720,
    alt: {
      en: 'An architecture model and drawings on a desk',
      de: 'Ein Architekturmodell und Zeichnungen auf einem Tisch',
    },
  },
  events: {
    kind: 'ai',
    src: '/assets/scene-foyer',
    width: 1280,
    height: 720,
    alt: {
      en: 'The foyer of a lecture hall with chairs set up for a talk',
      de: 'Das Foyer eines Hörsaals mit Stühlen für einen Vortrag',
    },
  },
  team: {
    kind: 'ai',
    src: '/assets/scene-workshop',
    width: 1280,
    height: 720,
    alt: {
      en: 'Students build a model together at a table',
      de: 'Studierende bauen gemeinsam ein Modell an einem Tisch',
    },
  },
  join: {
    kind: 'ai',
    src: '/assets/scene-craft',
    width: 1280,
    height: 720,
    alt: {
      en: 'Paper, pens and a sketchbook on a workshop table',
      de: 'Papier, Stifte und ein Skizzenbuch auf einem Werkstatttisch',
    },
  },
  ideas: {
    kind: 'ai',
    src: '/assets/scene-ideas',
    width: 1280,
    height: 720,
    alt: {
      en: 'A wall of sticky notes and diagrams above a desk',
      de: 'Eine Wand voller Haftnotizen und Diagramme über einem Schreibtisch',
    },
  },
  newsletter: {
    kind: 'ai',
    src: '/assets/scene-board',
    width: 1280,
    height: 720,
    alt: {
      en: 'A notice board with posters in a university corridor',
      de: 'Ein Schwarzes Brett mit Plakaten in einem Hochschulflur',
    },
  },
  'quiet-zones': {
    kind: 'ai',
    src: '/assets/scene-quiet-zones',
    width: 1280,
    height: 720,
    alt: {
      en: 'Small glass study rooms with a desk and a lamp',
      de: 'Kleine verglaste Lernräume mit Tisch und Lampe',
    },
  },
  'ambient-lighting': {
    kind: 'ai',
    src: '/assets/scene-lighting',
    width: 1280,
    height: 720,
    alt: {
      en: 'A hall with warm, dimmed pendant lights in the evening',
      de: 'Eine Halle mit warmen, gedimmten Pendelleuchten am Abend',
    },
  },
  'shorter-lectures': {
    kind: 'ai',
    src: '/assets/scene-lectures',
    width: 1280,
    height: 720,
    alt: {
      en: 'A lecture hall with a large clock above the screen',
      de: 'Ein Hörsaal mit einer großen Uhr über der Leinwand',
    },
  },
} as const satisfies Record<string, MediaImage>;

export const videos = {
  studyGroup: {
    kind: 'ai',
    src: '/assets/scene-study-group.mp4',
    poster: '/assets/scene-study-group-poster.webp',
    width: 960,
    height: 540,
    duration: 10,
    alt: {
      en: 'Four students talk at a table in a seminar room',
      de: 'Vier Studierende unterhalten sich an einem Tisch in einem Seminarraum',
    },
  },
} as const satisfies Record<string, MediaVideo>;

export type ImageKey = keyof typeof images;
export type VideoKey = keyof typeof videos;
