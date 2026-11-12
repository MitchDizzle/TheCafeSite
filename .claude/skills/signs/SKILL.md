---
name: signs
description: Make or update a printed counter sign for The Cafe (today's desserts, today's special sides, a fridge or "do not open" sign, any one-off black & white letter sign), proof it, and hand Mitch the PDF to print. Use for any request that ends in "need the sign for...".
---

# Counter signs, fast

Mitch asks between customers and prints straight from the PDF you send. The
design is settled (STYLE.md, "Counter signs, quickly"); don't redesign. Get
the words right, proof once, send the PDF.

## The everyday three are on the kitchen board

Since 2026-11-11 the cafe prints today's special sides, the special & soup
and the dessert fridge sign itself: the front page's **Manage → Signs**
(`kitchen/lib/signs.js`, kitchen/README.md "Signs"), from Specials and
Square. Point Mitch there first. Make one here only when he asks for a PDF,
or for something that screen can't do.

## Which piece

| Request | Piece | What to change |
|---|---|---|
| Today's desserts / dessert fridge | `sign-desserts-bw` | Run `npm run desserts` first (reads Square). Then front matter only: `skipDesserts`, `skipKinds` (in Square, not in the fridge), `inKinds` (in the fridge, Square says 0), `addDesserts` (not in Square yet, `priceOf` another item), `signNames`, `treats` |
| The open fridge (not self serve) | `sign-desserts-open-fridge-bw` | Its `sign:` rows |
| Today's special sides | `sign-todays-sides-bw` | `sidesDate` to today; the day's `sides` / `extraSides` in `src/_data/specials.json` (two sides that come with the plate = two entries, both also in `extraSides`; a "today only" extra side = `extraSides` only) |
| Day's special, soup & desserts on letter (colour printer, light on ink; the front counter, beside the sides sign) | `sign-day-letter` | `signDate` to the day. `onePage: true` (the usual): the plate, the soup and the desserts on one page, no swap list. `onePage: false`: the plate on page 1, the soup on page 2 (with its `soupNote`), from `specials.json`; page 3 is the desserts, the same rows as `sign-desserts-bw` (edit its front matter, not this one; `dessertPage: false` drops it) |
| Magic bars & rice crispy treats | `sign-dessert-bars-bw` | Nothing; it reads Square |
| Anything else, one-off | a fill-in sign | `npm run new-sign -- <name> "<Heading>"`, fill in `sign:` |

If Mitch names something Square has at 0 or doesn't have, make the sign
anyway (override above) and tell him in one line to fix it on the kitchen
board (Manage → Desserts), since online ordering reads the same count.

## Steps

1. `git status -sb`: be on `dev`.
2. Change the data / front matter (table above). Never type a price that
   Square or menu.json has.
3. `npx @11ty/eleventy --quiet && node scripts/export-studio.js <slug>`
   (one piece, a few seconds; `npm run build` does every piece, slower).
4. Read `_site/studio/downloads/<slug>.png`. Check: nothing cut off at the
   bottom, nothing listed twice, names as Mitch said them, prices right.
5. SendUserFile the **PDF** (`display: attach`), the one he prints.
6. Commit on `dev` (data files like `desserts.json` / `specials.json` with it).
   Changing today's `sides`/`extraSides` only reaches Square once `main` is
   pushed: ask whether to merge `dev` into `main` and push.

## Fill-in sign blocks

The top of `src/_includes/layouts/quick-sign.njk` documents them: `rows`
(`square:` / `name:`+`priceOf:` / `name:`+`price:` / name only), `label`,
`boxes` (+`joiner`), `text` (+`big`), `list` (+`title`), `caution` (+`sub`).
Names shrink to one line and a full sign shrinks to the page by themselves;
if it comes out small, it's doing too much: split it into two signs.

## Report

Three or four bullets: what's on each sign, anything Square needs fixed on the
board, whether it's live. No step narration.
