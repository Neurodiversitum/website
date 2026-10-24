// The sign-up form, one question at a time. Progressive enhancement of the normal form: without
// JavaScript every question shows at once and the server checks them as before. With it, each
// `[data-step]` is one screen of the form: a count and a bar show how far the visitor is, Back
// and Next (or Enter) move between the questions with the site's build-up motion, and the last
// question carries the submit button. Each step is checked with the same rules as the server
// (src/lib/members/validate.ts) before the next one comes; the server still checks everything.
// After a post with errors the form opens on the first question with an error.
import {
  cleanDate,
  cleanEmail,
  cleanLinkedin,
  isUniversityEmail,
} from '@/lib/members/validate';

const OUT_MS = 380;

function errorFor(step: HTMLElement): string | null {
  const field = (name: string) =>
    step.querySelector<HTMLInputElement | HTMLSelectElement>(
      `[name="${name}"]`,
    );
  switch (step.dataset.step) {
    case 'name': {
      const value = (field('name')?.value ?? '').trim().replace(/\s+/g, ' ');
      return value.length < 2 || value.length > 120
        ? (step.dataset.error ?? '')
        : null;
    }
    case 'email': {
      const email = cleanEmail(field('email')?.value ?? '');
      if (!email) return step.dataset.error ?? '';
      return isUniversityEmail(email)
        ? (step.dataset.errorUniversity ?? '')
        : null;
    }
    case 'university':
      return field('university')?.value ? null : (step.dataset.error ?? '');
    case 'linkedin':
      return cleanLinkedin(field('linkedin')?.value ?? '') === 'invalid'
        ? (step.dataset.error ?? '')
        : null;
    case 'dateOfBirth':
      return cleanDate(field('dateOfBirth')?.value ?? '') === 'invalid'
        ? (step.dataset.error ?? '')
        : null;
    case 'consent':
      return (field('privacyConsent') as HTMLInputElement | null)?.checked
        ? null
        : (step.dataset.error ?? '');
    default:
      return null;
  }
}

function showError(step: HTMLElement, message: string | null) {
  step.querySelector('.field-error[data-client]')?.remove();
  const control = step.querySelector<HTMLElement>('input, select');
  step.classList.toggle('invalid', Boolean(message));
  if (!message) {
    control?.removeAttribute('aria-invalid');
    return;
  }
  // a server message for the same field is replaced by the current one
  step.querySelectorAll('.field-error').forEach((el) => el.remove());
  const p = document.createElement('p');
  p.className = 'field-error';
  p.dataset.client = '';
  p.id = `${step.dataset.step}-client-error`;
  p.setAttribute('role', 'alert');
  p.textContent = message;
  step.append(p);
  if (control) {
    control.setAttribute('aria-invalid', 'true');
    const described = (control.getAttribute('aria-describedby') ?? '')
      .split(' ')
      .filter((id) => id && !id.endsWith('-error'));
    control.setAttribute('aria-describedby', [p.id, ...described].join(' '));
  }
}

export function initStepper() {
  document
    .querySelectorAll<HTMLFormElement>('form[data-stepper]')
    .forEach((form) => {
      if (form.dataset.stepperBound) return;
      form.dataset.stepperBound = '1';
      const steps = Array.from(
        form.querySelectorAll<HTMLElement>('[data-step]'),
      );
      const viewport = form.querySelector<HTMLElement>('[data-steps]');
      const count = form.querySelector<HTMLElement>('[data-step-count]');
      const bar = form.querySelector<HTMLElement>('[data-step-bar]');
      const back = form.querySelector<HTMLButtonElement>('[data-step-back]');
      const next = form.querySelector<HTMLButtonElement>('[data-step-next]');
      const submit = form.querySelector<HTMLButtonElement>('[type="submit"]');
      if (!steps.length || !viewport || !count || !bar || !back || !next)
        return;
      const reduce = () =>
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      // the note on private fields goes with the questions it is about
      const note = form.querySelector<HTMLElement>('[data-step-note]');
      if (note) {
        form.querySelectorAll<HTMLElement>('[data-note]').forEach((step) => {
          const copy = note.cloneNode(true) as HTMLElement;
          copy.removeAttribute('data-step-note');
          step.append(copy);
        });
        note.hidden = true;
      }
      form.classList.add('stepped');
      const firstError = steps.findIndex(
        (step) =>
          step.classList.contains('invalid') ||
          step.querySelector('[aria-invalid="true"]'),
      );
      let index = Math.max(0, firstError);
      let busy = false;

      const render = () => {
        steps.forEach((step, i) => {
          step.hidden = i !== index;
          step.classList.remove('step-out', 'step-in');
        });
        const total = steps.length;
        count.textContent = (count.dataset.pattern ?? '{n} / {total}')
          .replace('{n}', String(index + 1))
          .replace('{total}', String(total));
        bar.style.transform = `scaleX(${(index + 1) / total})`;
        bar.parentElement?.setAttribute('aria-valuenow', String(index + 1));
        bar.parentElement?.setAttribute('aria-valuemax', String(total));
        back.hidden = index === 0;
        const last = index === total - 1;
        next.hidden = last;
        if (submit) submit.hidden = !last;
      };

      const focusStep = () => {
        const target = steps[index].querySelector<HTMLElement>(
          'input:not([type="hidden"]), select, textarea',
        );
        target?.focus({ preventScroll: true });
      };

      const go = (to: number) => {
        if (busy || to === index || to < 0 || to >= steps.length) return;
        const from = steps[index];
        const instant = reduce();
        busy = true;
        // the box keeps its height while the questions change, then eases to the new one
        viewport.style.height = `${viewport.offsetHeight}px`;
        from.classList.add('step-out');
        window.setTimeout(
          () => {
            index = to;
            render();
            const step = steps[index];
            step.classList.add('step-in');
            viewport.style.height = `${step.offsetHeight}px`;
            requestAnimationFrame(() =>
              requestAnimationFrame(() => step.classList.remove('step-in')),
            );
            focusStep();
            window.setTimeout(
              () => {
                viewport.style.height = '';
                busy = false;
              },
              instant ? 0 : 700,
            );
          },
          instant ? 0 : OUT_MS,
        );
      };

      const advance = () => {
        const step = steps[index];
        const message = errorFor(step);
        showError(step, message);
        if (message) {
          step.querySelector<HTMLElement>('input, select')?.focus();
          return;
        }
        go(index + 1);
      };

      next.addEventListener('click', advance);
      back.addEventListener('click', () => go(index - 1));
      form.addEventListener('keydown', (e) => {
        const target = e.target as HTMLElement;
        if (e.key !== 'Enter' || e.isComposing) return;
        if (target.matches('button, a, textarea')) return;
        if (index < steps.length - 1) {
          e.preventDefault();
          advance();
        }
      });
      // a fixed answer clears its error while typing (not on blur, so the buttons never move
      // under a click)
      form.addEventListener('input', (e) => {
        const step = (e.target as HTMLElement).closest<HTMLElement>(
          '[data-step]',
        );
        if (step?.classList.contains('invalid') && !errorFor(step))
          showError(step, null);
      });
      form.addEventListener('submit', (e) => {
        const wrong = steps.findIndex((step) => errorFor(step));
        if (wrong === -1) return;
        e.preventDefault();
        if (wrong !== index) go(wrong);
        window.setTimeout(
          () => showError(steps[wrong], errorFor(steps[wrong])),
          reduce() ? 0 : OUT_MS + 20,
        );
      });
      render();
      if (firstError >= 0) focusStep();
    });
}
