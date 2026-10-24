// The parts of the page that stay while pages switch: the header with its gliding navigation
// pill, the settings panel (pause, easy read, external media, language) and the one clock of
// the light on the primary buttons. `initChrome` runs once per full load, `updateChrome` after
// every page switch.
import { dict } from '@/data/copy';
import {
  LOCALES,
  asLanguage,
  localePath,
  pick,
  resolveCopy,
  stripLocale,
} from '@/lib/i18n';
import { setPaused } from './sky';

export interface Prefs {
  font: 'default' | 'easy';
  embeds: 'ask' | 'allow';
  motion: 'run' | 'paused';
}
const defaults: Prefs = { font: 'default', embeds: 'ask', motion: 'run' };

export function readPrefs(): Prefs {
  try {
    return {
      ...defaults,
      ...JSON.parse(localStorage.getItem('ndt_prefs') || '{}'),
    };
  } catch {
    return defaults;
  }
}
let prefs = readPrefs();

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
const PERIOD = 7000;

/** One clock for every button light: each new button starts at the same phase. In every round
 *  each button starts its light at a new point of its edge. */
const shuffleEdges = (root: ParentNode = document) =>
  root
    .querySelectorAll<HTMLElement>('.btn.primary')
    .forEach((b) =>
      b.style.setProperty(
        '--edge-off',
        `${Math.round(Math.random() * 360)}deg`,
      ),
    );
export function syncEdges(root: ParentNode = document) {
  const offset = -((performance.now() % PERIOD) / 1000);
  root.querySelectorAll<HTMLElement>('.btn.primary').forEach((b) => {
    b.style.setProperty('--edge-sync', `${offset}s`);
    if (!b.style.getPropertyValue('--edge-off'))
      b.style.setProperty(
        '--edge-off',
        `${Math.round(Math.random() * 360)}deg`,
      );
  });
}
// a new start point while the light is out (20 % into the round)
window.setTimeout(
  () => {
    shuffleEdges();
    window.setInterval(shuffleEdges, PERIOD);
  },
  (0.2 * PERIOD - (performance.now() % PERIOD) + PERIOD) % PERIOD,
);

/** Easy-read mode swaps every text that has a plain-language variant. */
function applyText() {
  const root = document.documentElement;
  if (prefs.font !== 'easy' && root.dataset.easy !== '1') return;
  const lang = asLanguage(root.lang);
  root.dataset.easy = prefs.font === 'easy' ? '1' : '0';
  document.querySelectorAll<HTMLElement>('[data-copy]').forEach((node) => {
    const field = resolveCopy(dict, node.dataset.copy || '');
    if (field) node.textContent = pick(field, lang, prefs.font === 'easy');
  });
}

function applyMotion() {
  const paused = prefs.motion === 'paused' || reduce.matches;
  document.documentElement.classList.toggle('motion-paused', paused);
  setPaused(paused);
  const mark = document.querySelector<SVGSVGElement>('[data-mark]');
  if (mark?.pauseAnimations) {
    if (paused) mark.pauseAnimations();
    else mark.unpauseAnimations();
  }
}

function save() {
  try {
    localStorage.setItem('ndt_prefs', JSON.stringify(prefs));
  } catch {}
  window.dispatchEvent(new CustomEvent('ndt:preferences'));
}

/* Glass navigation pill: sits on the active page, glides to the item under the pointer. */
let movePill: (target: HTMLElement | null | undefined) => void = () => {};
const activeLink = () =>
  document.querySelector<HTMLElement>('.nav .nav-link[aria-current="page"]');

export function initChrome() {
  const settingsBtn = document.querySelector<HTMLButtonElement>(
    '[data-settings-open]',
  );
  const settings = document.querySelector<HTMLElement>('[data-settings-panel]');
  const isOpen = () => Boolean(settings?.classList.contains('open'));
  const setOpen = (open: boolean) => {
    settings?.classList.toggle('open', open);
    settingsBtn?.setAttribute('aria-expanded', String(open));
  };
  settingsBtn?.addEventListener('click', () => setOpen(!isOpen()));
  // A press anywhere outside the panel and its button closes it (mouse, pen and touch alike).
  document.addEventListener(
    'pointerdown',
    (e) => {
      const target = e.target as Node;
      if (
        isOpen() &&
        !settings?.contains(target) &&
        !settingsBtn?.contains(target)
      )
        setOpen(false);
    },
    true,
  );
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) {
      setOpen(false);
      settingsBtn?.focus();
    }
  });
  // Focus that leaves the panel with Tab closes it too.
  settings?.parentElement?.addEventListener('focusout', (e) => {
    const next = e.relatedTarget as Node | null;
    if (next && !settings.parentElement?.contains(next)) setOpen(false);
  });
  document.addEventListener('ndt:page', () => setOpen(false));
  // scrolling closes the panel, with its own soft fade
  const closeOnScroll = (e: Event) => {
    if (isOpen() && !settings?.contains(e.target as Node)) setOpen(false);
  };
  addEventListener('wheel', closeOnScroll, { passive: true });
  addEventListener('touchmove', closeOnScroll, { passive: true });
  addEventListener('scroll', closeOnScroll, { passive: true });
  // the header turns darker as soon as content can pass behind it
  const under = () =>
    document.documentElement.classList.toggle(
      'under',
      scrollY > 8 ||
        Boolean(document.querySelector('.sections .sec.on:not(.hero-sec)')),
    );
  addEventListener('scroll', under, { passive: true });
  document.addEventListener('ndt:page', under);
  document.addEventListener('ndt:section', under);
  under();

  // Focus rings only for keyboard navigation with Tab, never after a click.
  const root = document.documentElement;
  addEventListener(
    'pointerdown',
    () => root.classList.add('pointer-mode'),
    true,
  );
  addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Tab') root.classList.remove('pointer-mode');
    },
    true,
  );
  const switches = {
    motion: ['paused', 'run'],
    font: ['easy', 'default'],
    embeds: ['allow', 'ask'],
  } as const;
  document
    .querySelectorAll<HTMLInputElement>('[data-pref]')
    .forEach((input) => {
      const key = input.dataset.pref as keyof typeof switches;
      if (!(key in switches)) return;
      input.checked = prefs[key] === switches[key][0];
      if (key === 'motion' && reduce.matches) {
        input.checked = true;
        input.disabled = true;
      }
      input.addEventListener('change', () => {
        prefs = {
          ...prefs,
          [key]: input.checked ? switches[key][0] : switches[key][1],
        };
        save();
        if (key === 'motion') applyMotion();
        if (key === 'font') applyText();
      });
    });

  const nav = document.querySelector<HTMLElement>('.nav');
  const pill = nav?.querySelector<HTMLElement>('.nav-pill');
  if (nav && pill) {
    movePill = (target) => {
      if (!target) {
        pill.style.opacity = '0';
        return;
      }
      pill.style.opacity = '1';
      pill.style.width = `${target.offsetWidth}px`;
      pill.style.transform = `translateX(${target.offsetLeft}px)`;
    };
    nav.querySelectorAll<HTMLElement>('.nav-link').forEach((link) => {
      link.addEventListener('pointerenter', () => movePill(link));
      link.addEventListener('focus', () => movePill(link));
    });
    nav.addEventListener('pointerleave', () => movePill(activeLink()));
    // the Join button has its own hover, so the pill leaves the last link for the current page
    nav
      .querySelector<HTMLElement>('[data-nav-join]')
      ?.addEventListener('pointerenter', () => movePill(activeLink()));
    nav.addEventListener('focusout', () => movePill(activeLink()));
    addEventListener('resize', () => movePill(activeLink()));
    document.fonts?.ready.then(() => movePill(activeLink()));
  }
  applyMotion();
  reduce.addEventListener('change', applyMotion);
}

/** After every page: the active navigation item, the easy-read texts, the button lights. */
export function updateChrome(active?: string) {
  if (active !== undefined) {
    document.querySelectorAll<HTMLElement>('.nav .nav-link').forEach((link) => {
      if (link.dataset.nav === active)
        link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }
  // in the member area the person icon shows where you are
  const inMembers = stripLocale(location.pathname).startsWith('/members');
  document.querySelectorAll<HTMLElement>('[data-members-link]').forEach((a) => {
    if (inMembers) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  const current = activeLink();
  movePill(current);
  // on narrow screens the navigation scrolls sideways: keep the active page in view
  const nav = current?.closest<HTMLElement>('.nav');
  if (nav && current && nav.scrollWidth > nav.clientWidth) {
    const left =
      current.offsetLeft - (nav.clientWidth - current.offsetWidth) / 2;
    nav.scrollTo({ left, behavior: 'instant' as ScrollBehavior });
  }
  // the language switch points at the current page in the other language
  const path = stripLocale(location.pathname);
  document
    .querySelectorAll<HTMLAnchorElement>('.langs a[hreflang]')
    .forEach((a) => {
      const code = LOCALES.find((l) => l === a.hreflang);
      if (code) a.href = localePath(code, path) + location.search;
    });
  applyText();
  syncEdges();
}
