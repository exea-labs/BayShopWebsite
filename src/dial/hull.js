// Projects the gnomon (a thin triangular prism) along the sun onto a horizontal
// plane and returns its convex hull, the exact outline of the cast shadow.
import { GNOMON, H } from './geometry.js';

const yTop = H + GNOMON.height;
// East face O, B, T; the west face is the same triangle 0.022 further west.
const EAST = [
  [GNOMON.xEast, H, GNOMON.zRoot],
  [GNOMON.xEast, H, GNOMON.zBack],
  [GNOMON.xEast, yTop, GNOMON.zBack],
];
const PRISM = [...EAST, ...EAST.map(([x, y, z]) => [x - (GNOMON.xEast - GNOMON.xWest), y, z])];

function cross(o, a, b) {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

// Andrew's monotone chain; counter-clockwise, no repeated end point.
function convexHull(points) {
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const lower = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 1e-12) lower.pop();
    lower.push(q);
  }
  const upper = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 1e-12) upper.pop();
    upper.push(q);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

/**
 * @param {number[]} sun     unit vector toward the sun [x, y, z]
 * @param {number} planeY    receiving plane (H for the dial face, 0 for the paper)
 * @param {import('three').Vector2[]} hullOut  6 entries, padded by repeating the last
 * @param {import('three').Vector4} styleOut   projected style: root (x, z) and tip (z, w)
 */
export function shadowOutline(sun, planeY, hullOut, styleOut) {
  const sy = Math.max(sun[1], 0.02);
  const proj = ([x, y, z]) => {
    const t = (y - planeY) / sy;
    return [x - sun[0] * t, z - sun[2] * t];
  };
  const pts = PRISM.map(proj);
  const hull = convexHull(pts);
  for (let i = 0; i < hullOut.length; i++) {
    const q = hull[Math.min(i, hull.length - 1)];
    hullOut[i].set(q[0], q[1]);
  }
  const root = proj(EAST[0]);
  const tip = proj(EAST[2]);
  styleOut.set(root[0], root[1], tip[0], tip[1]);
}
