# The Café — Style guide

How The Café looks and sounds: on the website, on Facebook, and on paper.
This guide collects rules that already live in the code and in client calls.
Where the code is the source of truth, it says so, and **the code wins** if
the two disagree. Fix this file when that happens.

Nothing here is business strategy or pricing policy. That stays in the
private CafeWork repo (see `CLAUDE.md`).

---

## 1. The basics

| | |
|---|---|
| Name | **The Café**, always with the é and "The". Never "The Cafe" or "Cafe". |
| Town | Leavenworth, KS (Leavenworth, Kansas in running text) |
| Website | lvcafetogo.com. The ordering link is **lvcafetogo.com/order**, never the ordering service's own address. |
| Phone, address, hours | Never typed by hand. They come from `src/_data/site.json`, so changing them there changes every piece. |
| What it is | An order-and-go deli: breakfast and lunch made to order, plus catering. Everyone orders at the counter. |

---

## 2. Voice and wording

- **Plain words and short sentences.** Many customers are older, and many
  read on a phone. Say it the way it would be said at the counter.
- **No emoji and no hashtags.** Captions and alt text are read aloud by
  screen readers, and emoji read as noise. Save exclamation marks for a
  thank-you ("Thank you!" on the form pages), not sales lines.
- **Keep posts short.** The details (which drinks, which sides) get explained
  at the counter (client 2026-10-08).
- **Name the town early in anything posted.** Facebook shows posts to people
  well outside Leavenworth (client 2026-10-10).
- **Call menu items exactly what `menu.json` calls them**, so the post, the
  board, the printed menu and Square all match.
- **Write "and" in sentences, not "&".** An "&" is fine inside an item's own
  name ("Biscuit & Gravy") but never joins a list.
- **Say a price, a rule or a condition once**, at the top, not on every row.
  This is how the weekly post handles the drink and the soup prices.
- **Never promise what we can't stand behind:**
  - Nothing is deep-fried, because there is no fryer. Fried Potatoes are
    pan-fried on the flat-top.
  - No GF or V marks, and no "gluten-free" or "vegetarian" claims, until the
    client confirms them (`menu.json` → `dietsConfirmed`).
  - The soup is sold separately. Say so wherever the specials are listed.
  - Don't list flavours or desserts that change with each batch. Customers
    ask at the counter.

### Numbers, times and dates

| Thing | Write it | Not |
|---|---|---|
| Prices on a menu | `$9.00`, `$9.00 / $11.00` (sizes in the order the name gives them) | `$9`, `9.00` |
| A price in a headline or caption | `$10`, `$10.50` | `$10.00` |
| Times | `11am`, `6am – 2pm` | `11:00 AM`, `11 a.m.` |
| Days and ranges | `Monday – Friday` (en dash with spaces) | `Mon-Fri` |
| Dates | `October 5 – 9`, `September 28 – October 2` | `10/5–10/9` |
| Facts strung on one line | separated by a middle dot: `Phone · Website · Hours` | `|` or ` - ` |
| Lists of days in a caption | One day per line, as a list, with no full stop at the end | |

---

## 3. Colour

**Source of truth: `src/assets/css/tokens.css`.** Don't copy hex values into a
new file. Use the tokens.

The palette follows the front-window graphic: cool teal backgrounds with a
warm red accent on top.

| Token | Hex | Use |
|---|---|---|
| `--cream` | `#FAF7F2` | Page and post backgrounds; the logo's fill |
| `--cream-alt` | `#EDF1F1` | Alternate page sections |
| `--teal` | `#2C5E70` | **Backgrounds only**: hero, bands, footer, sign mastheads |
| `--teal-dark` | `#1F4552` | **Backgrounds only**, plus the logo's outline |
| `--accent` | `#C0392F` | Red. Every button and link, plus day names and labels on cream |
| `--accent-dark` | `#A02F26` | Red, hover and pressed |
| `--mint` | `#8ED9D4` | Small text and links **on teal** |
| `--coral` | `#EB5E64` | Decoration only: the logo's shadow on a teal screen. Never text. |
| `--text-dark` | `#22323A` | Body text |

**The rules:**

- **Never put red on teal, either way round.** The contrast is 1.3:1 and the
  text can't be read. A red rule or stripe *beside* a teal band is fine (the
  weekly post's masthead has one); red *text* on teal is not.
- **Red text goes on cream or white** (5.08:1, passes).
- **Text on teal is cream or mint.**
- Teal bands on posts use the house gradient: `linear-gradient(135deg,
  var(--teal-dark) 0%, var(--teal) 55%, #3C7183 100%)`.
- **On paper, use a contained coloured box, not a flood of colour.** A solid
  panel cockles the paper and uses up toner.
- **Black & white versions** (`-bw` pieces, `.sign--bw`) turn every colour
  token into black. Every colour piece that may go through the office
  printer has one.

---

## 4. Type

Both fonts come from Google Fonts.

| Role | Font | Notes |
|---|---|---|
| Headings, item names, day names | **Playfair Display** 700 | `.p-display` |
| Kickers ("This Week's Lunch Specials") | Playfair Display *italic* 400 | `.p-display-italic` |
| Body text | **Lato** 400 (300 on the website) | `.p-body` |
| Small labels ("SOUP", the date line) | Lato 700, CAPITALS, spaced 0.18em | `.p-label` |
| Eyebrows | Lato 300, CAPITALS, spaced 0.3em | `.p-eyebrow` |
| Website buttons | Lato 400, CAPITALS, spaced 0.12em, red | `.btn-primary` |

The helper classes live in `src/assets/css/studio/piece.css`. Each piece sets
its own sizes; the helpers fix only the font, weight and letter spacing.

### Smallest sizes

The audience skews older, so these are floors, not targets.

| Piece | Smallest size anything a customer needs to read |
|---|---|
| Facebook post (1080px wide) | **24px**. It shows at about 540px on a phone. |
| Counter signs (read from 4–8 feet) | About **16pt**; item names and prices about 30pt |
| 11×17 counter menu | About 14pt descriptions |
| Tri-fold menu | 7.5pt. It is full, and it **clips rather than reflows**, so add items by moving a whole category, never by shrinking type. |

---

## 5. The logo (wordmark)

- **The file:** `src/assets/thecafe.svg`, which is outlined lettering with no
  colour of its own. **Always inline it** (`{% inlineSvg %}`). Placed as an
  `<img>`, it renders black.
- **The house treatment (default everywhere):** cream lettering, a teal-dark
  outline, and **one** red shadow offset down and to the right. This is what
  makes a printed sign and a Facebook post look like the same business.
  Class: `.wordmark .wordmark--light`.
- **Hero weight:** on a teal screen background (website hero, post
  mastheads), add `.wordmark--hero` for a lighter outline and a coral shadow.
- **Solid ink:** use `.wordmark--ink`, solid teal with no outline, **only**
  where an outline won't survive: a photocopy, a one-colour job, or anything
  printed very small. On black & white pieces it is solid black.
- **Don't:** add a second shadow, stretch or squash it, retype it in a font,
  put it on a busy photo, or crop it tight. It needs room around it.
- The construction (stroke widths, shadow angles) is explained in
  `piece.css`. Read that before changing anything.

### Other shared marks

- **Filigree divider:** `partials/studio/filigree.njk`. It takes the colour
  of the text around it.
- **QR codes:** `src/assets/qr-*.svg` (order, website, Facebook, survey).
  They are always **black on white with the white border left on**, because
  scanners need that border. They point at our own short links
  (lvcafetogo.com/order), so a printed code survives a change of ordering
  service.

---

## 6. Formats and sizes

| Piece | Size | Notes |
|---|---|---|
| Facebook feed post | **1080 × 1350 px**, portrait 4:5 | The tallest a feed post shows uncropped |
| Facebook profile picture | 1080 × 1080 px | Facebook crops it to a circle; keep the logo centred |
| Square item picture | 1200 × 1200 px | Placeholders for the soup and special until a photo exists |
| Receipt logo | 1280 × 648 px | Square digital receipts and invoices |
| Counter signs | 8.5 × 11 in portrait | Letter stand-up sign holders |
| Daily specials board signs | 11 × 17 in portrait | One page per plate, with no date, so they can be reused |
| Labels (tip jar, business card bowl) | 11 × 8.5 in, two 10 × 3.6 in labels | Cut apart |
| Survey card | 11 × 8.5 in, two 5.5 × 8.5 cards | One ink |
| Tri-fold menu | Letter, black & white | Also the PDF behind "Print this menu" on /menu |
| Counter menu | 11 × 17 in, both sides, colour | Bigger type |
| In-store TV board (`/menu-board`) | 1920 × 1080 | Sizes in rem only |

Every one of these is built in `/studio/`. Copy the nearest existing piece
rather than starting blank. `src/studio/README.md` explains how.

---

## 7. Facebook posts

**The weekly lunch specials post** is the regular one (`fb-weekly-specials`):

- **Layout:** a teal band at the top with the logo, the italic kicker and the
  date and town line; a cream body with one row per day (plate and sides on
  the left, soup on the right); a sides box; and a teal band at the bottom
  with phone, website, hours and address.
- **Said once, at the top:** "Starting at 11am", the usual price, "drink
  included", and the soup's cup and bowl prices. A day that costs something
  else shows its own price beside the plate.
- **Each day's sides on one line** (client 2026-10-09).
- **The caption** is written by code (`fb-weekly-specials.11tydata.js`)
  from the same data as the picture, so the two can't disagree. Its order is:
  the opening line with the town, dates, time and price; one line per day;
  the sides line; the soups line ("sold separately"); then address · hours ·
  phone · order link.
- **Routine:** add next week to `specials.json`, run `npm run build`, upload,
  then post the PNG and copy the caption from `/studio/downloads/`.

**For any post:**

- **Upload the PNG, not a JPEG.** Facebook re-compresses whatever it gets, and
  flat colour with crisp letters suffers most from JPEG.
- Use teal bands top and bottom so posts read as one account, and a cream
  body wherever red text is needed.
- Copy the post's wording into the caption too; don't rely on text that
  exists only inside the picture.

---

## 8. Printed pieces

- **Print from the PDF** (Print → Save as PDF) at **100% / Actual size**,
  never "Fit to page". The lettering stays sharp at any size.
- **Leave a margin.** A desktop printer can't print the last ¼ inch. A
  full-bleed piece needs a borderless printer or trimming.
- **Proof every menu PNG after any menu change.** An overrun on the tri-fold
  gives no warning; it just cuts text off.
- **Signs with dates go stale.** A sign meant to go back up (the daily
  specials board signs) carries no date at all.

---

## 9. Photos

- **Food and places only, never people.** The staff don't want photos of
  themselves online.
- Use only photos the café took or has permission to use.
- **Web copies:** about 2000px, upright, with **camera and GPS data
  stripped**. Phone photos carry the location. Originals go in
  `photos-originals/`, which is never committed.
- **Every photo needs alt text** describing what's in it, for screen readers.
- Gallery tiles crop to 4:3. Set `position` so the food stays in the frame.
- After adding one, run `npm run thumbs`. Details are in the `_note` at the
  top of `src/_data/photos.json` and `gallery.json`.

---

## 10. Accessibility checklist

Run through this list before anything goes out.

- [ ] Text contrast passes: red on cream or white, cream or mint on teal,
      **never red on teal**
- [ ] Nothing a customer needs is below the floor in §4
- [ ] Every picture has alt text; every post's words are also in its caption
- [ ] No emoji standing in for words
- [ ] Website: lazy-loaded images, `prefers-reduced-motion` respected, and
      keyboard focus visible (a red outline)

---

## Where the rules live

| What | File |
|---|---|
| Palette | `src/assets/css/tokens.css` |
| Logo treatment, type helpers, QR | `src/assets/css/studio/piece.css` |
| Website type and buttons | `src/assets/css/style.css` |
| Counter signs | `src/assets/css/studio/sign.css` |
| Weekly post | `src/studio/fb-weekly-specials.njk` + `.11tydata.js`, `src/assets/css/studio/fb-weekly-specials.css` |
| Specials wording | `src/_lib/specials-caption.js` |
| Name, phone, address, hours, links | `src/_data/site.json` |
| Item names, prices, diet marks | `src/_data/menu.json` (read its `_note` keys) |
| Making a new piece, exporting, uploading | `src/studio/README.md` |
