// Light keyed to solar elevation (DESIGN.md §9.4). The sun is a directional
// light; the sky is the baked outdoor environment (sky.js), tinted per hour.
// Intensities are absolute and include exposure: a horizontal face receives
// only sin(elevation) of the sun, so, like a photographer, the sun is exposed
// up as it drops. Golden hour therefore reads luminous (warm highlights, cool
// sky-filled shadows) instead of muddy, and the sun fades out by smoothstep
// in the last 2.5° before sunset. After sunset an afterglow from the west-south-west
// (a one-sided hemisphere light) warms the faces that look toward it while the
// sky turns the stone to a muted blue-hour slate.
import { Color, LinearSRGBColorSpace } from 'three';

// The page's paper takes the same afternoon light (page.js GROUND), so each
// row is set to keep the sunlit stone a constant shade below the paper it sits
// on: warm cream at 4:00, honey at 4:40, rosy grey at sunset and a cool grey
// at 5:30. The drama is in the shadows, which stay deep and turn cool, not in
// the stone changing hue.
const ROWS = [
  // el°,   sun colour, face irradiance, sky tint, env, hemi, afterglow
  [29.85, '#FFF5E8', 1.75, '#FFFCF7', 0.62, 0.2, 0.0],
  [25.0, '#FFF3E4', 1.77, '#FFFBF6', 0.63, 0.2, 0.0],
  [16.0, '#FFEFDA', 1.9, '#FAF8F6', 0.67, 0.2, 0.0],
  [9.6, '#FFF0D8', 2.05, '#F2F3F6', 0.75, 0.2, 0.0],
  [3.0, '#FFE6C0', 1.95, '#F4EEEC', 0.84, 0.2, 0.15],
  [-0.83, '#FFD3A6', 0.0, '#F4E8E2', 1.45, 0.2, 0.55],
  [-5.65, '#FFD3A6', 0.0, '#E4E6EA', 1.5, 0.2, 0.25],
].map(([el, sun, e, sky, env, hi, glow]) => ({
  el,
  sun: new Color(sun),
  e,
  sky: new Color(sky),
  env,
  hi,
  glow,
}));

const smooth = (a, b, x) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};
const DEG = Math.PI / 180;

/** Fills `out` with the sun, sky tint, environment, hemisphere and afterglow for an elevation. */
export function lightAt(elDeg, out) {
  let i = 0;
  while (i < ROWS.length - 2 && elDeg < ROWS[i + 1].el) i++;
  const a = ROWS[i];
  const b = ROWS[i + 1];
  const t = Math.min(Math.max((a.el - elDeg) / (a.el - b.el), 0), 1);
  out.sun.copy(a.sun).lerp(b.sun, t);
  out.sky.copy(a.sky).lerp(b.sky, t);
  out.env = a.env + (b.env - a.env) * t;
  out.hemiI = a.hi + (b.hi - a.hi) * t;
  out.glowI = a.glow + (b.glow - a.glow) * t;
  // The dial face receives sin(elevation) of the sun; the rows give the
  // irradiance we want it to receive (exposure included), the last degrees
  // before sunset fade it out.
  const rowE = elDeg >= 3 ? a.e + (b.e - a.e) * t : ROWS[4].e;
  const e = rowE * smooth(-0.83, 2.5, elDeg);
  out.sunI = e / Math.max(Math.sin(Math.max(elDeg, 0.5) * DEG), 0.0087);
  out.faceE = e;
  // Ground shadow strength: one shadow (the disc's and the gnomon's are a
  // union, never stacked), a little lighter than the gnomon's on the stone,
  // because the open paper sees more of the sky. It fades with the sun, and
  // turns from teal-black to a cool slate as the sky takes over the fill.
  // A raking sun exaggerates the honed grain into orange peel; ease the
  // relief as the sun drops (the cuts keep most of theirs).
  out.relief = 1 - 0.4 * (1 - smooth(3, 14, elDeg));
  const low = 1 - smooth(4, 16, elDeg);
  out.shadowAlpha = (0.25 + 0.06 * low) * smooth(-0.83, 2.5, elDeg);
  out.shadowTint.copy(TINT_HIGH).lerp(TINT_LOW, low);
  return out;
}

// The ground shader writes its tint unconverted, so these are display values.
const display = (r, g, b) => new Color().setRGB(r / 255, g / 255, b / 255, LinearSRGBColorSpace);
const TINT_HIGH = display(6, 16, 16);
const TINT_LOW = display(40, 58, 86);

export function createLightState() {
  return { sun: new Color(), sky: new Color(), sunI: 1, faceE: 1, env: 0.6, hemiI: 0.2, glowI: 0, shadowAlpha: 0.25, shadowTint: TINT_HIGH.clone(), relief: 1 };
}
