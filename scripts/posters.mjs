// Renders the dial posters (DESIGN.md §9.9) with headless Chrome against
// `vite preview`, then encodes them as AVIF and WebP with alpha, so they
// composite over the page's paper exactly like the live canvas does.
//
//   npm run build && npm run posters            all three posters
//   node scripts/posters.mjs hero-d --png       one poster, PNG only (to /tmp)
//
// SwiftShader needs DISPLAY unset on this machine (see BUILD_NOTES.md).
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const pngOnly = args.includes('--png');
const ids = args.filter((a) => !a.startsWith('--'));
const extra = (args.find((a) => a.startsWith('--q=')) || '').slice(4); // e.g. --q=sun=6&hemi=1
// Calibration points (world x, y, z): sunlit stone, the gnomon's shadow on the
// stone, the disc's shadow on the paper, and bare paper (DESIGN.md §9.8).
const SAMPLES = {
  'hero-d': [
    { name: 'stone, sunlit', p: [0.35, 0.1, 0.35] },
    { name: 'stone, gnomon shadow', p: [-0.385, 0.1, -0.13] },
    { name: 'paper, disc shadow', p: [0.02, 0, -1.08] },
    { name: 'paper, bare', p: [-1.3, 0, 1.4] },
  ],
};
const targets = ids.length ? ids : ['hero-d', 'hero-m', 'hours'];
const ENCODE = `
import sys
from PIL import Image
src, stem = sys.argv[1], sys.argv[2]
im = Image.open(src).convert("RGBA")
im.save(stem + ".avif", "AVIF", quality=64, speed=4)
im.save(stem + ".webp", "WEBP", quality=82, method=6, alpha_quality=90)
import os
for ext in ("avif", "webp"):
    print("  %s.%s %.1f KB" % (os.path.basename(stem), ext, os.path.getsize(stem + "." + ext) / 1024))
`;

const PORT = 4517;
const tmp = join(tmpdir(), 'bs2posters');
mkdirSync(tmp, { recursive: true });

const server = spawn(process.execPath, [`${root}node_modules/vite/bin/vite.js`, 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('preview did not start')), 20000);
  server.stdout.on('data', (d) => {
    if (String(d).includes(String(PORT))) {
      clearTimeout(t);
      resolve();
    }
  });
});

const env = { ...process.env };
delete env.DISPLAY;
delete env.WAYLAND_DISPLAY;
let browser;
try {
  const browserCandidates = process.platform === 'win32'
    ? [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      ]
    : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    || browserCandidates.find(existsSync);
  if (!executablePath) throw new Error('No Chromium browser found; set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH.');
  browser = await chromium.launch({
    executablePath,
    env,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  for (const id of targets) {
    const page = await browser.newPage({ viewport: { width: 1700, height: 1300 }, deviceScaleFactor: 1 });
    page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && console.log(`[${id}] ${m.type()}: ${m.text()}`));
    const samples = encodeURIComponent(JSON.stringify(SAMPLES[id] || []));
    await page.goto(`http://localhost:${PORT}/?poster=${id}&samples=${samples}${extra ? `&${extra}` : ''}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__poster, null, { timeout: 180000 });
    const result = await page.evaluate(() => window.__poster);
    if (result.error) throw new Error(`${id}: ${result.error}`);
    const png = `${tmp}/${id}.png`;
    writeFileSync(png, Buffer.from(result.url.split(',')[1], 'base64'));
    console.log(`${id}: ${png} (${result.renderer})`);
    const paper = [0xf2, 0xee, 0xe6];
    for (const smp of result.samples || []) {
      const [r, g, b, a] = smp.rgba;
      const over = [r, g, b].map((c, i) => Math.round(c + paper[i] * (1 - a / 255)));
      const hex = '#' + over.map((c) => c.toString(16).padStart(2, '0')).join('').toUpperCase();
      console.log(`  ${smp.name.padEnd(22)} ${hex}  alpha ${(a / 255).toFixed(2)}  @${smp.x},${smp.y}`);
    }
    await page.close();
    if (!pngOnly) {
      const python = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
      execFileSync(python, ['-I', '-c', ENCODE, png, `${root}public/assets/posters/${id}`], { stdio: 'inherit' });
    }
  }
} finally {
  await browser?.close();
  server.kill();
}
process.exit(0);
