// Scroll-linked page state that is not motion: the header's hairline and dusk
// theme, the schedule's reading time, and portrait fallbacks.

/** Header: hairline after 8px, dusk theme while a dusk section is under it. */
export function headerUpdater() {
  const header = document.querySelector('.site-header');
  if (!header) return () => {};
  const dusk = [...document.querySelectorAll('.cta, .site-footer')];
  return function update() {
    header.classList.toggle('is-scrolled', window.scrollY > 8);
    const mid = header.offsetHeight / 2;
    let theme = 'paper';
    for (const el of dusk) {
      const r = el.getBoundingClientRect();
      if (r.top <= mid && r.bottom > mid) {
        theme = 'dusk';
        break;
      }
    }
    if (header.dataset.theme !== theme) header.dataset.theme = theme;
  };
}

/** A probe for 1svh in px (the sticky and reading-line unit). */
function svhProbe() {
  const el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = 'position:fixed;left:-9px;top:0;width:1px;height:100svh;visibility:hidden;pointer-events:none';
  document.body.appendChild(el);
  let svh = el.getBoundingClientRect().height / 100 || innerHeight / 100;
  addEventListener('resize', () => {
    svh = el.getBoundingClientRect().height / 100 || innerHeight / 100;
  });
  return () => svh;
}

/**
 * The page's paper through the workshop day (minutes after 10:00 → sRGB). Paper
 * holds until mid-afternoon, warms as the sun drops, goes rosy at sunset
 * (5:03) and settles into a cool blue-hour grey by 5:45. Every step keeps ink-3
 * above 4.5:1, so all text stays AA on it.
 */
const GROUND = [
  [0, [242, 238, 230]],
  [300, [242, 238, 230]],
  [360, [244, 235, 220]],
  [402, [243, 228, 207]],
  [423, [236, 224, 214]],
  [465, [221, 224, 225]],
];

function groundAt(tau) {
  let i = 0;
  while (i < GROUND.length - 2 && tau > GROUND[i + 1][0]) i++;
  const [t0, a] = GROUND[i];
  const [t1, b] = GROUND[i + 1];
  const f = Math.min(Math.max((tau - t0) / (t1 - t0), 0), 1);
  const s = f * f * (3 - 2 * f);
  return a.map((v, k) => v + (b[k] - v) * s);
}

/**
 * The full day: map the reading line to clock time. Within each schedule row the
 * time runs linearly from its start to the next start, so the shadow reaches an
 * engraved milestone as the relevant row crosses the reading line. The last
 * slot ends where the hold begins (the --hold below the axis's 5:45 tick).
 *
 * With motion on, the page's paper also takes the afternoon light (GROUND) and
 * returns to paper as the section leaves the screen.
 */
export function scheduleUpdater(store) {
  const root = document.querySelector('[data-schedule]');
  if (!root) return () => {};
  const html = document.documentElement;
  const section = root.closest('section') || root;
  const list = root.querySelector('.schedule__list');
  const items = [...root.querySelectorAll('.session')].map((el) => ({
    el,
    start: Number(el.dataset.start),
    dur: Number(el.dataset.dur),
  }));
  const total = Math.max(...items.map((item) => item.start + item.dur));
  const svh = svhProbe();
  const wide = matchMedia('(min-width: 1100px)');
  let active = -1;
  let ended = false;
  let ground = '';

  return function update() {
    const reading = svh() * (wide.matches ? 50 : 72);
    // the hold is the 5:30 tick's offset from the list's end (0 without motion)
    const hold = parseFloat(getComputedStyle(list, '::after').bottom) || 0;
    let tau = 0;
    let index = 0;
    const tops = items.map((it) => it.el.getBoundingClientRect());
    if (reading >= tops[0].top) {
      tau = total;
      index = items.length - 1;
      for (let i = 0; i < items.length; i++) {
        const top = tops[i].top;
        const bottom = i + 1 < items.length ? tops[i + 1].top : tops[i].bottom - hold;
        if (reading < bottom) {
          const f = Math.min(Math.max((reading - top) / Math.max(bottom - top, 1), 0), 1);
          tau = items[i].start + f * items[i].dur;
          index = i;
          break;
        }
      }
    }
    store.tau = tau;
    if (index !== active) {
      if (active >= 0) items[active].el.classList.remove('is-active');
      items[index].el.classList.add('is-active');
      active = index;
    }
    if ((tau >= total) !== ended) {
      ended = tau >= total;
      root.classList.toggle('is-end', ended);
    }

    // The afternoon light on the page. It holds while the dial is pinned and
    // returns to paper as the section leaves (its end rising from the bottom of
    // the screen to 45%), so the next section arrives on paper.
    let next = '';
    if (html.classList.contains('motion') && tau > GROUND[1][0]) {
      const vh = innerHeight;
      const leave = Math.min(Math.max((vh - section.getBoundingClientRect().bottom) / (vh * 0.55), 0), 1);
      const c = groundAt(tau).map((v, k) => Math.round(v + (GROUND[0][1][k] - v) * leave));
      if (leave < 1) next = `rgb(${c[0]} ${c[1]} ${c[2]})`;
    }
    if (next !== ground) {
      ground = next;
      if (next) html.style.setProperty('--ground', next);
      else html.style.removeProperty('--ground');
    }
  };
}

/** Portraits that fail to load fall back to their initials (source behaviour). */
export function initAvatars() {
  for (const img of document.querySelectorAll('.avatar img')) {
    const fail = () => {
      const avatar = img.closest('.avatar');
      if (!avatar) return;
      avatar.classList.add('is-empty');
      (img.closest('picture') || img).remove();
    };
    if (img.complete && img.naturalWidth === 0 && img.currentSrc) fail();
    else img.addEventListener('error', fail, { once: true });
  }
}

/**
 * The Earth's shadow (DESIGN.md §8.4): the CTA's dusk edge rises as a shallow
 * arc with a 10vh sagitta and flattens, linearly, by the time the section top
 * reaches 40% of the viewport.
 */
export function arcUpdater() {
  const cta = document.querySelector('.cta');
  if (!cta) return () => {};
  let lastS = -1;
  return function update() {
    const r = cta.getBoundingClientRect();
    const vh = innerHeight;
    if (r.top > vh || r.bottom < 0) return;
    const p = Math.min(Math.max((vh - r.top) / (vh * 0.6), 0), 1);
    const s = Math.round((1 - p) * 0.1 * vh * 2) / 2;
    if (s === lastS) return;
    lastS = s;
    if (s < 0.5) {
      cta.style.removeProperty('--arc');
      return;
    }
    // An ellipse centred ry below the top edge: its top is an arc of sagitta s
    // across the full width, and it reaches far below the section's bottom.
    const ry = Math.max(r.height, vh) * 2;
    const rx = r.width / 2 / Math.sqrt(1 - (1 - s / ry) ** 2);
    cta.style.setProperty('--arc', `ellipse(${rx.toFixed(1)}px ${ry.toFixed(1)}px at 50% ${ry.toFixed(1)}px)`);
  };
}
