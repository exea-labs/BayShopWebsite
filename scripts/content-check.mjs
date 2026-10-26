// Content audit: the built pages against the snapshot of the live site.
//   npm run build && node scripts/content-check.mjs
// With JavaScript off, for each page pair it compares
//   * the multiset of words in all text outside aria-hidden subtrees (exact case and punctuation),
//   * links (href + target + rel), image alts, aria-labels, aria-current, title and meta values.
// The only text allowed inside new aria-hidden subtrees is the "§ 0n" index.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('..', import.meta.url));
const ORIG = '/workspace/bayshop/orig';
const PAIRS = [
  ['index.html', 'index.html'],
  ['about.html', 'about.html'],
  ['signup.html', 'signup.html'],
  ['firebase.json', '404.html'], // the snapshot's firebase.json is the live 404 page
];

if (!existsSync(ORIG)) {
  console.log(`SKIP  content snapshot is not available at ${ORIG}`);
  process.exit(0);
}

const env = { ...process.env };
delete env.DISPLAY;
const browserCandidates = process.platform === 'win32'
  ? [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    ]
  : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || browserCandidates.find(existsSync);
if (!executablePath) throw new Error('No Chromium browser found; set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH.');
const browser = await chromium.launch({ executablePath, env, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ javaScriptEnabled: false });

// Known, deliberate additions (DESIGN.md §7.1): the footer repeats the header's
// brand lockup, which is excluded from the comparison and reported separately.
const KNOWN = '.brand--footer';

function extract(known) {
  const hidden = (el) => !!el.closest('[aria-hidden="true"]') || (known && !!el.closest(known));
  const words = [];
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let text = '';
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const p = n.parentElement;
    if (!p || hidden(p) || p.closest('script,style,noscript,template')) {
      text += ' ';
      continue;
    }
    text += n.nodeValue;
  }
  // block boundaries are whitespace in rendering; text nodes split by tags are not
  words.push(...text.split(/\s+/).filter(Boolean));
  const hiddenText = [...document.querySelectorAll('[aria-hidden="true"]')]
    .map((el) => el.textContent.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const attrs = {
    links: [...document.querySelectorAll('a[href]')].map((a) => `${a.getAttribute('href')} ${a.getAttribute('target') || ''} ${a.getAttribute('rel') || ''}`.trim()),
    alts: [...document.querySelectorAll('img')].filter((i) => !hidden(i)).map((i) => `${i.getAttribute('alt')}`),
    hiddenImgs: [...document.querySelectorAll('img')].filter((i) => hidden(i)).map((i) => `${i.getAttribute('src')} alt="${i.getAttribute('alt')}"`),
    labels: [...document.querySelectorAll('[aria-label]')].map((e) => `${e.tagName.toLowerCase()}:${e.getAttribute('aria-label')}`),
    current: [...document.querySelectorAll('[aria-current]')].map((e) => `${e.getAttribute('href')}:${e.getAttribute('aria-current')}`),
    labelledby: [...document.querySelectorAll('[aria-labelledby]')].map((e) => `${e.getAttribute('aria-labelledby')}=${document.getElementById(e.getAttribute('aria-labelledby'))?.textContent.trim()}`),
    title: document.title,
    meta: [...document.querySelectorAll('meta[name], meta[property]')]
      .map((m) => `${m.getAttribute('name') || m.getAttribute('property')}=${m.getAttribute('content')}`)
      .filter((m) => !/^(viewport|theme-color|color-scheme)=/.test(m)),
    icons: [...document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]')].map((l) => `${l.rel} ${l.getAttribute('sizes') || ''} ${l.getAttribute('href')}`.trim()),
    lang: document.documentElement.lang,
    initials: [...document.querySelectorAll('[data-initials]')].map((e) => e.getAttribute('data-initials')),
    counts: [...document.querySelectorAll('[data-count]')].map((e) => `${e.getAttribute('data-count')}/${e.getAttribute('data-suffix') || ''}`),
  };
  return { words, hiddenText, attrs };
}

const diff = (a, b) => {
  const m = new Map();
  for (const x of a) m.set(x, (m.get(x) || 0) + 1);
  for (const x of b) m.set(x, (m.get(x) || 0) - 1);
  return [...m].filter(([, v]) => v !== 0).map(([k, v]) => `${v > 0 ? '-' : '+'}${Math.abs(v)} ${JSON.stringify(k)}`);
};

let problems = 0;
for (const [o, n] of PAIRS) {
  const page = await ctx.newPage();
  await page.setContent(readFileSync(`${ORIG}/${o}`, 'utf8'), { waitUntil: 'domcontentloaded' });
  const before = await page.evaluate(extract, null);
  await page.setContent(readFileSync(`${root}dist/${n}`, 'utf8'), { waitUntil: 'domcontentloaded' });
  const after = await page.evaluate(extract, KNOWN);
  const known = await page.evaluate((sel) => [...document.querySelectorAll(sel)].map((e) => e.textContent.replace(/\s+/g, ' ').trim()), KNOWN);
  await page.close();

  const out = [];
  const w = diff(before.words, after.words);
  if (w.length) out.push(`words: ${w.join(', ')}`);
  for (const k of Object.keys(before.attrs)) {
    if (k === 'hiddenImgs') continue; // decorative images inside aria-hidden figures; listed below
    const a = before.attrs[k];
    const b = after.attrs[k];
    const d = Array.isArray(a) ? diff(a, b) : a === b ? [] : [`-${JSON.stringify(a)} +${JSON.stringify(b)}`];
    if (d.length) out.push(`${k}: ${d.join(', ')}`);
  }
  const extraHidden = after.hiddenText.filter((t) => !/^§ \d\d$/.test(t.replace(/ /g, ' ')));
  if (extraHidden.length) out.push(`aria-hidden text: ${extraHidden.map((t) => JSON.stringify(t)).join(', ')}`);
  problems += out.length;
  console.log(`${n.padEnd(12)} ${out.length ? 'DIFFERS' : 'identical content'}  (${after.words.length} words, ${after.attrs.links.length} links)`);
  for (const line of out) console.log(`  ${line}`);
  const newHidden = diff(before.attrs.hiddenImgs, after.attrs.hiddenImgs);
  if (newHidden.length) console.log(`  note, new decorative images: ${newHidden.join(', ')}`);
  if (known.length) console.log(`  note, known addition: footer lockup ${JSON.stringify(known[0])}`);
}
await browser.close();
console.log(problems ? `${problems} difference group(s)` : 'All text, links, alts, labels and meta match the live snapshot.');
