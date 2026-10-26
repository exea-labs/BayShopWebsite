// The dial renderer (DESIGN.md §9.6). One WebGLRenderer and one canvas. The
// canvas is parented into whichever figure ([data-view]) is most visible, so it
// scrolls natively with the page (no swimming on touch) and inherits the
// figure's stacking. Rendering is on demand: scroll, resize, pointer easing and
// time changes request a frame; otherwise nothing is drawn.
import { NeutralToneMapping, PerspectiveCamera, SRGBColorSpace, Vector3, WebGLRenderer } from 'three';
import { drawEngraving, loadEngravingFonts } from './engraving.js';
import { bakeStone } from './bake.js';
import { createDial } from './scene.js';
import { place, VIEWS } from './camera.js';
import { SESSIONS, T_END, T_START } from './sun.js';
import { bakeSky } from './sky.js';

const idle = (fn) =>
  new Promise((resolve, reject) => {
    const run = () => {
      try {
        resolve(fn());
      } catch (err) {
        reject(err);
      }
    };
    if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 500 });
    else setTimeout(run, 16);
  });

const clamp = (v, a, b) => Math.min(Math.max(v, a), b);

function createRenderer(canvas, preserveDrawingBuffer = false) {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    premultipliedAlpha: true,
    powerPreference: 'high-performance',
    preserveDrawingBuffer,
  });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  return renderer;
}

function rendererName(renderer) {
  const gl = renderer.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return String((ext && gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || '');
}

async function compile(renderer, scene, camera) {
  if (renderer.extensions.has('KHR_parallel_shader_compile')) await renderer.compileAsync(scene, camera);
  else renderer.compile(scene, camera);
}

async function buildDial(renderer, size, { longExposure = false, tune } = {}) {
  await loadEngravingFonts();
  const engraving = await idle(() => drawEngraving(size));
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const maps = await idle(() => bakeStone(renderer, engraving, { anisotropy }));
  const env = await idle(() => bakeSky(renderer));
  const dial = createDial({ maps, env: env.texture, longExposure, tune });
  const dispose = dial.dispose;
  dial.dispose = () => {
    dispose();
    env.dispose();
  };
  return dial;
}

/* ------------------------------------------------------------------------ */
/* Posters: one frame at the exact poster size (scripts/posters.mjs).        */
/* ------------------------------------------------------------------------ */

const HOURS_DISC_SHADOW = 1;
const HERO_SWEEP = 70; // 10:00 to the 11:10 research-question milestone

export const POSTERS = {
  'hero-d': { width: 1600, height: 1000, view: 'hero-d' },
  'hero-m': { width: 780, height: 600, view: 'hero-m' },
  hours: { width: 1200, height: 1200, view: 'hours', longExposure: true },
};

export async function renderPoster(id, { tune, samples = [], time, cam, disc } = {}) {
  const spec = { ...POSTERS[id] };
  if (time) Object.assign(spec, { time, longExposure: false });
  if (cam) Object.assign(VIEWS[spec.view], cam);
  const canvas = document.createElement('canvas');
  canvas.width = spec.width;
  canvas.height = spec.height;
  canvas.style.cssText = `position:fixed;left:0;top:0;width:${spec.width}px;height:${spec.height}px`;
  document.body.appendChild(canvas);
  const renderer = createRenderer(canvas, true);
  renderer.setPixelRatio(1);
  renderer.setSize(spec.width, spec.height, false);
  const dial = await buildDial(renderer, 2048, { longExposure: !!spec.longExposure, tune });
  const camera = new PerspectiveCamera(20, 1, 0.05, 200);
  place(camera, spec.view, spec.width / spec.height);
  if (spec.longExposure) dial.setLongExposure(SESSIONS, 870);
  else dial.setTime(spec.time || T_START);
  dial.setViewport(spec.width, spec.height, 96);
  dial.setDiscShadow(disc ?? (spec.view === 'hours' ? HOURS_DISC_SHADOW : 1));
  await compile(renderer, dial.scene, camera);
  renderer.render(dial.scene, camera);
  // Read back named world points (for calibration against DESIGN.md §4.4).
  const gl = renderer.getContext();
  const px = new Uint8Array(4);
  const read = samples.map(({ name, p }) => {
    const v = new Vector3(...p).project(camera);
    const x = Math.round((v.x * 0.5 + 0.5) * spec.width);
    const y = Math.round((v.y * 0.5 + 0.5) * spec.height);
    gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return { name, x, y: spec.height - y, rgba: [...px] };
  });
  return { url: canvas.toDataURL('image/png'), renderer: rendererName(renderer), samples: read };
}

/* ------------------------------------------------------------------------ */
/* Live views                                                                */
/* ------------------------------------------------------------------------ */

/**
 * @param {object} o
 * @param {{ tau: number, smooth: boolean }} o.store  τ in minutes after 10:00, set by the schedule
 * @param {(fn: () => void) => void} o.onScroll        subscribe to the page's scroll frames
 */
export async function mountDial({ store, onScroll }) {
  const figures = [...document.querySelectorAll('[data-view]')];
  if (!figures.length) return null;

  const fine = matchMedia('(pointer: fine)').matches;
  const automation = navigator.webdriver === true;
  const canvas = document.createElement('canvas');
  canvas.className = 'view__canvas';
  canvas.setAttribute('aria-hidden', 'true');

  const renderer = createRenderer(canvas);
  const software = /swiftshader|llvmpipe|softpipe|software/i.test(rendererName(renderer));
  // Software renderers start on the low tier, except under automation, where
  // screenshots should show what a real GPU renders.
  const lowTier = software && !automation;
  const narrowStart = innerWidth < 768;
  const texSize = lowTier || narrowStart || !fine ? 1024 : 2048;

  const views = figures.map((el) => ({
    el,
    id: el.dataset.view,
    frame: el.querySelector('.view__frame') || el,
    section: el.closest('section') || el,
    rect: null,
  }));

  let dial;
  try {
    dial = await buildDial(renderer, texSize);
  } catch (err) {
    renderer.dispose();
    throw err;
  }

  const camera = new PerspectiveCamera(20, 1, 0.05, 200);
  let active = null;
  let raf = 0;
  let last = performance.now();
  let stopped = false;
  let dprCap = Infinity; // lowered by the governor
  let continuous = false; // the previous frame asked for the next one, or scroll is running
  let size = { w: 0, h: 0, dpr: 0 };
  let tau = store.tau || 0;
  let shownTime = -1;
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const frames = [];

  let scrolled = false;
  const request = () => {
    if (!raf && !stopped && !document.hidden) raf = requestAnimationFrame(frame);
  };
  const onPageScroll = () => {
    scrolled = true;
    request();
  };

  function attach(view) {
    if (active) active.el.classList.remove('is-live');
    view.frame.appendChild(canvas);
    active = view;
    size = { w: 0, h: 0, dpr: 0 };
    shownTime = -1;
  }

  function resize(w, h) {
    const narrow = innerWidth < 768;
    let dpr = Math.min(devicePixelRatio || 1, narrow ? 2 : 1.5);
    if (lowTier) dpr = 1;
    dpr = Math.min(dpr, Math.sqrt(2.4e6 / Math.max(w * h, 1)), dprCap);
    dpr = Math.max(1, Math.round(dpr * 100) / 100);
    if (w === size.w && h === size.h && dpr === size.dpr) return;
    size = { w, h, dpr };
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    dial.setViewport(Math.round(w * dpr), Math.round(h * dpr), 48 * dpr);
  }

  // Quality governor (DESIGN.md §9.7): over 60 consecutive rendered frames, a
  // median above 22 ms steps DPR down by 0.25; above 33 ms at DPR 1 the live
  // view stops and the posters return. Automation is exempt from the stop.
  function governor(dt) {
    if (!continuous || dt <= 0 || dt > 0.1) return;
    frames.push(dt * 1000);
    if (frames.length < 60) return;
    const median = frames.slice().sort((a, b) => a - b)[30];
    frames.length = 0;
    if (median > 22 && size.dpr > 1.001) {
      dprCap = Math.max(1, size.dpr - 0.25);
      size.dpr = 0;
    } else if (median > 33 && size.dpr <= 1.001 && !automation) {
      stop(true);
    }
  }

  function frame(now) {
    raf = 0;
    if (stopped) return;
    const dt = Math.min((now - last) / 1000, 0.25);
    last = now;

    let best = null;
    let bestArea = 0;
    const vw = innerWidth;
    const vh = innerHeight;
    for (const v of views) {
      const r = v.frame.getBoundingClientRect();
      v.rect = r;
      const area = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0)) * Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
      if (area > bestArea) {
        bestArea = area;
        best = v;
      }
    }
    if (!best) return; // both views off-screen: idle
    if (best !== active) attach(best);

    const r = best.rect;
    resize(Math.max(1, Math.round(r.width)), Math.max(1, Math.round(r.height)));
    const aspect = r.width / Math.max(r.height, 1);
    let moving = false;

    if (best.id === 'hero') {
      const k = fine ? 1 - Math.exp(-4 * dt) : 1;
      pointer.x += (pointer.tx - pointer.x) * k;
      pointer.y += (pointer.ty - pointer.y) * k;
      moving = Math.abs(pointer.tx - pointer.x) > 1e-4 || Math.abs(pointer.ty - pointer.y) > 1e-4;
      const s = best.section.getBoundingClientRect();
      const exit = clamp(-s.top / Math.max(s.height, 1), 0, 1);
      place(camera, innerWidth < 768 ? 'hero-m' : 'hero-d', aspect, {
        dAz: pointer.x * 3,
        dEl: pointer.y * 1.5 + exit * 10,
        scale: 1 - 0.06 * exit,
      });
      dial.setDiscShadow(1);
      // The first scroll moves the sun: as the hero leaves, the shadow swings
      // from 10:00 to the 11:10 line, the page's mechanic in miniature.
      const t = T_START + exit * HERO_SWEEP;
      if (Math.abs(t - shownTime) > 1e-3) dial.setTime((shownTime = t));
    } else {
      const target = clamp(store.tau || 0, 0, T_END - T_START);
      const k = store.smooth ? 1 : 1 - Math.exp(-10 * dt);
      tau += (target - tau) * k;
      if (Math.abs(target - tau) < 0.02) tau = target;
      else moving = true;
      place(camera, 'hours', aspect);
      dial.setDiscShadow(HOURS_DISC_SHADOW);
      const t = T_START + tau;
      if (Math.abs(t - shownTime) > 1e-3) dial.setTime((shownTime = t));
    }

    renderer.render(dial.scene, camera);
    if (!best.el.classList.contains('is-live')) best.el.classList.add('is-live');
    governor(dt);
    continuous = moving || scrolled;
    scrolled = false;
    if (moving) request();
  }

  function stop(fallback) {
    stopped = true;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    for (const v of views) v.el.classList.remove('is-live');
    if (fallback) {
      setTimeout(() => {
        canvas.remove();
        dial.dispose();
        renderer.dispose();
      }, 700);
    }
  }

  // Inputs that can change the picture.
  onScroll(onPageScroll);
  addEventListener('resize', request, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      last = performance.now();
      request();
    }
  });
  if (fine) {
    addEventListener(
      'pointermove',
      (e) => {
        pointer.tx = clamp((e.clientX / innerWidth) * 2 - 1, -1, 1);
        pointer.ty = clamp((e.clientY / innerHeight) * 2 - 1, -1, 1);
        if (active && active.id === 'hero') request();
      },
      { passive: true },
    );
  }
  const ro = new ResizeObserver(request);
  for (const v of views) ro.observe(v.frame);
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    stop(false);
    canvas.remove();
  });

  // First frame: compile off the critical path, then render and crossfade.
  place(camera, innerWidth < 768 ? 'hero-m' : 'hero-d', 1.6);
  dial.setTime(T_START);
  await compile(renderer, dial.scene, camera);
  last = performance.now();
  request();
  return { stop, renderer };
}
