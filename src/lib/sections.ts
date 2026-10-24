// One section per screen, as in the design study. Wheel, swipe, the arrow and page keys and the
// dots move one section at a time; the old section fades out, the new one builds up step by
// step (`[data-build]`, CSS in global.css). A section whose content is taller than the screen
// scrolls inside itself first. Sections off screen stay in the page for screen readers and the
// Tab key: when focus moves into one, it comes on screen. Without JavaScript the sections stack.
import { goTo, setPage, type SkyMode } from './sky';
import { syncEdges } from './chrome';

const reduce = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

interface Pager {
  view: HTMLElement;
  secs: HTMLElement[];
  index: number;
  lockUntil: number;
  dots: HTMLButtonElement[];
}
let pager: Pager | null = null;
let bound = false;

/** True when the section scrolls inside and has room left in the direction `dir`. */
function canScroll(el: HTMLElement, dir: number) {
  if (el.scrollHeight <= el.clientHeight + 2) return false;
  return dir > 0
    ? el.scrollTop + el.clientHeight < el.scrollHeight - 2
    : el.scrollTop > 2;
}

/** Scrolling sections are focusable. The legal links sit at the bottom of the last section, or after its content when it scrolls. */
function measure() {
  if (!pager) return;
  for (const sec of pager.secs) {
    // A section that scrolls inside can take keyboard focus, so the keys can scroll it.
    if (sec.scrollHeight > sec.clientHeight + 2) sec.tabIndex = 0;
    else sec.removeAttribute('tabindex');
    const foot = sec.querySelector<HTMLElement>('.site-foot');
    if (foot) {
      // At the bottom like in the study, unless the content would run into it.
      sec.classList.remove('scrolls');
      const inner = sec.querySelector<HTMLElement>('.sec-inner');
      const clash =
        sec.scrollHeight > sec.clientHeight + 2 ||
        (inner && inner.offsetTop + inner.offsetHeight + 16 > foot.offsetTop);
      sec.classList.toggle('scrolls', Boolean(clash));
    }
  }
}

/** The Join pill in the header shows only where no "Join the club" button is on screen. It
 *  leaves at once, but comes back only when the new section content builds in (`delay`). */
let joinTimer = 0;
export function updateJoinPill(delay = 0) {
  const pill = document.querySelector<HTMLElement>('[data-nav-join]');
  if (!pill) return;
  const view = document.querySelector<HTMLElement>('main .view:not(.leaving)');
  let away = view?.dataset.joinPill === 'hide';
  // in the member area Join makes no sense: the pill stays away
  if (location.pathname.replace(/^\/de(?=\/|$)/, '').startsWith('/members'))
    away = true;
  if (!away && pager && pager.view === view)
    away = Boolean(pager.secs[pager.index]?.querySelector('[data-join]'));
  const set = (hidden: boolean) => {
    pill.classList.toggle('away', hidden);
    pill.tabIndex = hidden ? -1 : 0;
    pill.setAttribute('aria-hidden', String(hidden));
  };
  clearTimeout(joinTimer);
  if (away || !delay || reduce()) set(away);
  else joinTimer = window.setTimeout(() => set(false), delay);
}

function setDots(joinDelay = 0) {
  if (!pager) return;
  pager.dots.forEach((b, i) =>
    b.setAttribute('aria-current', String(i === pager!.index)),
  );
  updateJoinPill(joinDelay);
}

export function goSection(next: number, force = false) {
  if (!pager) return;
  const p = pager;
  next = clamp(next, 0, p.secs.length - 1);
  if (next === p.index || (!force && performance.now() < p.lockUntil)) return;
  const instant = reduce();
  const from = p.secs[p.index];
  const to = p.secs[next];
  // Slow and in order, as in the study: the old content leaves (1 s), then sky, atom and line
  // move (from 550 ms, 2.1 s), then the new content builds in (from 1.8 s).
  p.lockUntil = performance.now() + (instant ? 200 : 2900);
  from.classList.add('out');
  from.classList.remove('built');
  to.classList.add('on');
  to.classList.remove('out', 'built');
  to.scrollTop = next > p.index ? 0 : to.scrollTop;
  clearTimeout(buildTimer);
  if (instant) to.classList.add('built');
  else
    buildTimer = window.setTimeout(() => {
      if (p.secs[p.index] === to) to.classList.add('built');
    }, 1800);
  syncEdges(to);
  window.setTimeout(
    () => {
      if (p.secs[p.index] !== from) from.classList.remove('on', 'out');
    },
    instant ? 0 : 1250,
  );
  goTo(next);
  p.index = next;
  document.dispatchEvent(new CustomEvent('ndt:section'));
  setDots(1900);
}
let buildTimer = 0;

function bindInputs() {
  if (bound) return;
  bound = true;
  // a link to the page that is open leads back to its first section (router.ts)
  document.addEventListener('ndt:top', () => {
    if (pager && pager.index !== 0) goSection(0, true);
  });
  let acc = 0;
  let accTimer = 0;
  let innerUntil = 0;
  addEventListener(
    'wheel',
    (e) => {
      if (!pager || e.ctrlKey) return;
      const cur = pager.secs[pager.index];
      const dir = Math.sign(e.deltaY);
      if (dir && canScroll(cur, dir)) {
        // the section scrolls inside first; a short pause at its edge before the next section
        innerUntil = performance.now() + 380;
        acc = 0;
        return;
      }
      e.preventDefault();
      if (
        performance.now() < pager.lockUntil ||
        performance.now() < innerUntil
      ) {
        acc = 0;
        return;
      }
      acc += e.deltaY;
      clearTimeout(accTimer);
      accTimer = window.setTimeout(() => (acc = 0), 180);
      if (Math.abs(acc) > 48) {
        goSection(pager.index + Math.sign(acc));
        acc = 0;
      }
    },
    { passive: false },
  );
  let touchY: number | null = null;
  let touchEdge = { up: true, down: true };
  addEventListener(
    'touchstart',
    (e) => {
      if (!pager) return;
      const cur = pager.secs[pager.index];
      touchY = e.touches[0].clientY;
      touchEdge = { up: !canScroll(cur, -1), down: !canScroll(cur, 1) };
    },
    { passive: true },
  );
  addEventListener(
    'touchmove',
    (e) => {
      if (!pager || touchY === null) return;
      const cur = pager.secs[pager.index];
      const dir = Math.sign(touchY - e.touches[0].clientY);
      if (dir && canScroll(cur, dir)) return;
      if ((e.target as Element).closest('.nav, .settings')) return;
      if (e.cancelable) e.preventDefault();
    },
    { passive: false },
  );
  addEventListener('touchend', (e) => {
    if (!pager || touchY === null) return;
    const dy = touchY - e.changedTouches[0].clientY;
    touchY = null;
    if (Math.abs(dy) <= 44) return;
    const dir = Math.sign(dy);
    if (dir > 0 ? touchEdge.down : touchEdge.up) goSection(pager.index + dir);
  });
  addEventListener('keydown', (e) => {
    if (!pager || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey)
      return;
    const target = e.target as HTMLElement;
    if (
      target.closest(
        'input, textarea, select, iframe, [contenteditable], .settings, .nav',
      )
    )
      return;
    const down =
      ['ArrowDown', 'PageDown'].includes(e.key) ||
      (e.key === ' ' && !e.shiftKey && !target.closest('button, a, summary'));
    const up =
      ['ArrowUp', 'PageUp'].includes(e.key) ||
      (e.key === ' ' && e.shiftKey && !target.closest('button, a, summary'));
    if (!down && !up && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const cur = pager.secs[pager.index];
    if (e.key === 'Home') return goSection(0, true);
    if (e.key === 'End') return goSection(pager.secs.length - 1, true);
    const dir = down ? 1 : -1;
    if (canScroll(cur, dir)) {
      const step = e.key.startsWith('Page') || e.key === ' ' ? 0.85 : 0.2;
      cur.scrollBy({
        top: dir * cur.clientHeight * step,
        behavior: reduce() ? 'auto' : 'smooth',
      });
      return;
    }
    goSection(pager.index + dir);
  });
  // Focus that moves into a section off screen (Tab, a skip link, a screen reader) brings it in.
  document.addEventListener('focusin', (e) => {
    if (!pager) return;
    const sec = (e.target as Element).closest<HTMLElement>('.sec');
    const i = sec ? pager.secs.indexOf(sec) : -1;
    if (i >= 0 && i !== pager.index) goSection(i, true);
  });
  addEventListener('resize', () => measure());
}

let loaded = false;

/** The pictures of the sections off screen load once the page has loaded, so they are ready
 *  when their section comes on screen but never compete with the first screen. */
function loadPictures() {
  pager?.view
    .querySelectorAll<HTMLImageElement>('.sections img[loading="lazy"]')
    .forEach((img) => (img.loading = 'eager'));
}

/** Runs once after the page has loaded and the sky exists (BaseLayout): the sky takes over the
 *  current page and section, the other pictures load. */
export function pageLoaded() {
  loaded = true;
  const view = document.querySelector<HTMLElement>('main .view:not(.leaving)');
  const mode = (view?.dataset.sky as SkyMode | undefined) ?? 'plain';
  if (pager) setPage(mode, pager.secs.length, pager.index, view?.dataset.page);
  else setPage('plain', 1, 0, view?.dataset.page);
  loadPictures();
}

/** Prepares the current page: sections, dots and the sky. Runs on load and after every page switch. */
export function initSections() {
  bindInputs();
  const view = document.querySelector<HTMLElement>('main .view:not(.leaving)');
  const root = document.documentElement;
  const mode = (view?.dataset.sky as SkyMode | undefined) ?? 'plain';
  const container = view?.querySelector<HTMLElement>('.sections');
  root.classList.toggle('paged', Boolean(container));
  if (!view || !container) {
    pager = null;
    setPage('plain', 1, 0, view?.dataset.page);
    updateJoinPill();
    return;
  }
  const secs = Array.from(
    container.querySelectorAll<HTMLElement>(':scope > .sec'),
  );
  const start = clamp(Number(container.dataset.start || 0), 0, secs.length - 1);
  secs.forEach((sec, i) => {
    sec.classList.toggle('on', i === start);
    sec.classList.toggle('built', i === start);
    sec.classList.remove('out');
  });
  // dots, labelled with the section names
  const nav = view.querySelector<HTMLElement>('.dots');
  const dots: HTMLButtonElement[] = [];
  if (nav) {
    nav.replaceChildren();
    secs.forEach((sec, i) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('aria-label', sec.dataset.label || String(i + 1));
      button.addEventListener('click', () => goSection(i, true));
      nav.append(button);
      dots.push(button);
    });
    nav.hidden = secs.length < 2;
  }
  pager = { view, secs, index: start, lockUntil: 0, dots };
  if (loaded) loadPictures();
  setPage(mode, secs.length, start, view.dataset.page);
  setDots();
  measure();
  document.fonts?.ready.then(measure);
}
