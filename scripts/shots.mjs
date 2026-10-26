// Verification screenshots of the built site (desktop 1440×900, mobile 390×844).
//
//   npm run build && node scripts/shots.mjs [--pages=/,/about] [--vp=d,m] [--reduced] [--out=DIR] [--steps=N]
//
// For each page and viewport it scrolls through in viewport steps (so reveals
// and the live dial run), saves one PNG per step, and reports console errors,
// warnings, failed requests and horizontal overflow. SwiftShader needs DISPLAY
// unset on this machine.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('..', import.meta.url));
const opt = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);
const pages = String(opt.pages || '/,/about,/signup,/404').split(',');
const vps = String(opt.vp || 'd,m').split(',');
const out = String(opt.out || '/tmp/bs2shots');
const maxSteps = Number(opt.steps || 40);
const dpr = opt.dpr ? Number(opt.dpr) : null;
const PORT = 4518;
mkdirSync(out, { recursive: true });

const VIEWPORTS = {
  d: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  m: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

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
const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  env,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

const report = [];
try {
  for (const vp of vps) {
    for (const path of pages) {
      const ctx = await browser.newContext({
        ...VIEWPORTS[vp],
        ...(dpr ? { deviceScaleFactor: dpr } : {}),
        reducedMotion: opt.reduced ? 'reduce' : 'no-preference',
      });
      const page = await ctx.newPage();
      const log = [];
      page.on('console', (m) => ['error', 'warning'].includes(m.type()) && log.push(`${m.type()}: ${m.text()}`));
      page.on('pageerror', (e) => log.push(`pageerror: ${e.message}`));
      page.on('requestfailed', (r) => log.push(`requestfailed: ${r.url()}`));
      page.on('response', (r) => r.status() >= 400 && log.push(`http ${r.status()}: ${r.url()}`));
      const requests = [];
      page.on('request', (r) => requests.push(r.url()));
      await page.goto(`http://localhost:${PORT}${path}`, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      if (path === '/') {
        await page
          .waitForFunction(() => document.documentElement.dataset.dial || matchMedia('(prefers-reduced-motion: reduce)').matches, null, { timeout: 60000 })
          .catch(() => log.push('note: dial did not report within 60s'));
      }
      await page.waitForTimeout(1600);
      const slug = `${vp}${path === '/' ? '-home' : path.replace(/\//g, '-')}`;
      const h = VIEWPORTS[vp].viewport.height;
      const total = await page.evaluate(() => document.documentElement.scrollHeight);
      let y = 0;
      let i = 0;
      while (i < maxSteps) {
        await page.evaluate((top) => window.scrollTo(0, top), y);
        await page.waitForTimeout(i === 0 ? 300 : 1300);
        await page.screenshot({ path: `${out}/${slug}-${String(i).padStart(2, '0')}.png` });
        i++;
        if (y + h >= total) break;
        y = Math.min(y + Math.round(h * 0.85), total - h);
      }
      const facts = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - innerWidth,
        dial: document.documentElement.dataset.dial || '-',
        live: [...document.querySelectorAll('.view.is-live')].map((v) => v.dataset.view).join(',') || '-',
        canvas: (() => {
          const c = document.querySelector('canvas.view__canvas');
          return c ? `${c.width}x${c.height}` : '-';
        })(),
        fonts: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family).join(', '),
      }));
      const three = requests.filter((u) => /index-.*\.js|three/.test(u)).length;
      report.push({ page: slug, steps: i, ...facts, threeRequests: three, log });
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  server.kill();
}
for (const r of report) {
  console.log(`${r.page.padEnd(14)} steps ${r.steps}  overflow ${r.overflow}px  dial ${r.dial}  live ${r.live}  canvas ${r.canvas}  three-chunk ${r.threeRequests}`);
  console.log(`  fonts: ${r.fonts}`);
  for (const l of r.log) console.log(`  ${l}`);
}
process.exit(0);
