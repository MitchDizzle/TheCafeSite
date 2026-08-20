---
# This file documents the folder for whoever is editing it. It must never
# become a page — Eleventy would otherwise build it to /studio/README.html.
permalink: false
eleventyExcludeFromCollections: true
---

# The Studio board

Internal proof board at **`/studio/`** — flyers, print pieces, menus, social
art. Not linked from anywhere on the site, not in `robots.txt`, not in
`sitemap.xml`, and served with an `X-Robots-Tag: noindex` header (see the
"Private studio board" block in `src/.htaccess`).

That is obscurity plus a no-index request, **not access control**. Anyone with
the URL can open it. `src/.htaccess` carries a commented-out Basic Auth block
if that changes.

## Adding an item

Two ways, and the board merges them into one list.

### 1. Drop a finished file in — no code

Put a PDF, PNG, JPG, WEBP, SVG, GIF, AVIF, or HTML file into
`src/studio/files/`. It appears on the board on the next build.

    src/studio/files/fall-flyer.pdf            → category "Files"
    src/studio/files/menus/lunch-menu.pdf      → category "Menus"

A **subfolder becomes the category**. The filename becomes the title, tidied
up: `02-fall-specials.pdf` reads as "Fall Specials" (a leading number is
treated as a sort prefix and dropped).

To override any of that, add `src/studio/_meta.json` — note that it sits one
level **above** `files/`, because everything inside `files/` is copied into the
published site and these notes are internal. Every field is optional, and files
you leave out still show up with their defaults:

```json
{
  "menus/lunch-menu.pdf": {
    "title": "Lunch Menu — Fall",
    "category": "Menus",
    "note": "Waiting on the client to confirm the soup rotation.",
    "order": 10
  }
}
```

Keys are paths relative to `files/`, with forward slashes. Files inside `files/`
that start with `.` or `_` are skipped entirely.

### 2. Build it as a template — themed, and live

A piece written as a `.njk` file in `src/studio/` uses the site's real palette
and wordmark, and its preview on the board is the actual page in an iframe — so
a CSS tweak shows up on the board immediately, with no re-export.

Copy `fb-profile.njk` as a starting point. The front matter contract:

| Field | Required | Purpose |
|---|---|---|
| `layout` | yes | Always `layouts/piece.njk` |
| `title` | yes | Browser tab |
| `canvasW` / `canvasH` | yes | Artboard size — `"11in"` or `"1080px"` |
| `pageSize` | print only | `@page` size, e.g. `"11in 17in portrait"`. Its presence is also what puts a **Print** button on the card. |
| `pageCss` | usually | The piece's own stylesheet in `assets/css/` |
| `tags: studio` | yes | This is what puts it on the board |
| `studioTitle` | | Board heading (defaults to `title`) |
| `studioCategory` | | `Print`, `Social`, `Menus`, `Flyers`, … |
| `studioSize` | | Human-readable size line |
| `studioNote` | | Handling note shown on the card |
| `studioW` / `studioH` | yes | Artboard size **in pixels**, for the preview frame. Inches × 96: 11 × 17in → `1056` × `1632`. |
| `studioOrder` | | Sort within its category (default 500) |

Shared piece styles — the wordmark treatment, filigree, QR padding, type
helpers — live in `src/assets/css/piece.css`. Read it before writing a new
piece; the wordmark's stroke-and-single-shadow construction is fussy and the
reasoning is documented there.

## The opening-day pieces

Three artboards carry the October 5th announcement, and none of them states
the date itself:

| Piece | For |
|---|---|
| `front-door-banner` | 11 x 17 taped inside the door glass |
| `fb-opening-day` | 1080 square Facebook feed post |
| `fb-event-cover` | 1920 x 1005 cover image on a Facebook Event |

The date, the hours and the address all come from the `opening` block in
`src/_data/site.json`. Change it there once and all three follow; there is no
second copy to catch. If the date moves, that is the only edit.

### Where the specials go

`fb-opening-day.njk` opens with a `specials:` list. Fill it in and the card
sets the lines in the display italic:

```yaml
specials:
  - "Biscuits & sausage gravy"
  - "Chicken fried steak & eggs"
  - "Cinnamon roll, still warm"
```

Three lines read best, four fit, five crowd the date above them. Write `&` as
a literal, never `&amp;` — Nunjucks escapes these on output.

Leave the list **empty** and the card exports with `specialSlots` blank ruled
lines instead, so the specials can be written on by hand or typed over the PNG
later. A blank card also carries a red reminder line, which is there so an
unfinished post cannot quietly become a published one — set
`showSpecialsHint: false` when a blank export is what you actually want.

The event cover has no specials card on purpose. An Event already has a
description field for them, and the cover is cropped differently on every
surface Facebook shows it on — only the centre of it is safe to put words in.

## Exporting

```bash
npm run export
```

Builds the site, then renders every board piece to PNG at its exact artboard
size into `exports/` (gitignored). One piece at a time:

```bash
npm run export -- fb-profile
```

The slug is the filename without `.njk`, and each card on the board prints its
own command. New pieces are picked up automatically — `studio/pieces.json` is
generated from the same front matter that puts them on the board.

`studioExportScale` in front matter multiplies the output: `3` on an 11 x 17
gives 3168 x 4896, about 288dpi.

### Why a command and not a button on the board

In-browser DOM-to-PNG converters cannot reproduce these pieces. The wordmark is
an inline SVG carrying `filter: drop-shadow()` and `paint-order: stroke`, over a
CSS gradient, in Google-hosted fonts. Those rasterisers either drop CSS filters
on SVG or need every font inlined as base64 first, and they fail *quietly* — you
get a subtly wrong file and find out once it is already a profile picture.
`scripts/export-studio.js` renders the real page in the real engine instead.

### Print pieces

Prefer **Print → Save as PDF** at 100% / "Actual size" — never "Fit to page".
That keeps the type and the wordmark vector, so it stays sharp at any size; the
PNG export of an 11 x 17 is only 96dpi unless you raise `studioExportScale`.

The full-bleed banner needs a borderless printer or a trim — a desktop printer
reserves about 0.25in it will not print into. `front-door-banner-inset` is the
same sheet with nothing touching the paper edge.

### Uploading to Facebook

Upload the **PNG**. This artwork is flat colour, type, and a hard-edged offset
shadow, which is exactly what JPEG handles worst — ringing along every letter
edge. Facebook re-encodes to JPEG on their side no matter what you send, so a
lossless source means one generation of loss instead of two. The export is
fully opaque, so nothing changes when Facebook flattens transparency.

## QR codes

`src/assets/qr-facebook.svg` and `qr-website.svg` were generated at error
correction level **H** with no quiet zone — the white padding around them is
CSS (`.qr` in `piece.css`), and scanners need it, so don't crop it. They draw
with `currentColor`, so they must be inlined with the `inlineSvg` shortcode
rather than used in an `<img>`.

To regenerate one (the `qrcode` package is intentionally not a project
dependency — this is a one-off):

```bash
npx qrcode -o src/assets/qr-facebook.svg -t svg -e H -w 0 "https://www.facebook.com/LVCafeToGo"
```

Then strip the background `<rect>` and swap `#000000` for `currentColor`.
