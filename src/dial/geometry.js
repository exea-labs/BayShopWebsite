// Dial geometry (DESIGN.md §9.2). World units: x east, y up, z south (north is −z).
import {
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  ExtrudeGeometry,
  Matrix4,
  PlaneGeometry,
  Shape,
} from 'three';

export const R = 1.0; // disc radius
export const H = 0.1; // disc thickness; the dial face is the plane y = H
const CHAMFER = 0.012; // 45° top chamfer
const FILLET = 0.003;
const BOTTOM_CHAMFER = 0.006;

// The gnomon is a bronze plate in the plane x ∈ [−0.430, −0.400] (0.03 thick:
// at hero size a 0.022 plate cast too faint a sliver at the day's opening).
// Its east face root is the origin of every afternoon hour line.
export const LINE_ORIGIN = { x: -0.4, z: 0.47 };
export const GNOMON = {
  xWest: -0.43,
  xEast: -0.4,
  zRoot: 0.47, // O: where the style meets the dial face
  zBack: 0.0225, // B and T: the vertical back edge
  height: 0.34, // run 0.4475 = height / tan(latitude), so the style points at the pole
};
export const GNOMON_HALF_T = (GNOMON.xEast - GNOMON.xWest) / 2;
export const GNOMON_MID_X = (GNOMON.xEast + GNOMON.xWest) / 2;

// Fillet tangent distance for a 135° corner.
const tangent = FILLET / Math.tan((135 * Math.PI) / 180 / 2);
export const CAP_RADIUS = R - CHAMFER - tangent;

/** Dial face: a flat cap with planar UVs u = (x + 1) / 2, v = (z + 1) / 2. */
export function createTop() {
  const geo = new CircleGeometry(CAP_RADIUS, 256);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, H, 0);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, (pos.getX(i) + 1) / 2, (pos.getZ(i) + 1) / 2);
  }
  uv.needsUpdate = true;
  return geo;
}

/**
 * Side of the disc: a lathe over a profile with a 45° chamfer and small fillets.
 * Built by hand so every profile point carries its exact analytic normal, which keeps
 * the join with the flat cap invisible and lets the chamfer catch one clean line of light.
 */
export function createSide(segments = 256) {
  const profile = []; // [r, y, nr, ny]
  const arc = (cx, cy, a0, a1, steps) => {
    for (let i = 0; i <= steps; i++) {
      const a = a0 + ((a1 - a0) * i) / steps;
      const nr = Math.cos(a);
      const ny = Math.sin(a);
      profile.push([cx + nr * FILLET, cy + ny * FILLET, nr, ny]);
    }
  };
  const s2 = Math.SQRT1_2;
  // Fillet 1: top face (normal +y) into the chamfer (normal 45°).
  {
    const cx = CAP_RADIUS;
    const cy = H - FILLET;
    arc(cx, cy, Math.PI / 2, Math.PI / 4, 6);
  }
  // Fillet 2: chamfer into the vertical side (normal +r).
  {
    const cornerR = R;
    const cornerY = H - CHAMFER;
    // tangent point on the side, `tangent` below the corner; centre is FILLET inward from it
    const cx = cornerR - FILLET;
    const cy = cornerY - tangent;
    // from the chamfer normal (45°) down to horizontal; the straight chamfer run lies
    // between the last point of fillet 1 and the first point of fillet 2
    arc(cx, cy, Math.PI / 4, 0, 6);
  }
  // Vertical side down to the bottom chamfer.
  profile.push([R, BOTTOM_CHAMFER, 1, 0]);
  profile.push([R, BOTTOM_CHAMFER, s2, -s2]);
  profile.push([R - BOTTOM_CHAMFER, 0, s2, -s2]);

  const rows = profile.length;
  const cols = segments + 1;
  const position = new Float32Array(rows * cols * 3);
  const normal = new Float32Array(rows * cols * 3);
  const uv = new Float32Array(rows * cols * 2);
  let p = 0;
  let q = 0;
  for (let j = 0; j < cols; j++) {
    const phi = (j / segments) * Math.PI * 2;
    const sin = Math.sin(phi);
    const cos = Math.cos(phi);
    for (let i = 0; i < rows; i++) {
      const [r, y, nr, ny] = profile[i];
      position[p] = r * sin;
      position[p + 1] = y;
      position[p + 2] = r * cos;
      normal[p] = nr * sin;
      normal[p + 1] = ny;
      normal[p + 2] = nr * cos;
      p += 3;
      uv[q++] = j / segments;
      uv[q++] = i / (rows - 1);
    }
  }
  const index = [];
  for (let j = 0; j < segments; j++) {
    for (let i = 0; i < rows - 1; i++) {
      const a = j * rows + i;
      const b = (j + 1) * rows + i;
      index.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(position, 3));
  geo.setAttribute('normal', new BufferAttribute(normal, 3));
  geo.setAttribute('uv', new BufferAttribute(uv, 2));
  geo.setIndex(index);
  return geo;
}

/** Gnomon: a right triangle O–B–T extruded across x with a 0.003 bevel. */
export function createGnomon() {
  const g = GNOMON;
  const bevel = 0.005;
  // Shape plane: sx = −z (north positive), sy = height above the dial face.
  const shape = new Shape();
  shape.moveTo(-g.zRoot, 0);
  shape.lineTo(-g.zBack, 0);
  shape.lineTo(-g.zBack, g.height);
  shape.closePath();
  const thickness = g.xEast - g.xWest;
  const geo = new ExtrudeGeometry(shape, {
    depth: thickness - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments: 3,
    curveSegments: 1,
    steps: 1,
  });
  // local (sx, sy, sz) → world (x = xWest + bevel + sz, y = H + sy, z = −sx); det = +1, so winding is kept.
  const m = new Matrix4().set(
    0, 0, 1, g.xWest + bevel,
    0, 1, 0, H - 0.0015, // seated very slightly into the stone so no seam of light shows
    -1, 0, 0, 0,
    0, 0, 0, 1,
  );
  geo.applyMatrix4(m);
  geo.computeVertexNormals();
  return geo;
}

/** Shadow catcher. */
export function createGround() {
  const geo = new PlaneGeometry(12, 12, 1, 1);
  geo.rotateX(-Math.PI / 2);
  return geo;
}

/** Points that bound the object, for camera framing. */
export function framingPoints() {
  const pts = [];
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    pts.push([Math.sin(a) * R, 0, Math.cos(a) * R], [Math.sin(a) * R, H, Math.cos(a) * R]);
  }
  pts.push([GNOMON.xWest, H + GNOMON.height, GNOMON.zBack], [GNOMON.xEast, H + GNOMON.height, GNOMON.zBack]);
  return pts;
}
