/**
 * dots.ts — "gravity well": the hero's hidden halftone field, revealed by the cursor.
 *
 * At rest the field is invisible (the clean opening stays clean). Near the
 * pointer, dots fade in and are pulled toward it like light bending around
 * a mass. Inside the core they become short cobalt strokes aligned on their
 * orbit and twist around the cursor; the twist grows with pointer speed and
 * unwinds when it stops, and fast moves drag a wake behind the well.
 * It previews the dive: the cursor is a small portal of its own.
 *
 * rAF runs only while the well is moving; hero stage only, fine pointers
 * only, never with reduced motion. Fades with the dive via CSS (--p).
 */
const SPACING = 35; // px between field dots
const REACH = 600; // px radius where the field becomes visible
const PULL = 50; // px max inward displacement (lensing)
const CORE = 1.2; // influence above which a dot becomes a cobalt stroke
const TWIST_REST = 0.15; // rad of swirl when the pointer is still
const TWIST_SPEED = 0.01; // extra rad per px/frame of pointer speed
const WAKE = 0.4; // how far fast moves drag the field

// alpha per depth bucket (outer → inner), so the field has no hard edge
const INK_ALPHA = [0.1, 0.26, 0.46];
const COBALT_ALPHA = [0, 0.65, 0.95];

export function initDots() {
  const canvas = document.querySelector<HTMLCanvasElement>('[data-dots]');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let w = 0;
  let h = 0;
  // eased pointer (x,y), target (tx,ty), smoothed velocity (vx,vy)
  const m = { x: 0, y: 0, tx: 0, ty: 0, vx: 0, vy: 0 };
  let energy = 0; // 0..1 presence of the well
  let inside = false;
  let raf = 0;

  const resize = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    kick();
  };

  const draw = () => {
    ctx.clearRect(0, 0, w, h);
    if (energy < 0.005) return;

    const reach = REACH * (0.6 + 0.4 * energy);
    const speed = Math.hypot(m.vx, m.vy);
    const twist = (TWIST_REST + speed * TWIST_SPEED) * energy;

    // 3 depth buckets keep the edge soft without per-dot fillStyle churn
    const ink = [new Path2D(), new Path2D(), new Path2D()];
    const cobalt = [new Path2D(), new Path2D(), new Path2D()];

    const x0 = Math.max(0, Math.ceil((m.x - reach) / SPACING) * SPACING);
    const y0 = Math.max(0, Math.ceil((m.y - reach) / SPACING) * SPACING);
    const x1 = Math.min(w, m.x + reach);
    const y1 = Math.min(h, m.y + reach);

    for (let gy = y0; gy < y1; gy += SPACING) {
      for (let gx = x0; gx < x1; gx += SPACING) {
        const dx = gx - m.x;
        const dy = gy - m.y;
        const d = Math.hypot(dx, dy);
        if (d >= reach) continue;

        const t = 1 - d / reach;
        const inf = t * t * (3 - 2 * t) * energy; // smoothstep falloff
        const b = Math.min(2, Math.floor(inf * 3));

        // lensing: pull inward, swirl around the well, drag with velocity
        const a = Math.atan2(dy, dx) + twist * inf * inf;
        const r = Math.max(0, d - PULL * inf);
        const px = m.x + Math.cos(a) * r - m.vx * WAKE * inf * 6;
        const py = m.y + Math.sin(a) * r - m.vy * WAKE * inf * 6;

        if (inf > CORE) {
          // orbit-aligned stroke, longer toward the centre
          const k = (inf - CORE) / (1 - CORE);
          const len = 2 + k * 9;
          const tx = -Math.sin(a) * len;
          const ty = Math.cos(a) * len;
          cobalt[b].moveTo(px - tx, py - ty);
          cobalt[b].lineTo(px + tx, py + ty);
        } else {
          const rad = 0.6 + inf * 2.2;
          ink[b].moveTo(px + rad, py);
          ink[b].arc(px, py, rad, 0, Math.PI * 2);
        }
      }
    }

    for (let b = 0; b < 3; b++) {
      ctx.fillStyle = `rgba(10,10,11,${INK_ALPHA[b] * energy})`;
      ctx.fill(ink[b]);
      if (COBALT_ALPHA[b]) {
        ctx.strokeStyle = `rgba(20,56,255,${COBALT_ALPHA[b] * energy})`;
        ctx.lineWidth = 1.6;
        ctx.lineCap = 'round';
        ctx.stroke(cobalt[b]);
      }
    }
  };

  const frame = () => {
    raf = 0;
    const body = document.body;
    const active = body.dataset.at === 'hero' && !body.classList.contains('is-paused');

    const nx = m.x + (m.tx - m.x) * 0.16;
    const ny = m.y + (m.ty - m.y) * 0.16;
    m.vx += (nx - m.x - m.vx) * 0.2;
    m.vy += (ny - m.y - m.vy) * 0.2;
    m.x = nx;
    m.y = ny;
    energy += ((inside && active ? 1 : 0) - energy) * 0.08;

    draw();

    // stop once the well has faded out, or settled still and fully present
    const still =
      Math.abs(m.tx - m.x) + Math.abs(m.ty - m.y) < 0.05 &&
      Math.abs(m.vx) + Math.abs(m.vy) < 0.05;
    const settled = inside && active && energy > 0.995 && still;
    if (energy > 0.005 && !settled) raf = requestAnimationFrame(frame);
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
      m.tx = e.clientX;
      m.ty = e.clientY;
      if (!inside && energy < 0.01) {
        m.x = m.tx; // appear under the pointer instead of flying in from the old spot
        m.y = m.ty;
      }
      inside = true;
      kick();
    },
    { passive: true }
  );
  document.documentElement.addEventListener('pointerleave', () => {
    inside = false;
    kick();
  });
  // re-evaluate the fade when the stage changes (dive in / back out)
  new MutationObserver(kick).observe(document.body, { attributes: true, attributeFilter: ['data-at'] });
}
