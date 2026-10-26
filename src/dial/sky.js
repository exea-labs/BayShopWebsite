// The dial's image-based light: an outdoor winter sky instead of a studio box.
// A soft blue zenith, a pale haze at the horizon, a broad aureole around the
// sun, and a warm ground that bounces the sunlit paper. Baked once into a PMREM
// with the aureole at the 12:30 sun; each material then turns it about the
// vertical to follow the sun's azimuth (envMapRotation) and tints it with the
// hour (uSkyTint), so the bronze reflects a sky and the stone is filled by one.
import { BackSide, Mesh, PMREMGenerator, Scene, ShaderMaterial, SphereGeometry, Vector3 } from 'three';
import { sunAt, T_START } from './sun.js';

const DEG = Math.PI / 180;

/** Azimuth (degrees east of north) at which the aureole is baked. */
export const SKY_AZ = sunAt(T_START).azDeg;

const SKY_FRAG = /* glsl */ `
uniform vec3 uSun;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float e = d.y;
  // linear radiance; the materials scale it with envMapIntensity
  vec3 zenith = vec3(0.40, 0.49, 0.64);
  vec3 haze = vec3(0.90, 0.88, 0.84);
  vec3 sky = mix(haze, zenith, pow(clamp(e, 0.0, 1.0), 0.55));
  float c = max(dot(d, uSun), 0.0);
  sky += vec3(1.0, 0.93, 0.80) * (1.6 * pow(c, 48.0) + 0.55 * pow(c, 6.0));
  // ground: the sunlit page and stone around the dial, darker toward the nadir
  vec3 ground = vec3(0.66, 0.60, 0.50) * mix(0.55, 1.0, smoothstep(-1.0, -0.05, e));
  vec3 col = mix(ground, sky, smoothstep(-0.03, 0.04, e));
  gl_FragColor = vec4(col, 1.0);
}`;

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

/** @returns {{ texture: import('three').Texture, dispose(): void }} */
export function bakeSky(renderer) {
  const s = sunAt(T_START).dir;
  const scene = new Scene();
  const geo = new SphereGeometry(10, 64, 32);
  const mat = new ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    uniforms: { uSun: { value: new Vector3(s[0], s[1], s[2]) } },
    side: BackSide,
    depthWrite: false,
    depthTest: false,
  });
  scene.add(new Mesh(geo, mat));
  const pmrem = new PMREMGenerator(renderer);
  const target = pmrem.fromScene(scene, 0, 0.1, 100);
  pmrem.dispose();
  geo.dispose();
  mat.dispose();
  return { texture: target.texture, dispose: () => target.dispose() };
}

/** envMapRotation.y that carries the baked aureole to the sun at `azDeg`. */
export function skyTurn(azDeg) {
  return (SKY_AZ - azDeg) * DEG;
}
