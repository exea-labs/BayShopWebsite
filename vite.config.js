import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const read = (file) => readFileSync(`${root}src/partials/${file}`, 'utf8');

/*
 * Tiny include step so the four pages share one header, footer and head block.
 *   <!-- @head -->            favicons, font preloads, the boot script
 *   <!-- @header home -->     header with aria-current on the named page (home | about | signup | none)
 *   <!-- @footer -->          footer
 *   <!-- @grad 02 -->         graduated rule with a decorative "§ 02" index (omit the number for none)
 *   <!-- @icon arrow -->      inline icon (arrow | check | discord)
 * Partials are read on every transform, so edits show up in dev without a restart.
 */
function sitePartials() {
  const icon = (name) => {
    const icons = JSON.parse(read('icons.json'));
    if (!icons[name]) throw new Error(`Unknown icon "${name}"`);
    return icons[name];
  };
  const header = (page) =>
    read('header.html').replace(/\{\{(\w+)\}\}/g, (_, key) => (key === page ? ' aria-current="page"' : ''));
  const grad = (index) => {
    const ticks = Array.from({ length: 12 }, (_, i) => `<i style="--i:${i}"></i>`).join('');
    const label = index ? `<span class="grad__index">&sect;&nbsp;${index}</span>` : '';
    return `<div class="grad" data-reveal="grad" aria-hidden="true">${label}<span class="grad__line"></span><span class="grad__ticks">${ticks}</span></div>`;
  };

  return {
    name: 'site-partials',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return html
          .replace(/<!--\s*@head\s*-->/g, () => read('head.html'))
          .replace(/<!--\s*@header\s+(\w+)\s*-->/g, (_, page) => header(page))
          .replace(/<!--\s*@footer\s*-->/g, () => read('footer.html'))
          .replace(/<!--\s*@grad\s*(\d*)\s*-->/g, (_, index) => grad(index))
          .replace(/<!--\s*@icon\s+(\w+)\s*-->/g, (_, name) => icon(name));
      },
    },
  };
}

export default defineConfig({
  appType: 'mpa',
  plugins: [sitePartials()],
  build: {
    target: 'es2020',
    cssTarget: ['chrome111', 'safari16.4', 'firefox115'],
    assetsDir: 'assets/app',
    // The three.js chunk is ~500 KB minified (~130 KB gzip). It is lazy-loaded
    // only on the home page, after first paint, so the default 500 KB warning
    // does not apply to it.
    chunkSizeWarningLimit: 640,
    rollupOptions: {
      input: {
        index: `${root}index.html`,
        about: `${root}about.html`,
        signup: `${root}signup.html`,
        404: `${root}404.html`,
      },
    },
  },
  preview: { port: 4500 },
});
