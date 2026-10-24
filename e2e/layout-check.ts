// Runs inside the page: finds horizontal overflow, text that is cut off, and text that overlaps
// other text. Returns a list of problems, each with a short description of the element.
export interface LayoutProblem {
  kind: 'overflow' | 'offscreen' | 'clipped' | 'overlap';
  detail: string;
}

export function checkLayout(): LayoutProblem[] {
  const problems: LayoutProblem[] = [];
  const vw = window.innerWidth;
  const doc = document.documentElement;
  if (doc.scrollWidth > vw + 1 || document.body.scrollWidth > vw + 1) {
    problems.push({
      kind: 'overflow',
      detail: `page is ${Math.max(doc.scrollWidth, document.body.scrollWidth)}px wide in a ${vw}px viewport`,
    });
  }

  const describe = (el: Element) => {
    const tag = el.tagName.toLowerCase();
    const cls =
      el.className && typeof el.className === 'string'
        ? '.' + el.className.trim().split(/\s+/).join('.')
        : '';
    const text = (el.textContent || '')
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 40);
    return `${tag}${cls} "${text}"`;
  };

  const isVisible = (el: Element) => {
    // Sections off screen (one section per screen) are checked when they are on screen.
    if (el.closest('.sections > .sec:not(.on)')) return false;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    if (Number(style.opacity) < 0.05) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 1 && rect.height > 1;
  };

  const inScroller = (el: Element) => {
    for (let node = el.parentElement; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (
        /(auto|scroll)/.test(style.overflowX) &&
        node.scrollWidth > node.clientWidth + 1
      )
        return true;
    }
    return false;
  };

  // An element inside an ancestor that clips its overflow and sits inside the viewport cannot
  // leave the viewport itself (decorative layers that are larger than their frame, for example).
  const clippedInView = (el: Element) => {
    for (let node = el.parentElement; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (
        /(hidden|clip)/.test(style.overflowX) &&
        /(hidden|clip)/.test(style.overflowY)
      ) {
        const box = node.getBoundingClientRect();
        return box.left >= -1 && box.right <= vw + 1;
      }
    }
    return false;
  };

  const layerOf = (el: Element) =>
    el.closest('[data-layer]')?.getAttribute('data-layer') ?? 'page';

  const all = Array.from(
    document.body.querySelectorAll<HTMLElement>('*'),
  ).filter((el) => {
    if (el.closest('script, style, template, svg, noscript, [hidden]'))
      return false;
    if (el.closest('.sr-only, .skip-link')) return false;
    return isVisible(el);
  });

  // Off-screen content: anything whose box leaves the viewport to the left or right.
  // Fixed elements without text (the pointer glow) never add to the scrollable width.
  const fixedDecoration = (el: Element) =>
    getComputedStyle(el).position === 'fixed' && !(el.textContent || '').trim();
  for (const el of all) {
    if (inScroller(el) || clippedInView(el) || fixedDecoration(el)) continue;
    const rect = el.getBoundingClientRect();
    if (rect.right > vw + 1 || rect.left < -1) {
      problems.push({
        kind: 'offscreen',
        detail: `${describe(el)} spans ${Math.round(rect.left)}..${Math.round(rect.right)}px`,
      });
    }
  }

  // Text leaves: elements with their own text, measured per line box.
  const leaves = all.filter((el) =>
    Array.from(el.childNodes).some(
      (node) =>
        node.nodeType === Node.TEXT_NODE && (node.textContent || '').trim(),
    ),
  );

  // Cut-off text: a leaf whose content is larger than its own box or the box of a clipping ancestor.
  for (const el of leaves) {
    const style = getComputedStyle(el);
    const clipsItself =
      style.overflow !== 'visible' ||
      style.overflowX !== 'visible' ||
      style.overflowY !== 'visible';
    if (
      clipsItself &&
      !inScroller(el) &&
      (el.scrollWidth > el.clientWidth + 2 ||
        el.scrollHeight > el.clientHeight + 2)
    ) {
      problems.push({
        kind: 'clipped',
        detail: `${describe(el)} needs ${el.scrollWidth}x${el.scrollHeight}, has ${el.clientWidth}x${el.clientHeight}`,
      });
      continue;
    }
    if (inScroller(el)) continue;
    const rect = el.getBoundingClientRect();
    for (
      let node = el.parentElement;
      node && node !== document.body;
      node = node.parentElement
    ) {
      const s = getComputedStyle(node);
      if (
        s.overflow === 'visible' &&
        s.overflowX === 'visible' &&
        s.overflowY === 'visible'
      )
        continue;
      const box = node.getBoundingClientRect();
      // A section taller than the screen scrolls inside: text below its edge is not cut off.
      const scrollsY =
        /(auto|scroll)/.test(s.overflowY) &&
        node.scrollHeight > node.clientHeight + 1;
      if (
        rect.right > box.right + 2 ||
        rect.left < box.left - 2 ||
        (!scrollsY && (rect.bottom > box.bottom + 2 || rect.top < box.top - 2))
      ) {
        problems.push({
          kind: 'clipped',
          detail: `${describe(el)} is cut off by ${describe(node)}`,
        });
      }
      break;
    }
  }

  const blockOf = (el: Element): Element | null => {
    let node: Element | null = el;
    while (node && getComputedStyle(node).display === 'inline')
      node = node.parentElement;
    return node;
  };

  // Overlapping text: line boxes of two unrelated leaves that intersect.
  const boxes = leaves.map((el) => ({
    el,
    layer: layerOf(el),
    rects: Array.from(el.getClientRects()).filter(
      (r) => r.width > 1 && r.height > 1,
    ),
  }));
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      if (a.layer !== b.layer) continue;
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      // Two inline runs of one block (a heading and its subline) share line boxes by design.
      if (blockOf(a.el) === blockOf(b.el)) continue;
      let hit = false;
      for (const ra of a.rects) {
        for (const rb of b.rects) {
          const x = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
          const y = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
          if (x > 3 && y > 3) hit = true;
        }
      }
      if (hit) {
        problems.push({
          kind: 'overlap',
          detail: `${describe(a.el)} overlaps ${describe(b.el)}`,
        });
      }
    }
  }
  return problems;
}
