// The dial: honed limestone disc, verdigris-filled engraving, statuary-bronze
// gnomon, and a shadow catcher on the paper (DESIGN.md §9.1–§9.4).
import {
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshPhysicalMaterial,
  Scene,
  ShaderChunk,
  ShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
} from 'three';
import { createGnomon, createGround, createSide, createTop, GNOMON, GNOMON_HALF_T, GNOMON_MID_X, H } from './geometry.js';
import { NOISE, SHADOW } from './shaders.js';
import { shadowOutline } from './hull.js';
import { sunAt } from './sun.js';
import { createLightState, lightAt } from './light.js';
import { skyTurn } from './sky.js';

const LE = 6; // long-exposure suns

const vec2s = (n) => Array.from({ length: n }, () => new Vector2());

function worldVarying(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vDialWorld;')
    .replace(
      '#include <project_vertex>',
      '#include <project_vertex>\nvDialWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;',
    );
}

// The sky (sky.js) reaches every material through the environment; this tints
// that light with the hour without rebaking it.
const SKY_TINT = /* glsl */ `
#include <lights_fragment_maps>
iblIrradiance *= uSkyTint;
radiance *= uSkyTint;
#ifdef USE_CLEARCOAT
clearcoatRadiance *= uSkyTint;
#endif`;

function skyLight(shader, U) {
  shader.uniforms.uSkyTint = U.uSkyTint;
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform vec3 uSkyTint;')
    .replace('#include <lights_fragment_maps>', SKY_TINT);
}

// Multipliers on light.js (1 = as calibrated). Poster mode can override them
// for calibration (scripts/posters.mjs --q=sun=1.1&hemi=0.9).
export const TUNE = {
  sun: 1,
  hemi: 1,
  envStone: 1,
  envBronze: 1.4, // the waxed bronze sees more of the sky than the stone does
};

export function createDial({ maps, env, longExposure = false, tune = {} }) {
  const T = { ...TUNE, ...tune };
  const U = {
    uSoft: { value: Math.tan((0.7 * Math.PI) / 180) },
    uSun: { value: new Vector3(0, 1, 0) },
    uHullTop: { value: vec2s(6) },
    uStyleTop: { value: new Vector4() },
    uHullGround: { value: vec2s(6) },
    uStyleGround: { value: new Vector4() },
    uShadowAlpha: { value: 0.22 },
    uDiscShadow: { value: 1 }, // weight of the disc's own shadow on the paper (per view)
    uTint: { value: new Color('#18292A') },
    uRes: { value: new Vector2(1, 1) },
    uFeather: { value: 48 },
    uFoot0: { value: new Vector2(GNOMON_MID_X, GNOMON.zRoot) },
    uFoot1: { value: new Vector2(GNOMON_MID_X, GNOMON.zBack) },
    uHalfT: { value: GNOMON_HALF_T },
    // long exposure
    uHullTopLE: { value: vec2s(6 * LE) },
    uStyleTopLE: { value: Array.from({ length: LE }, () => new Vector4()) },
    uHullGroundLE: { value: vec2s(6 * LE) },
    uStyleGroundLE: { value: Array.from({ length: LE }, () => new Vector4()) },
    uSunLE: { value: Array.from({ length: LE }, () => new Vector3()) },
    uSkyTint: { value: new Color(1, 1, 1) },
    uBounce: { value: new Color(0, 0, 0) },
  };
  const defines = longExposure ? { DIAL_LONG: '' } : {};

  // ---------- Dial face ----------
  const top = new MeshPhysicalMaterial({
    map: maps.map,
    normalMap: maps.normalMap,
    aoMap: maps.ormMap,
    roughnessMap: maps.ormMap,
    roughness: 1,
    metalness: 0,
    specularIntensity: 0.62,
    aoMapIntensity: 1,
    envMap: env,
  });
  top.defines = { ...defines };
  top.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, U);
    worldVarying(shader);
    skyLight(shader, U);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vDialWorld;
uniform vec3 uSun;
uniform vec2 uHullTop[6];
uniform vec4 uStyleTop;
uniform vec2 uFoot0;
uniform vec2 uFoot1;
uniform float uHalfT;
#ifdef DIAL_LONG
uniform vec2 uHullTopLE[${6 * LE}];
uniform vec4 uStyleTopLE[${LE}];
uniform vec3 uSunLE[${LE}];
#endif
${SHADOW}
float dialSunVisibility() {
  vec2 q = vDialWorld.xz;
#ifdef DIAL_LONG
  float v = 1.0;
  for (int k = 0; k < ${LE}; k++) {
    vec2 h[6];
    for (int i = 0; i < 6; i++) h[i] = uHullTopLE[k * 6 + i];
    v *= 1.0 - 0.3 * (1.0 - dShadowVis(q, h, uStyleTopLE[k], vec2(0.0, ${GNOMON.height.toFixed(4)}), max(uSunLE[k].y, 0.02)));
  }
  return v;
#else
  return dShadowVis(q, uHullTop, uStyleTop, vec2(0.0, ${GNOMON.height.toFixed(4)}), max(uSun.y, 0.02));
#endif
}
float dialFootAO() {
  float d = dSdSegment(vDialWorld.xz, uFoot0, uFoot1) - uHalfT;
  return 1.0 - 0.4 * exp(-max(d, 0.0) / 0.012);
}`,
      )
      .replace(
        '#include <aomap_fragment>',
        ShaderChunk.aomap_fragment.replace(
          'float ambientOcclusion = ( texture2D( aoMap, vAoMapUv ).r - 1.0 ) * aoMapIntensity + 1.0;',
          'float ambientOcclusion = ( ( texture2D( aoMap, vAoMapUv ).r - 1.0 ) * aoMapIntensity + 1.0 ) * dialFootAO();',
        ),
      )
      .replace(
        '#include <lights_fragment_begin>',
        'float dialVis = dialSunVisibility() * mix(0.72, 1.0, dialFootAO());\n' +
          ShaderChunk.lights_fragment_begin.replace(
            'getDirectionalLightInfo( directionalLight, directLight );',
            'getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= dialVis;',
          ),
      );
  };

  // ---------- Disc sides: the same stone, with bedding and ground contact ----------
  // A sawn edge shows the limestone's bedding as faint horizontal strata, and
  // the sky light falls off toward the foot where the paper occludes it.
  const side = new MeshPhysicalMaterial({
    color: new Color('#E7E1D4').multiplyScalar(0.97),
    roughness: 0.6,
    metalness: 0,
    specularIntensity: 0.55,
    envMap: env,
  });
  side.onBeforeCompile = (shader) => {
    worldVarying(shader);
    skyLight(shader, U);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vDialWorld;\n${NOISE}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
float ang = atan(vDialWorld.x, vDialWorld.z);
vec2 sp = vec2(ang * 2.0, vDialWorld.y * 6.0);
float bed = dFbm(vec2(ang * 1.5, vDialWorld.y * 70.0 + dFbm(vec2(ang * 4.0, 1.7)) * 3.0)) - 0.5;
diffuseColor.rgb *= 1.0 + (dFbm(vDialWorld.xz * 2.3 + 4.1 + sp * 0.4) - 0.5) * 0.08 + bed * 0.07;`,
      )
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
float foot = mix(0.42, 1.0, smoothstep(0.0, 0.085, vDialWorld.y));
reflectedLight.indirectDiffuse *= foot;
reflectedLight.indirectSpecular *= foot;`,
      );
  };

  // ---------- Gnomon: a waxed dark-bronze blade with polished arrises ----------
  // The faces are a near-black statuary patina under a wax coat, so the plate
  // reads as a dark blade against the pale stone. Low down they pick up warm
  // light bounced from the sunlit stone they stand on, fading up the blade.
  // Only the bevels are polished: hairlines of warm light along each arris,
  // brightest on the sloping style, which faces the low sun. A faint mottle
  // keeps the patina hand-finished without reading as dirt.
  const bronze = new MeshPhysicalMaterial({
    color: new Color('#ffffff'),
    metalness: 1,
    roughness: 1,
    clearcoat: 0.6,
    clearcoatRoughness: 0.16,
    anisotropy: 0.35,
    anisotropyRotation: Math.atan2(GNOMON.height, GNOMON.zRoot - GNOMON.zBack),
    envMap: env,
  });
  bronze.onBeforeCompile = (shader) => {
    skyLight(shader, U);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDialNormal;\nvarying vec3 vDialPos;')
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvDialNormal = normalize(mat3(modelMatrix) * objectNormal);')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvDialPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vDialNormal;\nvarying vec3 vDialPos;\n${NOISE}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
float nx = abs(normalize(vDialNormal).x);
// polished: only the bevels, as hairlines along every arris (the style's catch
// the low sun); patina: the broad faces, the back and the narrow top face, so
// from overhead the blade stays dark instead of reading as a gold bar
float polish = smoothstep(0.15, 0.35, nx) * (1.0 - smoothstep(0.86, 0.97, nx));
float mottle = dFbm(vDialPos.zy * 38.0 + vDialPos.x * 9.0) - 0.5;
vec3 patina = vec3(0.034, 0.024, 0.017) * (1.0 + mottle * 0.5);
diffuseColor.rgb = mix(patina, vec3(0.62, 0.42, 0.22), polish);
float dialMetal = mix(0.3, 1.0, polish);`,
      )
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = dialMetal;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.4 + mottle * 0.1, 0.2, polish);')
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
// light bounced up from the sunlit stone: warm at the root, fading up the blade
reflectedLight.indirectDiffuse += diffuseColor.rgb * uBounce * 2.2 * exp(-max(vDialPos.y - ${H.toFixed(3)}, 0.0) / 0.12);`,
      );
    shader.uniforms.uBounce = U.uBounce;
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uBounce;');
  };

  // ---------- Shadow catcher on the paper (outputs sRGB tint + alpha) ----------
  const ground = new ShaderMaterial({
    defines: { ...defines },
    uniforms: U,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: 2,
    polygonOffsetUnits: 2,
    toneMapped: false,
    vertexShader: /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`,
    fragmentShader: /* glsl */ `
uniform vec3 uSun;
uniform vec2 uHullGround[6];
uniform vec4 uStyleGround;
uniform float uShadowAlpha;
uniform float uDiscShadow;
uniform vec3 uTint;
uniform vec2 uRes;
uniform float uFeather;
#ifdef DIAL_LONG
uniform vec2 uHullGroundLE[${6 * LE}];
uniform vec4 uStyleGroundLE[${LE}];
uniform vec3 uSunLE[${LE}];
#endif
varying vec3 vWorld;
${SHADOW}
void main() {
  vec2 q = vWorld.xz;
  vec2 hgt = vec2(${H.toFixed(3)}, ${(H + GNOMON.height).toFixed(4)});
#ifdef DIAL_LONG
  float keep = 1.0;
  for (int k = 0; k < ${LE}; k++) {
    vec2 h[6];
    for (int i = 0; i < 6; i++) h[i] = uHullGroundLE[k * 6 + i];
    // the gnomon's six traces only; six stacked disc shadows would be a blot
    float vk = dShadowVis(q, h, uStyleGroundLE[k], hgt, max(uSunLE[k].y, 0.02));
    keep *= 1.0 - (1.0 - vk) * 0.09;
  }
  float shadowA = 1.0 - keep;
#else
  float discA = (1.0 - dDiscVis(q, uSun)) * uDiscShadow;
  float gnomonA = 1.0 - dShadowVis(q, uHullGround, uStyleGround, hgt, max(uSun.y, 0.02));
  float shadowA = max(discA, gnomonA) * uShadowAlpha;
#endif
  // contact: a stone this heavy presses a crisp dark line into the paper
  float ao = 1.0 - 0.6 * exp(-max(length(q) - 1.0, 0.0) / 0.026);
  float a = min(0.36, shadowA + (1.0 - ao) * 0.3);
  a *= 1.0 - smoothstep(2.4, 3.6, length(q));
  vec2 fc = gl_FragCoord.xy;
  float edge = min(min(fc.x, fc.y), min(uRes.x - fc.x, uRes.y - fc.y));
  a *= smoothstep(0.0, uFeather, edge);
  gl_FragColor = vec4(uTint, a);
}`,
  });

  // ---------- Scene ----------
  const scene = new Scene();
  const topMesh = new Mesh(createTop(), top);
  const sideMesh = new Mesh(createSide(), side);
  const gnomonMesh = new Mesh(createGnomon(), bronze);
  const groundMesh = new Mesh(createGround(), ground);
  groundMesh.renderOrder = 1;
  for (const m of [topMesh, sideMesh, gnomonMesh, groundMesh]) {
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    scene.add(m);
  }

  const sun = new DirectionalLight(0xffffff, 1);
  sun.matrixAutoUpdate = false;
  const hemi = new HemisphereLight(0xffffff, 0xffffff, 1);
  // Afterglow: one-sided (black ground colour), from the west-south-west sky
  // just after sunset, so only the faces turned toward it warm up.
  const glow = new HemisphereLight(0xffb27a, 0x000000, 0);
  glow.position.set(-0.93, 0.12, 0.35);
  glow.updateMatrixWorld();
  scene.add(sun, sun.target, hemi, glow);

  const L = createLightState();
  const tmp = new Vector3();

  /** Set solar time (minutes after midnight, PST). */
  function setTime(minutes) {
    const s = sunAt(minutes);
    const d = s.dir;
    U.uSun.value.set(d[0], d[1], d[2]);
    shadowOutline(d, H, U.uHullTop.value, U.uStyleTop.value);
    shadowOutline(d, 0, U.uHullGround.value, U.uStyleGround.value);
    lightAt(s.elDeg, L);
    sun.position.copy(tmp.set(d[0], d[1], d[2]).multiplyScalar(10));
    sun.updateMatrix();
    sun.updateMatrixWorld();
    sun.color.copy(L.sun);
    sun.intensity = L.sunI * T.sun;
    // the hemisphere is a small neutral fill under the sky's own light
    hemi.color.copy(L.sky);
    hemi.groundColor.set(0xd9d0c0).multiply(L.sky);
    hemi.intensity = L.hemiI * T.hemi;
    glow.intensity = L.glowI;
    U.uSkyTint.value.copy(L.sky);
    // sunlit stone (#E7E1D4) seen from the gnomon's foot, over a hemisphere
    U.uBounce.value.setRGB(0.8, 0.75, 0.66).multiply(L.sun).multiplyScalar(L.faceE * 0.35);
    top.envMapIntensity = side.envMapIntensity = L.env * T.envStone;
    bronze.envMapIntensity = L.env * T.envBronze;
    const turn = skyTurn(s.azDeg);
    top.envMapRotation.y = side.envMapRotation.y = bronze.envMapRotation.y = turn;
    U.uShadowAlpha.value = L.shadowAlpha;
    U.uTint.value.copy(L.shadowTint);
    top.normalScale.setScalar(L.relief);
    return s;
  }

  /** Long exposure: six session suns at once, lit by `litBy`. */
  function setLongExposure(times, litBy) {
    times.forEach((t, k) => {
      const d = sunAt(t).dir;
      U.uSunLE.value[k].set(d[0], d[1], d[2]);
      const hullT = U.uHullTopLE.value.slice(k * 6, k * 6 + 6);
      const hullG = U.uHullGroundLE.value.slice(k * 6, k * 6 + 6);
      shadowOutline(d, H, hullT, U.uStyleTopLE.value[k]);
      shadowOutline(d, 0, hullG, U.uStyleGroundLE.value[k]);
    });
    return setTime(litBy);
  }

  function setViewport(width, height, featherPx) {
    U.uRes.value.set(width, height);
    U.uFeather.value = featherPx;
  }

  /** How strongly the disc's own shadow shows on the paper (1 hero, lighter overhead). */
  function setDiscShadow(w) {
    U.uDiscShadow.value = w;
  }

  function dispose() {
    for (const m of [topMesh, sideMesh, gnomonMesh, groundMesh]) {
      m.geometry.dispose();
      m.material.dispose();
    }
    maps.dispose();
  }

  return { scene, setTime, setLongExposure, setViewport, setDiscShadow, dispose };
}
