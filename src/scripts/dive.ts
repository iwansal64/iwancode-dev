/**
 * dive.ts — the entire camera dive as ONE paused GSAP timeline.
 *
 * p ∈ [0,1] is mapped 1:1 onto timeline progress, so scrubbing is exact and
 * forward/backward are perfectly symmetrical. This module owns no input;
 * engine.ts only calls apply(p).
 *
 * Beats (timeline units, 100 total):
 *   00–35  accelerate — grid + marks rush past at different speeds, slivers
 *          stretch, wordmark blows up around the portal, FOV widens, roll
 *   35–60  fall in — portal dot expands, cobalt floods, "STAGE 02" flash
 *   60–100 iris opens over the flood and About assembles from depth
 */
import gsap from 'gsap';

export type Dive = {
  apply: (p: number) => void;
  intro: () => gsap.core.Timeline;
  layout: () => void;
};

const q1 = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) =>
  root.querySelector<T>(sel)!;

export function createDive(opts: { reduced: boolean }): Dive {
  const world = q1('[data-world]');
  const hero = q1('[data-stage="hero"]');
  const wm = q1('[data-wordmark]');
  const name = q1('.hero__name');
  const portal = q1('[data-portal]');
  const flood = q1('[data-flood]');
  const floodLabel = q1('[data-flood-label]');
  const aboutClip = q1('[data-about-clip]');
  const aboutWorld = q1('[data-about-world]');
  const about = q1('[data-stage="about"]');
  const aboutScroll = q1('[data-about-scroll]', about);

  /* ---- geometry ---------------------------------------------------
     Rest position of the portal dot (for the wordmark's zoom origin) and the
     pan needed to bring it to the viewport centre. The flood and the iris use
     the centre, because by the time they fire the camera has panned onto the
     dot. Values are read lazily by the timeline (function-based) so a resize
     or a late font load cannot desync them. */
  const geo = { cx: innerWidth / 2, cy: innerHeight / 2, max: 800, dx: 0, dy: 0 };

  const measure = () => {
    const prev = Number(gsap.getProperty(wm, 'scale')) || 1;
    gsap.set(wm, { scale: 1 });
    wm.style.transformOrigin = '50% 50%';
    const r = portal.getBoundingClientRect();
    const w = wm.getBoundingClientRect();
    geo.cx = r.left + r.width / 2;
    geo.cy = r.top + r.height / 2;
    // Zoom the wordmark around the dot so the camera "locks on" to it.
    wm.style.transformOrigin = `${geo.cx - w.left}px ${geo.cy - w.top}px`;
    // Pan distance that brings the dot to the centre of the viewport.
    geo.dx = innerWidth / 2 - geo.cx;
    geo.dy = innerHeight / 2 - geo.cy;
    geo.max =
      Math.hypot(innerWidth / 2, innerHeight / 2) + 8;
    flood.style.setProperty('--fx', `${innerWidth / 2}px`);
    flood.style.setProperty('--fy', `${innerHeight / 2}px`);
    flood.style.setProperty('--fmax', `${geo.max}px`);
    gsap.set(wm, { scale: prev });
  };

  const setInteractive = (atAbout: boolean) => {
    hero.style.pointerEvents = atAbout ? 'none' : '';
    about.style.pointerEvents = atAbout ? 'auto' : 'none';
    hero.inert = atAbout;
    about.inert = !atAbout;
    if (!atAbout) aboutScroll.scrollTop = 0;
  };

  /* ---- reduced motion: plain crossfade, no camera ------------------ */
  if (opts.reduced) {
    gsap.set(aboutClip, { clipPath: 'none', visibility: 'visible' });
    gsap.set(about, { autoAlpha: 0 });
    const fade = gsap
      .timeline({ paused: true, defaults: { ease: 'none' } })
      .to(hero, { autoAlpha: 0, duration: 1 }, 0)
      .to(about, { autoAlpha: 1, duration: 1 }, 0);
    return {
      layout: () => {},
      intro: () => gsap.timeline(),
      apply: (p) => {
        fade.progress(p);
        setInteractive(p > 0.5);
      },
    };
  }

  /* ---- intro: runs once, handed off from the preloader ------------- */
  // Order per brief: wordmark + line → enter/portal → HUD + texture.
  const intro = () =>
    gsap
      .timeline({ defaults: { ease: 'expo.out' } })
      .from('[data-reveal-wm]', { yPercent: 104, duration: 1.25 }, 0)
      .from('[data-reveal]', { yPercent: 118, duration: 1.05, stagger: 0.09 }, 0.1)
      .from('[data-enter]', { autoAlpha: 0, scale: 0.88, duration: 0.8, ease: 'power3.out' }, 1.1)
      .from(portal, { scale: 0, duration: 0.7, ease: 'back.out(1.5)' }, 1.15)
      .from('[data-hud-corner]', { autoAlpha: 0, y: 5, duration: 0.5, stagger: 0.08 }, 1.55)
      .from('[data-layer="grid"]', { autoAlpha: 0, duration: 0.8 }, 1.6)
      .from('[data-layer="mid"] .mark, [data-sliver]', { autoAlpha: 0, duration: 0.55, stagger: 0.04 }, 1.75)
      .from('[data-grain]', { autoAlpha: 0, duration: 0.5 }, 1.8);

  /* ---- the dive --------------------------------------------------- */
  const tl = gsap.timeline({ paused: true, defaults: { ease: 'none' } });

  // 00–40 ─ accelerate through the layers, then fall into the dot.
  // The grid tops out at z 880 (≈13×): past ~900 the masked layer's raster
  // jumps to tens of thousands of px wide and its own repaint blocks the
  // compositor for seconds. At 1200 it measured a 6 s frame on slow scroll-back.
  tl.fromTo('[data-layer="grid"]', { z: -700 }, { z: 880, duration: 40, ease: 'power2.in' }, 0)
    .fromTo('[data-grid]', { scale: 1 }, { scale: 1.7, duration: 40, ease: 'power2.in' }, 0)
    .fromTo('[data-layer="mid"]', { z: -340 }, { z: 1250, duration: 34, ease: 'power2.in' }, 0)
    .fromTo('[data-layer="fg"]', { z: 420 }, { z: 1500, duration: 26, ease: 'power2.in' }, 0)
    .fromTo('[data-sliver]', { scaleY: 1 }, { scaleY: 7, duration: 26, ease: 'power2.in' }, 0)
    .fromTo('.hero__eyebrow', { autoAlpha: 1, y: 0 }, { autoAlpha: 0, y: -28, duration: 12 }, 0)
    .fromTo('[data-foot]', { autoAlpha: 1, y: 0 }, { autoAlpha: 0, y: 70, duration: 14, ease: 'power2.in' }, 2)
    // The wordmark grows past the camera AND drifts so its dot lands dead
    // centre. Panning the glyphs (not the world) keeps the cream hero edge
    // off-screen — panning the world exposed the ink behind it.
    .fromTo(
      wm,
      { scale: 1, x: 0, y: 0 },
      {
        scale: 4.2,
        x: () => geo.dx,
        y: () => geo.dy,
        duration: 40,
        ease: 'power3.in',
      },
      0
    )
    // fade late: the glyphs are still crossing the frame while the dot swells,
    // so the approach never reads as an empty cream field
    .fromTo(name, { opacity: 1 }, { opacity: 0, duration: 8, ease: 'power2.in' }, 34)
    .fromTo(world, { rotation: 0, scale: 1 }, { rotation: -2.4, scale: 1.16, duration: 30, ease: 'power2.inOut' }, 0)
    .fromTo(world, { perspective: 1100 }, { perspective: 620, duration: 44, ease: 'power1.in' }, 0);

  // 30–52 ─ the dot takes the frame: it grows as the camera locks on, then the
  // flood leaves from it and covers the viewport.
  tl.fromTo(portal, { scale: 1 }, { scale: 5.5, duration: 20, ease: 'power3.in' }, 28)
    .fromTo(flood, { scale: 0.04 }, { scale: 1, duration: 18, ease: 'power2.in' }, 32)
    .fromTo(flood, { opacity: 0 }, { opacity: 1, duration: 3 }, 32)
    .set(hero, { autoAlpha: 0 }, 50)
    .fromTo(floodLabel, { autoAlpha: 0, scale: 1.05 }, { autoAlpha: 1, scale: 1, duration: 4 }, 46)
    .to(floodLabel, { autoAlpha: 0, scale: 0.97, duration: 4 }, 52);

  // 54–100 ─ iris opens over the flood; About assembles from depth
  // Recovery tweens use .to + immediateRender:false so they lazily capture
  // the value left by the outbound tween (no conflicting "from" values).
  // The iris is centred: by unit 54 the camera has already panned onto the dot.
  const iris = { r: 0 };
  tl.set(aboutClip, { visibility: 'visible' }, 53)
    .to(iris, { r: 1, duration: 24, ease: 'power2.inOut', onUpdate: () => {
        aboutClip.style.clipPath = `circle(${iris.r * geo.max}px at 50% 50%)`;
      } }, 54)
    .to(flood, { opacity: 0, duration: 8, immediateRender: false }, 72)
    .fromTo(aboutWorld, { z: -1200, scale: 1.08 }, { z: 0, scale: 1, duration: 36, ease: 'power3.out' }, 54)
    .fromTo(
      '[data-arrive]',
      { z: -700, autoAlpha: 0, y: 28 },
      { z: 0, autoAlpha: 1, y: 0, duration: 22, stagger: 2.4, ease: 'power3.out' },
      58
    )
    .fromTo('[data-about-line]', { yPercent: 112 }, { yPercent: 0, duration: 18, ease: 'expo.out' }, 64)
    .fromTo('[data-stat-v]', { autoAlpha: 0, x: -8 }, { autoAlpha: 1, x: 0, duration: 8, stagger: 2, ease: 'steps(4)' }, 76)
    .fromTo('[data-locked]', { autoAlpha: 0 }, { autoAlpha: 1, duration: 8 }, 90)
    .to(world, { perspective: 1100, duration: 34, ease: 'power2.out', immediateRender: false }, 62)
    .to(world, { rotation: 0, scale: 1, duration: 34, ease: 'power2.out', immediateRender: false }, 56);

  // Pad to exactly 100 units so timeline progress === p.
  tl.set({}, {}, 100);

  const apply = (p: number) => {
    tl.progress(p);
    setInteractive(p > 0.5);
  };

  const layout = () => {
    const p = tl.progress();
    tl.progress(0);
    measure();
    tl.progress(p);
  };

  measure();
  apply(0);
  addEventListener('resize', layout, { passive: true });

  return { apply, intro, layout };
}
