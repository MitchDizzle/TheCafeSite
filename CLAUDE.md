# TheCafeSite — Claude instructions

Static site for The Cafe (catering & meal prep, Leavenworth KS), built with **Eleventy 3 + Nunjucks**. Mirrors the setup of the `mtch.tech` project at `E:\ScriptsGit\mtch.tech` — check there first when a convention is unclear.

## Planning & tasks
Project planning, decisions, and the task backlog live OUTSIDE this public repo at `E:\GitHub\CafeWork\` (private repo) — read `PLAN.md` there first, take tasks from `TASKS.md`. Never commit business/planning details, pricing strategy, or outreach scripts to this repo.

## Build
- `npm start` — Eleventy dev server with live reload on `http://localhost:8080`. Its extensionless URL resolution matches `.htaccess`, so `/catering` works locally exactly as it does in production. **Use this rather than opening files from `file://`**, which cannot resolve extensionless links.
- `npm run build` — clean build into `_site/`, **then exports every `/studio/` piece to PNG (and PDF, where the piece sets `pageSize`) via headless Chrome**. **`_site/` is what gets uploaded**, not `src/`. Both `_site/` and `node_modules/` are gitignored. Chrome or Edge is therefore a build dependency; set `CHROME_PATH` if it is not in a standard location. `npm run export` re-runs just the artwork half.
- Exported pieces are published at `/studio/downloads/` so they can be saved on a phone — see `src/studio/README.md`. `npm start` does not export, so that page is empty until a `npm run build` has run.
- `social/`, `FrontBanner/`, `archive/`, and the `.md` docs stay out of the build entirely.

## Structure
- `src/*.njk` — one file per page. `src/src.11tydata.js` sets `permalink` so pages build to flat files (`catering.njk` → `catering.html`) instead of Eleventy's default `catering/index.html`. This keeps every live URL, canonical tag, and sitemap entry unchanged. Don't remove it without planning redirects.
- `src/_includes/layouts/base.njk` — `<head>`, fonts, canonical/og tags, body shell. `layouts/page.njk` adds nav, `<main>`, and footer; inner pages use it.
- `src/_includes/partials/` — `nav.njk`, `footer.njk`, `construction-banner.njk`. Nav/footer are **partials now, not duplicated per page** — the old `components/` reference copies are gone, so there is nothing to keep in sync.
- `src/_data/site.json` — name, URL, phone, email, address, the `underConstruction` flag that shows/hides the banner site-wide, and `ordering.url` (the Square Online pickup site). Every "Order Online" button is conditional on that URL, so it stays empty until the Square site exists rather than shipping a dead button. `nav.json` — primary and footer link lists.
- `src/_data/menu.json` — the menu, shared by `/menu`, `/menu-board` and both `/studio/` menu pieces. Sandwiches are two categories on purpose (`sandwiches` = cold/deli, `hot_sandwiches` = griddle, which sits beside the burgers on every layout) — see `_note_hot_cold`. A category priced flat carries one `sizing` line instead of a price per row (`_note_flat_price`), and a build-your-own category uses `picks` columns instead of priced rows (`_note_picks`); every template guards `c.items`, so a `picks`-only category is legal. Dietary marks (GF/V/LS) come from its `diets` registry; `dietsConfirmed` gates every mark on the public page — while it is false `/menu` renders no marks, key, filter, or `suitableForDiet`, and the tri-fold carries a proof-only warning instead. Read the `_note_diet` keys before touching a mark.
- `src/menu-board.njk` → `/menu-board` — the in-store screen, built for a 1920×1080 TV in browser fullscreen. Unlisted: `noindex`, off `nav.json`, off the sitemap — but unlisted is not private, so nothing sensitive goes on it. Scales by a viewport-tied root font-size with **every length in rem**; a `px` value in `menu-board.css` is a bug.
- `src/_includes/partials/diet-marks.njk` — the GF/V/LS marks, shared by `/menu` and the board. The macro is ungated on purpose; **the caller applies `menu.dietsConfirmed`**. Read the comment in the partial before using it.
- `src/studio/menu-trifold.njk` and `src/studio/menu-large-print.njk` — the two printable menus, same data, different geometry. The tri-fold is full: its panels are a fixed 8.5in and **clip rather than reflow**, so adding items means moving a whole category between panels and re-proofing the PNG, not shrinking type. The large-print piece is the answer when type needs to be bigger (about 10pt descriptions against the tri-fold's 7.5pt); it costs three plain sheets and that is the trade. **Proof both PNGs after any menu change** — an overrun is silent.
- `src/index.njk` — self-contained hero/gateway page. No nav or footer, sets `noSiteJs: true`, carries the JSON-LD via `headExtra`.
- Page-specific CSS lives in `src/assets/css/<page>.css` and is wired up with `pageCss` front matter; shared styles are `style.css`.

## Front matter
`title` and `description` are required. Optional: `ogTitle`, `ogDescription`, `pageCss`, `headExtra`, `bodyClass`, `noSiteJs`, `noindex`.

Write `&` as a literal in front matter, never `&amp;` — Nunjucks escapes these values on output, so a pre-escaped entity ships as `&amp;amp;`.

## Config filters
- `bust` — content-hash query string on asset URLs. Required for CSS/JS because `.htaccess` caches them for 7 days.
- `hasAsset` — true if a file exists in `src/`, for artwork-with-text-fallback patterns.
- `inlineSvg` — inlines an SVG's markup so page CSS can color it. An `<img>` is a separate document, so an SVG with no `fill` of its own renders **black** inside one; `assets/thecafe.svg` is outlined with no fill and must be inlined to pick up a color.

## Conventions
- Palette: cream `#FAF7F2`, teal `#2C5E70` / `#1F4552`, accent red `#C0392F` / `#A02F26`, mint `#8ED9D4`, `--text-dark #22323A`. Teal and teal-dark are **grounds only** (hero, footer, overlay); red on teal is 1.3:1, never put one on the other. Red accent carries every interactive element. Playfair Display headings, Lato body, via Google Fonts.
- Images lazy-loaded; respect `prefers-reduced-motion`; keep pages accessible (this audience skews older).
- Live site: `https://lvcafetogo.com` (canonical/og:url/sitemap use this host). Internal links are root-absolute and extensionless (`/about`) — `src/.htaccess` rewrites them to the real files.
- `404.html` is served by `ErrorDocument` at whatever path was requested, so it carries `noindex: true` and deliberately has **no canonical or og:url**. Its links are root-absolute so they still work from any depth.
- Social templates live in `social/` (fixed-size HTML → PNG screenshots); door signage precedent in `FrontBanner/`.

## Safety
Public repo: no secrets, no API keys, no customer data — ever. Formspree endpoints are OK (domain-restricted).
