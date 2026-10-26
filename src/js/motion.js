// Reveals (DESIGN.md §8.3). Runs only when motion is allowed. Start states are
// CSS under .motion; this file decides when each element arrives.
import { gsap } from 'gsap';
import { SplitText } from 'gsap/SplitText';
import { CustomEase } from 'gsap/CustomEase';

gsap.registerPlugin(SplitText, CustomEase);
CustomEase.create('settle', 'M0,0 C0.22,1 0.36,1 1,1');
CustomEase.create('glide', 'M0,0 C0.65,0.05 0,1 1,1');
CustomEase.create('drift', 'M0,0 C0.445,0.05 0.55,0.95 1,1');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function observe(elements, margin, onEnter) {
  if (!elements.length) return;
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        io.unobserve(entry.target);
        onEnter(entry.target);
      }
    },
    { rootMargin: `0px 0px -${margin}% 0px` },
  );
  for (const el of elements) io.observe(el);
}

/** Line-mask reveal: each line rises out of its own clip, 105% → 0. */
function splitLines(el, { hero = false } = {}) {
  try {
    SplitText.create(el, {
      type: 'lines',
      mask: 'lines',
      linesClass: 'line',
      autoSplit: true,
      onSplit(self) {
        if (el.dataset.revealed === 'done') return undefined;
        gsap.set(self.lines, { yPercent: 105 });
        const tween = gsap.to(self.lines, {
          yPercent: 0,
          duration: hero ? 1.1 : 1,
          ease: 'settle',
          stagger: hero ? 0.09 : 0.07,
          paused: !el.classList.contains('is-in'),
          onComplete: () => {
            el.dataset.revealed = 'done';
          },
        });
        el._reveal = () => tween.play();
        return tween;
      },
    });
  } catch {
    el.dataset.revealed = 'done';
  }
  el.classList.add('is-split');
}

/** Count-up: the real value stays readable by assistive tech underneath. */
function prepareCounter(el) {
  const suffix = el.dataset.suffix || '';
  const real = document.createElement('span');
  real.className = 'stat__real';
  while (el.firstChild) real.appendChild(el.firstChild);
  const anim = document.createElement('span');
  anim.className = 'stat__anim';
  anim.setAttribute('aria-hidden', 'true');
  el.append(real, anim);
  el.classList.add('is-counting');
  const tail = suffix ? `<span class="stat__suffix">${suffix}</span>` : '';
  const box = { v: 0 };
  const paint = () => {
    anim.innerHTML = `${Math.round(box.v)}${tail}`;
  };
  paint();
  el._count = () =>
    gsap.to(box, {
      v: Number(el.dataset.count),
      duration: 1.4,
      ease: 'settle',
      onUpdate: paint,
      onComplete: () => {
        el.classList.remove('is-counting');
        anim.remove();
        while (real.firstChild) el.insertBefore(real.firstChild, real);
        real.remove();
      },
    });
}

export function initMotion() {
  const root = document.documentElement;
  // The head script drops .motion if the app was too slow to arrive; stay still.
  if (!root.classList.contains('motion')) {
    root.setAttribute('data-ready', '');
    return;
  }

  for (const list of document.querySelectorAll('[data-reveal="stagger"]')) {
    [...list.children].forEach((child, i) => child.style.setProperty('--i', String(i)));
  }

  const reveal = (el) => el.classList.add('is-in');
  observe([...document.querySelectorAll('[data-reveal="up"], [data-reveal="stagger"], [data-reveal="plate"]')], 15, reveal);
  observe([...document.querySelectorAll('.grad[data-reveal]')], 10, reveal);

  const counters = [...document.querySelectorAll('[data-count]')];
  counters.forEach(prepareCounter);
  observe(counters, 20, (el) => el._count());

  // Headings split once the fonts are in (600ms cap on load), then reveal.
  const heroLines = [...document.querySelectorAll('[data-hero="lines"]')];
  const lines = [...document.querySelectorAll('[data-reveal="lines"]')];
  const fades = [...document.querySelectorAll('[data-hero="fade"]')].sort((a, b) => {
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    return ra.top - rb.top || ra.left - rb.left;
  });
  fades.forEach((el, i) => el.style.setProperty('--d', `${150 + i * 50}ms`));

  const fonts = document.fonts ? document.fonts.ready : Promise.resolve();
  Promise.race([fonts, wait(600)]).then(() => {
    for (const el of heroLines) splitLines(el, { hero: true });
    for (const el of lines) splitLines(el);

    // The hero sequence: H1 lines, then the figure, then the rest at +200ms.
    for (const el of heroLines) {
      el.classList.add('is-in');
      el._reveal?.();
    }
    document.querySelector('.hero__view')?.classList.add('is-in');
    requestAnimationFrame(() => fades.forEach(reveal));

    observe(lines, 15, (el) => {
      el.classList.add('is-in');
      el._reveal?.();
    });
  });

  // Safety: nothing stays hidden if a split never happened.
  setTimeout(() => {
    for (const el of [...heroLines, ...lines]) el.classList.add('is-split');
  }, 2500);

  root.setAttribute('data-ready', '');
}
