/**
 * cursor.ts — cobalt triangle that points where the pointer is heading.
 * Fine pointers only. Exposes a tiny API so the engine can set
 * hold / dive states without the cursor knowing about the engine.
 */
import gsap from 'gsap';

// tunables
const POS_LAG = 0.12; // s
const ROT_LAG = 0.38; // s (heavier than position = compass needle)
const STRETCH_MAX = 0.55; // extra scaleX at full speed

export type CursorMode = 'free' | 'hover' | 'portal' | 'hold' | 'dive';

export type CursorApi = {
  setMode: (m: CursorMode, label?: string) => void;
  setHold: (p: number) => void;
};

const noop: CursorApi = { setMode: () => {}, setHold: () => {} };

export function initCursor(opts: {reduced: boolean}): CursorApi {
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return noop;

  const el = document.querySelector<HTMLElement>('[data-cursor]');
  if (!el) return noop;
  const root = el;
  const tri = root.querySelector<SVGElement>('[data-cursor-tri]')!;
  const ring = root.querySelector<SVGElement>('[data-cursor-ring]')!;
  const prog = root.querySelector<SVGCircleElement>('[data-cursor-prog]')!;
  const label = root.querySelector<HTMLElement>('[data-cursor-label]')!;
  const portal = document.querySelector<HTMLElement>('[data-portal]');

  document.body.classList.add('is-custom-cursor');
  root.dataset.mode = 'free';

  const posLag = opts.reduced ? 0.04 : POS_LAG;
  const rotLag = opts.reduced ? 0.1 : ROT_LAG;
  const xTo = gsap.quickTo(root, 'x', { duration: posLag, ease: 'power3.out' });
  const yTo = gsap.quickTo(root, 'y', { duration: posLag, ease: 'power3.out' });
  const rTo = gsap.quickTo(tri, 'rotation', { duration: 0, ease: 'power3.out' });
  const sxTo = gsap.quickTo(tri, 'scaleX', { duration: 0.25, ease: 'power2.out' });
  const sTo = gsap.quickTo(tri, 'scaleY', { duration: 0.25, ease: 'power2.out' });

  let mode: CursorMode = 'free';
  let px = innerWidth / 2;
  let py = innerHeight / 2;
  let lastX = px;
  let lastY = py;
  let heading = -90; // unwrapped degrees, starts pointing up
  let speed = 0;
  let shown = false;

  /** Rotate along the shortest arc: unwrap target relative to current. */
  const aim = (deg: number) => {
    let d = deg - heading;
    d = ((((d + 180) % 360) + 360) % 360) - 180;
    heading += d;
    rTo(deg);
  };

  const baseScale = () => (mode === 'hover' || mode === 'portal' ? 1.4 : 1);

  addEventListener(
    'mousemove',
    (e) => {
      px = e.clientX;
      py = e.clientY;
      xTo(px);
      yTo(py);
      if (!shown) {
        shown = true;
        gsap.set(root, { x: px, y: py });
        gsap.to(root, { opacity: 1, duration: 0.3, delay: 1 });
      }


      const dx = px - lastX;
      const dy = py - lastY;

      lastX = px;
      lastY = py;
      speed += (Math.hypot(dx, dy) - speed) * 0.25;

      // Prevent tiny differences leading to zero in which making the speed goes to negative
      const is_leading_to_zero = (Math.abs(dx) * Math.abs(dy) < 0.1);

      if (mode === 'hold' || mode === 'dive') {
        aim(-90); // point forward
      } else if (!is_leading_to_zero) {
        aim((Math.atan2(dy, dx) * 180) / Math.PI);
      }

      const s = baseScale();
      const stretch = opts.reduced ? 0 : Math.min(1, speed / 30) * STRETCH_MAX;
      const dive = mode === 'dive' && !opts.reduced ? 0.6 : 0;
      sxTo(s * (1 + stretch + dive));
      sTo(s * (1 - stretch * 0.25));
    },
    { passive: true }
  );
  document.documentElement.addEventListener('pointerleave', () => {
    shown = false;
    gsap.to(root, { opacity: 0, duration: 1 });
  });

  // Per-frame: derive velocity once per tick (no layout reads except portal).
  gsap.ticker.add(() => {
    if (mode === 'hold' && !opts.reduced) {
      // vibrate while charging
      gsap.set(tri, { x: (Math.random() - 0.5) * 2.4, y: (Math.random() - 0.5) * 2.4 });
    }
  });

  // Hover states via delegation: [data-cursor-hover="LABEL"]
  document.addEventListener('pointerover', (e) => {
    if (mode === 'hold' || mode === 'dive') return;
    const t = (e.target as Element).closest<HTMLElement>('[data-cursor-hover], a, button');
    if (!t) return setMode('free');
    const isPortal = t.matches('[data-enter]');
    setMode(isPortal ? 'portal' : 'hover', t.dataset.cursorHover ?? '');
  });

  const setLabel = (text: string) => {
    label.textContent = text;
    gsap.to(label, { opacity: text ? 1 : 0, x: text ? 0 : -4, duration: 0.2 });
  };

  function setMode(m: CursorMode, text = '') {
    if (m === mode && label.textContent === text) return;
    mode = m;
    root.dataset.mode = m; // CSS inverts colours over the cobalt ENTER button
    gsap.to(ring, { opacity: m === 'portal' || m === 'hold' ? 1 : 0, duration: 0.25 });
    if (m !== 'hold') {
      gsap.set(tri, { x: 0, y: 0 });
      prog.style.strokeDashoffset = '1';
    }
    setLabel(m === 'hold' ? 'HOLD' : m === 'dive' || m === 'free' ? '' : text);
  }

  return {
    setMode,
    setHold: (p) => {
      prog.style.strokeDashoffset = String(1 - p);
    },
  };
}
