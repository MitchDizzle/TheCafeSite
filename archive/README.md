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

## Restoring something

Move each of its files back to the same path under `src/`
(`git mv archive/site-src/studio/x.njk src/studio/x.njk`, and its CSS), then
`npm run build` and proof the PNG.

- The opening posts read the `opening` block and `owners` in
  `src/_data/site.json`, which are still there. They were written as an
  **opening, not a grand opening**; a grand opening is a new piece, not these
  with the word changed.
