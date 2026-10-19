/**
 * engine.ts — the interaction engine.
 *
 * Single state: p ∈ [0,1]. Every frame we push p into the dive timeline,
 * then derive HUD/aria/hash from it. Input only ever moves a target goal;
 * a lerp (or a GSAP tween for dispatched moves) closes the gap, which is
 * what makes wheel motion feel weighty and reversals feel seamless.
 *
 * Adding Stage 03 later = add component + one entry in content.stages +
 * one segment in dive.ts. Nothing here assumes two stages except
 * `stageCount()`, which reads the registry.
 */
import gsap from 'gsap';
import { content } from '../data/content';
import { createDive } from './dive';
import { runPreloader } from './preloader';
import { initCursor } from './cursor';

/* ---- tunables (all in one place) --------------------------------- */
const TUNE = {
  wheelDistance: 1350, // px of wheel delta for a full dive
  touchDistance: 620, // px of swipe for a full dive
  smooth: 0.12, // lerp factor per frame (higher = twitchier)
  keyboard: 1.1, // s per keyboard stage jump
  autoDive: 2.2, // s for the ENTER click auto-play
  holdTime: 2.4, // s hold to complete the dive (eased by holdEase, so it builds up)
  settleAfter: 700, // ms idle before easing to nearest stage
  settleTime: 0.75, // s settle duration
  commit: 0.5, // p above which a released hold completes
  flick: 160, // ms of projected inertia for a touch flick
  tapMax: 250, // ms: pointer press shorter than this counts as a click, not a hold
  reducedSwap: 0.35, // s crossfade between stages with prefers-reduced-motion
};

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const q1 = <T extends Element = HTMLElement>(s: string) => document.querySelector<T>(s);

// Hover canvases are not needed for first paint, and only run on fine,
// non-reduced pointers: load them in an idle slice, only where they can run.
const whenIdle = () =>
  new Promise<void>((r) => ('requestIdleCallback' in window ? requestIdleCallback(() => r(), { timeout: 1500 }) : setTimeout(r, 300)));

export async function boot() {
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;

  const dive = createDive({ reduced });
  const cursor = initCursor(reduced);
  if (!reduced && fine) {
    whenIdle().then(() => {
      import('./dots').then((m) => m.initDots());
      import('./contours').then((m) => m.initContours());
    });
  }

  /* ---- DOM handles ---------------------------------------------- */
  const view = q1('[data-view]')!;
  const hero = q1('[data-stage="hero"]')!;
  const about = q1('[data-stage="about"]')!;
  const aboutScroll = q1('[data-about-scroll]')!;
  const enterBtn = q1<HTMLButtonElement>('[data-enter]')!;
  const enterRing = q1<SVGCircleElement>('[data-hold-ring]');
  const portal = q1('[data-portal]')!;
  const backBtn = q1<HTMLButtonElement>('[data-back]')!;
  const live = q1('[data-live]')!;
  const hudStageNumber = q1('[data-hud-stage-number]')!;
  const hudStageLabel = q1('[data-hud-stage-label]')!;
  const hudDepth = q1('[data-hud-depth]')!;
  const hudBar = q1('[data-hud-bar]')!;
  const hudHint = q1('.hud__hint')!;

  /* ---- state ----------------------------------------------------- */
  const state = { p: 0, goal: 0 };
  let tween: gsap.core.Tween | null = null;
  let idle = 0;
  let holding = false;
  let holdFrom = 0;
  let holdAt = 0;
  let suppressClick = false; // a real hold also emits click; swallow that one
  let lastStage = -1;

  // HUD stage swaps on the flood card's first frame (unit 46), not at the
  // midpoint, so the corner never contradicts the "STAGE 02" card.
  const stageIndex = (p: number) => (p >= 0.46 ? 1 : 0);

  /* ---- render: p → everything ----------------------------------- */
  let lastHint = -1;
  const render = () => {
    const p = state.p;
    dive.apply(p);

    const si = stageIndex(p);
    if (si !== lastStage) {
      lastStage = si;
      const s = content.stages[si];
      // Two text nodes instead of an innerHTML rebuild: no parser, no
      // re-creating the <b>, no layout invalidation of the whole corner.
      hudStageNumber.textContent = `Stage 0${si + 1} / 0${content.stages.length}`;
      hudStageLabel.textContent = ` — ${s.label.charAt(0).toUpperCase() + s.label.slice(1)}`;
      document.body.dataset.at = s.id;
      live.textContent = `Stage 0${si + 1} — ${s.label}`;
      hudHint.textContent = si === 0 ? content.hud.hint : content.hud.hintBack;
    }

    const depth = Math.round(p * 1240);
    const depthText = String(depth).padStart(3, '0');
    if (hudDepth.textContent !== depthText) {
      hudDepth.textContent = depthText;
      hudBar.style.width = `${(p * 100).toFixed(1)}%`;
    }

    // HUD/cursor invert once the cobalt flood owns the frame.
    const tone = p > 0.5 || (p > 0.36 && p < 0.62) ? 'ink' : 'cream';
    if (document.body.dataset.tone !== tone) document.body.dataset.tone = tone;
    document.body.classList.toggle('is-flood', p > 0.34 && p < 0.7);
    view.style.setProperty('--p', String(p));
    // Control hint is only shown near a resting stage, hidden mid-dive.
    // Quantised to 2dp so the style write is skipped on most frames.
    const hint = Math.round(Math.max(0, 1 - Math.min(p, 1 - p) * 6) * 100) / 100;
    if (hint !== lastHint) {
      lastHint = hint;
      hudHint.style.opacity = String(hint);
    }
  };

  /* ---- dispatched movement -------------------------------------- */
  const killTween = () => {
    if (tween) {
      tween.kill();
      tween = null;
      state.goal = state.p;
    }
  };

  const commitStage = () => {
    const hash = stageIndex(state.p) === 1 ? '#about' : '';
    history.replaceState(null, '', hash || location.pathname + location.search);
  };

  const moveTo = (goal: number, dur = TUNE.keyboard, ease = 'power3.inOut') => {
    // Cancel any pending settle: otherwise a stale idle timer fires after a
    // keyboard/click move and yanks the dive back to where it was heading.
    clearTimeout(idle);
    killTween();
    state.goal = clamp01(goal);
    if (Math.abs(state.goal - state.p) < 0.001) {
      state.p = state.goal;
      render();
      commitStage();
      return;
    }
    tween = gsap.to(state, {
      p: state.goal,
      duration: dur,
      ease,
      onUpdate: render,
      onComplete: () => {
        tween = null;
        state.p = state.goal;
        render();
        commitStage();
      },
    });
  };

  const scheduleSettle = () => {
    clearTimeout(idle);
    idle = window.setTimeout(() => {
      if (holding) return;
      moveTo(state.goal > TUNE.commit ? 1 : 0, TUNE.settleTime);
    }, TUNE.settleAfter);
  };

  /* ---- input: wheel --------------------------------------------- */
  // While About's content overflows, the wheel scrolls it before it dives.
  const aboutScrollable = () => aboutScroll.scrollHeight - aboutScroll.clientHeight > 2;
  const atTop = () => aboutScroll.scrollTop <= 0;
  const atBottom = () =>
    aboutScroll.scrollTop + aboutScroll.clientHeight >= aboutScroll.scrollHeight - 2;

  addEventListener(
    'wheel',
    (e) => {
      if (!ready || e.ctrlKey) return; // ctrl+wheel = browser zoom, leave it alone
      const dir = Math.sign(e.deltaY);
      if (state.p > 0.9 && aboutScrollable() && ((dir > 0 && !atBottom()) || (dir < 0 && !atTop()))) {
        return; // let the About copy scroll natively
      }
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1;
      nudge((e.deltaY * unit) / TUNE.wheelDistance);
    },
    { passive: false }
  );

  const nudge = (dp: number) => {
    killTween();
    state.goal = clamp01(state.goal + dp);
    state.p = clamp01(state.p + dp * 0.55); // immediate bite, lerp settles the rest
    render();
    scheduleSettle();
  };

  /* ---- input: touch swipe ---------------------------------------
     Native touch events (not pointer events): pointer streams get
     cancelled the moment the browser decides to pan. preventDefault is
     conditional so the About copy can still scroll natively. */
  let swipeY = 0;
  let swipeActive = false;
  let vel = 0;
  let lastMoveAt = 0;

  const onTouchStart = (e: TouchEvent) => {
    if (!ready || e.touches.length !== 1) return;
    if ((e.target as Element).closest('button, a')) return;
    swipeActive = true;
    swipeY = e.touches[0].clientY;
    vel = 0;
    clearTimeout(idle);
    killTween();
  };

  const onTouchMove = (e: TouchEvent) => {
    if (!swipeActive) return;
    const y = e.touches[0].clientY;
    const dy = swipeY - y;
    swipeY = y;
    // On About: native-scroll the copy until it hits an edge.
    if (state.p > 0.9 && aboutScrollable() && ((dy > 0 && !atBottom()) || (dy < 0 && !atTop()))) return;
    e.preventDefault();
    const dp = dy / TUNE.touchDistance;
    state.goal = clamp01(state.goal + dp);
    state.p = clamp01(state.p + dp * 0.6);
    // smoothed velocity (p per ms) for the inertia flick
    const now = performance.now();
    const dt = Math.max(1, now - lastMoveAt);
    vel = vel * 0.6 + (dp / dt) * 0.4;
    lastMoveAt = now;
    render();
  };

  const onTouchEnd = () => {
    if (!swipeActive) return;
    swipeActive = false;
    const fresh = performance.now() - lastMoveAt < 100;
    // Inertia: a flick projects ~TUNE.flick ms ahead, then commits to a stage.
    if (fresh && Math.abs(vel) > 0.0004) {
      const projected = state.goal + vel * TUNE.flick;
      moveTo(projected > TUNE.commit ? 1 : 0, 0.9, 'power3.out');
      return;
    }
    scheduleSettle();
  };

  addEventListener('touchstart', onTouchStart, { passive: true });
  addEventListener('touchmove', onTouchMove, { passive: false });
  addEventListener('touchend', onTouchEnd, { passive: true });
  addEventListener('touchcancel', onTouchEnd, { passive: true });

  /* ---- input: keyboard ------------------------------------------ */
  addEventListener('keydown', (e) => {
    if (!ready) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const forward = ['ArrowDown', 'PageDown', ' '].includes(e.key);
    const back = ['ArrowUp', 'PageUp', 'Escape'].includes(e.key);
    if (e.key === 'Enter' && !(e.target as Element).closest('button, a')) {
      e.preventDefault();
      moveTo(1, TUNE.keyboard);
      return;
    }
    if (forward) {
      e.preventDefault();
      moveTo(1, TUNE.keyboard);
    } else if (back) {
      e.preventDefault();
      moveTo(0, TUNE.keyboard);
    }
  });

  /* ---- input: click + hold on ENTER ----------------------------- */
  const setHoldUI = (on: boolean, progress = 0) => {
    document.body.classList.toggle('is-holding', on);
    enterRing?.style.setProperty('stroke-dashoffset', String(1 - progress));
    portal.style.setProperty('--hold', `${progress}turn`);
    cursor.setHold(progress);
  };

  enterBtn.addEventListener('pointerdown', (e) => {
    if (!ready || holding) return;
    holding = true;
    holdFrom = state.p;
    holdAt = performance.now();
    killTween();
    enterBtn.setPointerCapture?.(e.pointerId);
    cursor.setMode('hold');
    setHoldUI(true, 0);
  });

  const endHold = () => {
    if (!holding) return;
    holding = false;
    suppressClick = performance.now() - holdAt > TUNE.tapMax;
    setHoldUI(false, 0);
    cursor.setMode('portal');
    if (state.p >= 1) return;
    if (state.p > TUNE.commit) moveTo(1, 0.9, 'power3.out');
    else moveTo(0, 0.9, 'power3.out');
  };
  enterBtn.addEventListener('pointerup', endHold);
  enterBtn.addEventListener('pointercancel', endHold);
  enterBtn.addEventListener('pointerleave', endHold);

  enterBtn.addEventListener('click', () => {
    // Keyboard activation never sets suppressClick, so Enter/Space still work.
    if (!ready || suppressClick) {
      suppressClick = false;
      return;
    }
    cursor.setMode('dive');
    moveTo(1, TUNE.autoDive, 'power3.inOut');
    setTimeout(() => cursor.setMode('free'), TUNE.autoDive * 1000);
  });

  backBtn.addEventListener('click', () => {
    cursor.setMode('dive');
    moveTo(0, TUNE.autoDive, 'power3.inOut');
    setTimeout(() => cursor.setMode('free'), TUNE.autoDive * 1000);
  });

  q1<HTMLAnchorElement>('[data-enter-link]')?.addEventListener('click', (e) => {
    e.preventDefault();
    moveTo(1, TUNE.keyboard);
  });

  /* ---- ambient pointer parallax (hero only, subtle) ------------- */
  if (!reduced && matchMedia('(hover: hover) and (pointer: fine)').matches) {
    const layers = Array.from(document.querySelectorAll<HTMLElement>('[data-parallax]')).map(
      (el) => ({
        el,
        depth: Number(el.dataset.parallax) || 1,
        x: gsap.quickTo(el, 'x', { duration: 0.9, ease: 'power3.out' }),
        y: gsap.quickTo(el, 'y', { duration: 0.9, ease: 'power3.out' }),
      })
    );
    let mx = 0;
    let my = 0;
    addEventListener(
      'pointermove',
      (e) => {
        if (e.pointerType !== 'mouse') return;
        mx = e.clientX / innerWidth - 0.5;
        my = e.clientY / innerHeight - 0.5;
        const rest = Math.max(0, 1 - state.p * 3); // parallax dies as we dive
        for (const l of layers) {
          l.x(mx * 10 * l.depth * rest);
          l.y(my * 8 * l.depth * rest);
        }
      },
      { passive: true }
    );
  }

  /* ---- ticker: hold progress + lerp ----------------------------- */
  // Hold is a charge-up: slow start, gathers pace, eases into the arrival.
  // The ring shows real time (prog); the dive follows the eased curve.
  const holdEase = gsap.parseEase('power2.inOut');
  gsap.ticker.add(() => {
    if (holding) {
      const prog = clamp01((performance.now() - holdAt) / (TUNE.holdTime * 1000));
      const eased = holdEase(prog);
      state.p = clamp01(holdFrom + eased * (1 - holdFrom));
      state.goal = state.p;
      setHoldUI(true, eased); // ring tracks the eased dive, not raw time
      render();
      if (prog >= 1) {
        holding = false;
        suppressClick = true;
        setHoldUI(false, 0);
        cursor.setMode('dive'); // otherwise the cursor keeps vibrating in 'hold'
        moveTo(1, 0.35, 'power2.out');
        setTimeout(() => cursor.setMode('free'), 400);
      }
      return;
    }
    if (tween) return; // tween drives state + render

    const d = state.goal - state.p;
    if (Math.abs(d) < 0.0004) {
      if (state.goal !== state.p) {
        state.p = state.goal;
        render();
      }
      return;
    }
    state.p = clamp01(state.p + d * TUNE.smooth);
    render();
  });

  /* ---- hash + boot sequence ------------------------------------ */
  const deepLink = location.hash === '#about';

  let ready = false;
  await runPreloader(reduced);

  ready = true;
  document.body.classList.add('is-ready');

  if (deepLink) {
    state.p = state.goal = 1;
    render();
    commitStage();
  } else {
    if (document.fonts?.ready) await document.fonts.ready;
    dive.layout(); // fonts settled → re-measure the portal anchor
    render();
    dive.intro();
  }

  /* paused ambient work when the tab is hidden */
  document.addEventListener('visibilitychange', () => {
    document.body.classList.toggle('is-paused', document.hidden);
    if (document.hidden) gsap.ticker.sleep();
    else gsap.ticker.wake();
  });

  // expose for debugging / future stages
  (window as unknown as { iwan: unknown }).iwan = { state, moveTo, dive };
}
