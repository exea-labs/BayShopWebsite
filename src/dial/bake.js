// One-time bake (DESIGN.md §9.2): the Canvas2D engraving height map becomes the
// stone's albedo, tangent-space normal and occlusion/roughness/metalness maps.
// Everything is generated here; the dial downloads no textures.
import {
  CanvasTexture,
  HalfFloatType,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  NoColorSpace,
  OrthographicCamera,
  PlaneGeometry,
  RGBAFormat,
  SRGBColorSpace,
  Scene,
  ShaderMaterial,
  UnsignedByteType,
  Vector2,
  WebGLRenderTarget,
} from 'three';
import { FULLSCREEN_VERT, NOISE } from './shaders.js';

const BLUR_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uStep;
uniform float uW[5];
varying vec2 vUv;
void main() {
  float h = texture2D(tSrc, vUv).r * uW[0];
  for (int i = 1; i < 5; i++) {
    vec2 o = uStep * float(i);
    h += (texture2D(tSrc, vUv + o).r + texture2D(tSrc, vUv - o).r) * uW[i];
  }
  gl_FragColor = vec4(h, h, h, 1.0);
}
`;

// Honed limestone, shared by the albedo, normal and roughness passes so the
// sheen breaks up exactly where the texture does: soft drifts under a domain
// warp, faint bedding veils, fine sand grain, sparse dark specks and a few pale
// fossil flecks. p is world xz in [-1, 1]; uN scales the finest grain to the map.
const STONE = /* glsl */ `
float sCloud(vec2 p) {
  vec2 w = vec2(dFbm(p * 1.6 + 3.1), dFbm(p * 1.6 - 7.7)) - 0.5;
  return dFbm(p * 2.1 + w * 1.8) - 0.5;
}
float sVeil(vec2 p) {
  vec2 q = vec2(p.x * 0.9 + p.y * 0.25, p.y * 4.5 - p.x * 0.6);
  return dFbm(q * 3.0 + 11.0) - 0.5;
}
float sGrain(vec2 p, float n) {
  // sand grain at a fixed world scale (coarser only if the map cannot hold it);
  // the finer octave only on 2048 maps
  float fine = smoothstep(1200.0, 2048.0, n);
  return (dNoise(p * min(330.0, n * 0.16)) - 0.5) * 0.7 + (dNoise(p * 740.0 + 9.1) - 0.5) * 0.3 * fine;
}
float sSpeck(vec2 p) {
  vec2 c = floor(p * 90.0);
  vec2 g = fract(p * 90.0);
  if (dHash(c + 5.3) > 0.035) return 0.0;
  vec2 o = vec2(dHash(c + 1.7), dHash(c + 8.1)) * 0.6 + 0.2;
  float rad = 0.16 + 0.18 * dHash(c + 2.9);
  return 1.0 - smoothstep(rad * 0.35, rad, length(g - o));
}
float sFleck(vec2 p) {
  vec2 c = floor(p * 16.0);
  vec2 g = fract(p * 16.0) - 0.5;
  if (dHash(c + 31.7) > 0.22) return 0.0;
  float a = dHash(c + 4.4) * 6.2832;
  vec2 o = (vec2(dHash(c + 12.9), dHash(c + 19.1)) - 0.5) * 0.4;
  vec2 q = mat2(cos(a), -sin(a), sin(a), cos(a)) * (g - o);
  float len = 0.12 + 0.16 * dHash(c + 7.3);
  float d = length(vec2(q.x / len, q.y / 0.035));
  return (1.0 - smoothstep(0.6, 1.0, d)) * (0.5 + 0.5 * dHash(c + 2.2));
}
`;

// Linear-light values of #E7E1D4 (stone) and #2B5A53 (verdigris infill).
const ALBEDO_FRAG = /* glsl */ `
uniform sampler2D tH;
uniform float uN;
varying vec2 vUv;
${NOISE}
${STONE}
void main() {
  float depth = 1.0 - texture2D(tH, vUv).r;
  vec2 p = vUv * 2.0 - 1.0;
  float cloud = sCloud(p);
  float veil = sVeil(p);
  float grain = sGrain(p, uN);
  float m = cloud * 0.16 + veil * 0.05 + grain * 0.034;
  // darker drifts run a touch warmer, lighter ones a touch cooler
  vec3 tint = vec3(1.0 - cloud * 0.03, 1.0, 1.0 + cloud * 0.05);
  vec3 stone = vec3(0.7991, 0.7529, 0.6584) * tint * (1.0 + m);
  stone *= 1.0 - 0.22 * sSpeck(p);
  stone = mix(stone, vec3(0.86, 0.82, 0.73), 0.55 * sFleck(p));
  vec3 infill = vec3(0.0242, 0.1022, 0.0865);
  vec3 col = mix(stone, infill, smoothstep(0.10, 0.72, depth));
  gl_FragColor = vec4(col, 1.0);
}
`;

const NORMAL_FRAG = /* glsl */ `
uniform sampler2D tH;
uniform vec2 uTexel;
uniform float uSlope;
uniform float uMicro;
uniform float uN;
varying vec2 vUv;
${NOISE}
${STONE}
void main() {
  float hl = texture2D(tH, vUv - vec2(uTexel.x, 0.0)).r;
  float hr = texture2D(tH, vUv + vec2(uTexel.x, 0.0)).r;
  float hd = texture2D(tH, vUv - vec2(0.0, uTexel.y)).r;
  float hu = texture2D(tH, vUv + vec2(0.0, uTexel.y)).r;
  vec2 g = vec2(hr - hl, hu - hd) * 0.5 * uSlope;
  vec2 p = vUv * 2.0 - 1.0;
  // grain relief (the same field as the albedo) and a faint honing waviness
  float e = 2.0 / uN;
  vec2 gr = vec2(sGrain(p + vec2(e, 0.0), uN) - sGrain(p - vec2(e, 0.0), uN),
                 sGrain(p + vec2(0.0, e), uN) - sGrain(p - vec2(0.0, e), uN));
  vec2 wave = vec2(dFbm(p * 7.0 + vec2(0.05, 0.0)) - dFbm(p * 7.0 - vec2(0.05, 0.0)),
                   dFbm(p * 7.0 + vec2(0.0, 0.05)) - dFbm(p * 7.0 - vec2(0.0, 0.05)));
  vec3 n = normalize(vec3(-g + gr * uMicro + wave * 0.02, 1.0));
  gl_FragColor = vec4(n * 0.5 + 0.5, 1.0);
}
`;

const ORM_FRAG = /* glsl */ `
uniform sampler2D tH;
uniform float uN;
varying vec2 vUv;
${NOISE}
${STONE}
void main() {
  float depth = 1.0 - texture2D(tH, vUv).r;
  vec2 p = vUv * 2.0 - 1.0;
  float cut = smoothstep(0.08, 0.8, depth);
  float ao = mix(1.0, 0.62, cut);
  // honed, not polished: a satin face whose gloss drifts with the stone
  float rough = 0.44 + sCloud(p) * 0.10 + sGrain(p, uN) * 0.08 + sSpeck(p) * 0.15;
  rough = mix(rough, 0.86, cut);
  gl_FragColor = vec4(ao, rough, 0.0, 1.0);
}
`;

function gaussian(sigma) {
  const w = [];
  let sum = 0;
  for (let i = 0; i < 5; i++) {
    w[i] = Math.exp(-(i * i) / (2 * sigma * sigma));
    sum += i === 0 ? w[i] : 2 * w[i];
  }
  return w.map((v) => v / sum);
}

/**
 * @param {import('three').WebGLRenderer} renderer
 * @param {HTMLCanvasElement} heightCanvas  white = honed surface, black = bottom of a cut
 * @returns {{ map, normalMap, ormMap, dispose }}
 */
export function bakeStone(renderer, heightCanvas, { anisotropy = 1 } = {}) {
  const N = heightCanvas.width;
  const gl = renderer.getContext();
  const halfFloat =
    renderer.capabilities.isWebGL2 !== false &&
    (gl.getExtension('EXT_color_buffer_half_float') || gl.getExtension('EXT_color_buffer_float'));

  const source = new CanvasTexture(heightCanvas);
  source.flipY = false; // texture v = canvas row / N, so v = (z + 1) / 2 like the cap's UVs
  source.colorSpace = NoColorSpace;
  source.generateMipmaps = false;
  source.minFilter = LinearFilter;
  source.magFilter = LinearFilter;

  const flat = {
    type: halfFloat ? HalfFloatType : UnsignedByteType,
    format: RGBAFormat,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    depthBuffer: false,
    generateMipmaps: false,
  };
  const blurA = new WebGLRenderTarget(N, N, flat);
  const blurB = new WebGLRenderTarget(N, N, flat);

  const mipmapped = (colorSpace) =>
    new WebGLRenderTarget(N, N, {
      type: UnsignedByteType,
      format: RGBAFormat,
      colorSpace,
      generateMipmaps: true,
      minFilter: LinearMipmapLinearFilter,
      magFilter: LinearFilter,
      anisotropy,
      depthBuffer: false,
    });
  const albedo = mipmapped(SRGBColorSpace);
  const normal = mipmapped(NoColorSpace);
  const orm = mipmapped(NoColorSpace);

  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new Mesh(new PlaneGeometry(2, 2));
  quad.frustumCulled = false;
  scene.add(quad);

  const weights = gaussian(Math.max(0.6, (1.2 * N) / 2048));
  const texel = 1 / N;
  const blur = new ShaderMaterial({
    vertexShader: FULLSCREEN_VERT,
    fragmentShader: BLUR_FRAG,
    uniforms: { tSrc: { value: null }, uStep: { value: new Vector2() }, uW: { value: weights } },
    depthTest: false,
    depthWrite: false,
  });
  const make = (fragmentShader, uniforms) =>
    new ShaderMaterial({ vertexShader: FULLSCREEN_VERT, fragmentShader, uniforms, depthTest: false, depthWrite: false });

  const passes = [
    [blur, blurA, () => { blur.uniforms.tSrc.value = source; blur.uniforms.uStep.value.set(texel, 0); }],
    [blur, blurB, () => { blur.uniforms.tSrc.value = blurA.texture; blur.uniforms.uStep.value.set(0, texel); }],
    [make(ALBEDO_FRAG, { tH: { value: blurB.texture }, uN: { value: N } }), albedo],
    [
      make(NORMAL_FRAG, {
        tH: { value: blurB.texture },
        uTexel: { value: new Vector2(texel, texel) },
        // groove wall slope: depth 0.0024 world units over a texel of 2 / N
        uSlope: { value: (0.0024 * N) / 2 },
        uMicro: { value: 0.18 * Math.min(1, N / 2048) },
        uN: { value: N },
      }),
      normal,
    ],
    [make(ORM_FRAG, { tH: { value: blurB.texture }, uN: { value: N } }), orm],
  ];

  const prevTarget = renderer.getRenderTarget();
  const prevAutoClear = renderer.autoClear;
  const prevTone = renderer.toneMapping;
  renderer.autoClear = true;
  renderer.toneMapping = 0; // NoToneMapping for data passes
  for (const [material, target, before] of passes) {
    if (before) before();
    quad.material = material;
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
  }
  renderer.setRenderTarget(prevTarget);
  renderer.autoClear = prevAutoClear;
  renderer.toneMapping = prevTone;

  // Free everything except the three maps.
  for (const [material] of passes) material.dispose();
  quad.geometry.dispose();
  source.dispose();
  blurA.dispose();
  blurB.dispose();

  return {
    map: albedo.texture,
    normalMap: normal.texture,
    ormMap: orm.texture,
    dispose() {
      albedo.dispose();
      normal.dispose();
      orm.dispose();
    },
  };
}
