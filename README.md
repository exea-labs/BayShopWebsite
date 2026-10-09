# Exea Labs — Bay Area Workshop site

Three-page static site for Exea Workshop #1 (Sunday, January 3, 2027, SF Bay Area).
No build step, no package install, no external requests — plain HTML, one stylesheet,
one script, and a vendored copy of GSAP.

```
public/
  index.html     Home — animated hero, key info, who should come, awards, schedule
  about.html     Exea Labs — what it is, stats, what members get, who runs it
  signup.html    Sign Up — how registration works, on the day, what to bring
  404.html
  assets/
    styles.css   All styling. Design tokens and a section index at the top.
    app.js       Nav, reveals, parallax, counters, section tracking, image fallback
    favicon.svg
    vendor/      GSAP 3.12.5 + ScrollTrigger, self-hosted (115 KB)
    img/         Brand assets — see "Images" below
```

Source artwork lives in `assets/` at the repo root. That folder is **not deployed**
(`firebase.json` only publishes `public/`); it holds the full-resolution originals that
the web-sized files in `public/assets/img/` were generated from.

## Deploy

```bash
npm install -g firebase-tools     # once
firebase login
firebase use --add                # pick your project; .firebaserc has a placeholder id
firebase deploy --only hosting
```

`firebase.json` sets `cleanUrls: true`, so pages serve at `/`, `/about`, `/signup`.
Assets cache for a year; HTML is not cached, so redeploys show up immediately.

## Preview locally

```bash
firebase serve --only hosting     # matches production, including clean URLs
```

## Images

### Brand assets (done)

Generated from the originals in `assets/`:

| File | Size | From | Used for |
| --- | --- | --- | --- |
| `logo-mark.png` | 128px | WorkshopLogo.png | Header and footer brand mark |
| `favicon-32.png` | 32px | WorkshopLogo.png | Browser tab icon |
| `favicon-192.png` | 192px | WorkshopLogo.png | Android home screen |
| `apple-touch-icon.png` | 180px | WorkshopLogo.png | iOS home screen |
| `exea-mark.png` | 256px | ExeaLabsLogo.png | About: logo tile + core-team card |
| `wesley.jpg` | 400px | WesleyWong.png | About: organiser card portrait |
| `og.png` | 1200x630 | composed | Link preview card |

The palm logo's background is already `#0E7C75`, the site's teal, so it needs no
treatment. The 9.5 MB portrait was cropped square and resized to 15.8 KB.

**Before sending the link out:** `og:image` is a root-relative path. Slack and
Facebook resolve that, but some scrapers want an absolute URL. After deploying, change
it in all three pages to your full domain, e.g.
`https://your-project.web.app/assets/img/og.png`.

## How the animation works

Two layers, deliberately split so the page cannot end up blank:

- **CSS keyframes** drive everything that loops — the four drifting ocean bands, palm
  trunk sway, individual frond movement, clouds, birds, sun pulse, water glints. These
  run with no JavaScript at all.
- **GSAP + ScrollTrigger** drive everything tied to scrolling: the hero intro,
  hero parallax, staggered section reveals, and the stat counters on About.

Content safety, in three layers: hidden start states live behind a `.js` class (so
no-script renders a plain, complete page); if GSAP is missing an IntersectionObserver
reveals instead; and if GSAP loads but its ticker never advances, `app.js` detects that
and hands back to the observer. `prefers-reduced-motion` disables all of it.

The ocean is four tiled SVG wave paths, each duplicated three times and translated by
exactly one tile width, which makes the loop seamless. Wave speed and amplitude are set
per band in `styles.css` (`.wave-band--1` … `--4`).

## Editing the facts

Hardcoded in the HTML. Search-and-replace across `public/*.html`:

| Fact | Current value | Where |
| --- | --- | --- |
| Date | Sunday, January 3, 2027 | all pages + footers, and baked into `public/assets/img/og.png` (Georgia Bold 62 / Open Sans 29) — bump the `?v=` on each `og:image` after redrawing it so scrapers refetch |
| Time | 12:30 - 5:30 PM | home key-info, signup card |
| Venue | "SF Bay Area" / "sent to registrants" | home key-info, signup card, signup logistics |
| Capacity | About 50 students | home key-info, home closing, signup card |
| Luma link | `https://luma.com/g9xq2f52` | every page |

## Page scope

Each page owns its subject and does not repeat the others:

- **Home** carries the event: what it is, who should come, the three awards, and the
  five-hour schedule.
- **Exea Labs** covers only the organisation: what it is, the numbers, what members
  get, and who runs it.
- **Sign Up** covers only registration and logistics: how approval works, details for
  the day, and what to bring.

The schedule lives on Home only. Logistics live on Sign Up only. The signup card and
the "On the day" table are deliberately non-overlapping.

Copy is kept deliberately plain: no headline wordplay, no "not X but Y" constructions,
and no em dashes. Whole site is about 730 words.

## Deliberately left out

- **Individual organiser names** beyond the host. `exealabs.org/team` was paused at
  build time, so About describes the team by function. Add cards to "Who runs it"
  in `about.html` once the roster is confirmed.
- **Specific prize values.** Three named categories; values marked to be announced.
- **Discord invite URL.** Referenced in the signup logistics table but not linked. Add it when ready.
- **Sponsor logos.** The partner strip on About shows AMD plus two open slots.
- Analytics, and any signup form of our own — Luma owns registration.

## Theme

White ground, black text, teal accents, coastal motifs, collegiate serif/sans pairing.
Tokens live in `:root` at the top of `styles.css`:

```css
--teal: #0E7C75;  --teal-deep: #075E58;  --teal-wash: #E6F2F1;  --teal-soft: #C9E4E1;
--ink: #0B0B0C;   --paper: #FFFFFF;      --sand: #FAF8F4;       --mist: #F5F7F7;
```
