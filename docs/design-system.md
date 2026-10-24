# Design system: the design study

Date 2026-10-13 (version 2.2.0, design v54). Version 2.2.0 brings the design round v54, which Max approved as one HTML file built from this code; the rules below include it, and "v54" marks what it changed. Before that, 2026-10-11 (version 2.1.0, the final study): Max approved a working design study (one HTML file with CSS and one canvas script) and asked for the live site to look and move exactly like it. The site translates the study one to one: the values below are the values of the study. Every value is a token or a rule in `src/styles/global.css`; the canvas is `src/lib/sky.ts`. Earlier systems ("Quiet editorial", the glass edition of version 1.2.0) are replaced.

## Direction in three sentences

Dark by choice: a night sky behind every page, near-white ink, one accent blue, glass pills with a thin light edge. The start page shows one section per screen; a section fades out and the next one builds up step by step, and one orbit line leads from the first section to the last. Inner pages scroll like a document, with the orbit line growing from heading to heading and their content in the form that suits it. The start page opens on the club atom in 3D with comets on its rings, a star sky and the headline above it.

## Colour

| Token            | Value                       | Use                                        |
| ---------------- | --------------------------- | ------------------------------------------ |
| `--ground-a`     | `#04050a`                   | first ground, page background              |
| `--ground-b`     | `#0a0d18`                   | second ground; sections alternate A, B, A  |
| `--ink`          | `#eef1f7`                   | text                                       |
| `--ink-2`        | `#9aa2b4`                   | secondary text (ledes, descriptions)       |
| `--ink-3`        | `#767e92`                   | sublines of headings, footer, mail line    |
| `--accent`       | `#8fb0ff`                   | links, roles, icons, focus ring, the atom  |
| `--accent-deep`  | `#2552c4`                   | primary button gradient, switch on         |
| `--glass`        | white at 4.5 %              | pills and buttons                          |
| `--glass-strong` | `rgba(14, 17, 26, 0.7)`     | settings panel                             |
| `--glass-line`   | white at 10 %               | every border                               |
| `--glass-top`    | white at 16 %               | the one-pixel highlight along the top      |
| `--edge-light`   | `rgba(222, 231, 255, 0.95)` | the light that runs around primary buttons |
| `--card`         | `rgba(10, 13, 24, 0.6)`     | cards, panels, rows                        |

Forms add `--danger` and `--ok` (always with text). There is no light theme: the study is dark by choice, and one theme keeps the sky, the glass and the contrast exact. `--ink-2` on `--ground-a` is 8.0 to 1, `--ink-3` 5.0 to 1 (the study used `#6b7387`, 4.3 to 1, below the AA minimum for the small footer text, so it is one step lighter).

## Type

Geist Variable, self-hosted through `@fontsource-variable/geist` (the study's font; no Google servers), with a metric-matched fallback. Body 16 px, line height 1.6. Version 2.1.0 sets every size about 6 % below the study (Max found the text too large); proportions, weights, line heights and spacing stay the study's. Weights 500 for headings and buttons, 600 for the brand. Sizes (all `rem`, so the root size scales them on very large screens):

| Use                  | Size                                                                         |
| -------------------- | ---------------------------------------------------------------------------- |
| Start page headline  | `clamp(2.05rem, 1.3rem + 3vw, 3.9rem)`, line height 1.05, tracking −0.035 em |
| Page title (h1)      | `clamp(2.1rem, 1.4rem + 2.7vw, 3.6rem)`                                      |
| Section heading (h2) | `clamp(1.65rem, 1.2rem + 1.6vw, 2.65rem)`                                    |
| Closing heading      | `clamp(1.85rem, 1.3rem + 2.15vw, 3.3rem)`                                    |
| Tile title           | `clamp(1.03rem, 0.9rem + 0.45vw, 1.3rem)`                                    |
| Lede                 | 1.03 to 1.125 rem                                                            |
| Navigation, buttons  | 14 px, 15 px                                                                 |

Headings stand alone, with no small label above them. A section heading and its subline form one line: `Explore the club <span class="sub">Four ways in.</span>` (`HeadRow`).

## Layout

- Content width `--content`: 1160 px, then 72 % of the screen from 1611 px, at most 2080 px. On a 2560 px screen the content is 1843 px wide (1.6 times the study), on a 3840 px screen 2080 px. From 2400 px the root size is 112.5 %, from 3200 px 125 %.
- The study keeps the browser's 8 px body margin; the site keeps it too, so every position matches.
- Header: three glass pills 50 px high, 14 px from the top: brand left, navigation centred, tools right (members icon and settings). Below 980 px the brand shows the atom only and the navigation scrolls sideways. Below 640 px the navigation shows icons instead of words, so the Join button always fits; the words stay for screen readers.
- Sections: `padding: 100px 16px 64px`, content centred vertically. A section taller than the screen scrolls inside itself.
- Plain pages (legal, 404, member area) scroll like a document: padding 140 px on top, the legal links at the end.

## Components

- Buttons: solid pills (no glass, so nothing moves behind them), 12 by 22 px padding, a dark gradient `#1c2131` to `#131722` with a thin light edge and a soft top highlight. The primary button ("Join the club") is the deep club blue `#2f3a59` to `#12224c`, a brighter edge and a subtle blue outer glow, with the edge light: a conic light runs around its border once every 7 s (visible from 62 % to 88 % of the period), on one clock for every primary button on the page (`syncEdges` in `src/lib/chrome.ts`). In every round each button starts its light at a new point of its edge, chosen while the light is out (v54).
- Navigation: About, Projects, Events, Team, then the Join button (Ideas and Newsletter are reached from Projects and Events). All items 38 px high. A glass pill sits on the active page and glides to the item under the pointer (460 ms). The Join button shows only where no "Join the club" button is on screen (`data-join` on such buttons) and stays away on the join page and in the member area. It leaves at once and comes back only when the new section builds in (1.9 s). When the pointer moves from a link to Join, the pill goes back to the current page.
- Header glass (v54): clear glass, so stars, line and light show through; it turns darker as soon as content can pass behind it (`html.under`: scrolled, or a section after the hero on screen), so the header stays readable over every page. The pointer glow also lights the brand pill and the header pills. The members icon (a person) sits in the tools pill and is marked as current in the member area; the footer no longer carries the members link.
- Settings panel: pause animation (with its explanation), easy read (with a short explanation), load external media, language. Switches 40 by 24 px. No text size option, no theme option. Panel 240 px wide, 10 px below the tools pill, right-aligned, opacity 260 ms and a 6 px drop 360 ms. It is a sibling of the tools pill (a glass element inside a glass element loses its blur). Opens and closes on the button, closes on a press outside, on Escape, when focus leaves it and, with its own soft fade, as soon as the page scrolls (wheel, touch or scroll). Choices are kept in `localStorage` (`ndt_prefs`).
- Section dots on the right edge (hidden below 820 px), labelled with the section names.
- Picture tiles (start page): 3 by 4, at most 46 % of the screen high, number top left, title and arrow at the bottom over a dark gradient, description below. Two columns of 4 by 3 below 820 px.
- Columns with a picture (projects): 16 by 10 picture, icon and title, one line. A row with a square picture below 820 px. On the Projects page the background changes from project to project, and the project nearest the middle of the screen glows softly (`.lit`, `initProminent` in `src/lib/reveal.ts`).
- Pictures (v54): round corners at all times, also while the page scrolls, builds up or the pointer is on them. The corners come from a clip path with the box's own radius on an inner layer (`.pic-in`, `rounds()` in `src/lib/glow.ts`), because a rounded overflow clip shows square corners for a moment in Chrome. The blue shine below a picture and the pointer glow inside it show only while the pointer is on the picture; the picture at the top of each page has the shine only then too.
- Start page team section (v54): three person boxes (portrait or initials, name, role) from the Notion team list, and a "Meet the team" button to the Team page, before the closing section.
- Join page (v54): the clip shows as a still picture without a play button (`ClipVideo` with `still`).
- Events (v54): no calendar for now. `src/components/Calendar.astro` and `src/lib/calendar.ts` stay in the code for later; the events carry anchors (`event-<id>`) for it.
- Resource links (About): a small round mark with the first letter of the site's address in front of each link.
- Page head (first section of inner pages): title and lede left, the registry picture 4 by 3 right; picture below the text on phones.
- Cards: radius 20 px, padding 24 px, `--card` background, `--glass-line` border.
- Closing section: centred heading, one line, the primary button, the club address, the legal links at the bottom (`Cta`).
- AI chip: a small "AI" (German "KI") in the top right corner of every AI image and clip, with the full disclosure for screen readers and as a tooltip (EU AI Act, Article 50(4), see `docs/media.md`).
- Focus: a subtle light ring (1.5 px, ink at 55 %, 3 px offset) for keyboard users. After a pointer press no ring stays (`html.pointer-mode`, removed by Tab). Headings never show a ring, also when the router moves focus to them.
- Pointer glow (`src/lib/glow.ts`): an organic, wobbly light. On the plain background small and quiet (240 px, accent at 8 %, blur 12 px); inside picture tiles, cards, boxes and buttons clear (300 px, 160 px on buttons and header pills). Boxes and buttons light up when the pointer comes near; pictures only while the pointer is on them. Fine pointers only, off under reduced motion.
- Inner pages: they scroll like a document. A page head (title, lede, picture), then blocks with a heading row and the content in its own form: text column and points (About), quote column, glossary, link list, feature rows (Projects), numbered list (project goals), timeline (Events), profiles (Team), text beside a form (Ideas, Newsletter, Join). The end is the study's closing section and the legal links. Blocks build in every time they come into view and fade out again when they leave it, up and down (v54).
- Sign-up form: one question at a time (`src/lib/stepper.ts`), a count and a bar, Back and Next (Enter moves on), each step checked with the server's rules, the box eases to the height of the next question. Without JavaScript all questions show at once.

## Motion

All values from the study. Easing `cubic-bezier(0.22, 0.8, 0.2, 1)` everywhere.

- Section switch, slow and in order: the old section's blocks fade out, rise 16 px and blur to 10 px (1000 ms, 60 ms apart); from 550 ms the sky, the atom and the line move to the next section over 2100 ms; from 1800 ms the new section's blocks build up from 18 px below and an 8 px blur (opacity 1300 ms, travel 1700 ms, 150 ms apart, from 250 ms). Input is locked for 2900 ms per step. Wheel (48 px threshold), swipe (44 px), arrow and page keys, space, Home and End, the dots, and focus move between sections.
- Page switch (`src/lib/router.ts`): the old page fades, slides 7 % to the side, shrinks to 98.5 % and blurs to 12 px (520 ms); the new one comes in from the other side (760 ms, 120 ms later). The direction follows the navigation order; inside one part of the site a deeper page lies ahead. Back and forward use the same rule, so going back plays the switch in reverse. Header and sky stay. Every internal link switches this way, also through redirects (the member area sends signed-out visitors to the sign-in page) and to the 404 page; a link to the page that is open goes back to its top (first section on the start page). Only a request that fails completely (offline) loads the page in full.
- Language switch: the same page in the other language replaces the view at once, without slide or fade, and keeps the place on the page; the header stays and its texts, labels and links change to the other language in place. Nothing of the old language shows after the click.
- Sky (`src/lib/sky.ts`, one canvas, v54): the stars sit in a real 3D field with depth, near stars larger and brighter. The sky stands still; only the pointer (like looking around a little) and scrolling move it, near stars more than far ones. Some stars fade out after a while and come back elsewhere. No star shines on or right above a heading (a calm area around every heading). Rare shooting stars cross the sky at random times, on every page, and never cross the atom. Below the hero only rare stars stay. Grounds alternate A, B per section.
- Atom: three orbits with the ellipse ratio of the club mark, two comets per ring that stay opposite each other, fading tails; it leans towards the pointer. The core is a calm small sun in the club's blue: a soft middle, a thin uneven corona that turns very slowly, active regions that breathe a little, now and then a short outburst of shine at a random point of the rim.
- The comet (v54): leaving the hero, the comet that faces most downward leaves its ring, draws the line behind it and rides to the next heading; at rest it is the light at the end of the line. Scrolling back up to the hero it rides up the line at the pace of the sky, then swings back into its own ring at its own place, opposite the other comet of that ring, at the ring's speed and without a jump. Its tail is never longer than the tails on the rings; it is as long as the comet is fast and grows evenly, without steps.
- Guide line (v54): one path through the page, drawn as a haze, a glow and a core. On the hero at rest there is no line; only a small light with a short tail moves a short way down from below the buttons every 10 s and fades out. The line runs in calm curves and never folds back over itself: between two headings far apart it swings out to one side in one calm bow, elsewhere one calm S-curve joins them, and it reaches every heading and every closing heading straight from above. At rest it ends just above the heading in view; with the next section (start page) or the next heading (inner pages) it grows on to the next heading. Its end keeps glowing at rest and gives a short shine the moment the light arrives (when less than 2.5 px are left); a slow light runs along the resting line and fades out within half a second when the line or the page moves. The atom rises with its section at 60 % of the travel and fades by a little under half the step.
- Inner pages: the sky keeps its rare stars and has no dark overlay. The line comes straight down from the top of the page to the first heading and grows on from heading to heading as the page scrolls, with the same rules as on the start page. Their parts build in every time they come into view and fade out again when they leave it (`src/lib/reveal.ts`), up and down.
- Header atom: three dots on the three orbits of the brand mark (SVG, 6, 7.5 and 9 s per round).

Nothing flashes: the fastest change is the button light (once per 7 s); stars twinkle with periods above 2 s and an amplitude of at most 22 %. Reduced motion (`prefers-reduced-motion: reduce`) and the pause switch stop every ongoing motion: the sky stands still (one frame, then no loop: no drift, no comet flight, no shooting stars, no sun outbursts, no hero light), the brand dots stop, the button light is off and the glow of the project in the middle stands still. Reduced motion also switches sections and pages at once without travel or blur, puts every part of a page there from the start and turns the pointer glow off; with the pause switch alone, switches and build-ups keep their calm fades, because they answer the visitor's own action.

## Addresses

Static pages are built as files (`about.html`, `build.format: 'file'` in `astro.config.mjs`), so Cloudflare serves `/about` directly. With folders (`about/index.html`) it answered every address without a slash with a redirect to `/about/`, which cost a round trip on every visit and made the page switch fall back to a full load. Addresses never end with a slash; `/about/` redirects to `/about`. `pagePath()` in `src/lib/i18n.ts` removes the file name from `Astro.url` for canonical and language links.

## Performance

The canvas draws only what is on screen: the atom only on the start page's hero, the full star field only there, rare stars elsewhere; the loop stops when the tab is hidden or motion is paused and settled. The device pixel ratio is capped at 2. The headline is HTML text and paints first (largest contentful paint). Header, sections and router start at once; the sky starts 350 ms after the load event and fades in over 600 ms, so it never competes with the first screen. Sections off screen sit far below the screen (`translateY(400vh)`, clipped), so their lazy pictures wait; after the load they load in the background. The pixels of the sun (disc and corona, about 65 ms of noise math on a fast machine) are computed in a worker (`src/lib/sun.worker.ts`), away from the main thread, and the sun fades in over 450 ms when they arrive. Computed on the main thread, they gave a total blocking time of up to 640 ms. The fine structure of the active regions is the same for all of them, so it is computed once per pixel, not once per region. A frame never reads the layout: the scroll position and the page height are kept in variables that update on scroll, resize and page changes. The header atom and the button light change styles in every frame, so a layout read inside a frame (2026-10-14: `scrollY` in the star drawing) forced a full style and layout pass each time. A pointer glow that is hidden keeps its wobble paused. Measured on 2026-10-11 (mobile profile): LCP 1.2 to 1.7 s, TBT at most 70 ms, CLS 0, performance 100. Measured on 2026-10-13 with v54: LCP 1.4 to 2.1 s, TBT at most 100 ms, CLS at most 0.002, performance 0.99 to 1. Budget unchanged: Lighthouse mobile performance at least 90, LCP at most 2.5 s, CLS at most 0.05, TBT at most 150 ms.

## Media

Registry images in `src/data/media.ts`, 16:9 crops at 640, 960 and 1280 px and 3:4 centre crops at 480 and 720 px for the tiles (`npm run media`). The club logo is `public/logo.svg` (traced from the club's picture, `media/originals/club-logo.webp`), also as `public/logo-512.png`, favicon, touch icon and app icons.
