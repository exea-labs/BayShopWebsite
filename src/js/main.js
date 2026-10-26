// Exea Labs Bay Area Workshop
// Content is complete without this file. It adds smooth scroll (fine pointers),
// reveals, the mobile menu, the header's dusk theme, the schedule's reading
// time and, after first paint, the dial (three.js, home page only).
import { initScroll, onScroll } from './scroll.js';
import { initMenu } from './menu.js';
import { arcUpdater, headerUpdater, initAvatars, scheduleUpdater } from './page.js';
import { initMotion } from './motion.js';

const root = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(pointer: fine)').matches;
const store = { tau: 0, smooth: false };

function loadDial() {
  if (reduced || !document.querySelector('[data-view]')) return;
  if (navigator.connection && navigator.connection.saveData) return;
  if (matchMedia('(pointer: coarse)').matches && navigator.deviceMemory && navigator.deviceMemory < 4) return;
  if (!('WebGL2RenderingContext' in window)) return;
  const go = () =>
    import('../dial/index.js')
      .then((m) => m.mountDial({ store, onScroll }))
      .then((dial) => root.setAttribute('data-dial', dial ? 'live' : 'none'))
      .catch(() => root.setAttribute('data-dial', 'failed'));
  // After load, and after the hero intro has played (~1.2 s), so shader
  // compilation never competes with first paint or the reveal.
  const idle = () => ('requestIdleCallback' in window ? requestIdleCallback(go, { timeout: 1500 }) : setTimeout(go, 200));
  const start = () => setTimeout(idle, Math.max(0, 1200 - performance.now()));
  if (document.readyState === 'complete') start();
  else addEventListener('load', start, { once: true });
}

function boot() {
  initAvatars();
  store.smooth = !!initScroll({ smooth: fine && !reduced });
  initMenu();

  const updaters = [headerUpdater(), scheduleUpdater(store)];
  if (!reduced) updaters.push(arcUpdater());
  const update = () => {
    for (const fn of updaters) fn();
  };
  onScroll(update);
  update();

  if (reduced) root.setAttribute('data-ready', '');
  else initMotion();

  loadDial();
}

// Poster capture (scripts/posters.mjs drives this under automation only).
const poster = new URLSearchParams(location.search).get('poster');
if (poster && navigator.webdriver) {
  const q = new URLSearchParams(location.search);
  const tune = {};
  for (const k of ['sun', 'hemi', 'envStone', 'envBronze']) if (q.has(k)) tune[k] = Number(q.get(k));
  for (const [k, v] of q) if (k.startsWith('t.')) tune[k.slice(2)] = Number(v);
  const samples = q.has('samples') ? JSON.parse(q.get('samples')) : [];
  // look-dev overrides (tools/look2.mjs): camera fields and the disc's paper-shadow weight
  const cam = q.has('cam') ? JSON.parse(q.get('cam')) : null;
  const disc = q.has('disc') ? Number(q.get('disc')) : undefined;
  import('../dial/index.js')
    .then((m) => m.renderPoster(poster, { tune, samples, time: Number(q.get('time')) || 0, cam, disc }))
    .then((result) => {
      window.__poster = result;
    })
    .catch((err) => {
      window.__poster = { error: String((err && err.stack) || err) };
    });
} else {
  boot();
}
