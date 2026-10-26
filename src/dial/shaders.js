// GLSL shared by the bake passes and the dial materials.
// World: x east, y up, z south. The dial face is the plane y = 0.1, the paper is y = 0.

export const NOISE = /* glsl */ `
float dHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float dNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(dHash(i), dHash(i + vec2(1.0, 0.0)), u.x),
             mix(dHash(i + vec2(0.0, 1.0)), dHash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float dFbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    s += a * dNoise(p);
    p = mat2(1.6, 1.2, -1.2, 1.6) * p + 17.13;
    a *= 0.5;
  }
  return s / 0.875;
}
`;

// Analytic shadows (DESIGN.md §9.4, §A.2). The CPU projects the gnomon prism
// along the sun onto each receiving plane and passes its convex hull (6 points,
// padded by repeating the last). Distances are exact, so edges are crisp and
// acne-free; the penumbra widens with the height of the occluding style point.
export const SHADOW = /* glsl */ `
uniform float uSoft;

float dSdSegment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-10), 0.0, 1.0);
  return length(pa - ba * h);
}

// Signed distance to a simple polygon (after Inigo Quilez), negative inside.
float dSdPoly6(vec2 p, vec2 v[6]) {
  float d = dot(p - v[0], p - v[0]);
  float s = 1.0;
  for (int i = 0; i < 6; i++) {
    int j = (i + 5) % 6;
    vec2 e = v[j] - v[i];
    vec2 w = p - v[i];
    vec2 b = w - e * clamp(dot(w, e) / max(dot(e, e), 1e-12), 0.0, 1.0);
    d = min(d, dot(b, b));
    bvec3 c = bvec3(p.y >= v[i].y, p.y < v[j].y, e.x * w.y > e.y * w.x);
    if (all(c) || all(not(c))) s *= -1.0;
  }
  return s * sqrt(d);
}

// 0 in shadow, 1 lit. style = projected style segment (root.xy, tip.zw);
// hgt = occluder height above the plane at the root and at the tip.
float dShadowVis(vec2 q, vec2 hull[6], vec4 style, vec2 hgt, float sunY) {
  float sd = dSdPoly6(q, hull);
  vec2 a = style.xy;
  vec2 st = style.zw - a;
  float k = clamp(dot(q - a, st) / max(dot(st, st), 1e-10), 0.0, 1.0);
  float w = max(mix(hgt.x, hgt.y, k) / sunY * uSoft, 0.0012);
  return smoothstep(-w, w, sd);
}

// A vertical cylinder (the disc, radius 1, height 0.1) casts a capsule on the paper.
float dDiscVis(vec2 q, vec3 sun) {
  float sy = max(sun.y, 0.02);
  vec2 c1 = -sun.xz * (0.1 / sy);
  float sd = dSdSegment(q, vec2(0.0), c1) - 1.0;
  float w = max(0.1 / sy * uSoft, 0.0012);
  return smoothstep(-w, w, sd);
}
`;

export const FULLSCREEN_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;
