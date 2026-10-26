// Mobile menu: a text button reading Menu / Close opens a full-viewport paper
// sheet (DESIGN.md §6). Escape and link taps close it, focus stays inside while
// it is open and returns to the toggle, and widening to ≥ 768px closes it.
import { getLenis } from './scroll.js';

export function initMenu() {
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.getElementById('site-nav');
  const header = document.querySelector('.site-header');
  if (!toggle || !nav || !header) return;

  const root = document.documentElement;
  const outside = [document.querySelector('main'), document.querySelector('.site-footer'), document.querySelector('.skip')].filter(Boolean);
  const mobile = matchMedia('(max-width: 767.98px)');
  let open = false;

  function set(next, { focusToggle = true } = {}) {
    if (next === open) return;
    open = next;
    nav.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.textContent = open ? 'Close' : 'Menu';
    root.classList.toggle('menu-open', open);
    for (const el of outside) el.inert = open;
    const lenis = getLenis();
    if (open) lenis?.stop();
    else lenis?.start();
    if (!open && focusToggle) toggle.focus();
  }

  toggle.addEventListener('click', () => set(!open));

  nav.addEventListener('click', (e) => {
    if (open && e.target.closest('a')) set(false, { focusToggle: false });
  });

  document.addEventListener('keydown', (e) => {
    if (!open) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      set(false);
      return;
    }
    if (e.key !== 'Tab') return;
    const items = [...header.querySelectorAll('a[href], button')].filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  mobile.addEventListener('change', (e) => {
    if (!e.matches) set(false, { focusToggle: false });
  });
}
