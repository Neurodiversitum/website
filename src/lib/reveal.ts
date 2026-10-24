// Inner pages scroll like a document. Their parts build in every time they come into view and
// fade out again when they leave it, with
// the build-up of the design study (rise, sharpen, fade; `[data-build]` in global.css). The page
// head is visible at once. Under reduced motion everything is there from the start.

let observer: IntersectionObserver | null = null;

export function initReveal() {
  observer?.disconnect();
  const items = Array.from(
    document.querySelectorAll<HTMLElement>(
      'main .view:not(.leaving) .doc [data-build]',
    ),
  );
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('in'));
    return;
  }
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        // in on the way into view, out again on the way out: up and down, every time
        entry.target.classList.toggle('in', entry.isIntersecting);
      }
    },
    { rootMargin: '-4% 0px -6% 0px', threshold: 0 },
  );
  items.forEach((el) => observer!.observe(el));
}

// Projects page: the project nearest the middle of the screen glows softly.
let litBound = false;
export function initProminent() {
  const pics = () =>
    Array.from(
      document.querySelectorAll<HTMLElement>(
        'main .view:not(.leaving) .features .col-pic',
      ),
    );
  const update = () => {
    const list = pics();
    let best: HTMLElement | null = null;
    let bd = Infinity;
    for (const pic of list) {
      const r = pic.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) continue;
      const d = Math.abs(r.top + r.height / 2 - innerHeight / 2);
      if (d < bd) {
        bd = d;
        best = pic;
      }
    }
    list.forEach((pic) => pic.classList.toggle('lit', pic === best));
  };
  if (!litBound) {
    litBound = true;
    let queued = false;
    addEventListener(
      'scroll',
      () => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => {
          queued = false;
          update();
        });
      },
      { passive: true },
    );
  }
  update();
}
