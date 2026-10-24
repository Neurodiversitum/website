// The sky behind every page: one canvas with the star field, the club atom in 3D on the start
// page, the two alternating grounds of the sections and the orbit line.
// - Stars sit in a real 3D field. The view drifts slowly forward, so near stars are larger,
//   brighter and faster. Some fade out after a while and come back elsewhere. Now and then a
//   shooting star crosses the sky.
// - The core of the atom is a small sun: a soft glow that wobbles, with a short outburst of its
//   shine at a random point of the rim now and then.
// - The orbit line is one path through the page. At rest it ends just above the heading in view;
//   with the next section (start page) or the next heading (inner pages) it grows on to the next
//   heading and may cross text on its way.
// - Leaving the hero, the comet that flies most downward leaves its ring, flies into the line and
//   rides its tip. Back on the hero it rides the line up and rejoins its ring where the ring runs
//   upward.
// `src/lib/sections.ts` tells the sky which section is on screen; the router tells it the page.

/** `hero`: the start page. `sections`: a page with one section per screen. `plain`: a page that
 *  scrolls like a document. */
export type SkyMode = 'hero' | 'sections' | 'plain';

import { SUN_CORONA, SUN_DISC, sunPixels, sunRegions } from './sun';

const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const easeIO = (x: number) =>
  x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
const hash = (x: number) => {
  const v = Math.sin(x * 12.9898) * 43758.5453;
  return v - Math.floor(v);
};

type Point = [number, number];
interface Star {
  u: number;
  v: number;
  z: number;
  mag: number;
  base: number;
  col: string;
  f1: number;
  f2: number;
  ph: number;
  rare: boolean;
  inner: boolean;
  life: boolean;
  L: number;
  lp: number;
  id: number;
}
interface Comet {
  p: number;
  T: number;
}
interface Orbit {
  a: number;
  spin: number;
  dir: number;
  comets: Comet[];
}
interface Track {
  pts: Point[];
  cum: number[];
  total: number;
}
interface Anim {
  from: number;
  to: number;
  t0: number;
  dur: number;
}
interface Fly {
  oi: number;
  ci: number;
  /** out: from the ring into the line and down to the next heading. rest: the comet is the light
   *  at the end of the line and moves with it. back: up the line and into a ring. */
  mode: 'out' | 'rest' | 'back';
  path: Track | null; // out and back: the whole way in page space, one smooth movement
  t0: number;
  dur: number;
  free: number; // out: length of the free flight at the start; back: length of the line part
  lineFrom: number; // back: where on the line it starts
  /** back: up the line with the sky (Dl ms, from height yA to yB), then in T ms freely into its
   *  own ring, leaving the line with velocity vE and meeting its ring comet at that comet's speed */
  back?: { Dl: number; T: number; yA: number; yB: number; vE: Point };
}
interface Burst {
  a: number;
  r: number;
  t0: number;
  d: number;
  h: number;
}
interface Shoot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t0: number;
  d: number;
  len: number;
}

const TILT = Math.acos(14.7 / 38); // same ellipse ratio as the club mark
const orbits: Orbit[] = [
  {
    a: 0,
    spin: 1 / 300,
    dir: 1,
    comets: [
      { p: 0.08, T: 46 },
      { p: 0.58, T: 46 },
    ],
  },
  {
    a: TAU / 6,
    spin: -1 / 360,
    dir: -1,
    comets: [
      { p: 0.3, T: 58 },
      { p: 0.86, T: 58 },
    ],
  },
  { a: TAU / 3, spin: 1 / 420, dir: 1, comets: [{ p: 0.47, T: 52 }] },
];
const GROUND = [
  [4, 5, 10],
  [10, 13, 24],
]; // two grounds, alternating per section

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D;
let W = 0;
let H = 0;
let R = 0;
let CY = 0;
let stars: Star[] = [];
let nebula: HTMLCanvasElement;
let glowStar: HTMLCanvasElement;
let glowComet: HTMLCanvasElement;
let glowCore: HTMLCanvasElement;
let sunDisc: HTMLCanvasElement;
let corona: HTMLCanvasElement;
let fan: HTMLCanvasElement;
let loop: HTMLCanvasElement;
let active: Array<{ a: number; r: number; f: number; p: number }> = [];
/** When the pixels of the sun arrived (`Infinity` until then), and how long it fades in. */
let sunAt = Infinity;
/** The scroll position and the page height, read on scroll, resize and page changes. Reading them
 *  inside a frame would force a style and layout pass in every frame, because the animations of
 *  the header and the buttons change styles all the time. */
let pageY = 0;
let pageH = 0;
const readScroll = () => {
  pageY = scrollY;
  pageH = document.documentElement.scrollHeight;
};
const SUN_FADE = 450;

let paused = false;
let reduce = false;
let heroTarget = 1;
let heroVal = 1;
let modeTarget = 1; // 1 on pages with sections, 0 on plain pages
let modeVal = 1;
let loadT = 0;
let pageKey = '/';
let index = 0;
const sec = { s: 0, from: 0, to: 0, t0: 0, dur: 2100 };
const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
let simT = 18;
let lastNow = 0;
let running = false;
let DT = 0.016;
let seed = 7;
const rnd = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

// the line of the start page, and of the inner pages
let track: Track | null = null;
let stops: number[] = [0];
/** Calm areas around the headings, in page space: no star shines there, so none sits on a heading
 *  or right above it where the line ends. */
let quietHome: number[][] = [];
let quietDoc: number[][] = [];
let entry = 0;
let line: Anim = { from: 0, to: 0, t0: 0, dur: 1 };
let doc: (Track & { stops: number[]; tops: number[] }) | null = null;
let docLine: Anim = { from: 0, to: -1, t0: 0, dur: 1 };
let docL = 0;
interface Rest {
  t: number;
  a0: number;
  a1: number;
  end: number;
}
let homeRest: Rest = { t: -1, a0: 0, a1: 0, end: 0 };
let docRest: Rest = { t: -1, a0: 0, a1: 0, end: 0 };
let lastScroll = -1e9;
let restAt = 0;
let lastArrive = '';
/** The end shines the moment the light reaches it: when less than 2.5 px are left. */
function arrive(key: string, left: number, now: number) {
  if (left < 2.5 && lastArrive !== key) {
    lastArrive = key;
    restAt = now;
  }
}
let lastFlash = -1; // when the comet or the end of the line came to rest: it lights up briefly
/** The slow light along the resting line; it fades out within half a second when the line or the page moves. */
function drawAmbient(
  rest: Rest,
  m: Track,
  dy: number,
  mul: number,
  now: number,
) {
  const idle = (now - rest.t) / 1000;
  if (paused || rest.t < 0 || idle < 2.5) return;
  const cyc = (idle - 2.5) % 11;
  if (cyc >= 9 || rest.a1 - rest.a0 < 40) return;
  const fade = rest.end > rest.t ? clamp(1 - (now - rest.end) / 450, 0, 1) : 1;
  if (fade <= 0) return;
  const u = cyc / 9;
  const round = Math.floor((idle - 2.5) / 11);
  const pos = rest.a0 + (rest.a1 - rest.a0) * u;
  if (fade === 1 && lastFlash !== rest.t * 1000 + round && rest.a1 - pos < 4) {
    lastFlash = rest.t * 1000 + round;
    restAt = now;
  }
  const q = at(m, pos);
  ctx.globalCompositeOperation = 'lighter';
  // it fades in at the start and stays bright until it reaches the end
  ctx.globalAlpha = 0.7 * mul * Math.min(1, u / 0.15) * fade;
  ctx.drawImage(glowComet, q[0] - 13, q[1] + dy - 13, 26, 26);
}
/** A short brightening right after the line came to rest. */
const restPulse = (now: number) => {
  // at once when the light arrives, then slowly fading
  const k = (now - restAt) / 1100;
  if (k < 0 || k > 1) return 0;
  return k < 0.08 ? k / 0.08 : Math.pow(1 - (k - 0.08) / 0.92, 2);
};

// the comet on its way, the shooting stars, the outbursts of the sun
let fly: Fly | null = null;
let atomNow: { cx: number; cy: number; tiltX: number; tiltY: number } | null =
  null;
/** A comet that has just come back into its ring: its tail on the ring grows in. */
let landed: { oi: number; ci: number; t: number; ts: number; f: Fly } | null =
  null;
let cometNow: Array<{
  oi: number;
  ci: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  z: number;
  sc: number;
}> = [];
let shoots: Shoot[] = [];
let nextShoot = 26;
let bursts: Burst[] = [];
let nextBurst = 24;

function sprite(size: number, stops: Array<[number, string]>) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  stops.forEach(([o, col]) => gr.addColorStop(o, col));
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  return c;
}

/* ---------- paths ---------- */

/**
 * Joins the nodes with cubic curves. Every node has one direction that the curve keeps through
 * it, so there is never a corner or a dent; each curve between two nodes is one calm swing.
 * Returns the sampled curve and the sample index of every node.
 */
function chain(nodes: Point[], dirs: Point[]): { pts: Point[]; at: number[] } {
  const pts: Point[] = [nodes[0]];
  const idx = [0];
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i];
    const b = nodes[i + 1];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const h = d * 0.42;
    const c1: Point = [a[0] + dirs[i][0] * h, a[1] + dirs[i][1] * h];
    const c2: Point = [b[0] - dirs[i + 1][0] * h, b[1] - dirs[i + 1][1] * h];
    const n = Math.max(8, Math.ceil(d / 3));
    for (let j = 1; j <= n; j++) pts.push(cubic(a, c1, c2, b, j / n));
    idx.push(pts.length - 1);
  }
  return { pts, at: idx };
}
/** Adds the stop `p`, reached straight from above. Between two stops far apart the line swings out
 *  to one side in a calm bow, so it stays curved although every stop is reached vertically. */
function addStop(
  nodes: Point[],
  dirs: Point[],
  stopIx: number[],
  p: Point,
  side: number,
) {
  const a = nodes[nodes.length - 1];
  const dy = p[1] - a[1];
  // only where the two points are almost straight above each other; elsewhere one calm S-curve
  // joins them, as a bow there would make the line swing out and back like a wiggle
  if (dy > 140 && Math.abs(p[0] - a[0]) < 60) {
    const off = side * clamp(dy * 0.14, 24, W < 820 ? 36 : 110);
    nodes.push([clamp((a[0] + p[0]) / 2 + off, 10, W - 10), (a[1] + p[1]) / 2]);
    dirs.push([0, 1]);
  }
  stopIx.push(nodes.length);
  nodes.push(p);
  dirs.push([0, 1]);
}
/** Where the home line rests in section `i`: nothing on the hero, else above the heading. */
const restL = (i: number) =>
  i > 0 ? (stops[Math.min(i, stops.length - 1)] ?? 0) : 0;
function measure(pts: Point[]): Track {
  const cum = [0];
  for (let i = 1; i < pts.length; i++)
    cum.push(
      cum[i - 1] +
        Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]),
    );
  return { pts, cum, total: cum[cum.length - 1] || 1 };
}
/** The point at arc length `d`. */
function at(m: Track, d: number): Point {
  d = clamp(d, 0, m.total);
  let lo = 0;
  let hi = m.cum.length - 1;
  while (hi - lo > 1) {
    const md = (lo + hi) >> 1;
    if (m.cum[md] < d) lo = md;
    else hi = md;
  }
  const v = (d - m.cum[lo]) / (m.cum[hi] - m.cum[lo] || 1);
  return [
    lerp(m.pts[lo][0], m.pts[hi][0], v),
    lerp(m.pts[lo][1], m.pts[hi][1], v),
  ];
}
function trace(m: Track, d1: number, dy: number, d0 = 0) {
  const path = new Path2D();
  const s0 = at(m, d0);
  path.moveTo(s0[0], s0[1] + dy);
  for (let i = 1; i < m.pts.length && m.cum[i] < d1; i++)
    if (m.cum[i] > d0) path.lineTo(m.pts[i][0], m.pts[i][1] + dy);
  const s1 = at(m, d1);
  path.lineTo(s1[0], s1[1] + dy);
  return path;
}
const arcAtY = (m: Track, y: number) => {
  for (let i = 1; i < m.pts.length; i++)
    if (m.pts[i][1] > y) return m.cum[i - 1];
  return m.total;
};
/** The arc length where the line reaches height `y` (the line only runs downwards). */
const arcY = (m: Track, y: number) => {
  for (let i = 1; i < m.pts.length; i++) {
    const y1 = m.pts[i][1];
    if (y1 >= y) {
      const y0 = m.pts[i - 1][1];
      return (
        m.cum[i - 1] +
        (m.cum[i] - m.cum[i - 1]) * clamp((y - y0) / (y1 - y0 || 1), 0, 1)
      );
    }
  }
  return m.total;
};
const cubic = (a: Point, b: Point, c: Point, d: Point, u: number): Point => {
  const w = 1 - u;
  return [0, 1].map(
    (i) =>
      w * w * w * a[i] +
      3 * w * w * u * b[i] +
      3 * w * u * u * c[i] +
      u * u * u * d[i],
  ) as Point;
};
/** Position of `el` inside `root`, from the layout (transforms of the build-up ignored). */
const rel = (el: HTMLElement, root: HTMLElement | null): Point => {
  let x = 0;
  let y = 0;
  let e: HTMLElement | null = el;
  while (e && e !== root) {
    x += e.offsetLeft;
    y += e.offsetTop;
    e = e.offsetParent as HTMLElement | null;
  }
  return [x, y];
};
/** Where the text of `el` starts, for centred headings too. */
const quietBox = (el: HTMLElement, root: HTMLElement | null, top: number) => {
  const r = document.createRange();
  r.selectNodeContents(el);
  const t = r.getBoundingClientRect();
  const e = el.getBoundingClientRect();
  const [x, y] = rel(el, root);
  return [
    x + t.left - e.left - 18,
    top + y - 70,
    x + t.right - e.left + 18,
    top + y + el.offsetHeight + 8,
  ];
};
const textX = (el: HTMLElement) => {
  const r = document.createRange();
  r.selectNodeContents(el);
  return r.getBoundingClientRect().left - el.getBoundingClientRect().left;
};
const currentView = () =>
  document.querySelector<HTMLElement>('main .view:not(.leaving)');

/** Start page: the hero line, then a stop above every section heading. */
function buildTrack() {
  track = null;
  const view = currentView();
  const S = Array.from(
    view?.querySelectorAll<HTMLElement>('.sections > .sec') ?? [],
  );
  if (S.length < 2 || !S[0].offsetParent) return;
  const narrow = W < 820;
  const mid = W / 2;
  const act = S[0].querySelector<HTMLElement>('.hero-actions');
  const btns = Array.from(act?.querySelectorAll<HTMLElement>('.btn') ?? []);
  const low = btns.reduce(
    (m, b) => Math.max(m, rel(b, S[0])[1] + b.offsetHeight),
    0,
  );
  // as before: a short, straight line from just below the buttons to the bottom of the screen
  const y0 = Math.min(
    H * 0.93,
    Math.max(
      H * 0.885,
      (act ? rel(act, S[0])[1] + act.offsetHeight : 0) + 22,
      low + 22,
    ),
  );
  // the line falls from the hero buttons, then swings from heading to heading in calm arcs
  const down: Point = [0, 1];
  // from below the buttons the line swings straight into the first heading in one calm S-curve;
  // a point at the bottom of the hero in between made the curve fold back over itself
  const nodes: Point[] = [[mid, y0]];
  const dirs: Point[] = [down];
  const stopIx: number[] = [];
  quietHome = [];
  for (let k = 1; k < S.length; k++) {
    const h = S[k].querySelector<HTMLElement>('h2');
    if (!h) continue;
    const [hx, hy] = rel(h, S[k]);
    const top = k * H + hy;
    const last = k === S.length - 1;
    quietHome.push(quietBox(h, S[k], k * H));
    // every heading is reached straight from above, the closing one in its middle
    addStop(
      nodes,
      dirs,
      stopIx,
      last
        ? [hx + h.offsetWidth / 2, top - 30]
        : [hx + textX(h) + (narrow ? 24 : 44), top - 26],
      k % 2 ? 1 : -1,
    );
  }
  const c = chain(nodes, dirs);
  track = measure(c.pts);
  const t = track;
  // the first stop is where the line leaves the hero
  stops = [arcY(t, H), ...stopIx.map((i) => t.cum[c.at[i]])];
  entry = stops[0] * 0.3;
}

/** Inner pages: a stop above every heading, the last above the closing heading. */
function buildDoc() {
  doc = null;
  const view = currentView();
  if (!view || modeTarget !== 0) return;
  const heads = Array.from(
    view.querySelectorAll<HTMLElement>('.doc h1, .doc h2, .doc .features h3'),
  ).filter((h) => h.offsetParent);
  if (!heads.length) return;
  const narrow = W < 820;
  const hs = [...pageKey].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);
  const r = (i: number) => hash(hs * 0.013 + i * 1.7);
  const down: Point = [0, 1];
  const h0 = heads[0];
  const x0 =
    getComputedStyle(h0).textAlign === 'center'
      ? rel(h0, null)[0] + h0.offsetWidth / 2
      : rel(h0, null)[0] + textX(h0) + (narrow ? 24 : 44);
  // the line comes straight down from the top of the page to the first heading
  const nodes: Point[] = [[x0, -20]];
  quietDoc = heads.map((el) => quietBox(el, null, 0));
  const dirs: Point[] = [down];
  const tops: number[] = [];
  const stopIx: number[] = [];
  heads.forEach((el, i) => {
    const [x, y] = rel(el, null);
    const centred = getComputedStyle(el).textAlign === 'center';
    // every heading is reached straight from above; each page swings its own way in between
    addStop(
      nodes,
      dirs,
      stopIx,
      centred
        ? [x + el.offsetWidth / 2, y - 30]
        : [x + textX(el) + (narrow ? 24 : 44), y - 26],
      r(i) < 0.5 ? -1 : 1,
    );
    tops.push(y);
  });
  const c = chain(nodes, dirs);
  const m = measure(c.pts);
  doc = {
    ...m,
    stops: stopIx.map((i) => m.cum[c.at[i]]),
    tops,
  };
}

/* ---------- stars ---------- */

function build() {
  if (!canvas) return;
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = Math.max(1, innerWidth);
  H = Math.max(1, innerHeight);
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  R = Math.min(W * 0.42, H * 0.31, 480);
  CY = H * 0.5;
  seed = 7;
  const count = Math.min(1100, Math.round((W * H) / 1800));
  const temps = ['220,230,255', '255,255,255', '255,244,228', '196,212,255'];
  stars = [];
  for (let i = 0; i < count; i++) {
    const mag = Math.pow(rnd(), 3.2);
    stars.push({
      u: rnd() * 2 - 1,
      v: rnd() * 2 - 1,
      z: rnd(),
      mag,
      base: 0.22 + mag * 0.8,
      col: temps[Math.floor(rnd() * temps.length)],
      f1: 0.25 + rnd() * 0.9,
      f2: 1.1 + rnd() * 2.4,
      ph: rnd() * TAU,
      rare: i % 30 === 0, // the few stars that stay in the sections below the hero
      inner: i % 3 === 0, // more on the inner pages
      life: rnd() < 0.3,
      L: 18 + rnd() * 26,
      lp: rnd(),
      id: i,
    });
  }
  nebula = document.createElement('canvas');
  nebula.width = Math.round(W * 0.5);
  nebula.height = Math.round(H * 0.5);
  const n = nebula.getContext('2d')!;
  const nw = nebula.width;
  const nh = nebula.height;
  const blob = (x: number, y: number, rad: number, col: string) => {
    const g = n.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, col);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    n.fillStyle = g;
    n.fillRect(0, 0, nw, nh);
  };
  blob(nw * 0.5, nh * 0.55, Math.max(nw, nh) * 0.5, 'rgba(30,52,130,0.24)');
  blob(nw * 0.22, nh * 0.3, nw * 0.4, 'rgba(60,40,120,0.1)');
  blob(nw * 0.8, nh * 0.72, nw * 0.42, 'rgba(20,60,140,0.12)');
  measureAll();
}

function measureAll() {
  readScroll();
  buildTrack();
  buildDoc();
  if (track) {
    const L = restL(index);
    if (performance.now() > line.t0 + line.dur)
      line = { ...line, from: L, to: L };
  }
}

function drawStars(t: number, s: number, heroF: number, home: number) {
  // The sky stands still. Moving the pointer is like looking around a little: every star moves
  // with it, near stars more than far ones. Scrolling lifts the sky the same way.
  const Z0 = 0.3;
  const Z1 = 3.6;
  const lookX = pointer.x * W * 0.006;
  const lookY = pointer.y * H * 0.006;
  const lift = s * H * 0.06 + (1 - home) * pageY * 0.03;
  const spanX = W + 40;
  const spanY = H + 40;
  for (const st of stars) {
    const vis =
      home * (st.inner || st.rare ? Math.max(heroF, 0.85) : heroF) +
      (1 - home) * (st.inner || st.rare ? 0.9 : 0);
    if (vis < 0.01) continue;
    const zz = Z0 + st.z * (Z1 - Z0);
    let u = st.u;
    let v = st.v;
    let env = 1;
    if (st.life) {
      // visible for a while, a slow fade, a pause, then back at another place
      const c = t / st.L + st.lp;
      const lc = Math.floor(c);
      const tin = (c - lc) * st.L;
      const on = st.L * 0.72;
      env =
        tin < on ? clamp(tin / 2.8, 0, 1) * clamp((on - tin) / 2.8, 0, 1) : 0;
      if (env <= 0) continue;
      env = env * env * (3 - 2 * env);
      if (lc) {
        u = hash(st.id * 3.1 + lc * 7.7) * 2 - 1;
        v = hash(st.id * 5.3 + lc * 1.9) * 2 - 1;
      }
    }
    const near = 1.25 / zz;
    let x = W / 2 + u * W * 0.55 - lookX - pointer.x * 36 * near;
    let y =
      H / 2 +
      v * H * 0.55 -
      lookY -
      pointer.y * 26 * near -
      lift * (0.2 + 0.8 * near);
    x = ((((x + 20) % spanX) + spanX) % spanX) - 20;
    y = ((((y + 20) % spanY) + spanY) % spanY) - 20;
    // no star on a heading or just above it
    let calm = 1;
    const qs = home > 0.5 ? quietHome : quietDoc;
    const qy = home > 0.5 ? s * H : pageY;
    for (const q of qs) {
      const dx = Math.max(q[0] - x, 0, x - q[2]);
      const dy = Math.max(q[1] - qy - y, 0, y - (q[3] - qy));
      calm = Math.min(calm, clamp(Math.max(dx, dy) / 16, 0, 1));
    }
    if (calm <= 0) continue;
    env *= calm;
    const size = Math.min(3.6, (0.26 + st.mag * 1.05) * near);
    const tw =
      0.78 +
      0.16 * Math.sin(t * st.f1 + st.ph) +
      0.06 * Math.sin(t * st.f2 * 2.3 + st.ph * 1.7);
    const alpha = clamp(
      st.base * Math.min(1.3, 0.25 + 0.5 * near) * tw * vis * env,
      0,
      1,
    );
    if (alpha < 0.01) continue;
    if (st.mag > 0.5 || size > 1.7) {
      const g = size * 9 * (0.9 + 0.2 * tw);
      ctx.globalAlpha = alpha * 0.5;
      ctx.drawImage(glowStar, x - g / 2, y - g / 2, g, g);
    }
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgb(' + st.col + ')';
    if (size > 1.4) {
      ctx.beginPath();
      ctx.arc(x, y, size, 0, TAU);
      ctx.fill();
    } else {
      const d = size * 2;
      ctx.fillRect(x - d / 2, y - d / 2, d, d);
    }
  }
  // shooting stars: rare, at random times, on every page
  if (!paused && t > nextShoot) {
    // a few tries for a path that keeps clear of the atom while it is on screen
    for (let tries = 0; tries < 8; tries++) {
      const dir = Math.random() < 0.5 ? 1 : -1;
      const an = ((16 + Math.random() * 22) * Math.PI) / 180;
      const sp = 520 + Math.random() * 380;
      const sh: Shoot = {
        x: W * (0.12 + Math.random() * 0.76),
        y: H * (0.05 + Math.random() * 0.42),
        vx: dir * Math.cos(an) * sp,
        vy: Math.sin(an) * sp,
        t0: t,
        d: 0.8 + Math.random() * 0.5,
        len: 110 + Math.random() * 130,
      };
      if (heroF > 0.05) {
        const cx = W / 2;
        const cy = CY - s * H * 0.6;
        let clear = true;
        for (let k = -0.3; k <= 1; k += 0.1) {
          const px = sh.x + sh.vx * sh.d * k;
          const py = sh.y + sh.vy * sh.d * k;
          if (Math.hypot(px - cx, py - cy) < R * 1.25) clear = false;
        }
        if (!clear) continue;
      }
      shoots.push(sh);
      break;
    }
    nextShoot = t + 10 + Math.random() * 22;
  }
  shoots = shoots.filter((sh) => t - sh.t0 <= sh.d && t >= sh.t0);
  for (const sh of shoots) {
    const age = t - sh.t0;
    const k = age / sh.d;
    const en = Math.sin(Math.PI * k);
    const hx = sh.x + sh.vx * age;
    const hy = sh.y + sh.vy * age;
    const sp = Math.hypot(sh.vx, sh.vy);
    const ux = sh.vx / sp;
    const uy = sh.vy / sp;
    const tl = sh.len * Math.min(1, k * 2.2);
    const gr = ctx.createLinearGradient(hx, hy, hx - ux * tl, hy - uy * tl);
    gr.addColorStop(0, 'rgba(235,242,255,' + (0.7 * en).toFixed(3) + ')');
    gr.addColorStop(1, 'rgba(160,186,255,0)');
    ctx.globalAlpha = 1;
    ctx.strokeStyle = gr;
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx - ux * tl, hy - uy * tl);
    ctx.stroke();
    ctx.globalAlpha = 0.55 * en;
    ctx.drawImage(glowStar, hx - 7, hy - 7, 14, 14);
  }
}

/* ---------- atom ---------- */

function proj(
  cx: number,
  cy: number,
  rad: number,
  tilt: number,
  a: number,
  th: number,
  tiltX: number,
  tiltY: number,
) {
  const x = rad * Math.cos(th);
  const y = rad * Math.sin(th);
  const y1 = y * Math.cos(tilt);
  const z1 = y * Math.sin(tilt);
  const X = x * Math.cos(a) - y1 * Math.sin(a);
  const Y = x * Math.sin(a) + y1 * Math.cos(a);
  const cyy = Math.cos(tiltY);
  const syy = Math.sin(tiltY);
  const X2 = X * cyy + z1 * syy;
  const Z2 = -X * syy + z1 * cyy;
  const cxx = Math.cos(tiltX);
  const sxx = Math.sin(tiltX);
  const Y2 = Y * cxx - Z2 * sxx;
  const Z3 = Y * sxx + Z2 * cxx;
  const f = 4.2 * rad;
  const s = f / (f - Z3);
  return { x: cx + X2 * s, y: cy + Y2 * s, z: Z3 / rad, s };
}

function drawComet(
  th: number,
  cx: number,
  cy: number,
  a: number,
  tiltX: number,
  tiltY: number,
  dir: number,
  alphaMul: number,
  tailK = 1,
) {
  const STEPS = 46;
  const head = proj(cx, cy, R, TILT, a, th, tiltX, tiltY);
  const depth = (0.45 + (0.55 * (head.z + 1)) / 2) * alphaMul;
  let prev = head;
  // flat ends: steps that overlap with round ends show as a row of beads
  ctx.lineCap = 'butt';
  ctx.strokeStyle = 'rgb(206,222,255)';
  // a comet that has just come back shows only the part of its tail it has already run; the newest
  // piece fades in as it grows and the end of the short tail is soft, so it builds up evenly
  const n = Math.min(STEPS, Math.ceil(STEPS * tailK - 1e-6));
  for (let i = 1; i <= n; i++) {
    const k = Math.min(i / STEPS, tailK);
    const grow = clamp(tailK * STEPS - (i - 1), 0, 1);
    const soft =
      1 - (1 - tailK) * (1 - clamp((tailK - k) / (0.25 * tailK + 0.02), 0, 1));
    const p = proj(cx, cy, R, TILT, a, th - dir * 1.15 * k, tiltX, tiltY);
    const fade = Math.pow(1 - k, 1.8) * grow * soft;
    ctx.globalAlpha = fade * 0.85 * depth;
    ctx.lineWidth = (2.6 * (1 - k) + 0.3) * head.s;
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.globalAlpha = fade * 0.08 * depth;
    ctx.lineWidth = (10 * (1 - k) + 1) * head.s;
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    prev = p;
  }
  const g = 46 * head.s * (0.8 + 0.2 * depth);
  ctx.globalAlpha = 0.9 * depth;
  ctx.drawImage(glowComet, head.x - g / 2, head.y - g / 2, g, g);
  ctx.globalAlpha = depth;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(head.x, head.y, 1.9 * head.s, 0, TAU);
  ctx.fill();
}

/** The core: a small sun, drawn like a photo of the sun in the club's blue. A mottled disc with
 *  a few bright active regions and a brighter rim, a thin, slightly uneven corona close around
 *  it, now and then a short flare at an active region near the rim, and rarely a faint loop of
 *  plasma at the edge. Nothing reaches far beyond the disc. */
function drawNucleus(nx: number, ny: number, alpha: number, t: number) {
  const cr = R * 0.075;
  const spin = t * 0.008;
  bursts = bursts.filter((b) => t - b.t0 < b.d && t >= b.t0);
  if (!paused && t > nextBurst && bursts.length < 2) {
    const ar = active[Math.floor(Math.random() * active.length)];
    bursts.push({
      a: ar.a,
      r: ar.r,
      t0: t,
      d:
        Math.random() < 0.25
          ? 6 + Math.random() * 4
          : 1.8 + Math.random() * 1.6,
      h: 0.6 + Math.random() * 0.4,
    });
    nextBurst = t + 3 + -Math.log(1 - Math.random()) * 7;
  }
  // corona: thin and close, its unevenness turns very slowly
  ctx.globalCompositeOperation = 'lighter';
  const halo = R * 0.5;
  ctx.globalAlpha = 0.22 * alpha;
  ctx.drawImage(glowCore, nx - halo / 2, ny - halo / 2, halo, halo);
  // the sun itself shows once its pixels are there
  const sunA = alpha * clamp((performance.now() - sunAt) / SUN_FADE, 0, 1);
  for (let k = 0; k < 2; k++) {
    const sz = cr * (3.1 + 0.08 * Math.sin(t * 0.21 + k * 2));
    ctx.save();
    ctx.translate(nx, ny);
    ctx.rotate(spin * (k ? -0.6 : 1) + k * 1.9);
    ctx.globalAlpha = sunA * 0.5;
    ctx.drawImage(corona, -sz / 2, -sz / 2, sz, sz);
    ctx.restore();
  }
  // the disc
  ctx.globalCompositeOperation = 'source-over';
  ctx.save();
  ctx.translate(nx, ny);
  ctx.rotate(spin);
  ctx.globalAlpha = sunA;
  ctx.drawImage(sunDisc, -cr, -cr, cr * 2, cr * 2);
  ctx.restore();
  // the disc shines
  ctx.globalCompositeOperation = 'lighter';
  const shine = cr * 2.4;
  ctx.globalAlpha = alpha * 0.13;
  ctx.drawImage(glowCore, nx - shine / 2, ny - shine / 2, shine, shine);
  // active regions breathe a little
  for (const ar of active) {
    const a = ar.a + spin;
    const f = 0.5 + 0.5 * Math.sin(t * ar.f + ar.p);
    const g = cr * (0.28 + 0.12 * f);
    ctx.globalAlpha = sunA * (0.08 + 0.1 * f);
    ctx.drawImage(
      glowStar,
      nx + Math.cos(a) * ar.r * cr - g / 2,
      ny + Math.sin(a) * ar.r * cr - g / 2,
      g,
      g,
    );
  }
  // flares and rare loops
  for (const b of bursts) {
    const k = (t - b.t0) / b.d;
    const a = b.a + spin;
    const px = nx + Math.cos(a) * b.r * cr;
    const py = ny + Math.sin(a) * b.r * cr;
    if (b.d < 6) {
      // a flare: sudden, then slowly fading; a soft fan of light, at most a little larger than the disc's radius
      const e =
        k < 0.12 ? easeIO(k / 0.12) : Math.pow(1 - (k - 0.12) / 0.88, 2.2);
      const g = cr * (0.5 + 0.6 * e) * b.h;
      ctx.globalAlpha = alpha * e;
      ctx.drawImage(glowComet, px - g / 2, py - g / 2, g, g);
      const fs = cr * (1.1 + 0.4 * e) * b.h;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(a);
      ctx.globalAlpha = alpha * 0.7 * e;
      ctx.drawImage(fan, -fs * 0.35, -fs / 2, fs, fs);
      ctx.restore();
    } else {
      // a loop of plasma at the rim: slow to come, slow to go, faint
      const e = Math.sin(Math.PI * k);
      const ls = cr * 1.05;
      ctx.save();
      ctx.translate(nx + Math.cos(a) * cr * 0.98, ny + Math.sin(a) * cr * 0.98);
      ctx.rotate(a + Math.PI / 2);
      ctx.globalAlpha = alpha * 0.55 * e;
      ctx.drawImage(loop, -ls / 2, -ls * 0.92, ls, ls);
      ctx.restore();
    }
  }
}

function drawAtom(
  t: number,
  s: number,
  heroA: number,
  tiltX: number,
  tiltY: number,
) {
  const cx = W / 2 + pointer.x * 16;
  const cy = CY - s * H * 0.6 + pointer.y * 10;
  atomNow = { cx, cy, tiltX, tiltY };
  type Item =
    | { ring: true; z: number; x1: number; y1: number; x2: number; y2: number }
    | { ring: false; o: Orbit; a: number; th: number; z: number; tk: number };
  const items: Item[] = [];
  cometNow = [];
  orbits.forEach((o, oi) => {
    const a = o.a + t * TAU * o.spin;
    const N = 220;
    let prev = proj(cx, cy, R, TILT, a, 0, tiltX, tiltY);
    for (let i = 1; i <= N; i++) {
      const p = proj(cx, cy, R, TILT, a, (i / N) * TAU, tiltX, tiltY);
      items.push({
        ring: true,
        z: (p.z + prev.z) / 2,
        x1: prev.x,
        y1: prev.y,
        x2: p.x,
        y2: p.y,
      });
      prev = p;
    }
    o.comets.forEach((c, ci) => {
      const th = (c.p + (o.dir * t) / c.T) * TAU;
      const hp = proj(cx, cy, R, TILT, a, th, tiltX, tiltY);
      const np = proj(cx, cy, R, TILT, a, th + o.dir * 0.05, tiltX, tiltY);
      const vl = Math.hypot(np.x - hp.x, np.y - hp.y) || 1;
      cometNow.push({
        oi,
        ci,
        z: hp.z,
        sc: hp.s,
        x: hp.x,
        y: hp.y,
        vx: (np.x - hp.x) / vl,
        vy: (np.y - hp.y) / vl,
      });
      if (fly && fly.oi === oi && fly.ci === ci) return; // this comet is out on the line
      // a comet that has just come back: its tail on the ring is only the way it has run there
      const tk = landed && landed.oi === oi && landed.ci === ci ? 0 : 1;
      items.push({ ring: false, o, a, th, z: hp.z, tk });
    });
  });
  const paint = (it: Item) => {
    if (it.ring) {
      const front = (it.z + 1) / 2;
      ctx.globalAlpha = (0.07 + 0.2 * front) * heroA;
      ctx.strokeStyle = 'rgb(160,186,255)';
      ctx.lineWidth = 0.8 + 0.6 * front;
      ctx.lineCap = 'butt';
      ctx.beginPath();
      ctx.moveTo(it.x1, it.y1);
      ctx.lineTo(it.x2, it.y2);
      ctx.stroke();
    } else drawComet(it.th, cx, cy, it.a, tiltX, tiltY, it.o.dir, heroA, it.tk);
  };
  items
    .filter((i) => i.z < 0)
    .sort((p, q) => p.z - q.z)
    .forEach(paint);
  drawNucleus(cx, cy, heroA, t);
  items
    .filter((i) => i.z >= 0)
    .sort((p, q) => p.z - q.z)
    .forEach(paint);
}

/* ---------- the line ---------- */

/** How far the home line reaches. Between two headings its end moves down (or up) the page at the
 *  pace of the sky, so the comet at its end glides calmly over the screen without dipping. */
const curL = (now: number) => {
  const e = easeIO(clamp((now - line.t0) / line.dur, 0, 1));
  if (!track || line.from === line.to || e <= 0 || e >= 1)
    return line.from + (line.to - line.from) * e;
  const y0 = at(track, line.from)[1];
  const y1 = at(track, line.to)[1];
  return arcY(track, y0 + (y1 - y0) * e);
};
const flyPos = (f: Fly, now: number) =>
  f.path ? f.path.total * easeIO(clamp((now - f.t0) / f.dur, 0, 1)) : 0;
/** back: where on the line the comet is u ms after it set off. It starts gently and reaches the
 *  point where it once joined the line still moving, so it never stops there. */
const backL = (f: Fly, u: number) => {
  const x = clamp(u / f.back!.Dl, 0, 1);
  return f.lineFrom - (f.lineFrom - entry) * x * x * (2 - x);
};
/** Where comet ci of ring oi is at sim time t, on screen, with its speed in px per ms. */
function ghost(oi: number, ci: number, t: number, s: number) {
  const o = orbits[oi];
  const c = o.comets[ci];
  const cx = W / 2 + pointer.x * 16;
  const cy = CY - s * H * 0.6 + pointer.y * 10;
  const pos = (tt: number) =>
    proj(
      cx,
      cy,
      R,
      TILT,
      o.a + tt * TAU * o.spin,
      (c.p + (o.dir * tt) / c.T) * TAU,
      -pointer.y * 0.1,
      pointer.x * 0.12,
    );
  const p = pos(t);
  const q = pos(t + 0.02);
  return {
    x: p.x,
    y: p.y,
    vx: (q.x - p.x) / 20,
    vy: (q.y - p.y) / 20,
    z: p.z,
    sc: p.s,
  };
}
/** back: the comet u ms after it set off, in page space, and how far it has gone into its ring */
function backHead(
  f: Fly,
  u: number,
  now: number,
  s: number,
): { p: Point; k: number } {
  const b = f.back!;
  if (u < b.Dl) return { p: at(track!, backL(f, Math.max(0, u))), k: 0 };
  const x = clamp((u - b.Dl) / b.T, 0, 1);
  const g = ghost(f.oi, f.ci, simT - (now - f.t0 - u) / 1000, s);
  const E = at(track!, entry);
  const G: Point = [g.x, g.y + s * H];
  const x2 = x * x;
  const x3 = x2 * x;
  const h00 = 2 * x3 - 3 * x2 + 1;
  const h10 = x3 - 2 * x2 + x;
  const h01 = -2 * x3 + 3 * x2;
  const h11 = x3 - x2;
  return {
    p: [0, 1].map(
      (i) =>
        h00 * E[i] +
        h10 * b.vE[i] * b.T +
        h01 * G[i] +
        h11 * (i ? g.vy : g.vx) * b.T,
    ) as Point,
    k: x,
  };
}
/** How far the line reaches: while the comet rides into it or out of it, the line follows the comet. */
function lineL(now: number) {
  if (fly?.path && fly.mode === 'out') {
    const pos = flyPos(fly, now);
    return pos <= fly.free ? 0 : entry + pos - fly.free;
  }
  if (fly?.back && fly.mode === 'back') {
    const u = now - fly.t0;
    return u < fly.back.Dl ? backL(fly, u) : 0;
  }
  return curL(now);
}

/**
 * The line, drawn like the tail of a comet: thin and faint where it has long been, wider and
 * brighter towards its end, with a soft wide glow and a light that varies a little along its
 * length. Short steps with flat ends, so no dots where steps meet.
 */
function strokeLive(
  m: Track,
  L: number,
  dy: number,
  alpha: number,
  fadeIn = 0,
  from = 0,
) {
  if (L <= from + 0.5) return;
  ctx.globalCompositeOperation = 'lighter';
  // a faint haze along the whole line
  const path = trace(m, L, dy, from);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgb(160,186,255)';
  ctx.globalAlpha = 0.025 * alpha;
  ctx.lineWidth = 12;
  ctx.stroke(path);
  const now = performance.now();
  const STEP = 6;
  const SPAN = 900;
  const top = -dy - 30;
  const bottom = -dy + H + 30;
  ctx.lineCap = 'butt';
  ctx.strokeStyle = 'rgb(206,222,255)';
  let prev = at(m, from);
  for (let d = from + STEP; d <= L + STEP - 0.01; d += STEP) {
    const dd = Math.min(d, L);
    const q = at(m, dd);
    if (Math.max(prev[1], q[1]) < top || Math.min(prev[1], q[1]) > bottom) {
      prev = q;
      continue;
    }
    const near = Math.pow(1 - clamp((L - dd) / SPAN, 0, 1), 1.6);
    const start = fadeIn ? easeIO(clamp((dd - from) / fadeIn, 0, 1)) : 1;
    const flick =
      0.82 +
      0.18 * Math.sin(dd * 0.021 - now * 0.0011 + Math.sin(dd * 0.006) * 2);
    const a = alpha * start * flick;
    ctx.globalAlpha = a * (0.2 + 0.55 * near);
    ctx.lineWidth = 0.55 + 1.75 * near;
    ctx.beginPath();
    ctx.moveTo(prev[0], prev[1] + dy);
    ctx.lineTo(q[0], q[1] + dy);
    ctx.stroke();
    {
      ctx.globalAlpha = a * (0.016 + 0.06 * near);
      ctx.lineWidth = 3 + 6 * near;
      ctx.beginPath();
      ctx.moveTo(prev[0], prev[1] + dy);
      ctx.lineTo(q[0], q[1] + dy);
      ctx.stroke();
    }
    prev = q;
  }
  ctx.lineCap = 'round';
}

function drawHomeLine(now: number, s: number, home: number) {
  if (!track) return;
  const L = lineL(now);
  const off = -s * H;
  // on the hero there is no line: the comet draws it when it flies down, from where it joins
  strokeLive(track, L, off, home, stops[0] * 0.35, entry);
  const moving = fly?.path
    ? now >= fly.t0
    : now >= line.t0 &&
      now < line.t0 + line.dur &&
      Math.abs(line.to - line.from) > 1;
  const restStart = fly?.path ? Infinity : line.t0 + line.dur;
  if (!fly?.path && line.to !== line.from && now >= line.t0)
    arrive('L' + line.t0, Math.abs(line.to - L), now);
  if (!moving && index > 0 && now >= restStart && homeRest.t !== restStart) {
    homeRest = {
      t: restStart,
      a0: Math.max(stops[index - 1] ?? 0, arcAtY(track, s * H + 70)),
      a1: L,
      end: Infinity,
    };
  }
  drawAmbient(homeRest, track, off, home, now);
  if (fly) return; // the comet is the light at the end of the line
  const tip = at(track, L);
  const pulse = restPulse(now);
  if (L > entry + 0.5 && (index > 0 || moving || pulse > 0)) {
    const g = (moving ? 34 : 22) + 26 * pulse;
    ctx.globalAlpha = (0.85 + 0.15 * pulse) * home;
    ctx.drawImage(glowComet, tip[0] - g / 2, tip[1] + off - g / 2, g, g);
  }
  // scroll hint on the hero: every 10 s a small light with a short tail moves a little way down
  // from below the buttons and fades out; there is no line yet
  const idle = paused
    ? -1
    : (now - Math.max(loadT, line.t0 + line.dur)) / 1000 - 2;
  if (index === 0 && idle >= 0 && s < 0.5) {
    const ph = (idle % 10) / 2.4;
    if (ph < 1) {
      const d = stops[0] * 0.62 * easeIO(ph);
      const fade = Math.sin(ph * Math.PI) * (1 - s * 2) * home;
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgb(206,222,255)';
      let prev = at(track, d);
      for (let k = 1; k <= 8; k++) {
        const q = at(track, Math.max(0, d - k * 6));
        const f = 1 - k / 9;
        ctx.globalAlpha = 0.35 * fade * f * f;
        ctx.lineWidth = 0.5 + 1.4 * f;
        ctx.beginPath();
        ctx.moveTo(prev[0], prev[1] + off);
        ctx.lineTo(q[0], q[1] + off);
        ctx.stroke();
        prev = q;
      }
      const q = at(track, d);
      ctx.globalAlpha = 0.5 * fade;
      ctx.drawImage(glowComet, q[0] - 10, q[1] + off - 10, 20, 20);
    }
  }
}

function drawDocLine(now: number) {
  if (!doc) return;
  const f = easeIO(clamp(1 - modeVal, 0, 1));
  if (f <= 0.001) return;
  const maxS = pageH - H;
  let k = 0;
  doc.tops.forEach((y, i) => {
    if (y < pageY + H * 0.74) k = i;
  });
  if (pageY >= maxS - 2) k = doc.tops.length - 1;
  // when the heading in view changes, the line grows on (or back) in one calm movement
  if (doc.stops[k] !== docLine.to) {
    if (docRest.end === Infinity) docRest.end = now;
    docLine = {
      from: Math.max(0, docL),
      to: doc.stops[k],
      t0: now,
      // up: the line goes back to the heading in view at once, so it never runs on below it
      dur: reduce ? 1 : doc.stops[k] < docLine.to ? 800 : 1800,
    };
  }
  docL =
    docLine.from +
    (docLine.to - docLine.from) *
      easeIO(clamp((now - docLine.t0) / docLine.dur, 0, 1));
  if (docL <= 0.5) return;
  strokeLive(doc, docL, -pageY, f);
  const q = at(doc, docL);
  const end = docLine.t0 + docLine.dur;
  const moving = now < end && Math.abs(docLine.to - docLine.from) > 2;
  if (docLine.to !== docLine.from && docLine.to > 0)
    arrive('D' + docLine.t0, Math.abs(docLine.to - docL), now);
  const restStart = Math.max(end, lastScroll + 400);
  if (!moving && now >= restStart && docRest.t !== restStart) {
    docRest = {
      t: restStart,
      a0: Math.max(doc.stops[k - 1] ?? 0, arcAtY(doc, pageY + 70)),
      a1: docL,
      end: Infinity,
    };
  }
  drawAmbient(docRest, doc, -pageY, f, now);
  const pulse = restPulse(now);
  {
    const g = (moving ? 34 : 22) + 26 * pulse;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = (0.8 + 0.2 * pulse) * f;
    ctx.drawImage(glowComet, q[0] - g / 2, q[1] - pageY - g / 2, g, g);
  }
}

/** The comet on its way: one smooth movement out of the ring and down the line, at rest as the
 *  light at the end of the line, and one smooth movement up the line and into a ring. */
/** The points of ring oi's comet ci and the ring behind it, from its head back over `span` rad. */
function ringArc(
  oi: number,
  ci: number,
  t: number,
  s: number,
  span: number,
  steps: number,
): Point[] {
  const o = orbits[oi];
  const c = o.comets[ci];
  const cx = W / 2 + pointer.x * 16;
  const cy = CY - s * H * 0.6 + pointer.y * 10;
  const ao = o.a + t * TAU * o.spin;
  const th = (c.p + (o.dir * t) / c.T) * TAU;
  const pts: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const q = proj(
      cx,
      cy,
      R,
      TILT,
      ao,
      th - o.dir * span * (i / Math.max(1, steps)),
      -pointer.y * 0.1,
      pointer.x * 0.12,
    );
    pts.push([q.x, q.y]);
  }
  return pts;
}
const plen = (pts: Point[]) => {
  let l = 0;
  for (let i = 1; i < pts.length; i++)
    l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return l;
};
/**
 * The tail of the comet on its way back and right after it has joined its ring: always exactly the
 * way it has come, and never longer than the tail of a comet on the rings. So it is the same tail
 * as theirs from the first moment, and once the comet has run a tail's length on its ring it is
 * one of them again.
 */
function drawBackTail(f: Fly, now: number, s: number, dep: number, sc: number) {
  const c = orbits[f.oi]?.comets[f.ci];
  if (!c || !track) return;
  const full = plen(ringArc(f.oi, f.ci, simT, s, 1.15, 46));
  const u0 = now - f.t0;
  const pts: Point[] = [];
  // once on its ring, the part of the tail that still lies on the way in fades out within a second
  let onRing = Infinity;
  let away = 1;
  if (u0 >= f.dur && landed) {
    const run = ((simT - landed.ts) * TAU) / c.T;
    pts.push(
      ...ringArc(
        f.oi,
        f.ci,
        simT,
        s,
        Math.min(run, 1.15),
        Math.max(1, Math.ceil(run / 0.01)),
      ),
    );
    onRing = plen(pts);
    away = 1 - easeIO(clamp((now - landed.t) / 900, 0, 1));
  } else {
    const h = backHead(f, u0, now, s).p;
    pts.push([h[0], h[1] - s * H]);
  }
  let len = plen(pts);
  for (
    let u = Math.min(u0, f.dur), n = 0;
    len < full && u > 0 && n < 500;
    u -= 6, n++
  ) {
    const h = backHead(f, u, now, s).p;
    const q: Point = [h[0], h[1] - s * H];
    const last = pts[pts.length - 1];
    len += Math.hypot(q[0] - last[0], q[1] - last[1]);
    pts.push(q);
  }
  // even steps along the tail, like the tails on the rings
  const total = Math.min(len, full);
  if (total < 0.5) return;
  const N = 46;
  const step = full / N;
  const res: Point[] = [pts[0]];
  const ks: number[] = [0];
  let j = 1;
  let acc = 0;
  for (let i = 1; i <= N && i * step <= total + 1e-6; i++) {
    const want = i * step;
    while (j < pts.length) {
      const a = pts[j - 1];
      const b = pts[j];
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (acc + d >= want) {
        const k = (want - acc) / (d || 1);
        res.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]);
        ks.push(want / full);
        break;
      }
      acc += d;
      j++;
    }
    if (j >= pts.length) break;
  }
  // a still short tail ends exactly where the comet started, so it grows without steps
  if (total < full - 0.5 && total > (res.length - 1) * step + 0.05) {
    let a2 = 0;
    for (let q = 1; q < pts.length; q++) {
      const d = Math.hypot(
        pts[q][0] - pts[q - 1][0],
        pts[q][1] - pts[q - 1][1],
      );
      if (a2 + d >= total) {
        const k = (total - a2) / (d || 1);
        res.push([
          pts[q - 1][0] + (pts[q][0] - pts[q - 1][0]) * k,
          pts[q - 1][1] + (pts[q][1] - pts[q - 1][1]) * k,
        ]);
        ks.push(total / full);
        break;
      }
      a2 += d;
    }
  }
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgb(206,222,255)';
  // a tail that is still growing gets a soft end, so it grows as one smooth line
  const growing = total < full - 0.5;
  for (let i = 1; i < res.length; i++) {
    const k = ks[i];
    const end = growing ? clamp((total - ks[i - 1] * full) / 14, 0, 1) : 1;
    const fade =
      Math.pow(1 - k, 1.8) * (ks[i - 1] * full > onRing ? away : 1) * end;
    ctx.lineCap = 'butt';
    ctx.globalAlpha = fade * 0.85 * dep;
    ctx.lineWidth = (2.6 * (1 - k) + 0.3) * sc;
    ctx.beginPath();
    ctx.moveTo(res[i - 1][0], res[i - 1][1]);
    ctx.lineTo(res[i][0], res[i][1]);
    ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.globalAlpha = fade * 0.08 * dep;
    ctx.lineWidth = (10 * (1 - k) + 1) * sc;
    ctx.beginPath();
    ctx.moveTo(res[i - 1][0], res[i - 1][1]);
    ctx.lineTo(res[i][0], res[i][1]);
    ctx.stroke();
  }
  ctx.lineCap = 'round';
}

function drawFly(now: number, s: number) {
  if (!fly && landed && track) {
    // just back on its ring: the comet itself is drawn there, its tail here until it is complete
    const g = ghost(landed.oi, landed.ci, simT, s);
    const heroA = clamp(1 - s * 2.2, 0, 1) * modeVal * heroVal;
    drawBackTail(
      landed.f,
      now,
      s,
      (0.45 + (0.55 * (g.z + 1)) / 2) * heroA,
      g.sc,
    );
  }
  if (!fly || !track) return;
  const tr = track;
  const off = -s * H;
  let head: Point;
  let tail: Point[] = [];
  let moving: boolean;
  // the tail is as long as the comet is fast, so it shrinks away as the comet slows down
  let gap = 7;
  let blend = 0; // back: how far the comet has already taken on the look of a ring comet
  let ring: { z: number; sc: number } | undefined;
  if (fly.mode === 'back' && fly.back) {
    // up the line with the sky, then one free swing into its own ring; the tail is where the comet
    // was a moment ago, so it is long while the comet is fast and vanishes as it slows
    const u = now - fly.t0;
    moving = u >= 0;
    const h = backHead(fly, u, now, s);
    head = h.p;
    const g = ghost(fly.oi, fly.ci, simT, s);
    if (h.k > 0) {
      ring = g;
      blend = easeIO(clamp(h.k / 0.5 - 1, 0, 1));
    }
    if (moving) {
      const heroA = clamp(1 - s * 2.2, 0, 1) * modeVal * heroVal;
      const depth = (0.45 + (0.55 * (g.z + 1)) / 2) * heroA;
      drawBackTail(fly, now, s, lerp(0.9, depth, blend), lerp(1, g.sc, blend));
    }
  } else if (fly.path) {
    const path = fly.path;
    const pos = flyPos(fly, now);
    if (fly.mode === 'out') arrive('F' + fly.t0, path.total - pos, now);
    moving = now >= fly.t0;
    const freeAt = (d: number): Point => at(path, d);
    head = freeAt(pos);
    gap = clamp((pos - flyPos(fly, now - 32)) * 0.25, 0, 7);
    if (moving && gap > 0.05)
      for (let k = 1; k <= 14; k++)
        tail.push(freeAt(Math.max(0, pos - k * gap)));
  } else {
    const d = curL(now);
    const dir = Math.sign(line.to - line.from) || 1;
    moving =
      now >= line.t0 && now < line.t0 + line.dur && line.to !== line.from;
    head = at(tr, d);
    gap = clamp(Math.abs(d - curL(now - 32)) * 0.25, 0, 7);
    if (moving && gap > 0.05)
      for (let k = 1; k <= 14; k++) tail.push(at(tr, d - dir * k * gap));
  }
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgb(206,222,255)';
  let prev = head;
  tail.forEach((q, i) => {
    const f = 1 - (i + 1) / 15;
    ctx.globalAlpha = 0.75 * f * f;
    ctx.lineWidth = 0.4 + 2.2 * f;
    ctx.beginPath();
    ctx.moveTo(prev[0], prev[1] + off);
    ctx.lineTo(q[0], q[1] + off);
    ctx.stroke();
    prev = q;
  });
  const pulse = restPulse(now);
  let g = (moving ? 40 : 30 + 3 * Math.sin(now / 900)) + 30 * pulse;
  let ga = Math.min(1, (moving ? 0.9 : 0.75) + 0.25 * pulse);
  let core = 1.9;
  let ca = 1;
  if (ring && blend > 0) {
    // on its way into the ring it takes on the size and light of the comets there
    const heroA = clamp(1 - s * 2.2, 0, 1) * modeVal * heroVal;
    const depth = (0.45 + (0.55 * (ring.z + 1)) / 2) * heroA;
    g = lerp(g, 46 * ring.sc * (0.8 + 0.2 * depth), blend);
    ga = lerp(ga, 0.9 * depth, blend);
    core = lerp(core, 1.9 * ring.sc, blend);
    ca = lerp(1, depth, blend);
  }
  ctx.globalAlpha = ga;
  ctx.drawImage(glowComet, head[0] - g / 2, head[1] + off - g / 2, g, g);
  ctx.globalAlpha = ca;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(head[0], head[1] + off, core, 0, TAU);
  ctx.fill();
}

/* ---------- frame ---------- */

function frame(now: number) {
  const dt = Math.min(0.05, (now - lastNow) / 1000);
  lastNow = now;
  DT = dt;
  if (!paused) simT += dt;
  const k = clamp((now - sec.t0) / sec.dur, 0, 1);
  sec.s = sec.from + (sec.to - sec.from) * easeIO(k);
  modeVal += (modeTarget - modeVal) * Math.min(1, DT * 4);
  heroVal += (heroTarget - heroVal) * Math.min(1, DT * 4);
  draw(simT, now);
  const settling =
    k < 1 ||
    Math.abs(modeTarget - modeVal) > 0.002 ||
    Math.abs(heroTarget - heroVal) > 0.002 ||
    now - loadT < 3200 ||
    now < sunAt + SUN_FADE ||
    now < line.t0 + line.dur + 200 ||
    now < docLine.t0 + docLine.dur + 200 ||
    Boolean(fly && fly.mode !== 'rest');
  if ((!paused || settling) && !document.hidden) requestAnimationFrame(frame);
  else running = false;
}

function start() {
  if (!canvas || running || document.hidden) return;
  running = true;
  lastNow = performance.now();
  requestAnimationFrame(frame);
}

function draw(t: number, now: number) {
  pointer.x += (pointer.tx - pointer.x) * 0.04;
  pointer.y += (pointer.ty - pointer.y) * 0.04;
  const s = sec.s;
  const home = modeVal;
  const heroF = clamp(1 - s, 0, 1) * home * heroVal; // 1 on the hero, 0 from the first section on

  // ground: A, B, A, B between the sections
  const i0 = Math.floor(s);
  const fr = s - i0;
  const ga = GROUND[i0 % 2];
  const gb = GROUND[(i0 + 1) % 2];
  const gcol = [0, 1, 2].map((c) => Math.round(lerp(ga[c], gb[c], fr)));
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgb(' + gcol.join(',') + ')';
  ctx.fillRect(0, 0, W, H);
  if (heroF > 0.01) {
    ctx.globalAlpha = heroF * (0.9 + 0.1 * Math.sin(t * 0.05));
    ctx.drawImage(
      nebula,
      -pointer.x * 6,
      -pointer.y * 6 - s * H * 0.5,
      W + 12,
      H + 12,
    );
  }
  ctx.globalCompositeOperation = 'lighter';
  drawStars(t, s, heroF, home);
  const tiltX = -pointer.y * 0.1;
  const tiltY = pointer.x * 0.12;
  if (landed && orbits[landed.oi]?.comets[landed.ci]) {
    // a tail's length on its ring: it is one of the ring comets again
    const c = orbits[landed.oi].comets[landed.ci];
    if (((simT - landed.ts) * TAU) / c.T >= 1.15) landed = null;
  }
  if ((fly?.path || fly?.back) && now >= fly.t0 + fly.dur) {
    if (fly.mode === 'back') {
      landed = { oi: fly.oi, ci: fly.ci, t: now, ts: simT, f: fly };
      fly = null; // it is on its ring now, and drawn there from this very frame
    } else fly = { ...fly, mode: 'rest', path: null };
  }
  if (home > 0.001 && heroVal > 0.001) drawHomeLine(now, s, home * heroVal);
  const heroA = clamp(1 - s * 2.2, 0, 1) * home * heroVal;
  if (heroA > 0.003) drawAtom(t, s, heroA, tiltX, tiltY);
  // the comet in flight lies under the same dark edge as the rings, so it is not brighter than them
  drawFly(now, s);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  if (heroF > 0.01) {
    const v = ctx.createRadialGradient(
      W / 2,
      H / 2,
      Math.min(W, H) * 0.35,
      W / 2,
      H / 2,
      Math.hypot(W, H) * 0.62,
    );
    v.addColorStop(0, 'rgba(4,5,10,0)');
    v.addColorStop(1, 'rgba(4,5,10,' + (0.5 * heroF).toFixed(3) + ')');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
  }
  if (home < 0.999) drawDocLine(now);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

/** Draws the sun once: its disc, its corona, a flare and a loop, as small pictures. The pixels of
 *  disc and corona come from a worker, so the page stays responsive while they are computed; the
 *  sun fades in when they arrive (at once under reduced motion). */
function makeSun() {
  active = sunRegions();
  sunDisc = document.createElement('canvas');
  sunDisc.width = sunDisc.height = SUN_DISC;
  corona = document.createElement('canvas');
  corona.width = corona.height = SUN_CORONA;
  const paint = (p: ReturnType<typeof sunPixels>) => {
    sunDisc
      .getContext('2d')!
      .putImageData(new ImageData(p.disc, SUN_DISC, SUN_DISC), 0, 0);
    corona
      .getContext('2d')!
      .putImageData(new ImageData(p.corona, SUN_CORONA, SUN_CORONA), 0, 0);
    sunAt = performance.now() - (paused ? SUN_FADE : 0);
    start();
  };
  const here = () => setTimeout(() => paint(sunPixels()), 0);
  try {
    const worker = new Worker(new URL('./sun.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (e) => {
      worker.terminate();
      paint(e.data);
    };
    worker.onerror = () => {
      worker.terminate();
      here();
    };
  } catch {
    here();
  }
  // a flare: a soft fan of fine light from one point
  fan = document.createElement('canvas');
  fan.width = fan.height = 128;
  const f = fan.getContext('2d')!;
  f.translate(44, 64);
  f.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 70; i++) {
    const ang = (hash(i * 4.4) - 0.5) * 1.6;
    const len = 30 + hash(i * 6.6) * 52;
    const gr = f.createLinearGradient(
      0,
      0,
      Math.cos(ang) * len,
      Math.sin(ang) * len,
    );
    gr.addColorStop(0, 'rgba(235,242,255,0.22)');
    gr.addColorStop(1, 'rgba(160,190,255,0)');
    f.strokeStyle = gr;
    f.lineWidth = 0.6 + hash(i * 8.8) * 1.2;
    f.beginPath();
    f.moveTo(0, 0);
    f.quadraticCurveTo(
      Math.cos(ang) * len * 0.5 + (hash(i) - 0.5) * 10,
      Math.sin(ang) * len * 0.5 + (hash(i * 2) - 0.5) * 10,
      Math.cos(ang) * len,
      Math.sin(ang) * len,
    );
    f.stroke();
  }
  // a loop of plasma: a few faint, slightly different arcs
  loop = document.createElement('canvas');
  loop.width = loop.height = 128;
  const l = loop.getContext('2d')!;
  l.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 9; i++) {
    const w = 34 + hash(i * 3.1) * 22;
    const hgt = 70 + hash(i * 5.2) * 40;
    const sx = 64 + (hash(i * 7.3) - 0.5) * 10;
    l.strokeStyle = 'rgba(205,222,255,0.2)';
    l.lineWidth = 1 + hash(i * 9.4) * 2;
    l.beginPath();
    l.moveTo(sx - w / 2, 118);
    l.bezierCurveTo(
      sx - w / 2 - 6,
      118 - hgt,
      sx + w / 2 + 6,
      118 - hgt,
      sx + w / 2,
      118,
    );
    l.stroke();
  }
}

/** Creates the sky once per full page load. */
export function initSky(motionPaused: boolean) {
  if (canvas) return;
  canvas = document.querySelector<HTMLCanvasElement>('#sky');
  const context = canvas?.getContext('2d');
  if (!canvas || !context) {
    canvas = null;
    return;
  }
  ctx = context;
  reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  paused = reduce || motionPaused;
  glowStar = sprite(64, [
    [0, 'rgba(255,255,255,1)'],
    [0.12, 'rgba(225,233,255,0.8)'],
    [0.35, 'rgba(160,185,255,0.18)'],
    [1, 'rgba(120,150,255,0)'],
  ]);
  glowComet = sprite(128, [
    [0, 'rgba(255,255,255,1)'],
    [0.08, 'rgba(230,238,255,0.9)'],
    [0.25, 'rgba(150,180,255,0.32)'],
    [1, 'rgba(90,130,255,0)'],
  ]);
  makeSun();
  glowCore = sprite(512, [
    [0, 'rgba(255,255,255,1)'],
    [0.06, 'rgba(232,239,255,0.9)'],
    [0.18, 'rgba(160,188,255,0.32)'],
    [0.45, 'rgba(70,110,230,0.07)'],
    [1, 'rgba(37,82,196,0)'],
  ]);
  addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType === 'touch' || reduce) return;
      pointer.tx = (e.clientX / innerWidth - 0.5) * 2;
      pointer.ty = (e.clientY / innerHeight - 0.5) * 2;
    },
    { passive: true },
  );
  addEventListener(
    'scroll',
    () => {
      lastScroll = performance.now();
      readScroll();
      if (docRest.end === Infinity) docRest.end = lastScroll;
      start();
    },
    { passive: true },
  );
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) start();
  });
  addEventListener('resize', () => {
    build();
    draw(simT, performance.now());
  });
  document.fonts?.ready.then(() => {
    measureAll();
    start();
  });
  loadT = performance.now();
  build();
  canvas.classList.add('on');
}

/**
 * Sets the kind of page and its number of sections. The first call after a full load jumps
 * there; later calls (page switches) fade the atom and the line in or out.
 */
let configured = false;
export function setPage(
  mode: SkyMode,
  _count: number,
  start0 = 0,
  key = location.pathname.replace(/^\/de(?=\/|$)/, '') || '/',
) {
  if (!canvas) return;
  pageKey = key;
  heroTarget = mode === 'hero' ? 1 : 0;
  modeTarget = mode === 'plain' ? 0 : 1;
  sec.from = sec.to = sec.s = index = start0;
  sec.t0 = 0;
  if (!configured) {
    heroVal = heroTarget;
    modeVal = modeTarget;
    configured = true;
  }
  if (mode !== 'hero') fly = null;
  loadT = performance.now() - (reduce ? 4000 : 0);
  measureAll();
  // pictures that load later move the headings: measure again once they are there
  currentView()
    ?.querySelectorAll<HTMLImageElement>('img')
    .forEach((img) => {
      if (!img.complete)
        img.addEventListener('load', remeasure, { once: true });
    });
  // the line draws in again on every page
  const L = restL(index);
  line = { from: 0, to: L, t0: loadT + 900, dur: reduce ? 1 : 2200 };
  docLine = { from: 0, to: -1, t0: 0, dur: 1 };
  docL = 0;
  draw(simT, performance.now());
  start();
}

/** Moves the sky to section `next`: after the old content has left, the sky and the atom move
 *  over 2100 ms, and the line grows on to the next heading. */
export function goTo(next: number) {
  if (!canvas) return;
  const now = performance.now();
  if (homeRest.end === Infinity) homeRest.end = now;
  const L0 = lineL(now);
  const target = restL(next);
  const calm = reduce || paused || !track || heroTarget !== 1;
  const sample = (a: Point, b: Point, c: Point, e: Point) =>
    Array.from({ length: 41 }, (_, i) => cubic(a, b, c, e, i / 40));
  const along = (d0: number, d1: number) => {
    const pts: Point[] = [];
    const step = d1 > d0 ? 8 : -8;
    for (let d = d0; step > 0 ? d < d1 : d > d1; d += step)
      pts.push(at(track!, d));
    pts.push(at(track!, d1));
    return pts;
  };
  if (index === 0 && next > 0 && !calm && !fly && cometNow.length) {
    // leaving the hero: the comet that faces most downward leaves its ring, flies into the line
    // and rides it down to the next heading, all in one movement
    const c = cometNow.reduce((a, b) => (b.vy > a.vy ? b : a));
    const from: Point = [c.x, c.y + sec.s * H];
    const E = at(track!, entry);
    const E2 = at(track!, entry + 6);
    const tl = Math.hypot(E2[0] - E[0], E2[1] - E[1]) || 1;
    const tg: Point = [(E2[0] - E[0]) / tl, (E2[1] - E[1]) / tl];
    const free = sample(
      from,
      [from[0] + c.vx * 110, from[1] + c.vy * 110],
      [E[0] - tg[0] * 90, E[1] - tg[1] * 90],
      E,
    );
    const path = measure([...free, ...along(entry, target).slice(1)]);
    fly = {
      oi: c.oi,
      ci: c.ci,
      mode: 'out',
      path,
      t0: now,
      dur: clamp(path.total * 1.6, 2300, 2800),
      free: measure(free).total,
      lineFrom: 0,
    };
    line = { from: target, to: target, t0: now, dur: 1 };
  } else if (
    next === 0 &&
    fly &&
    !calm &&
    atomNow &&
    orbits[fly.oi]?.comets[fly.ci]
  ) {
    // back to the hero: the comet rides up the line with the sky, leaves it where it once joined
    // it, and swings back into its own ring, meeting its place there at the ring's own speed
    // it sets off at once and reaches the end of the line just as the sky comes to rest
    const t0 = now + 100;
    const Dl = 2550;
    const yA = at(track!, L0)[1];
    const yB = at(track!, entry)[1];
    const proto = {
      ...fly,
      mode: 'back',
      lineFrom: L0,
      back: { Dl, T: 1, yA, yB, vE: [0, 0] },
    } as Fly;
    const E = at(track!, entry);
    const v = Math.max(0.05, (backL(proto, Dl - 10) - backL(proto, Dl)) / 10);
    const E2 = at(track!, entry + 6);
    const tl = Math.hypot(E2[0] - E[0], E2[1] - E[1]) || 1;
    const vE: Point = [(-(E2[0] - E[0]) / tl) * v, (-(E2[1] - E[1]) / tl) * v];
    const o = orbits[fly.oi];
    const comet = o.comets[fly.ci];
    // it goes back to its own place on its ring, where it would be had it never left, so the two
    // comets of a ring stay opposite each other
    const vG = (TAU * R * 0.6) / (comet.T * 1000);
    let T = 900;
    for (let k = 0; k < 3; k++) {
      const g = ghost(fly.oi, fly.ci, simT + (100 + Dl + T) / 1000, 0);
      T = clamp((2 * Math.hypot(g.x - E[0], g.y - E[1])) / (v + vG), 600, 1600);
    }
    fly = {
      oi: fly.oi,
      ci: fly.ci,
      mode: 'back',
      path: null,
      t0,
      dur: Dl + T,
      free: 0,
      lineFrom: L0,
      back: { Dl, T, yA, yB, vE },
    };
    line = { from: 0, to: 0, t0: now, dur: 1 };
  } else {
    if (next === 0) fly = null;
    if (fly && fly.path) fly = { ...fly, mode: 'rest', path: null };
    // the line (and the comet at its end) grows on to the next heading
    line = {
      from: L0,
      to: target,
      t0: now + (reduce ? 0 : 550),
      dur: reduce ? 1 : 2100,
    };
  }
  sec.from = sec.s;
  sec.to = next;
  sec.t0 = now + (reduce ? 0 : 550);
  sec.dur = reduce ? 1 : 2100;
  index = next;
  start();
}

export function setPaused(value: boolean) {
  paused = reduce || value;
  if (!paused) start();
}

/** Layout changed (fonts, pictures, easy read): measure the line again. */
export function remeasure() {
  measureAll();
  start();
}
