# archive/

Things that are no longer used, kept so git still has them and any of them can
come back. Nothing in here is built or uploaded: Eleventy reads only `src/`.

This folder is for things retired **by hand**. Studio pieces also archive
**themselves** after 14 days without a change, without moving: they stay in
`src/studio/` and simply aren't built (see "Newest first, and the archive" in
`src/studio/README.md`). The studio board lists both kinds under Archive.

| Folder | What | Archived |
|---|---|---|
| `site-src/` | Retired site files, each at the **same path it had under `src/`**: `site-src/studio/fb-dish.njk` was `src/studio/fb-dish.njk` | see below |
| `share/` | Phone hand-off copies of studio art (the opening-day post) | 2026-10-09 |
| `FrontBanner/` | The first door banner, made before `/studio/` existed; `src/studio/front-door-banner.njk` replaced it | 2026-10-09 |

Removed 2026-11-03, kept only in git history: the saved copies of the old
theabcafe.com site (`The Cafe.htm`, `The Cafe » Catering.htm` and their
`_files`). Also gone from here: `docs/`, the first project notes, which moved
to the private planning repo with anything else that isn't for the public.

## What's in `site-src/`

| Files | What they were | Why archived |
|---|---|---|
| `studio/fb-open-monday.*`, `studio/fb-opening-day.njk`, `studio/fb-event-cover.njk`, `studio/fb-who-we-are.njk`, and their `assets/css/` files | The opening-week Facebook posts and event cover (opening day was 2026-10-05) | Opening week is over. `fb-open-monday`'s caption reads the newest week in `specials.json`, so left on the board it announced "our first week of specials" for every later week |
| `studio/fb-dish.*`, `studio/fb-story-special.*`, `_data/specialPhotos.js`, and their `assets/css/` files | A Facebook post per food photo in `photos.json` (with its caption), and a Story per daily-special photo | 2026-10-09. Dish posts are made on the phone now, with Photo post on the kitchen front page (`kitchen/front.html` draws the same design), and daily Stories were dropped when specials went weekly. The photos stay in `src/_data/photos.json` and are on `/gallery` |
| `studio/menu-trifold.njk`, `studio/menu-handout.njk`, `studio/menu-handout-bw.njk`, `_includes/partials/menu-handout-sheets.njk`, `assets/css/menu-large-print--handout.css` | The colour tri-fold, and the whole menu on one letter sheet (colour and B&W) | 2026-10-09. The cafe prints the black & white tri-fold and the big-print menus (large print, counter). The colour tri-fold is only a wrapper: the sheets and their colour styles are still live in `menu-trifold-sheets.njk` and `menu-trifold.css`, used by the B&W one. `/studio/downloads/menu-trifold.pdf` and `.png` redirect to the B&W files (`src/.htaccess`) |
| `studio/menu-large-print.njk` | The menu in large type on three letter sheets, offered on `/menu` as "Print this menu in large type" | 2026-10-09. The cafe orders from the two-sided 11×17 (`menu-counter.njk`) instead, and the `/menu` link wasn't useful. Its partial and stylesheet stay: the 11×17 is built on them. `/studio/downloads/menu-large-print.pdf` and `.png` redirect to the 11×17 (`src/.htaccess`) |
| `studio/front-door-banner.njk`, `studio/front-door-banner-inset.njk`, `_includes/partials/banner-body.njk`, `assets/css/front-door-banner.css` | The front door banner, full bleed and as an inset panel | 2026-10-10, no longer needed (client). Nothing else used the partial. `sign-door-hours` took its place on the door 2026-10-31 |
| `studio/newspaper-photo.njk`, `assets/css/newspaper-photo.css` | The storefront photo with the wordmark in the sky, for the October 2026 newspaper piece | 2026-10-10, no longer needed (client). The photo itself (`assets/photos/storefront.jpg`) stays: the gallery uses it |
| `studio/sign-day-soups(-bw).*`, `_includes/partials/studio/sign-day-soups.njk` | The soup of the day as its own letter-landscape board sign, a page per soup, no day or date | 2026-10-18, the same day it was made: the soup went back on the daily special sheets for now (client), while the board's layout is worked out. Its `.dsoup` styles are still in `assets/css/studio/sign.css` |
| `studio/sign-exit-door.njk`, `assets/css/sign-exit-door.css` | The Exit Only door sign | 2026-10-10, no longer needed (client) |
| `studio/desktop-wallpaper.njk`, `studio/phone-wallpaper.njk`, `studio/ipad-wallpaper.njk`, `assets/css/device-wallpaper.css`, `assets/css/ipad-wallpaper.css` | Wallpapers for the kitchen PC, phones and the iPad | 2026-10-10, no longer needed (client). `partials/filigree.njk` stays in `src/` (now `partials/studio/filigree.njk`): other pieces use it |
| `studio/fb-costume-cookie.*`, `studio/label-costume-cookies.njk`, `assets/css/studio/fb-costume-cookie.css`, `assets/css/studio/label-avery.css`, `assets/studio/cookie-gf-mm.png`, `assets/studio/cookie-art.svg` | The costume cookie post (a free gluten-free M&M Cookie for anyone in costume, Friday 2026-10-30), its bag labels (Avery 18262), Mitch's cookie cut-out and the drawn stand-in | 2026-11-03, Halloween is over (client). The labels' stylesheet went with them: nothing else used it |
| `studio/fb-macho-nachos.*`, `assets/css/studio/fb-macho-nachos.css`, `assets/studio/macho-nachos.jpg`, `assets/studio/cream-puffs.jpg` | A one-day post: Macho Nachos, the lunch special on 2026-11-03, and the plain and chocolate cream puffs, with Mitch's photos | 2026-11-03, posted that day (client). It reads the day from `specials.json` by `postDate` and the cream puffs from `desserts.json`: a new date needs that day in `specials.json` |
| `studio/sign-todays-sides-bw.njk` | A one-day counter sign for a special's sides: a pick of two (2026-10-29) or two to double up on (2026-10-30) | 2026-11-03, with the rest of that week. It reads the day `sidesDate` names from `specials.json`; its `.ts-` styles are still in `assets/css/studio/sign.css` |
| `team.njk`, `assets/css/team.css` | A Meet the Team page with photo cards, never filled in | 2026-10-09. The staff don't want their photos online (2026-10-02), so it was never published (`permalink: false`); kept as a starting point if that changes |

## Restoring something

Move each of its files back to the same path under `src/`
(`git mv archive/site-src/studio/x.njk src/studio/x.njk`, and its CSS), then
`npm run build` and proof the PNG.

- **Paths changed on 2026-10-12**, after everything above was archived: the
  studio pieces' partials are in `_includes/partials/studio/` (the site's in
  `partials/site/`), their stylesheets in `assets/css/studio/`, and
  `_includes/specials-caption.js` is `_lib/specials-caption.js`. A restored
  piece goes to those folders, and its `include`, `pageCss` and `require`
  lines need the new paths.

- The opening posts read the `opening` block and `owners` in
  `src/_data/site.json`, which are still there. They were written as an
  **opening, not a grand opening**; a grand opening is a new piece, not these
  with the word changed.
- The handout's CSS was cut out of `menu-large-print.css`; paste
  `menu-large-print--handout.css` back in above its "Black & white" section.
  Restoring the colour tri-fold also means deleting its redirect in
  `src/.htaccess` and deciding which tri-fold `/menu` links.
- `fb-story-special` needs `_data/specialPhotos.js` back with it. `fb-dish`
  looks each photo's `item` up in `menu.json` by its exact name and fails the
  build if it isn't there (a daily special sets `special: true` instead).
