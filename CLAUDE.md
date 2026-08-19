# TheCafeSite — Claude instructions

Static site for The Cafe (catering & meal prep, Leavenworth KS), built with **Eleventy 3 + Nunjucks**. Mirrors the setup of the `mtch.tech` project at `E:\ScriptsGit\mtch.tech` — check there first when a convention is unclear.

## Planning & tasks
Project planning, decisions, and the task backlog live OUTSIDE this public repo at `E:\GitHub\CafeWork\` (private repo) — read `PLAN.md` there first, take tasks from `TASKS.md`. Never commit business/planning details, pricing strategy, or outreach scripts to this repo.

## Build
- `npm start` — Eleventy dev server with live reload on `http://localhost:8080`. Its extensionless URL resolution matches `.htaccess`, so `/catering` works locally exactly as it does in production. **Use this rather than opening files from `file://`**, which cannot resolve extensionless links.
- `npm run build` — clean build into `_site/`. **`_site/` is what gets uploaded**, not `src/`. Both `_site/` and `node_modules/` are gitignored.
- `social/`, `FrontBanner/`, `archive/`, and the `.md` docs stay out of the build entirely.

## Structure
- `src/*.njk` — one file per page. `src/src.11tydata.js` sets `permalink` so pages build to flat files (`catering.njk` → `catering.html`) instead of Eleventy's default `catering/index.html`. This keeps every live URL, canonical tag, and sitemap entry unchanged. Don't remove it without planning redirects.
- `src/_includes/layouts/base.njk` — `<head>`, fonts, canonical/og tags, body shell. `layouts/page.njk` adds nav, `<main>`, and footer; inner pages use it.
- `src/_includes/partials/` — `nav.njk`, `footer.njk`, `construction-banner.njk`. Nav/footer are **partials now, not duplicated per page** — the old `components/` reference copies are gone, so there is nothing to keep in sync.
- `src/_data/site.json` — name, URL, phone, email, address, and the `underConstruction` flag that shows/hides the banner site-wide. `nav.json` — primary and footer link lists.
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
