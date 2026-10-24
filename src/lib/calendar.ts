// Moves the events calendar (src/components/Calendar.astro) between months. Idempotent: runs on
// load and after every page switch.
import { scanGlow } from './glow';

export function initCalendar() {
  document
    .querySelectorAll<HTMLElement>('[data-cal]:not([data-bound])')
    .forEach((cal) => {
      cal.dataset.bound = '1';
      const locale = cal.dataset.locale || 'en-GB';
      const today = cal.dataset.today || '';
      const days = new Map<string, { title: string; id: string }>(
        (
          JSON.parse(cal.dataset.days || '[]') as Array<{
            day: string;
            title: string;
            id: string;
          }>
        ).map((d) => [d.day, d]),
      );
      let [y, m] = (cal.dataset.month || '2026-01').split('-').map(Number);
      const grid = cal.querySelector<HTMLElement>('[data-cal-grid]')!;
      const title = cal.querySelector<HTMLElement>('[data-cal-title]')!;
      const pad = (n: number) => String(n).padStart(2, '0');
      const render = () => {
        const first = new Date(Date.UTC(y, m - 1, 1));
        title.textContent = new Intl.DateTimeFormat(locale, {
          month: 'long',
          year: 'numeric',
          timeZone: 'UTC',
        }).format(first);
        grid.querySelectorAll('.cal-day').forEach((n) => n.remove());
        const lead = (first.getUTCDay() + 6) % 7;
        const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
        const total = Math.ceil((lead + count) / 7) * 7;
        for (let i = 0; i < total; i++) {
          const d = i - lead + 1;
          const day = d >= 1 && d <= count ? `${y}-${pad(m)}-${pad(d)}` : '';
          const ev = day ? days.get(day) : undefined;
          const el = document.createElement(ev ? 'a' : 'span');
          el.className = 'cal-day';
          if (!day) {
            el.classList.add('empty');
            el.setAttribute('aria-hidden', 'true');
          } else {
            el.textContent = String(d);
            if (day === today) el.classList.add('today');
            if (ev) {
              el.classList.add('has');
              (el as HTMLAnchorElement).href = `#${ev.id}`;
              el.title = ev.title;
            }
          }
          grid.append(el);
        }
        scanGlow();
      };
      cal.querySelectorAll<HTMLButtonElement>('[data-cal-step]').forEach((b) =>
        b.addEventListener('click', () => {
          m += Number(b.dataset.calStep);
          if (m < 1) {
            m = 12;
            y--;
          }
          if (m > 12) {
            m = 1;
            y++;
          }
          render();
        }),
      );
    });
}
