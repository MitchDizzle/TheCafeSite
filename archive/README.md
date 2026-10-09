# archive/

Things that are no longer used, kept so git still has them and any of them can
come back. Nothing in here is built or uploaded: Eleventy reads only `src/`.

| Folder | What | Archived |
|---|---|---|
| `site-src/` | Retired site files, each at the **same path it had under `src/`**: `site-src/studio/fb-dish.njk` was `src/studio/fb-dish.njk` | see below |
| `share/` | Phone hand-off copies of studio art (the opening-day post) | 2026-10-09 |
| `FrontBanner/` | The first door banner, made before `/studio/` existed; `src/studio/front-door-banner.njk` replaced it | 2026-10-09 |
| `The Cafe.htm`, `The Cafe » Catering.htm` and their `_files` | Saved copies of the old site | 2026-05 |

## What's in `site-src/`

| Files | What they were | Why archived |
|---|---|---|
| `studio/fb-open-monday.*`, `studio/fb-opening-day.njk`, `studio/fb-event-cover.njk`, `studio/fb-who-we-are.njk`, and their `assets/css/` files | The opening-week Facebook posts and event cover (opening day was 2026-10-05) | Opening week is over. `fb-open-monday`'s caption reads the newest week in `specials.json`, so left on the board it announced "our first week of specials" for every later week |
| `studio/fb-dish.*`, `studio/fb-story-special.*`, `_data/specialPhotos.js`, and their `assets/css/` files | A Facebook post per food photo in `photos.json` (with its caption), and a Story per daily-special photo | 2026-10-09. Dish posts are made on the phone now, with Photo post on the kitchen front page (`kitchen/front.html` draws the same design), and daily Stories were dropped when specials went weekly. The photos stay in `src/_data/photos.json` and are on `/gallery` |
| `studio/menu-trifold.njk`, `studio/menu-handout.njk`, `studio/menu-handout-bw.njk`, `_includes/partials/menu-handout-sheets.njk`, `assets/css/menu-large-print--handout.css` | The colour tri-fold, and the whole menu on one letter sheet (colour and B&W) | 2026-10-09. The cafe prints the black & white tri-fold and the big-print menus (large print, counter). The colour tri-fold is only a wrapper: the sheets and their colour styles are still live in `menu-trifold-sheets.njk` and `menu-trifold.css`, used by the B&W one. `/studio/downloads/menu-trifold.pdf` and `.png` redirect to the B&W files (`src/.htaccess`) |
| `studio/menu-large-print.njk` | The menu in large type on three letter sheets, offered on `/menu` as "Print this menu in large type" | 2026-10-09. The cafe orders from the two-sided 11×17 (`menu-counter.njk`) instead, and the `/menu` link wasn't useful. Its partial and stylesheet stay: the 11×17 is built on them. `/studio/downloads/menu-large-print.pdf` and `.png` redirect to the 11×17 (`src/.htaccess`) |
| `team.njk`, `assets/css/team.css` | A Meet the Team page with photo cards, never filled in | 2026-10-09. The staff don't want their photos online (2026-10-02), so it was never published (`permalink: false`); kept as a starting point if that changes |

## Restoring something

Move each of its files back to the same path under `src/`
(`git mv archive/site-src/studio/x.njk src/studio/x.njk`, and its CSS), then
`npm run build` and proof the PNG.

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
