// Copies the three Latin variable woff2 files from Fontsource into public/fonts
// under stable names, so they can be preloaded. Our own @font-face rules live in
// src/styles/fonts.css; Fontsource's CSS is never imported.
import { copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const files = [
  ['@fontsource-variable/source-serif-4/files/source-serif-4-latin-opsz-normal.woff2', 'source-serif-4-latin-opsz-normal.woff2'],
  ['@fontsource-variable/geist/files/geist-latin-wght-normal.woff2', 'geist-latin-wght-normal.woff2'],
  ['@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2', 'geist-mono-latin-wght-normal.woff2'],
];

mkdirSync(`${root}public/fonts`, { recursive: true });
for (const [from, to] of files) {
  copyFileSync(`${root}node_modules/${from}`, `${root}public/fonts/${to}`);
  console.log(`fonts: ${to}`);
}
