# Media: what the site uses and why

Date 2026-10-10. Decisions for the relaunch, with sources and licences. Max confirmed on the same day: the club has no real photos apart from the three team portraits; every other image and the video in the first site were AI-generated. They are used, marked, and never presented as photos of the club.

## One central place

`src/data/media.ts` lists every image and clip of the fixed pages with its kind: `photo` (real), `ai` (generated) or `placeholder` (drawn). The `MediaImg` and `ClipVideo` components render the entries and put a small "AI" chip ("KI" in German) in the corner of every AI entry, with the full text "AI-generated image. Not a photo of the club." for screen readers and as a tooltip (since 2026-10-11, see "AI disclosure"). To replace an AI image with a real photo later: put the original into `media/originals/`, run `npm run media` (or export the two WebP sizes by hand into `public/assets/`), change `src` and set `kind: 'photo'` in the registry. No page changes.

Team portraits, project images and event images come from Notion (`src/data/content.json`) and are real by definition. The three portraits in `public/assets/team-*.webp` are the committed fallback until Notion holds them.

## What the site shows

| Entry (`media.ts`)  | File                                                      | Kind                   | Where                                                                             |
| ------------------- | --------------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------- |
| `about`             | `scene-library`                                           | AI                     | About page head                                                                   |
| `projects`          | `scene-model`                                             | AI                     | Projects page head                                                                |
| `events`            | `scene-foyer`                                             | AI                     | Events page head                                                                  |
| `team`              | `scene-workshop`                                          | AI                     | Team page head (the portraits below it are real)                                  |
| `join`              | `scene-craft`                                             | AI                     | registered for the join page, not shown while the clip is used there              |
| `ideas`             | `scene-ideas`                                             | AI                     | Idea Wall page head                                                               |
| `newsletter`        | `scene-board`                                             | AI                     | Newsletter page head                                                              |
| `quiet-zones`       | `scene-quiet-zones`                                       | AI                     | project page head                                                                 |
| `ambient-lighting`  | `scene-lighting`                                          | AI                     | project page head                                                                 |
| `shorter-lectures`  | `scene-lectures`                                          | AI                     | project page head                                                                 |
| `studyGroup` (clip) | `scene-study-group.mp4` + poster                          | AI                     | Join page head: poster first, plays on request, pause button, no sound, 10 s loop |
| Team portraits      | `team-max`, `team-varvara`, `team-vincent`                | real photo             | Team page, start page                                                             |
| Club logo           | `public/logo.svg`, `public/logo-512.png`                  | club's own (traced)    | 404 page, emails, Notion icon, source of every icon                               |
| Favicon, app icons  | `favicon.svg`, `apple-touch-icon.png`, `icon-192/512.png` | from the logo          | browser tab, home screen, web manifest                                            |
| Header atom         | `Header.astro`                                            | drawn from the mark    | header (animated)                                                                 |
| Hero atom           | `src/lib/sky.ts`                                          | drawn from the mark    | start page (canvas, 3D)                                                           |
| Social preview      | `social.png`                                              | rendered from the site | link previews                                                                     |
| Placeholders        | `Placeholder.astro` (orbits, dot grid, waves)             | drawn                  | event cards without an image, any registry entry without a file                   |

No stock photos. Nothing on the start page is an AI image: the start page uses the club graphic and the real portraits.

## Sources and exports

- Originals: `media/originals/` (the files of the Claude Design export: ten scenes as PNG or JPEG, one MP4). They carry a generator watermark in the corner, which the 16:9 crop by attention keeps out of view in most cases. Rights: generated for the club, no third-party licence.
- Export: `scripts/export-media.mjs` (`npm run media`) writes 16:9 WebP at 640, 960 and 1280 px (crop by attention, quality 74), the clip as 960 px H.264 without sound plus a WebP poster. Sizes after export: images 20 to 90 KB, clip 553 KB.
- Delivery: static assets on the Worker (free, 25 MiB per file). No Cloudflare Stream is needed for a 553 KB clip; Stream would cost USD 5 per 1,000 minutes stored and USD 1 per 1,000 minutes delivered (checked 2026-10-10 at https://developers.cloudflare.com/stream/pricing/).

## Rules for new media

1. Real people, real places and real events get `kind: 'photo'`. Generated images get `kind: 'ai'` and the note. Nothing generated is shown next to a claim that it is the club.
2. Record source and rights in this file before a file enters `media/originals/`.
3. Formats: WebP for photos, SVG for graphics, MP4 (H.264) with a poster for clips. Width and height on every `img`. `loading="lazy"` below the fold, `eager` with high priority in the page head.
4. Clips never autoplay and never play sound by themselves; a visible button starts and pauses them. Anything that moves for more than five seconds has a pause control and respects `prefers-reduced-motion`.

## Club logo

Max sent the new logo on 2026-10-11 as a picture (the SVG named in the message did not arrive). It is traced to a clean vector with potrace (`media/originals/club-logo.webp`, colour `#0a3aa8`) and published at stable addresses for other tools such as the Notion icon:

- https://neurodiversitum.org/logo.svg
- https://neurodiversitum.org/logo-512.png (512 by 512, clear background)

`npm run media` exports the PNG, the touch icon and the app icons from `public/logo.svg`. If Max sends the original SVG, it replaces `public/logo.svg` and the export runs again.

## AI disclosure (EU AI Act, Article 50)

Checked 2026-10-11. Article 50(4) obliges deployers of an AI system that generates image content constituting a deep fake to disclose that it is AI-generated; a deep fake is content that resembles existing persons, objects, places or events and would falsely appear to a person to be authentic (Article 3(60)). The obligation applies since 2 August 2026; the Digital Omnibus postponed the high-risk rules and gave providers a grace period for machine-readable marking (Article 50(2)), but not the deployer disclosure. The club's AI scenes are photorealistic students and rooms on a campus that a visitor could take for real photos of the club, so the site discloses them: clearly, at the first view, and accessibly (Article 50(5)), but without a large note. The disclosure is the "AI" chip on the image and the full sentence for screen readers. Sources: Regulation (EU) 2024/1689, Articles 3(60), 50 and 113; summaries checked at cloudsecurityalliance.org, mayerbrown.com and governancedocs.com (2026).

## What the club should produce

- Three to five photos of real meetups or the team at work on campus, landscape, at least 2000 px wide, with the consent of everyone shown. They replace the AI scenes one by one through the registry.
- The original SVG of the new logo, if it exists (the site uses a traced version).
