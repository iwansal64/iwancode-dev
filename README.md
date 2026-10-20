# iwancode

Portfolio of Ridwan Bagoes Setiawan — Stage 01 of a staged, scroll-less build:
Preloader, Hero, About, and the camera-dive engine that connects them.

```sh
npm install
npm run dev      # http://localhost:4321
npm run build    # static output in dist/
```

## Structure

```
src/
├── data/content.ts        all copy (PLACEHOLDER markers), HUD strings, stage registry
├── styles/global.css      design tokens, reset, type, hero/about/hud/cursor/preloader
├── layouts/Base.astro     head, self-hosted fonts, Hud + Cursor mounts, aria-live
├── pages/index.astro      composes the stages; boots the engine
├── components/
│   ├── Preloader.astro    Stage 00
│   ├── Hero.astro         Stage 01 (layered 3D: grid / marks / content / slivers)
│   ├── About.astro        Stage 02 (character-sheet layout, portrait, locked slot)
│   ├── Hud.astro          persistent four-corner game HUD
│   └── Cursor.astro       cobalt triangle cursor
└── scripts/
    ├── engine.ts          p state, input, settling, hash, hold, boot
    ├── dive.ts            the whole dive as one 100-unit scrubbed timeline
    ├── cursor.ts          pointer-following triangle with heading logic
    ├── dots.ts            hero hover: cursor gravity-well field (canvas)
    ├── contours.ts        about hover: pointer-raised contour terrain (canvas)
    └── preloader.ts       counter, status lines, cobalt wipe, handoff
```

## The engine in one paragraph

`p ∈ [0,1]` is the only state: 0 = Hero at rest, 1 = About at rest. `dive.ts`
builds one paused GSAP timeline of exactly 100 units; `engine.ts` maps `p` onto
`timeline.progress(p)` every frame, so forward and backward are symmetrical and
the dive is fully scrubbable. Input never animates anything directly — it moves
a `goal`, and either a lerp (wheel/touch) or a GSAP tween (keyboard, click,
settle) closes the gap. Everything else (HUD depth, stage label, palette tone,
aria-live, hash, pointer-events) is derived from `p`.

Adding Stage 03: add `{ id, label }` to `content.stages`, drop the component
into `index.astro` inside `[data-world]`, and append one segment to the timeline
in `dive.ts`. Nothing in `engine.ts` hard-codes the stage count.

## Tunable constants

`src/scripts/engine.ts` → `TUNE`

| key | value | meaning |
| --- | --- | --- |
| `wheelDistance` | 1350 | px of wheel delta for a full dive |
| `touchDistance` | 620 | px of swipe for a full dive |
| `smooth` | 0.12 | lerp factor per frame (higher = twitchier) |
| `keyboard` | 1.1 | s per keyboard stage jump |
| `autoDive` | 2.2 | s for the ENTER click auto-play |
| `holdTime` | 2.4 | s of hold to complete the dive; eased `power2.inOut` so it charges up, and the ENTER ring follows the eased value |
| `settleAfter` | 700 | ms idle before easing to the nearest stage |
| `settleTime` | 0.75 | s settle duration |
| `commit` | 0.5 | p above which a released hold completes |
| `flick` | 160 | ms of projected inertia on a touch flick |
| `tapMax` | 250 | ms press under which a press counts as a click, not a hold |

`src/scripts/dive.ts` → timeline beats in units (100 = whole dive):
`0–30` camera accelerates and pans onto the portal, `0–40` the wordmark scales
past the camera, `28–52` the dot swells and the cobalt flood covers the frame,
`54–100` the iris opens centred and About assembles from depth. Change a
duration and every input path follows.

`src/scripts/preloader.ts` → `DURATION` 2.6s (`DURATION_REDUCED` 0.6s),
sessionStorage key `iwan:seen`.
`src/scripts/cursor.ts` → `SPEED_MIN`, `POS_LAG`, `ROT_LAG`, `STRETCH_MAX`.
`src/styles/global.css` → `--wm` wordmark size (`3.75em` glyph width), `--pad`,
`--hud`, `--persp`, `--z-grid/--z-mid/--z-fg` layer depths.

## Decisions

- **Archivo Variable** over Anton: the width axis (62–125%) lets the wordmark sit
  expanded at ~360px while staying legible in micro sizes. Anton is single-weight
  and goes muddy when scaled.
- **Instrument Serif Italic** carries exactly two phrases (hero line, About
  headline) so the italic stays a contrast note, not a texture.
- **Cobalt flood is a fixed circle anchored to the portal**, not a full-screen
  overlay. `measure()` stores the dot centre and the max screen radius as CSS
  vars, so the flood, the iris clip and the wordmark's transform origin all key
  off the same geometry at any viewport.
- **About lives in a separate `.about-clip` layer** with its own perspective.
  The iris (`clip-path: circle()` driven by an onUpdate) reveals it, which keeps
  the Hero's 3D transforms from fighting the About arrival.
- **The world scales to 1.16 while it rolls 2.4°** during the dive: without the
  scale, the rotation exposes viewport corners as black/cobalt wedges.
- **Touch uses native `touch` events, not pointer events** — pointer streams get
  cancelled the moment the browser decides to pan. `preventDefault` is
  conditional so the About copy still scrolls natively when it overflows.
- **A press longer than `tapMax` swallows its own click**, so hold-to-enter does
  not also trigger the click-to-autoplay path. Keyboard activation is untouched.
- **About's internal scroll is enabled only when it is the active stage**
  (`body[data-at='about']`), so the Hero can never be scrolled accidentally.
- **Deep link `#about`** starts at `p = 1` with no dive; the hash is written on
  settle via `replaceState`, not pushed, so Back doesn't re-enter the dive.
- **Mobile re-orders the About grid** (headline → copy → portrait → stats) rather
  than shrinking the desktop arrangement; the back control moves above the
  headline so it is reachable without scrolling.
- **Hero hover is a "gravity well"**, not a glow (`src/scripts/dots.ts`). A
  hidden halftone field appears only around the pointer: dots bend toward it,
  the core turns into cobalt orbit strokes that swirl harder with speed, and
  fast moves drag a wake. It previews the dive (the cursor is a small portal).
  Canvas sits at `z: 0` so pixels map 1:1 to the pointer; rAF stops when idle;
  off for touch and reduced motion; fades via `--p` during the dive.
- **About hover is a live topographic survey** (`src/scripts/contours.ts`). The
  pointer raises terrain instead of lighting it up: a hill grows the longer you
  hover and fixed iso-levels condense inward as it rises, noise-warped so the
  rings read as contours, index lines every third level, cobalt crest. Moving
  leaves ridges that widen and erode, so the stage accumulates a trail of
  terrain. Marching squares on the height field; nothing draws at rest. While
  the pointer rests, the mound keeps breathing: two noise fields cross-morph,
  the hill swells and settles, and it sways a few px. rAF runs while the hill
  is alive and stops once it has sunk.
- **Dev toolbar disabled** in `astro.config.mjs`: it collides with a fixed
  full-screen stage.

## Known limitations

- The portrait is a styled placeholder (cream/ink duotone frame), as specified.
- About's copy can exceed a short viewport; it scrolls internally, and the
  bottom HUD sits above the copy rather than in flow.
- The wheel handler calls `preventDefault`, so ctrl+wheel zoom is the only
  browser zoom gesture left untouched (it is explicitly passed through).
- No `prefers-reduced-transparency` / `forced-colors` handling yet.
- Custom cursor is desktop-only by design; touch gets the native pointer.

## Next stage

Stage 03 should mount as a sibling inside `[data-world]` and claim the
`NEXT STAGE — LOCKED` slot in `About.astro`. The cleanest extension is a second
`p` range (e.g. `p ∈ [1,2]`) with its own timeline segment, which keeps a single
scrubbable progress value instead of adding a second animation system.
