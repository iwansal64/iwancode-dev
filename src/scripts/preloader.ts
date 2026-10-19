/**
 * preloader.ts — Stage 00. Counter 000→100, status lines, cobalt wipe,
 * then clip-path exit. Resolves slightly BEFORE the exit finishes so the
 * hero intro overlaps the handoff.
 */
import gsap from 'gsap';
import { content } from '../data/content';

// tunables
const DURATION = 2.6; // s, counter run (first visit)
const DURATION_REDUCED = 0.6;
const SEEN_KEY = 'iwan:seen';

export function runPreloader(reduced: boolean): Promise<void> {
  const el = document.querySelector<HTMLElement>('[data-preload]');
  if (!el) return Promise.resolve();

  let seen = false;
  try {
    seen = sessionStorage.getItem(SEEN_KEY) === '1';
    sessionStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* storage blocked: just play it */
  }

  // Repeat visit in the same session: skip straight in.
  if (seen) {
    el.remove();
    return document.fonts.ready.then(() => undefined);
  }

  const count = el.querySelector<HTMLElement>('[data-preload-count]')!;
  const status = el.querySelector<HTMLElement>('[data-preload-status]')!;
  const state = el.querySelector<HTMLElement>('[data-preload-state]')!;
  const bar = el.querySelector<HTMLElement>('[data-preload-bar]')!;
  const wipe = el.querySelector<HTMLElement>('[data-preload-wipe]')!;
  const msgs = content.preloader.messages;

  return new Promise((resolve) => {
    const n = { v: 0 };
    const dur = reduced ? DURATION_REDUCED : DURATION;

    const counter = gsap.to(n, {
      v: 100,
      duration: dur,
      ease: 'power2.inOut',
      onUpdate: () => {
        const v = Math.round(n.v);
        count.textContent = String(v).padStart(3, '0');
        bar.style.width = `${v}%`;
        status.textContent = msgs[Math.min(msgs.length - 1, Math.floor((v / 100) * msgs.length))];
      },
    });

    // Counter AND fonts must both be done before the hero animates.
    Promise.all([counter.then(), document.fonts.ready]).then(() => {
      count.textContent = '100';
      status.textContent = msgs[msgs.length - 1];
      state.textContent = 'LOCKED';

      if (reduced) {
        gsap.to(el, { autoAlpha: 0, duration: 0.3, onComplete: () => el.remove() });
        resolve();
        return;
      }

      gsap
        .timeline({ onComplete: () => el.remove() })
        .to(count, { scale: 1.02, duration: 0.12, yoyo: true, repeat: 1, ease: 'power1.inOut' })
        .to(wipe, { scaleX: 1, duration: 0.45, ease: 'expo.inOut' }, 0.1)
        .to(wipe, { height: '100%', duration: 0.5, ease: 'expo.inOut' }, 0.5)
        .to(el, { clipPath: 'inset(0 0 100% 0)', duration: 0.85, ease: 'expo.inOut' }, 0.85)
        // hand off ~0.45s before the exit fully clears
        .add(() => resolve(), 1.2);
    });
  });
}
