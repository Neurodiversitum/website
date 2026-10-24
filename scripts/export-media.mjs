// Exports the site images from the originals in media/originals/ to public/assets/.
// Every image becomes a 16:9 WebP at 640, 960 and 1280 px and a 3:4 WebP at 480 and 720 px for
// the picture tiles (centre crop, as the design study shows them); the club logo becomes the icons; the video gets a
// 960 px H.264 version and a WebP poster. Run with `npm run media` after adding or replacing
// an original; the registry of what each file is (real photo, AI image, placeholder) lives in
// src/data/media.ts.
import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const source = path.join(root, 'media/originals');
const out = path.join(root, 'public/assets');

/** Original file name to published name. */
const images = {
  'about-hero.png': 'scene-library',
  'events-hero.jpg': 'scene-foyer',
  'ideas-hero.png': 'scene-ideas',
  'join-hero.png': 'scene-craft',
  'newsletter-hero.png': 'scene-board',
  'projects-hero.png': 'scene-model',
  'team-hero.jpg': 'scene-workshop',
  'project-quietzones.png': 'scene-quiet-zones',
  'project-lighting.png': 'scene-lighting',
  'project-lectures.png': 'scene-lectures',
};
const video = { 'hero.mp4': 'scene-study-group' };

await mkdir(out, { recursive: true });
for (const [file, name] of Object.entries(images)) {
  for (const width of [640, 960, 1280]) {
    const height = Math.round((width * 9) / 16);
    await sharp(path.join(source, file))
      .resize(width, height, { fit: 'cover', position: 'attention' })
      .webp({ quality: 74 })
      .toFile(path.join(out, `${name}-${width}.webp`));
  }
  for (const width of [480, 720]) {
    await sharp(path.join(source, file))
      .resize(width, Math.round((width * 4) / 3), {
        fit: 'cover',
        position: 'centre',
      })
      .webp({ quality: 74 })
      .toFile(path.join(out, `${name}-tall-${width}.webp`));
  }
  console.log(`media: ${name} (640, 960, 1280, tall 480, 720)`);
}

// The club logo: public/logo.svg (traced from media/originals/club-logo.webp) becomes a 512 px
// PNG with a clear background (stable address, also the Notion icon) and the app icons on the
// light ground of the original.
const pub = path.join(root, 'public');
const logo = path.join(pub, 'logo.svg');
await sharp(logo, { density: 300 })
  .resize(512, 512)
  .png()
  .toFile(path.join(pub, 'logo-512.png'));
for (const [file, size] of [
  ['apple-touch-icon.png', 180],
  ['assets/icon-192.png', 192],
  ['assets/icon-512.png', 512],
]) {
  const inner = Math.round(size * 0.72);
  const mark = await sharp(logo, { density: 300 })
    .resize(inner, inner)
    .png()
    .toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 4, background: '#f3f6fd' },
  })
    .composite([{ input: mark, gravity: 'centre' }])
    .png()
    .toFile(path.join(pub, file));
}
console.log('media: logo (512 png, touch icon, app icons)');
if (process.argv.includes('--images-only')) process.exit(0);
for (const [file, name] of Object.entries(video)) {
  const input = path.join(source, file);
  execFileSync('ffmpeg', [
    '-v',
    'error',
    '-y',
    '-i',
    input,
    '-an',
    '-vf',
    'scale=960:-2',
    '-c:v',
    'libx264',
    '-profile:v',
    'main',
    '-crf',
    '28',
    '-preset',
    'slow',
    '-movflags',
    '+faststart',
    '-pix_fmt',
    'yuv420p',
    path.join(out, `${name}.mp4`),
  ]);
  execFileSync('ffmpeg', [
    '-v',
    'error',
    '-y',
    '-ss',
    '0.5',
    '-i',
    input,
    '-frames:v',
    '1',
    '-vf',
    'scale=960:-2',
    path.join(out, `${name}-poster.png`),
  ]);
  await sharp(path.join(out, `${name}-poster.png`))
    .webp({ quality: 78 })
    .toFile(path.join(out, `${name}-poster.webp`));
  execFileSync('rm', [path.join(out, `${name}-poster.png`)]);
  console.log(`media: ${name} (mp4, poster)`);
}
