// Pointer glow of the design study: an organic, wobbly light that follows the pointer. Small and
// quiet on the plain background (one fixed element), clear inside boxes, cards, pictures and
// buttons (one element per box, drawn inside it), continuous across their edges. It stretches
// with the speed and direction of the pointer. Fine pointers only; hidden under reduced motion.
// The loop runs only while the light still moves towards the pointer.

const HOSTS =
  '.site-header .glass:not(.settings), .tile .pic, .col-pic, .card, .btn, .event, .person .portrait, .person-chip, .video-frame, .cal-day:not(.empty), .form.panel';
/** Pictures: they light up only while the pointer is on them. */
const PICS = '.tile .pic, .col-pic, .person .portrait, .video-frame';

interface Host extends HTMLElement {
  _glow?: HTMLElement;
}

let hosts: Host[] = [];
let bg: HTMLElement | null = null;
const gp = { x: -999, y: -999, tx: -999, ty: -999, vx: 0, vy: 0, on: false };
let running = false;
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

/** Gives every box on the current page its own inner light. Runs again after a page switch. */
export function scanGlow() {
  hosts = Array.from(document.querySelectorAll<Host>(HOSTS));
  for (const h of hosts) {
    if (h._glow) continue;
    h.classList.add('glow-host');
    const g = document.createElement('i');
    g.className = 'glow';
    g.setAttribute('aria-hidden', 'true');
    g.append(document.createElement('i'));
    // The glow sits in its own clip with the box's rounded corners. A clip path keeps the corners
    // round while the glow moves and while the page builds up; a plain rounded overflow clip
    // shows square corners for a moment in Chrome. Buttons keep their edge light outside it.
    const clip = document.createElement('i');
    clip.className = 'glow-clip';
    clip.setAttribute('aria-hidden', 'true');
    clip.append(g);
    h.append(clip);
    h._glow = g;
  }
  rounds();
}

/** Gives every glow clip, and every picture, a clip path with the rounded corners of its box. */
function rounds() {
  for (const h of hosts) {
    const r = getComputedStyle(h).borderRadius || '0px';
    const clip = h._glow?.parentElement;
    if (clip) clip.style.clipPath = `inset(0 round ${r})`;
    // pictures: the zoomed image stays inside the round corners while the page scrolls. The clip
    // sits on an inner layer, so the blue shine below the picture on hover is not cut off.
    if (!h.matches(PICS)) continue;
    if (h.classList.contains('video-frame')) {
      h.style.clipPath = `inset(0 round ${r})`;
      continue;
    }
    let inner = h.querySelector<HTMLElement>(':scope > .pic-in');
    if (!inner) {
      inner = document.createElement('span');
      inner.className = 'pic-in';
      // the glow goes in too, so labels on the picture stay above it
      for (const c of Array.from(h.childNodes)) inner.append(c);
      h.prepend(inner);
    }
    inner.style.clipPath = `inset(0 round ${r})`;
  }
}

function frame() {
  if (!gp.on || reduce.matches || !bg) {
    running = false;
    return;
  }
  const nx = gp.x + (gp.tx - gp.x) * 0.16;
  const ny = gp.y + (gp.ty - gp.y) * 0.16;
  gp.vx = gp.vx * 0.8 + (nx - gp.x) * 0.2;
  gp.vy = gp.vy * 0.8 + (ny - gp.y) * 0.2;
  gp.x = nx;
  gp.y = ny;
  const speed = Math.min(1, Math.hypot(gp.vx, gp.vy) / 18);
  const ang = (Math.atan2(gp.vy, gp.vx) * 180) / Math.PI;
  const shape = `rotate(${ang.toFixed(1)}deg) scale(${(1 + speed * 0.35).toFixed(3)},${(1 - speed * 0.18).toFixed(3)})`;
  bg.style.transform = `translate(${gp.x - 120}px,${gp.y - 120}px) ${shape}`;
  for (const h of hosts) {
    const glow = h._glow;
    if (!glow || !h.isConnected || !h.offsetParent) continue;
    const r = h.getBoundingClientRect();
    const small = h.classList.contains('btn') || h.classList.contains('glass');
    const size = small ? 160 : h.classList.contains('cal-day') ? 120 : 300;
    const half = size / 2;
    // pictures light up only while the pointer is on them; boxes and buttons also just before
    const reach = h.matches(PICS) || h.classList.contains('cal-day') ? 0 : half;
    const near =
      gp.x > r.left - reach &&
      gp.x < r.right + reach &&
      gp.y > r.top - reach &&
      gp.y < r.bottom + reach;
    glow.style.opacity = near ? '1' : '0';
    // a hidden glow keeps its shape still, so it costs nothing per frame
    glow.classList.toggle('on', near);
    if (near)
      glow.style.transform = `translate(${gp.x - r.left - half}px,${gp.y - r.top - half}px) ${shape}`;
  }
  const settled =
    Math.abs(gp.tx - gp.x) < 0.3 &&
    Math.abs(gp.ty - gp.y) < 0.3 &&
    Math.hypot(gp.vx, gp.vy) < 0.05;
  if (settled) running = false;
  else requestAnimationFrame(frame);
}

function kick() {
  if (running) return;
  running = true;
  requestAnimationFrame(frame);
}

export function initGlow() {
  bg = document.querySelector<HTMLElement>('.glow-bg');
  if (!bg) return;
  scanGlow();
  addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType === 'touch' || !bg) return;
      gp.tx = e.clientX;
      gp.ty = e.clientY;
      if (!gp.on) {
        gp.x = gp.tx;
        gp.y = gp.ty;
        gp.on = true;
        bg.style.opacity = '1';
      }
      kick();
    },
    { passive: true },
  );
  // boxes move under a resting pointer while sections switch and pages scroll
  addEventListener('scroll', () => gp.on && kick(), { passive: true });
  // the radius of some boxes changes with the width of the window
  addEventListener('resize', rounds, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => {
    gp.on = false;
    if (bg) bg.style.opacity = '0';
    hosts.forEach((h) => {
      if (!h._glow) return;
      h._glow.style.opacity = '0';
      h._glow.classList.remove('on');
    });
  });
}
