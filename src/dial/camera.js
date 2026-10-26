// Camera framing (DESIGN.md §9.5). Each view is solved once for its poster's
// aspect ratio; the live view then shows the same frame "contained" in its own
// rect, so the poster (object-fit: contain) and the first live frame agree.
import { PerspectiveCamera, Vector3 } from 'three';
import { framingPoints } from './geometry.js';

const DEG = Math.PI / 180;

export const VIEWS = {
  // Hero: east-north-east of the dial, looking west-south-west, half into the
  // sun. The gnomon stands in profile against the stone, every numeral reads
  // upright along the arc, and the 12:30 shadow lies along "Welcome".
  'hero-d': { fov: 22, az: 68, el: 27, target: [0.05, 0.1, -0.05], aspect: 1600 / 1000, fill: [0.77, 0.77], bias: [0.05, -0.07] },
  'hero-m': { fov: 26, az: 68, el: 31, target: [0.05, 0.1, -0.05], aspect: 780 / 600, fill: [0.8, 0.8], bias: [-0.04, -0.02] },
  // The Five Hours: from the south-south-west, high, so the fan points up.
  hours: { fov: 16, az: 203, el: 68, target: [0.1, 0.1, -0.1], aspect: 1, fill: [0.8, 0.8], bias: [0, -0.02] },
};

export function direction(azDeg, elDeg, out = new Vector3()) {
  const a = azDeg * DEG;
  const e = elDeg * DEG;
  return out.set(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e));
}

const solved = new Map();

/** Distance and principal-point shift that frame the dial in the poster rect. */
export function solve(id) {
  if (solved.has(id)) return solved.get(id);
  const cfg = VIEWS[id];
  const cam = new PerspectiveCamera(cfg.fov, cfg.aspect, 0.05, 200);
  const target = new Vector3(...cfg.target);
  const dir = direction(cfg.az, cfg.el);
  const pts = framingPoints().map((p) => new Vector3(...p));
  const v = new Vector3();
  const bounds = (d) => {
    cam.position.copy(target).addScaledVector(dir, d);
    cam.lookAt(target);
    cam.updateMatrixWorld(true);
    cam.updateProjectionMatrix();
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of pts) {
      v.copy(p).project(cam);
      x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x);
      y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
    }
    return { x0, x1, y0, y1 };
  };
  let lo = 1;
  let hi = 80;
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    const b = bounds(mid);
    if ((b.x1 - b.x0) / 2 <= cfg.fill[0] && (b.y1 - b.y0) / 2 <= cfg.fill[1]) hi = mid;
    else lo = mid;
  }
  const b = bounds(hi);
  const frame = {
    distance: hi,
    // move the bounds' centre to the rect centre, then apply the composition bias
    shift: [(b.x1 + b.x0) / 2 - cfg.bias[0], (b.y1 + b.y0) / 2 - cfg.bias[1]],
  };
  solved.set(id, frame);
  return frame;
}

/**
 * Place `cam` for view `id` inside a rect of the given aspect.
 * @param {object} o  { dAz, dEl, dEl2 (scroll), scale (distance multiplier) }
 */
export function place(cam, id, aspect, o = {}) {
  const cfg = VIEWS[id];
  const frame = solve(id);
  const a0 = cfg.aspect;
  const t0 = Math.tan((cfg.fov * DEG) / 2);
  const wider = aspect >= a0;
  const t = wider ? t0 : t0 * (a0 / aspect);
  cam.fov = (2 * Math.atan(t)) / DEG;
  cam.aspect = aspect;
  const target = _t.set(...cfg.target);
  direction(cfg.az + (o.dAz || 0), cfg.el + (o.dEl || 0), _d);
  cam.position.copy(target).addScaledVector(_d, frame.distance * (o.scale || 1));
  cam.up.set(0, 1, 0);
  cam.lookAt(target);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  const sx = frame.shift[0] * (wider ? a0 / aspect : 1);
  const sy = frame.shift[1] * (wider ? 1 : aspect / a0);
  cam.projectionMatrix.elements[8] += sx;
  cam.projectionMatrix.elements[9] += sy;
  cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
}

const _t = new Vector3();
const _d = new Vector3();
