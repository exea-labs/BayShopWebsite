// Engraving height map for the dial top, drawn with Canvas2D.
// White is the honed surface, black is the bottom of a cut. The bake pass blurs it
// into a V profile and derives albedo, normal and occlusion from it.
//
// Canvas mapping (planar, north up): px = (x + 1) / 2 * N, py = (z + 1) / 2 * N.
// Every angle comes from sunAt(), so the cut lines and the cast shadow agree by construction.
import { sunAt, SESSIONS, T_START, T_END, SUNSET } from './sun.js';
import { LINE_ORIGIN as O } from './geometry.js';

const DEG = Math.PI / 180;

const LINE_W = 0.006; // hour-line cut width (world units)
const FINE_W = 0.0036; // arc and graduations
const RHO_IN = 0.06;
const RHO_OUT = 1.36;
const RHO_ARC = 1.3;
const NUMERAL_RHO = 1.17; // centre of each numeral along its line, inside the arc
const NUMERAL_CAP = 0.048;
const TITLE_CAP = 0.018;
const TITLE_RHO = 0.5;
const CLEAR = 0.016; // clearance between a cut line and the type set on it

const NUMERALS = { 600: '10:00', 625: '10:25', 670: '11:10', 780: '1:00', 870: '2:30', 985: '4:25', 1065: '5:45' };
const TITLES = {
  600: 'Welcome',
  625: 'Topic Ideation',
  670: 'Research Question',
  780: 'Research Design',
  870: 'Research Tools',
  985: 'Research Pitches',
};

const SERIF = '"Source Serif 4", Georgia, serif';
// Heavier than the page's display numerals: a hairline cut holds too little
// infill to read at hero size.
const NUMERAL_WEIGHT = 430;
const MONO = '"Geist Mono", ui-monospace, monospace';

export async function loadEngravingFonts() {
  if (!document.fonts || !document.fonts.load) return;
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load(`${NUMERAL_WEIGHT} 64px ${SERIF}`, '10:00'),
        document.fonts.load(`500 24px ${MONO}`, 'WELCOME'),
      ]),
      new Promise((resolve) => setTimeout(resolve, 2500)),
    ]);
  } catch {
    /* fallback faces are acceptable inside an engraving */
  }
}

export function drawEngraving(N) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = N;
  const g = canvas.getContext('2d');
  const s = N / 2; // px per world unit
  const world = () => g.setTransform(s, 0, 0, s, s, s);
  const pixel = () => g.setTransform(1, 0, 0, 1, 0, 0);

  pixel();
  g.fillStyle = '#fff';
  g.fillRect(0, 0, N, N);
  g.fillStyle = '#000';
  g.strokeStyle = '#000';

  const dir = (deg) => [Math.sin(deg * DEG), -Math.cos(deg * DEG)];
  const at = (rho, deg, side = 0) => {
    // side > 0 offsets toward the clockwise neighbour
    const [dx, dz] = dir(deg);
    return [O.x + dx * rho - dz * side, O.z + dz * rho + dx * side];
  };
  const segment = (deg, r0, r1, width) => {
    if (r1 <= r0) return;
    const [x0, z0] = at(r0, deg);
    const [x1, z1] = at(r1, deg);
    world();
    g.lineWidth = width;
    g.lineCap = 'butt';
    g.beginPath();
    g.moveTo(x0, z0);
    g.lineTo(x1, z1);
    g.stroke();
  };
  const dotted = (deg, r0, r1, width, dash = 0.012) => {
    for (let r = r0; r < r1 - 1e-6; r += dash * 2) segment(deg, r, Math.min(r + dash, r1), width);
  };
  // Type set along a line, reading outward from the line origin.
  // `side` is the baseline's offset toward the clockwise neighbour (world units).
  const typeAlong = (text, deg, rho, side, font, align, spacingEm = 0) => {
    const [x, z] = at(rho, deg, side);
    pixel();
    g.translate((x + 1) * s, (z + 1) * s);
    g.rotate((deg - 90) * DEG);
    g.font = font;
    if ('letterSpacing' in g) g.letterSpacing = spacingEm ? `${spacingEm}em` : '0px';
    g.textAlign = align;
    g.textBaseline = 'alphabetic';
    g.fillText(text, 0, 0);
  };
  const measure = (text, font, spacingEm = 0) => {
    pixel();
    g.font = font;
    if ('letterSpacing' in g) g.letterSpacing = spacingEm ? `${spacingEm}em` : '0px';
    return g.measureText(text).width / s; // world units
  };
  const lineAngle = (t) => sunAt(t).lineDeg;

  const serifFont = `${NUMERAL_WEIGHT} ${((NUMERAL_CAP / 0.67) * s).toFixed(2)}px ${SERIF}`;
  const monoFont = `500 ${((TITLE_CAP / 0.71) * s).toFixed(2)}px ${MONO}`;
  const end = lineAngle(T_END);

  // Hour lines at the six session starts, each broken around its numeral.
  for (const t of [...SESSIONS, T_END]) {
    const a = lineAngle(t);
    const half = measure(NUMERALS[t], serifFont) / 2;
    const gap0 = NUMERAL_RHO - half - CLEAR;
    const gap1 = NUMERAL_RHO + half + CLEAR;
    if (t === T_END) {
      // The sun has set by 5:30, so no shadow ever reaches this line: dotted.
      dotted(a, RHO_IN + 0.04, gap0, LINE_W);
      dotted(a, gap1, RHO_OUT, LINE_W);
    } else {
      segment(a, RHO_IN, gap0, LINE_W);
      segment(a, gap1, RHO_OUT, LINE_W);
    }
    typeAlong(NUMERALS[t], a, NUMERAL_RHO, NUMERAL_CAP / 2, serifFont, 'center');
  }

  // Chapter arc: solid to sunset, dotted after it.
  const a0 = lineAngle(T_START);
  const aSet = lineAngle(SUNSET);
  const arc = (from, to, steps) => {
    world();
    g.lineWidth = FINE_W;
    g.beginPath();
    for (let i = 0; i <= steps; i++) {
      const [x, z] = at(RHO_ARC, from + ((to - from) * i) / steps);
      if (i === 0) g.moveTo(x, z);
      else g.lineTo(x, z);
    }
    g.stroke();
  };
  arc(a0, aSet, 240);
  {
    const total = (end - aSet) * DEG * RHO_ARC;
    const n = Math.floor(total / 0.024);
    for (let i = 0; i < n; i++) {
      const f0 = (i * 0.024) / total;
      const f1 = Math.min((i * 0.024 + 0.012) / total, 1);
      arc(aSet + (end - aSet) * f0, aSet + (end - aSet) * f1, 6);
    }
  }

  // Five-minute graduations outside the arc, quarter hours longer, dots after sunset.
  for (let t = T_START + 5; t < T_END; t += 5) {
    if (SESSIONS.includes(t)) continue; // the hour lines already cross the arc
    const a = lineAngle(t);
    const len = t % 15 === 0 ? 0.04 : 0.025;
    if (t > SUNSET) {
      const [x, z] = at(RHO_ARC + len * 0.55, a);
      world();
      g.beginPath();
      g.arc(x, z, FINE_W * 0.9, 0, Math.PI * 2);
      g.fill();
    } else {
      segment(a, RHO_ARC, RHO_ARC + len, FINE_W);
    }
  }

  // Session titles along each line, on its clockwise side. Each starts at the
  // smallest radius (from TITLE_RHO out) where the gap to the next line clears
  // 1.3 × cap height plus the offset, and only if it ends before the numeral.
  const side = CLEAR * 0.75 + TITLE_CAP;
  for (let i = 0; i < SESSIONS.length; i++) {
    const t = SESSIONS[i];
    const a = lineAngle(t);
    const next = i + 1 < SESSIONS.length ? lineAngle(SESSIONS[i + 1]) : end;
    const need = 1.3 * TITLE_CAP + side;
    const rho0 = Math.max(TITLE_RHO, need / Math.sin((next - a) * DEG));
    const text = TITLES[t].toUpperCase();
    const len = measure(text, monoFont, 0.12);
    const limit = NUMERAL_RHO - measure(NUMERALS[t], serifFont) / 2 - CLEAR * 2;
    if (rho0 + len > limit) continue;
    typeAlong(text, a, rho0, side, monoFont, 'left', 0.12);
  }

  pixel();
  return canvas;
}
