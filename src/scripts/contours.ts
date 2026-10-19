/**
 * contours.ts — the About stage's topographic hover.
 *
 * Where the hero pulls dots into a well, About does the opposite: the pointer
 * *raises terrain*. A hill grows under the cursor the longer it stays, and
 * because the contour levels are fixed, rings condense inward one by one as
 * the hill rises. Moving drags a ridge behind you that slowly erodes, so the
 * stage becomes a live elevation map — a survey sheet for a character profile.
 *
 * Cream iso-lines, one cobalt crest. Marching squares on a coarse height
 * field; nothing runs unless a hill is alive and About is the active stage.
 */
const STEP = 12; // height-field sampling grid, px
const SIGMA = 46; // hill radius, px
const LEVELS = [0.12, 0.24, 0.36, 0.48, 0.6]; // iso-levels
const INDEX_EVERY = 4; // every Nth line drawn heavier, like an index contour
const CREST = LEVELS.length - 1;
const TRAIL_EVERY = 150; // ms between ridge pucks
const MAX_TRAIL = 5;
const IDLE_WAVE = 8; // px drift while the pointer rests
const IDLE_SPEED = 0.0015; // radians per ms — breathing rate

/** Smooth value noise, 2 octaves — cheap terrain that never tiles visibly. */
const hash = (i: number, j: number) => {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const noise = (x: number, y: number) => {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};

// marching squares: which grid edges to connect for each corner case
// (bit 1 = top-left, 2 = top-right, 4 = bottom-right, 8 = bottom-left;
//  edges 0 = top, 1 = right, 2 = bottom, 3 = left)
const CASES: number[][][] = [
  [], [[3, 0]], [[0, 1]], [[3, 1]],
  [[1, 2]], [[3, 0], [1, 2]], [[0, 2]], [[3, 2]],
  [[2, 3]], [[2, 0]], [[0, 1], [2, 3]], [[2, 1]],
  [[1, 3]], [[1, 0]], [[0, 3]], [],
];

type Puck = { x: number; y: number; amp: number; s: number };

export function initContours() {
  const canvas = document.querySelector<HTMLCanvasElement>('[data-contours]');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let w = 0;
  let h = 0;
  let field = new Float32Array(0);
  let terrain = new Float32Array(0); // precomputed noise, one value per cell
  let terrainB = new Float32Array(0); // second octave set, morphed against terrain
  const pt = { x: -1e4, y: -1e4 }; // raw pointer
  const hill: Puck = { x: -1e4, y: -1e4, amp: 0, s: SIGMA }; // live puck
  let trail: Puck[] = [];
  let inside = false;
  let lastPush = 0;
  let lastMove = -1e4;
  let rest = 0; // 0 while moving, 1 once the pointer has settled
  let raf = 0;

  const active = () =>
    document.body.dataset.at === 'about' && !document.body.classList.contains('is-paused');

  const resize = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    terrain = new Float32Array(0); // grid shape changed; rebuild noise lazily
    kick();
  };

  /** Interpolated crossing point on one cell edge. */
  const edge = (e: number, x: number, y: number, h00: number, h10: number, h11: number, h01: number, L: number) => {
    switch (e) {
      case 0:
        return [x + STEP * ((L - h00) / (h10 - h00)), y];
      case 1:
        return [x + STEP, y + STEP * ((L - h10) / (h11 - h10))];
      case 2:
        return [x + STEP * ((L - h01) / (h11 - h01)), y + STEP];
      default:
        return [x, y + STEP * ((L - h00) / (h01 - h00))];
    }
  };

  const draw = (now: number) => {
    ctx.clearRect(0, 0, w, h);

    const pucks: Puck[] = hill.amp > 0.004 ? [...trail, hill] : trail;
    if (!pucks.length || !w || !h) return;

    const cols = Math.ceil(w / STEP) + 2;
    const rows = Math.ceil(h / STEP) + 2;
    if (field.length < cols * rows) field = new Float32Array(cols * rows);
    else field.fill(0, 0, cols * rows);
    if (terrain.length < cols * rows) {
      terrain = new Float32Array(cols * rows);
      terrainB = new Float32Array(cols * rows);
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          terrain[j * cols + i] = (noise(i * 0.38, j * 0.38) + noise(i * 0.17 + 17, j * 0.17 - 9) * 0.5) / 1.5;
          terrainB[j * cols + i] = (noise(i * 0.31 - 5, j * 0.44 + 3) + noise(i * 0.15 + 41, j * 0.21) * 0.5) / 1.5;
        }
      }
    }

    // idle: cross-morph the two noise fields so contours keep re-shaping
    const morph = 0.5 + 0.5 * Math.sin(now * IDLE_SPEED);
    // idle: the whole hill swells and settles, sliding rings across the levels
    const breathe = 1 + 0.085 * Math.sin(now * IDLE_SPEED * 0.7);
    // idle: a slow sway, eased in only once the pointer has stopped
    const swayX = Math.cos(now * IDLE_SPEED * 0.9) * IDLE_WAVE * rest;
    const swayY = Math.sin(now * IDLE_SPEED * 1.3) * IDLE_WAVE * rest;

    // sum the hills — only inside each puck's reach, so exp() stays cheap
    for (const p of pucks) {
      const isHill = p === hill;
      const px0 = p.x + (isHill ? swayX : 0);
      const py0 = p.y + (isHill ? swayY : 0);
      const amp = p.amp * (isHill ? breathe : 1);
      const cut = 3.2 * p.s;
      const cut2 = cut * cut;
      const inv = 1 / (2 * p.s * p.s);
      const i0 = Math.max(0, Math.floor((px0 - cut) / STEP));
      const i1 = Math.min(cols - 1, Math.ceil((px0 + cut) / STEP));
      const j0 = Math.max(0, Math.floor((py0 - cut) / STEP));
      const j1 = Math.min(rows - 1, Math.ceil((py0 + cut) / STEP));
      for (let j = j0; j <= j1; j++) {
        const dy = j * STEP - py0;
        for (let i = i0; i <= i1; i++) {
          const dx = i * STEP - px0;
          const d2 = dx * dx + dy * dy;
          if (d2 > cut2) continue;
          // terrain noise modulates each hill so rings bend into real contours;
          // morphing between two noise fields keeps them re-shaping while idle
          const k = j * cols + i;
          const t = terrain[k] + (terrainB[k] - terrain[k]) * morph;
          field[k] += amp * 1.4 * Math.exp(-d2 * inv) * (0.7 + 0.6 * t);
        }
      }
    }

    // trace every iso-line in one path per level, then stroke each once
    const paths = LEVELS.map(() => new Path2D());
    for (let j = 0; j < rows - 1; j++) {
      for (let i = 0; i < cols - 1; i++) {
        const h00 = field[j * cols + i];
        const h10 = field[j * cols + i + 1];
        const h11 = field[(j + 1) * cols + i + 1];
        const h01 = field[(j + 1) * cols + i];
        const lo = Math.min(h00, h10, h11, h01);
        const hi = Math.max(h00, h10, h11, h01);
        if (hi < LEVELS[0]) continue;

        const x = i * STEP;
        const y = j * STEP;
        for (let l = 0; l < LEVELS.length; l++) {
          const L = LEVELS[l];
          if (L <= lo || L >= hi) continue;
          const pairs = CASES[(h00 > L ? 1 : 0) | (h10 > L ? 2 : 0) | (h11 > L ? 4 : 0) | (h01 > L ? 8 : 0)];
          if (!pairs.length) continue;
          const path = paths[l];
          for (const [ea, eb] of pairs) {
            const a = edge(ea, x, y, h00, h10, h11, h01, L);
            const b = edge(eb, x, y, h00, h10, h11, h01, L);
            path.moveTo(a[0], a[1]);
            path.lineTo(b[0], b[1]);
          }
        }
      }
    }

    for (let l = 0; l < LEVELS.length; l++) {
      if (l === CREST) {
        ctx.strokeStyle = 'rgba(20,56,255,0.9)';
        ctx.lineWidth = 1.6;
      } else if ((l + 1) % INDEX_EVERY === 0) {
        // index contour: heavier, like on a survey sheet
        ctx.strokeStyle = `rgba(241,237,226,${0.32 + l * 0.03})`;
        ctx.lineWidth = 1.75;
      } else {
        ctx.strokeStyle = `rgba(241,237,226,${0.12 + l * 0.03})`;
        ctx.lineWidth = 0.9;
      }
      ctx.stroke(paths[l]);
    }
  };

  const frame = (now: number) => {
    raf = 0;
    const live = inside && active();

    // the hill rises while hovered, sinks when the pointer leaves
    hill.amp += ((live ? 1 : 0) - hill.amp) * (live ? 0.025 : 0.07);
    hill.x += (pt.x - hill.x) * 0.25;
    hill.y += (pt.y - hill.y) * 0.25;

    // ease the idle sway in after ~250 ms without movement, out instantly on move
    const resting = now - lastMove > 250;
    rest += ((resting ? 1 : 0) - rest) * (resting ? 0.03 : 0.25);

    // ridges left behind widen and erode
    for (const p of trail) {
      p.amp *= 0.955;
      p.s = Math.min(180, p.s + 2.2);
    }
    trail = trail.filter((p) => p.amp > 0.03);

    draw(now);

    // keep animating while the hill is alive (idle breathing never settles);
    // stop only once it has fully sunk with no ridges left
    const gone = !live && hill.amp < 0.004 && !trail.length;
    if (!gone) raf = requestAnimationFrame(frame);
  };

  function kick() {
    if (!raf) raf = requestAnimationFrame(frame);
  }

  resize();
  addEventListener('resize', resize);

  addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'mouse') return;
      pt.x = e.clientX;
      pt.y = e.clientY;
      lastMove = performance.now();
      if (hill.x < -1e3) {
        hill.x = pt.x; // land the hill under the pointer, don't fly in
        hill.y = pt.y;
      }
      if (!inside) inside = true;
      if (!active()) return;

      const now = performance.now();
      if (now - lastPush > TRAIL_EVERY && hill.amp > 0.05) {
        lastPush = now;
        trail.push({ x: hill.x, y: hill.y, amp: hill.amp * 0.62, s: SIGMA });
        if (trail.length > MAX_TRAIL) trail.shift();
      }
      kick();
    },
    { passive: true }
  );

  document.documentElement.addEventListener('pointerleave', () => {
    inside = false;
    kick();
  });

  // entering About starts a fresh sheet; leaving drops the terrain
  new MutationObserver(() => {
    hill.amp = 0;
    trail = [];
    kick();
  }).observe(document.body, { attributes: true, attributeFilter: ['data-at'] });
}
