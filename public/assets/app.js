/* Exea Labs — Bay Area Workshop
 *
 * The hero's loops (waves, palm sway, clouds, birds) are pure CSS keyframes, so
 * the scene runs even with this file blocked. GSAP only handles scroll-linked
 * work: the hero intro, parallax, reveals, and the stat counters.
 *
 * Content is never left hidden. Hidden start states live behind `.js`; if GSAP
 * is missing an IntersectionObserver reveals instead; and if GSAP loads but its
 * ticker never runs, that is detected and handed back to the observer.
 */
(function () {
  'use strict';

  var hasGsap = typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined';
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var animated = document.querySelectorAll('[data-anim]');

  /* ---------- Mobile nav ------------------------------------------------ */

  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('site-nav');

  function closeNav() {
    if (!nav || !toggle) return;
    nav.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.textContent = 'Menu';
  }

  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.textContent = open ? 'Close' : 'Menu';
    });

    nav.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') closeNav();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeNav();
    });

    window.addEventListener('resize', function () {
      if (window.innerWidth > 760) closeNav();
    });
  }

  /* ---------- A portrait that fails to load falls back to initials ------- */

  Array.prototype.forEach.call(
    document.querySelectorAll('.avatar > img'),
    function (img) {
      function fail() {
        if (img.parentNode) {
          img.parentNode.classList.add('is-empty');
          img.parentNode.removeChild(img);
        }
      }
      if (img.complete && img.naturalWidth === 0) fail();
      else img.addEventListener('error', fail, { once: true });
    }
  );

  /* ---------- Reveal ---------------------------------------------------- */

  function show(el) {
    el.style.opacity = '';
    el.style.transform = '';
    el.classList.add('is-in');
  }

  function showAll() {
    Array.prototype.forEach.call(animated, show);
  }

  function observerReveal() {
    if (reduced || !('IntersectionObserver' in window)) {
      showAll();
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          show(entry.target);
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

    Array.prototype.forEach.call(animated, function (el) { io.observe(el); });
    setTimeout(showAll, 2500); // last resort: nothing stays invisible
  }

  if (!hasGsap || reduced) {
    observerReveal();
    return;
  }

  /* ---------- GSAP ------------------------------------------------------ */

  gsap.registerPlugin(ScrollTrigger);

  // If the ticker never advances, drop GSAP and let the observer take over.
  setTimeout(function () {
    if (gsap.ticker.frame > 3) return;

    ScrollTrigger.getAll().forEach(function (t) { t.kill(); });
    gsap.globalTimeline.clear();
    Array.prototype.forEach.call(animated, function (el) {
      el.style.opacity = '';
      el.style.transform = '';
    });
    observerReveal();
  }, 1800);

  var heroBits = gsap.utils.toArray('[data-anim="hero"]');

  if (heroBits.length) {
    gsap.to(heroBits, { y: 0, opacity: 1, duration: 0.9, stagger: 0.085, ease: 'power3.out' });
  }

  // Only the sky parallaxes. Drifting the whole scene pulls the waterline up off
  // the section edge and opens a strip of bare gradient above the next section.
  // `y` is in SVG user units, so the offset is identical at every viewport width.
  if (document.querySelector('.hero-scene .sky')) {
    gsap.to('.hero-scene .sky', {
      y: 34,
      ease: 'none',
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true }
    });
  }

  var scrollAnimated = document.querySelectorAll('[data-anim]:not([data-anim="hero"])');

  if (scrollAnimated.length) {
    ScrollTrigger.batch(scrollAnimated, {
      start: 'top 88%',
      once: true,
      onEnter: function (batch) {
        gsap.to(batch, {
          opacity: 1,
          y: 0,
          duration: 0.7,
          stagger: 0.08,
          ease: 'power2.out',
          overwrite: true
        });
      }
    });
  }

  // Counters. The HTML carries the final value, so it is right without JS.
  gsap.utils.toArray('[data-count]').forEach(function (el) {
    var target = parseFloat(el.getAttribute('data-count'));
    var suffix = el.getAttribute('data-suffix') || '';
    var box = { v: 0 };

    gsap.to(box, {
      v: target,
      duration: 1.5,
      ease: 'power2.out',
      scrollTrigger: {
        trigger: el,
        start: 'top 88%',
        once: true,
        onEnter: function () { el.textContent = '0' + suffix; }
      },
      onUpdate: function () { el.textContent = Math.round(box.v) + suffix; },
      onComplete: function () { el.textContent = target + suffix; }
    });
  });

  window.addEventListener('load', function () { ScrollTrigger.refresh(); });
})();
