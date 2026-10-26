// One scroll pulse for the whole page. With a fine pointer and motion allowed,
// Lenis smooths the wheel and is driven from the GSAP ticker; touch keeps
// native scrolling (DESIGN.md §8.5). Listeners run at most once per frame.
import Lenis from 'lenis';
import { gsap } from 'gsap';

const listeners = new Set();
let lenis = null;
let queued = false;

function run() {
  queued = false;
  for (const fn of listeners) fn();
}

export function requestScrollFrame() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(run);
}

export function onScroll(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getLenis() {
  return lenis;
}

export function initScroll({ smooth }) {
  if (smooth) {
    lenis = new Lenis({
      lerp: 0.1,
      smoothWheel: true,
      wheelMultiplier: 1,
      syncTouch: false,
      // The only in-page link is "Skip to content"; the browser's own jump moves
      // focus to #main as well, so anchors are left native.
      anchors: false,
      autoRaf: false,
    });
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
    lenis.on('scroll', run);
  } else {
    addEventListener('scroll', requestScrollFrame, { passive: true });
  }
  addEventListener('resize', requestScrollFrame, { passive: true });
  requestScrollFrame();
  return lenis;
}
