// Behaviour checks against the built site (DESIGN.md §12).
//   npm run build && node scripts/checks.mjs
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('..', import.meta.url));
const PORT = 4519;
const BASE = `http://localhost:${PORT}`;
const server = spawn(process.execPath, [`${root}node_modules/vite/bin/vite.js`, 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('preview did not start')), 20000);
  server.stdout.on('data', (d) => String(d).includes(String(PORT)) && (clearTimeout(t), resolve()));
});
const env = { ...process.env };
delete env.DISPLAY;
delete env.WAYLAND_DISPLAY;
const browserCandidates = process.platform === 'win32'
  ? [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    ]
  : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || browserCandidates.find(existsSync);
if (!executablePath) throw new Error('No Chromium browser found; set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH.');
const browser = await chromium.launch({
  executablePath,
  env,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail });
const mobile = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const desktop = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };

try {
  // 0. Motion tokens: computed timing functions are only settle / glide / drift / linear
  for (const path of ['/', '/about', '/signup', '/404']) {
    const ctx = await browser.newContext(desktop);
    const page = await ctx.newPage();
    await page.goto(`${BASE}${path}`, { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    const fns = await page.evaluate(() => {
      const seen = new Map();
      const add = (v, where) => v.split(/,(?![^(]*\))/).map((x) => x.trim()).forEach((x) => seen.set(x, where));
      for (const el of document.querySelectorAll('*')) {
        for (const pseudo of [null, '::before', '::after']) {
          const cs = getComputedStyle(el, pseudo);
          if (cs.transitionDuration.split(',').some((d) => parseFloat(d) > 0)) add(cs.transitionTimingFunction, el.className || el.tagName);
          if (cs.animationName !== 'none') add(cs.animationTimingFunction, el.className || el.tagName);
        }
      }
      return [...seen].map(([fn, where]) => `${fn} @${String(where).slice(0, 30)}`);
    });
    const allowed = ['cubic-bezier(0.22, 1, 0.36, 1)', 'cubic-bezier(0.65, 0.05, 0, 1)', 'cubic-bezier(0.445, 0.05, 0.55, 0.95)', 'linear'];
    const bad = fns.filter((f) => !allowed.includes(f.split(' @')[0]));
    check(`motion ${path}: timing functions are tokens only`, bad.length === 0, bad.length ? bad.join('; ') : `${fns.length} in use`);
    await ctx.close();
  }

  // 1. Mobile menu
  {
    const ctx = await browser.newContext(mobile);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/about`, { waitUntil: 'load' });
    const toggle = page.locator('.nav-toggle');
    await toggle.click();
    await page.waitForTimeout(800);
    check('menu: opens, label Close', (await toggle.textContent()) === 'Close' && (await toggle.getAttribute('aria-expanded')) === 'true');
    check('menu: page locked', await page.evaluate(() => document.documentElement.classList.contains('menu-open') && document.querySelector('main').inert));
    const sheet = await page.locator('#site-nav').boundingBox();
    check('menu: sheet covers viewport', sheet && sheet.width >= 389 && sheet.height >= 843, JSON.stringify(sheet));
    // Tab cycles inside the header
    const seen = [];
    for (let i = 0; i < 7; i++) {
      await page.keyboard.press('Tab');
      seen.push(await page.evaluate(() => document.activeElement.textContent.trim().split('\n')[0]));
    }
    check('menu: focus stays in header', seen.every((t) => ['Exea Labs', 'Close', 'Home', 'Sign Up', 'Exea LabsBay Area Workshop'].some((s) => t.startsWith(s.slice(0, 4)))), seen.join(' | '));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(700);
    check('menu: Escape closes, focus on toggle', (await toggle.textContent()) === 'Menu' && (await page.evaluate(() => document.activeElement.classList.contains('nav-toggle'))));
    await toggle.click();
    await page.waitForTimeout(700);
    await page.setViewportSize({ width: 900, height: 844 });
    await page.waitForTimeout(300);
    check('menu: widening closes', (await toggle.getAttribute('aria-expanded')) === 'false');
    await ctx.close();
  }

  // 2. Reduced motion: no three.js, no Lenis, posters, natural list
  {
    const ctx = await browser.newContext({ ...desktop, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    const reqs = [];
    page.on('request', (r) => reqs.push(r.url()));
    await page.goto(`${BASE}/`, { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    await page.evaluate(() => document.querySelector('[data-view="hours"]').scrollIntoView());
    await page.waitForTimeout(2000);
    const three = reqs.filter((u) => /\/assets\/app\/index-/.test(u));
    check('reduced: no three.js chunk', three.length === 0, three.join(','));
    const st = await page.evaluate(() => ({
      lenis: document.documentElement.classList.contains('lenis'),
      motion: document.documentElement.classList.contains('motion'),
      sticky: getComputedStyle(document.querySelector('.hours__view')).position,
      sessionMin: getComputedStyle(document.querySelector('.session')).minHeight,
      poster: document.querySelector('[data-view="hours"] img').currentSrc,
      hidden: [...document.querySelectorAll('main *')].filter((el) => getComputedStyle(el).opacity === '0' || getComputedStyle(el).visibility === 'hidden').length,
    }));
    check('reduced: no Lenis, no .motion', !st.lenis && !st.motion);
    check('reduced: natural schedule, no sticky', st.sticky !== 'sticky' && (st.sessionMin === 'auto' || st.sessionMin === '0px'), `${st.sticky} ${st.sessionMin}`);
    check('reduced: long-exposure plate shown', /hours\.(avif|webp)/.test(st.poster), st.poster);
    check('reduced: nothing hidden', st.hidden === 0, String(st.hidden));
    await ctx.close();
  }

  // 3. No JavaScript: everything readable, hero facts above the fold
  {
    const ctx = await browser.newContext({ ...desktop, javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'load' });
    const st = await page.evaluate(() => {
      const vis = (el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return r.bottom <= innerHeight && r.top >= 0 && cs.opacity !== '0' && cs.visibility !== 'hidden';
      };
      const meta = [...document.querySelectorAll('.hero__meta li')];
      return {
        hidden: [...document.querySelectorAll('main *')].filter((el) => getComputedStyle(el).opacity === '0' || getComputedStyle(el).visibility === 'hidden').length,
        meta: meta.map((li) => vis(li)),
        luma: vis(document.querySelector('.hero__actions .btn--primary')),
      };
    });
    check('no-JS: nothing hidden', st.hidden === 0, String(st.hidden));
    check('no-JS: date, time, venue, Free and Luma above the fold at 1440×900', st.meta.every(Boolean) && st.luma, JSON.stringify(st));
    await ctx.close();
  }

  // 4. Idle rendering, DPR and canvas size (desktop)
  {
    const ctx = await browser.newContext({ ...desktop, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      window.__draws = 0;
      const wrap = (proto) => {
        const orig = proto.drawElements;
        proto.drawElements = function (...a) {
          window.__draws++;
          return orig.apply(this, a);
        };
        const orig2 = proto.drawArrays;
        proto.drawArrays = function (...a) {
          window.__draws++;
          return orig2.apply(this, a);
        };
      };
      wrap(WebGL2RenderingContext.prototype);
    });
    await page.goto(`${BASE}/`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.dataset.dial, null, { timeout: 60000 });
    await page.waitForTimeout(2500);
    const a = await page.evaluate(() => window.__draws);
    await page.waitForTimeout(2000);
    const b = await page.evaluate(() => window.__draws);
    check('3D: zero draws over 2 s idle', a === b, `${a} → ${b}`);
    const c = await page.evaluate(() => {
      const cv = document.querySelector('canvas.view__canvas');
      const r = cv.getBoundingClientRect();
      return { w: cv.width, h: cv.height, cw: r.width, ch: r.height, dpr: cv.width / r.width };
    });
    check('3D: desktop DPR ≤ 1.5 (device DPR 2)', c.dpr <= 1.501, JSON.stringify(c));
    await page.mouse.move(900, 500);
    await page.waitForTimeout(500);
    const d = await page.evaluate(() => window.__draws);
    check('3D: pointer causes renders on the hero', d > b, `${b} → ${d}`);
    await ctx.close();
  }

  // 5. No rendered pixel under the ink of H1 line 2 (hero), at several desktop
  //    widths: compare a text-only and a dial-only capture of the same clip.
  for (const w of [1100, 1280, 1366, 1440, 1680, 1920]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: Math.round(w * 0.625) }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.querySelector('.hero__view.is-live'), null, { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(2000);
    const box = await page.evaluate(() => {
      const h1 = document.querySelector('.hero__title');
      const lines = h1.querySelectorAll('.line');
      const last = lines[lines.length - 1] || h1;
      const range = document.createRange();
      range.selectNodeContents(last);
      const r = range.getBoundingClientRect();
      const v = document.querySelector('.hero__view').getBoundingClientRect();
      const x0 = Math.max(r.left, v.left);
      const x1 = Math.min(r.right, v.right);
      const y0 = Math.max(r.top, v.top);
      const y1 = Math.min(r.bottom, v.bottom);
      return x1 > x0 && y1 > y0 ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : null;
    });
    if (!box) {
      check(`hero ${w}: line 2 clear of the view`, true, 'no overlap');
      await ctx.close();
      continue;
    }
    const capture = async (hide) => {
      await page.evaluate((sel) => {
        document.querySelectorAll('[data-hide]').forEach((el) => {
          el.style.visibility = '';
          el.removeAttribute('data-hide');
        });
        document.querySelectorAll(sel).forEach((el) => {
          el.style.visibility = 'hidden';
          el.setAttribute('data-hide', '');
        });
      }, hide);
      return (await page.screenshot({ clip: box })).toString('base64');
    };
    const textOnly = await capture('.hero__view');
    const dialOnly = await capture('.hero__title');
    const both = await page.evaluate(async ([a, b]) => {
      const load = async (b64) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const g = c.getContext('2d');
        g.drawImage(img, 0, 0);
        return g.getImageData(0, 0, c.width, c.height).data;
      };
      const A = await load(a);
      const B = await load(b);
      const off = (d, i) => Math.abs(d[i] - 242) + Math.abs(d[i + 1] - 238) + Math.abs(d[i + 2] - 230) > 6;
      let ink = 0;
      let dial = 0;
      let n = 0;
      for (let i = 0; i < A.length; i += 4) {
        const t = off(A, i);
        const d = off(B, i);
        ink += t;
        dial += d;
        n += t && d;
      }
      return { ink, dial, n };
    }, [textOnly, dialOnly]);
    check(`hero ${w}: no rendered pixel under H1 line 2 ink`, both.n === 0, `${both.n} shared of ${both.ink} ink / ${both.dial} dial px in ${Math.round(box.width)}×${Math.round(box.height)}`);
    await ctx.close();
  }
} finally {
  await browser.close();
  server.kill();
}
let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  (${r.detail})` : ''}`);
}
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(0);
