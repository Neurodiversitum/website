// Page switches without a visible reload, as in the design study. A click on an internal link
// fetches the next page, loads any page script it needs, and swaps the view inside <main>: the
// old view fades, slides 7 % to one side, shrinks to 98.5 % and blurs (520 ms); the new view comes
// in from the other side and settles sharp (760 ms, 120 ms later). The direction follows the order
// of the navigation (`PAGE_ORDER`), also for the back and forward buttons. The header and the sky
// stay in place.
//
// Astro's own router is not supported together with the content security policy, which is why
// the site carries this small one. Forms, downloads, external links, modifier clicks and links
// marked `data-reload` keep the normal navigation. Redirects (the member area sends signed-out
// visitors to the sign-in page) and error pages switch like any other page. The language switch
// switches too: it swaps the texts of the header to the other language and crossfades the view,
// so the new language shows at once. After every swap the document dispatches `ndt:page`, which
// the page scripts listen to. Only a failed request (offline) falls back to a full load.

import { stripLocale } from './i18n';

const PAGE_ORDER: Array<[RegExp, number]> = [
  [/^\/$/, 0],
  [/^\/about/, 1],
  [/^\/projects/, 2],
  [/^\/events/, 3],
  [/^\/ideas/, 4],
  [/^\/newsletter/, 5],
  [/^\/team/, 6],
  [/^\/join/, 7],
  [/^\/members/, 8],
  [/^\/(imprint|privacy|cookies)/, 9],
];

const order = (pathname: string) => {
  const path = pathname.replace(/^\/de(?=\/|$)/, '') || '/';
  return PAGE_ORDER.find(([pattern]) => pattern.test(path))?.[1] ?? 10;
};

interface Fetched {
  html: string;
  /** The address the page came from, after redirects. */
  url: string;
}
const cache = new Map<string, Promise<Fetched>>();

/** Member pages depend on the sign-in and change with every action, so they are never kept. */
const isPrivate = (url: string) =>
  stripLocale(new URL(url, location.href).pathname).startsWith('/members');

const fetchPage = (url: string) => {
  let pending = cache.get(url);
  if (!pending) {
    pending = fetch(url, { headers: { Accept: 'text/html' } }).then(
      async (response) => {
        // Error pages (404) carry a view of their own and switch like every other page.
        if (!response.headers.get('content-type')?.includes('text/html'))
          throw new Error(`cannot swap ${url}`);
        return { html: await response.text(), url: response.url };
      },
    );
    if (isPrivate(url)) return pending;
    cache.set(url, pending);
    pending.catch(() => cache.delete(url));
    // A cached page goes stale after a minute.
    setTimeout(() => cache.delete(url), 60_000);
  }
  return pending;
};

/** Loads page scripts of the next document that this document does not have yet. */
const loadScripts = (next: Document) =>
  Promise.all(
    Array.from(
      next.querySelectorAll<HTMLScriptElement>('script[type="module"][src]'),
    )
      .filter(
        (script) =>
          !document.querySelector(
            `script[src="${script.getAttribute('src')}"]`,
          ),
      )
      .map(
        (script) =>
          new Promise<void>((resolve) => {
            const clone = document.createElement('script');
            clone.type = 'module';
            clone.src = script.src;
            clone.addEventListener('load', () => resolve());
            clone.addEventListener('error', () => resolve());
            document.head.append(clone);
          }),
      ),
  );

const EASE = 'cubic-bezier(0.22, 0.8, 0.2, 1)';

/** Head data of the next document: title, language, description, canonical link. */
const swapHead = (next: Document) => {
  document.title = next.title;
  document.documentElement.lang = next.documentElement.lang;
  for (const name of ['description']) {
    const meta = document.querySelector(`meta[name="${name}"]`);
    const value = next
      .querySelector(`meta[name="${name}"]`)
      ?.getAttribute('content');
    if (meta && value) meta.setAttribute('content', value);
  }
  const canonical = document.querySelector('link[rel="canonical"]');
  const nextCanonical = next
    .querySelector('link[rel="canonical"]')
    ?.getAttribute('href');
  if (canonical && nextCanonical) canonical.setAttribute('href', nextCanonical);
};

/** Attributes of the header that differ between the languages. */
const LANGUAGE_ATTRIBUTES = ['href', 'aria-label', 'title', 'alt', 'hreflang'];

/** The header stays in place on a page switch. When the language changes, its texts, labels and
 *  link targets change to those of the next document; the elements, their state and their
 *  listeners stay. Returns false when the two headers do not match element for element. */
const swapHeaderLanguage = (next: Document) => {
  const from = document.querySelector('.site-header');
  const to = next.querySelector('.site-header');
  if (!from || !to) return false;
  // the pointer glow adds its own layers to the pills; they are not part of the page
  const own = (root: Element) =>
    [root, ...root.querySelectorAll('*')].filter(
      (el) => !el.closest('.glow-clip'),
    );
  const a = own(from);
  const b = own(to);
  if (a.length !== b.length || a.some((el, i) => el.tagName !== b[i].tagName))
    return false;
  a.forEach((el, i) => {
    const source = b[i];
    for (const name of LANGUAGE_ATTRIBUTES) {
      const value = source.getAttribute(name);
      if (value === null) el.removeAttribute(name);
      else if (el.getAttribute(name) !== value) el.setAttribute(name, value);
    }
    if (el.closest('.langs')) {
      const current = source.getAttribute('aria-current');
      if (current === null) el.removeAttribute('aria-current');
      else el.setAttribute('aria-current', current);
    }
    const texts = Array.from(el.childNodes).filter(
      (n) => n.nodeType === Node.TEXT_NODE,
    );
    const nextTexts = Array.from(source.childNodes).filter(
      (n) => n.nodeType === Node.TEXT_NODE,
    );
    texts.forEach((n, j) => {
      const value = nextTexts[j]?.nodeValue;
      if (value != null && n.nodeValue !== value) n.nodeValue = value;
    });
  });
  return true;
};

/** Direction of a switch: 1 forwards, -1 backwards, 0 for the same page in the other language.
 *  The order of the navigation decides; inside one part of the site a deeper page lies ahead,
 *  and the back and forward buttons decide with their own step (`step`). */
const direction = (fromPath: string, toPath: string, step = 0) => {
  const from = stripLocale(fromPath);
  const to = stripLocale(toPath);
  if (from === to) return 0;
  const delta = order(toPath) - order(fromPath);
  if (delta) return Math.sign(delta);
  if (step) return Math.sign(step);
  return to.split('/').length >= from.split('/').length ? 1 : -1;
};

/** The position of the current entry in the session history, kept in its state. */
let index = 0;
/** The path the visible view belongs to. */
let shown = location.pathname + location.search;

interface Options {
  push?: boolean;
  scroll?: number;
  /** Steps through the history (back is negative), for the direction. */
  step?: number;
}

let navigating = false;
let queued: { url: string; options: Options } | null = null;

export async function navigate(url: string, options: Options = {}) {
  // A second click or a back step during a switch runs right after it, so the address and the
  // page never disagree.
  if (navigating) {
    queued = { url, options };
    return;
  }
  const { push = true, scroll = 0, step = 0 } = options;
  navigating = true;
  try {
    const fetched = await fetchPage(url);
    const next = new DOMParser().parseFromString(fetched.html, 'text/html');
    const main = document.querySelector('main');
    const from = main?.querySelector<HTMLElement>(':scope > .view');
    const to = next.querySelector<HTMLElement>('main > .view');
    if (!main || !from || !to) throw new Error('no view');
    // After a redirect the address bar shows where the visitor landed.
    const target = new URL(url, location.href);
    const landed = new URL(fetched.url || target.href, location.href);
    if (landed.pathname !== target.pathname || landed.search !== target.search)
      target.href = landed.href;
    const href = target.pathname + target.search + target.hash;
    const languageChange =
      next.documentElement.lang !== document.documentElement.lang;
    if (languageChange && !swapHeaderLanguage(next))
      throw new Error('header differs');
    await loadScripts(next);
    const dir = direction(shown, target.pathname, step);
    const reduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    const y = window.scrollY;
    swapHead(next);
    const incoming = document.importNode(to, true);
    // The other language shows at once: same page, new words, nothing slides.
    if (reduced || !dir) {
      from.replaceWith(incoming);
    } else {
      from.classList.add('leaving');
      from.style.top = `${-y}px`;
      main.append(incoming);
    }
    if (push) {
      index += 1;
      history.pushState({ scroll: 0, index }, '', href);
    } else if (href !== location.pathname + location.search + location.hash) {
      history.replaceState({ scroll, index }, '', href);
    }
    shown = target.pathname + target.search;
    const anchor = target.hash
      ? document.getElementById(decodeURIComponent(target.hash.slice(1)))
      : null;
    // the other language keeps the place on the page
    const top = !dir && push ? y : scroll;
    window.scrollTo({
      top: anchor && !top ? anchor.getBoundingClientRect().top + scrollY : top,
      behavior: 'instant' as ScrollBehavior,
    });
    document.dispatchEvent(new CustomEvent('ndt:page'));
    if (!reduced && dir) {
      const shift = dir * 7;
      const out = from.animate(
        [
          {
            opacity: 1,
            transform: 'translateX(0) scale(1)',
            filter: 'blur(0px)',
          },
          {
            opacity: 0,
            transform: `translateX(${-shift}%) scale(0.985)`,
            filter: 'blur(12px)',
          },
        ],
        { duration: 520, easing: EASE, fill: 'forwards' },
      );
      incoming.animate(
        [
          {
            opacity: 0,
            transform: `translateX(${shift}%) scale(0.985)`,
            filter: 'blur(12px)',
          },
          {
            opacity: 1,
            transform: 'translateX(0) scale(1)',
            filter: 'blur(0px)',
          },
        ],
        { duration: 760, delay: 120, easing: EASE, fill: 'backwards' },
      );
      await out.finished.catch(() => {});
      out.cancel();
      from.remove();
    }
    const heading = incoming.querySelector<HTMLElement>('h1');
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
  } catch {
    // Only when the page cannot be fetched at all (offline) or has no view to swap.
    location.href = url;
  } finally {
    navigating = false;
    const waiting = queued;
    queued = null;
    if (waiting) navigate(waiting.url, waiting.options);
  }
}

const isSoftLink = (link: HTMLAnchorElement, event: MouseEvent) => {
  if (event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
    return false;
  if (link.target && link.target !== '_self') return false;
  if (link.hasAttribute('download') || link.hasAttribute('data-reload'))
    return false;
  const url = new URL(link.href, location.href);
  if (url.origin !== location.origin) return false;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/media/'))
    return false;
  if (url.pathname === location.pathname && url.search === location.search)
    return false;
  return true;
};

export function initRouter() {
  if (!('DOMParser' in window) || !('pushState' in history)) return;
  history.scrollRestoration = 'manual';
  index = Number(history.state?.index) || 0;
  history.replaceState({ scroll: window.scrollY, index }, '');
  document.addEventListener('click', (event) => {
    const link = (event.target as Element | null)?.closest<HTMLAnchorElement>(
      'a[href]',
    );
    if (!link) return;
    const url = new URL(link.href, location.href);
    // A link to the page that is open (the logo on the start page) goes back to its top instead
    // of loading the page again.
    if (
      url.origin === location.origin &&
      url.pathname === location.pathname &&
      url.search === location.search &&
      !url.hash &&
      !link.hasAttribute('download') &&
      (!link.target || link.target === '_self') &&
      !event.defaultPrevented &&
      event.button === 0 &&
      !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
    ) {
      event.preventDefault();
      const calm = window.matchMedia(
        '(prefers-reduced-motion: reduce)',
      ).matches;
      window.scrollTo({
        top: 0,
        behavior: (calm ? 'instant' : 'smooth') as ScrollBehavior,
      });
      document.dispatchEvent(new CustomEvent('ndt:top'));
      return;
    }
    if (!isSoftLink(link, event)) return;
    if (url.hash && url.pathname === location.pathname) return;
    event.preventDefault();
    navigate(url.pathname + url.search + url.hash);
  });
  // Pages are fetched when the pointer rests on a link, so the switch itself has nothing to wait for.
  document.addEventListener(
    'pointerover',
    (event) => {
      const link = (event.target as Element | null)?.closest<HTMLAnchorElement>(
        'a[href]',
      );
      if (!link || link.hasAttribute('data-reload')) return;
      const url = new URL(link.href, location.href);
      if (url.origin !== location.origin || url.pathname === location.pathname)
        return;
      if (url.pathname.startsWith('/api/') || isPrivate(url.href)) return;
      fetchPage(url.pathname + url.search).catch(() => {});
    },
    { passive: true },
  );
  // The scroll position is remembered for the back button, at most once per 200 ms.
  let remember = 0;
  window.addEventListener(
    'scroll',
    () => {
      if (remember) return;
      remember = window.setTimeout(() => {
        remember = 0;
        history.replaceState({ scroll: window.scrollY, index }, '');
      }, 200);
    },
    { passive: true },
  );
  window.addEventListener('popstate', (event) => {
    const state = event.state as { scroll?: number; index?: number } | null;
    // A link to an anchor of the same page made this entry; the browser has scrolled already.
    if (state?.index == null) {
      index += 1;
      history.replaceState({ scroll: window.scrollY, index }, '');
      return;
    }
    const scroll = state?.scroll || 0;
    const to = Number(state?.index) || 0;
    const step = to - index;
    index = to;
    // A step between anchors of the same page only scrolls.
    if (location.pathname + location.search === shown) {
      const anchor = location.hash
        ? document.getElementById(decodeURIComponent(location.hash.slice(1)))
        : null;
      if (anchor && !scroll) anchor.scrollIntoView();
      else
        window.scrollTo({ top: scroll, behavior: 'instant' as ScrollBehavior });
      return;
    }
    navigate(location.pathname + location.search + location.hash, {
      push: false,
      scroll,
      step,
    });
  });
}
