# Order Up — the game's plan, art theme and style guide

A small phone game on lvcafetogo.com: a short-order cook's week at The Café,
played one shift at a time. Something to tap through while waiting for an
order, or at home, that feels like this kitchen and no other.

**It's built, as a demo, at `/play`** (unlisted: no link to it, noindex, off
the sitemap). `npm start`, then `http://localhost:8080/play`.

| What | Where |
|---|---|
| The page (title screen, the kitchen's fixed parts) | `src/play.njk` |
| The logic | `src/assets/js/play.js` |
| The look | `src/assets/css/play.css` |
| The drawings (one SVG sprite sheet) | `src/_includes/partials/game/sprites.njk` |
| **Everything tunable**: foods, tickets, specials, items, odds, prices, how hard each day is, the family's lines | `src/_data/game.json` |
| The check that the game still matches the menu | `src/play.11tydata.js` |
| This guide, in colour | `game/style-sheet.html` (made by `node game/make-style-sheet.js` from `style-sheet.src.html`; it uses the game's own sprite sheet) |
| A stand-in player, for checking the balance | `game/bot.js` |

Everything in the house `STYLE.md` still applies. This file only adds what a
game needs, and where the two meet it says which rule wins.

---

## 1. The idea in one paragraph

You are on the flat-top at 417 South 6th St. Tickets come in on the rail,
just like the kitchen board. Tap a bin: food that cooks goes on the griddle,
the rest goes on the plate. Pull the food when it's done (not burnt), and
tap Send when the plate has what a ticket shows, before the ticket goes
late. A **run is one week, Monday to Friday**; each **day is one shift, 6am
to 2pm**, in about 100 seconds. After close you pick one item for free and
spend the day's tips on more. Finish Friday's catering order and the week is
yours. Spill all three coffees in one day and the week is over: start a new
one.

Why this and not a generic game: everything in it is something a customer
has seen or eaten here. The pickle spear on the plate, the clamshell boxes,
the steel prep tables, the 6am sunrise over the parking lot, specials
starting at 11am with a drink included, no fryer, closed weekends.

---

## 2. The run

| Piece | What it is | Real thing it comes from |
|---|---|---|
| **Run** | One week, Monday – Friday. No weekends: the café is closed. | The hours |
| **Dawn** | Before each shift, pick the day's special from three. One side is a quicker plate; two sides tip more. | `specials.json`, the weekly posts |
| **Day** | One shift, 6am – 2pm, about 100 seconds. A clock on the HUD runs the real hours. | The hours |
| **Breakfast** (6am – 11am) | Eggs, bacon, toast, potatoes, biscuit and gravy, burritos | `menu.json` breakfast |
| **Lunch** (11am – 2pm) | Burgers, wraps, salads, soup, sides, the special. The bins turn over at 11am, once the last breakfast ticket is out. | "Starting at 11am" |
| **The pickle spear** | At lunch, any plate can take one: $1 more. Never required. | Nearly every plate in the photos |
| **Lives** | Three **coffee cups**. A ticket that runs out of time is a walk-out and spills one. They are poured again each morning. | |
| **After close** | Pick one item of three, free. Then the shop: three more for tips, and "Restock" for a new three. | |
| **Family** | From Wednesday, family may stop by at lunch (§4). | |
| **Friday** | Ends on a **catering order**: five platters, one after another, on one clock. | The catering photos |
| **Win** | Finish Friday's catering on time. The week's tips are the score. | |
| **Lose** | Three spilled coffees in one day, or the catering goes out late. | |

**Between runs** (kept on the phone only, §13): the **Recipe Box**, a card
for every ticket and special by its real name, which turns into the café's
own photo once it has been served 10 times; the best week; weeks finished.

**Not built yet:** unlocks (new tickets opening up over many runs), and
keeping a week that was left half way (closing the page ends it).

---

## 3. Items: gear and tricks

Every item has a **rarity: Normal, Rare or Epic**. After each close one is
picked for free from three, and three more are for sale. Each card is dealt
by rarity, and the odds move toward the better ones as the week goes on:

| After | Normal | Rare | Epic |
|---|---|---|---|
| Monday | 72% | 24% | 4% |
| Tuesday | 60% | 31% | 9% |
| Wednesday | 50% | 36% | 14% |
| Thursday | 40% | 40% | 20% |

(Friday has no shop: it ends in the catering order.) The odds, names,
prices and how many of each can be owned are in `game.json` → `items`,
`odds`. What an item *does* is in `play.js` under the same `id`.

**Normal**

| Name | Does |
|---|---|
| Grill Press (2) | Food cooks a fifth faster |
| Warming Shelf (2) | Done food waits 5 more seconds before it burns |
| Order Bell | Each plate sent gives the other tickets 2 more seconds |
| Pickle Jar (3) | A plate with a pickle spear tips $1 more |
| Tip Jar (2) | Every plate tips $1 more |
| Clamshells | To-go tickets wait 8 seconds longer |
| Early Bird | The first three tickets of the day tip double |
| Cinnamon Roll Case | Breakfast brings cinnamon roll tickets: one tap, $3 |
| Free Refills (2) | Every ticket waits 3 seconds longer |
| Bench Scraper | Burnt food clears itself off the flat-top |

**Rare**

| Name | Does |
|---|---|
| Second Flat-Top | Two more spots on the griddle |
| Coffee Urn | At 11am, one spilled coffee is poured again |
| Kitchen Board | A ticket about to walk out waits 6 more seconds, once |
| Drink Included | The day's special tips double |
| **Counter Help** (a helper) | Sends out every one-item ticket by themself |
| The Regular | Twice a day a ticket is "the usual" and tips triple |
| **Triple Chocolate Cookie** (2) | Once a day, tap it: every ticket's clock starts over |

**Epic**

| Name | Does |
|---|---|
| **Line Cook** (a helper) | Sends out the oldest ticket every 14 seconds |
| Golden Spatula | Nothing burns. Ever. |
| Big Dill | A pickle spear can stand in for any one missing part |
| Bottomless Coffee | A spilled coffee pours itself again after 25 seconds with no walk-out |

**The helpers** work by themselves: Counter Help takes the one-item tickets
(a side, a cup of soup, a side of eggs), the Line Cook takes the oldest
ticket on a timer shown by the bar under their hat. Neither will cook for
family. They are drawn as an apron and a hat, never as a person (§5).

**The cookie** sits on the pass with its count. It is for the moment the
rail is full and red. Family sometimes leaves one too.

**One joke that never works:** the **Deep Fryer**, "Not for now." It is on
the style sheet and not in the shop yet; when it goes in, it is greyed out
and can't be bought. It is the honest answer on /feedback.

---

## 4. Family at the counter

From Wednesday on (40%, 65%, 85% of days) someone from the family stops by
at lunch. It is the game's late-week difficulty, and it isn't a faster
clock: it's a distraction.

- Their ticket says **Free**. It tips nothing and waits a long time (45
  seconds).
- **They talk.** Every few seconds a speech bubble lands on top of the
  griddle, the plate or the bins and stays there until it's tapped, so the
  kitchen has to be worked around them. Up to three at once.
- **Feed them** and they pour one spilled coffee back (or leave $6 on the
  counter if none is spilled). One time in four they brought a cookie.
- Let their ticket run out and nothing is lost: "They'll bring it up at
  dinner."
- The helpers won't cook for family. You have to.

Who they are and what they say is in `game.json` → `family`. **Words only,
never a face, and no real names** ("Mom", "Your uncle", never a person's
name). Keep the lines kind and plain: this is somebody's mother.

---

## 5. Art direction: "Sunrise on the line"

**Where it comes from** (the photos in `src/assets/`):

- **Outside:** the brick front at sunrise and after a storm. Pink, peach and
  lavender skies over wet asphalt, warm lights in the windows. The café
  opens at 6am, so dawn is its time of day.
- **Inside:** stainless steel prep tables, bright strip lights, the long
  kitchen line, black floor. Cool, clean, a little shiny.
- **The food:** white scalloped plates, a dill pickle spear on nearly every
  plate, clear clamshell boxes, soup in a paper cup, orange order slips.
- **The brand:** the cream, teal and red of the sign and posts, the outlined
  wordmark with its single red shadow.

**The look in one line:** flat, chunky, friendly shapes with a teal-dark
outline, like the wordmark, on a cool steel kitchen, lit warm by a sky that
moves from sunrise to noon as the shift goes on.

**Rules of the look:**

1. **Flat shapes, no textures, no gradients on objects.** One flat colour
   per part, one lighter flat highlight where light hits. Gradients only in
   the sky and on teal bands (the house gradient).
2. **The house outline.** Every object has a **teal-dark (`#1F4552`)
   outline**, 2.5 on the sprite's 64 box. Never black.
3. **The house shadow.** Objects cast one **flat, unblurred shadow offset
   down and to the right**, teal-dark at 25% (`.ou-sh`). The wordmark's red
   shadow is for the wordmark only, never on food.
4. **Rounded everything.** Corners round, ends round, no sharp points.
5. **Seen from the cook's spot**, a little above.
6. **Big and few.** Three tickets, six griddle spots, twelve bins. A thing
   smaller than a thumb can't be tapped and can't be read.
7. **No people.** The staff don't want their likeness online, so nobody is
   drawn. The game is seen from the cook's eyes. Customers are tickets, a
   helper is an apron or a hat, family is a speech bubble.
8. **The sky tells the time.** A strip of sky in the kitchen window: dawn
   pink and peach at 6am, gold by 8, clear blue by 11, bright at noon,
   sunset-warm for Friday's catering.
9. **Our own drawings before emoji.** Emoji are allowed in the game (owner
   2026-11-10) but a custom SVG is better, and so far nothing uses one. A
   new thing gets a new `<symbol>` in the sprite sheet.

### Food on the flat-top

Three looks, and **colour is never the only signal** (colour-blind players):

| State | Look | Also shown by |
|---|---|---|
| Raw | Pale, no grill marks | A mint ring that fills as it cooks |
| Done | Its real colour, grill marks, a small bounce | A "Pull" tag; the ring burns down in orange (the time left before it burns) |
| Burnt | Dark | Crossed out, a "Burnt" tag, smoke. Tap to scrap. |

One drawing serves all three: a cooking food takes its colours from the CSS
custom properties `--food`, `--food2` and `--marks`.

### The spilled coffee

A mug **on its side, solid, with coffee running out into a puddle** (owner
2026-11-10: the first one, a faint outline, read as nothing). A life lost
must be as easy to see as a life left.

---

## 6. Colour

The house palette from `src/assets/css/tokens.css`, plus a game palette for
food, steel and sky. **The house tokens keep their jobs; the game palette
never takes over a house job.**

| Token | Game use |
|---|---|
| `--cream` `#FAF7F2` | The paper screens, ticket paper, speech bubbles |
| `--teal` / `--teal-dark` | The HUD, the title, the band on top of a paper screen, the Rare band. **Grounds only.** |
| `--accent` `#C0392F` | Buttons, prices, and a ticket that is **late**. Nothing else. |
| `--accent-dark` `#A02F26` | Pressed buttons |
| `--mint` `#8ED9D4` | Labels on teal; the cooking ring; the "Pull" tag |
| `--coral` `#EB5E64` | The wordmark's shadow on the title screen only |
| `--text-dark` `#22323A` | All text on cream |

**Red means one of two things: "tap me" (a button) or "late" (a ticket's
timer).** This is the kitchen board's own rule. So no red food, no red
rarity, no red decoration. And still **never red on teal, either way
round.**

**Rarity colours:** Normal steel (`#E6ECEE`), Rare teal with cream words,
Epic gold (`#F4C542`) with dark words. Always with the word and its
diamonds (one, two, three).

The game palette (sky, brick, steel, flat-top, each food) is on
`game/style-sheet.html` with its hex values and lives in `play.css` and the
sprite sheet, never in `tokens.css`. Tomato and bacon lean orange on purpose
so they never read as the red of a button or a late ticket.

---

## 7. Type

| Role | Font | Size on the 360-wide stage |
|---|---|---|
| The wordmark | `assets/thecafe.svg`, inlined, hero treatment | 200 wide |
| "Order Up", headings, item and card names | Playfair Display 700 | 17 – 46 |
| Kickers ("After close", "Today's special") | Playfair Display italic 400 | 20 |
| Ticket names, card text, hints | Lato 700 / 400 | 13 – 16 |
| HUD numbers (tips, clock) | Lato 900, tabular figures | 20 |
| Labels ("TIPS", "MONDAY", bin names) | Lato 700, CAPITALS, spaced | 10 – 11 |
| Buttons | Lato 700, CAPITALS, spaced 0.12em | 16 |

**Ticket names are spelled as `menu.json` spells them**, and the build warns
if one has left the menu. The stage is scaled to the phone, so on a 390-wide
phone everything is a little larger than these numbers and on an iPhone SE a
little smaller. Bin labels are small because the picture is the label; a
ticket's name is never under 15.

---

## 8. The screen (phone, portrait)

Built for a phone held in one hand: **portrait, tap only, everything in
thumb reach.** The game is one 360px-wide stage scaled to fit; a taller
phone gives the griddle the extra room. Checked at 375 × 553 (an iPhone SE
with the browser's bars showing), 390 × 760 and 412 × 860.

```
┌───────────────────────────┐
│ ⏸  Mon 7:40am   ☕☕☕  $14 │  HUD: teal, mint labels, cream numbers
├───────────────────────────┤
│ [ticket][ticket][ticket]  │  the rail: name, parts as pictures, timer
├───────────────────────────┤
│ the window: sky  [helpers]│  tells the time; helpers and the cookie
├───────────────────────────┤
│   FLAT-TOP: 4 to 6 spots  │
├───────────────────────────┤
│ hint      (plate)   [SEND]│  the steel table
│ [Scrap]                   │
├───────────────────────────┤
│ twelve bins, four across  │  cooks = warm tint, the rest = steel
└───────────────────────────┘
```

- **A ticket shows the item's name and its parts as small pictures**, so a
  player who doesn't know the menu can still build it. As the plate fills,
  the ticket it's heading for lifts and its parts tick off.
- **Send is red only when the plate matches a ticket**; grey otherwise.
- **Tap food on the plate to take it off.** Scrap clears the plate.
- **Bins that cook have a warm tint**; they dim when the griddle is full.
  Bacon, tortilla and cheese keep their place when breakfast turns to lunch.
- Tap only: no dragging, no swipes, no tilt.
- Pause is top left; the game pauses itself when the tab is hidden (a
  customer looks up when their name is called).

**The paper screens** (dawn, after close, week over, Recipe Box, how to
play) are cream with a teal band on top and a red rule under it, like the
weekly specials post, so the game and the café's posts read as one family.
The week-over screen is the week as rows, Monday to Friday, like the post.
First-time players get "How to play" before their first Monday, and short
hints beside the plate through that day.

---

## 9. Motion and feel

- Short and springy: things pop in at about 200ms with a small overshoot,
  then sit still. Nothing loops forever except steam, the done food's
  bounce and the cookie's nudge.
- A late ticket shakes once and its timer turns red.
- **`prefers-reduced-motion`:** every animation is off and the game plays
  the same.
- A short buzz on a walk-out where the phone allows it, off with the sound.

## 10. Sound

- **Off until the player turns it on** (title screen or pause; remembered).
  Many people will open this in the dining room.
- Made in the browser (Web Audio), so there are no sound files and nothing
  to license: a sizzle, a ticket tick, a "done" ping, the order bell, a low
  note for a walk-out. Short and quiet, no music.
- If real recordings are ever wanted (this kitchen's own flat-top and
  bell), list each one's source beside it.

---

## 11. Words

House voice (`STYLE.md` §2): plain words, short lines, no exclamation marks.

| Moment | Say | Not |
|---|---|---|
| Start | Start the week | Play now!!! |
| A plate sent | Order up · $5 | Awesome! |
| With a pickle | Order up, with a pickle · $6 | |
| A walk-out | They left. One coffee down. | FAIL |
| Day over | After close · Monday · $46 in tips | |
| Lost the week | Rough week · Three coffees down on Thursday. | Game over |
| Won the week | Week done · The catering went out on time. | Victory |
| Family fed | Mom poured you a coffee | |
| Family left | They'll bring it up at dinner. | |

- **Name the café, not the game,** in anything posted about it: "a little
  game on The Café's website", with the town.
- **No prizes for scores** unless the owners decide to offer one, and that
  is their call. The game never promises food, discounts or anything at the
  counter on its own.
- No reviews in the game. Never ask for a Google review from it: a review
  ask tied to playing could read as a reward, which Google's rules forbid.

---

## 12. Never

- No people drawn, no staff names, no photos of anyone.
- No red on teal; no red that isn't a button, a price or a late ticket.
- No fries, deep-fried anything, evenings or weekends: the game doesn't
  promise what the café doesn't do.
- No ads, no tracking, no accounts, no leaderboard server, no sign-in.
  Scores stay on the phone. The site has no backend and the game doesn't
  add one.
- No menu prices in the game. Tips are game money; menu prices change and
  belong to Square.
- Don't recreate any existing game's look or characters. This one looks
  like this kitchen.

---

## 13. How it's built

- **A page of the site:** `src/play.njk` → `/play`, on `layouts/base.njk`
  with no nav or footer (like the home page), `noSiteJs: true`.
  **Unlisted while it's a demo.** To publish it: take `noindex` off, add it
  to `sitemap.xml`, and link it (the footer; "Waiting on an order? Play a
  shift" on `/menu`).
- **No libraries, no image files.** Plain HTML and CSS for the kitchen,
  one inline SVG sprite sheet for every drawing, plain JavaScript. (The
  first plan said one `<canvas>`; a tap-only game with a few dozen things
  on screen is simpler, sharper and more accessible as real buttons.) The
  only pictures are the café's own photos in the Recipe Box and on the
  dawn cards, as the gallery's thumbnails.
- **Small:** about 120 KB before compression for everything (40 KB or so as the server sends it).
- **Saved on the phone only**, in `localStorage` (`orderup.v1`), every read
  and write in a `try`/`catch`: best week, weeks played and finished, what
  has been served, the sound setting. A private window just starts fresh.
- **Data, not code, for anything worth changing:** `src/_data/game.json`,
  with a note on every block. `play.11tydata.js` strips the notes, points
  each photo at its thumbnail and **warns in the build log** if a recipe's
  `menu` name is no longer in `menu.json` or the odds don't add up to 100.
  Prices are not read.
- `bust` on its CSS and JS, like every other asset.

### Checking the balance

`/play?debug` puts a `window.__ou` handle on the page (the run, the day, a
`tick()` to move the clock by hand, `give('linecook')` to own an item).
`game/bot.js` is a stand-in player built on it: paste it into the console
and `await ouBot({ weeks: 6, apm: 90 })`. A week takes it a second or two.

Where the numbers were left (2026-11-10), with a bot that never makes a
mistake:

| Taps a minute | Like | Weeks won | Walk-outs |
|---|---|---|---|
| 60 | a slow thumb | 4 of 6, the others lost on Thursday | a few from Wednesday on |
| 90 | a steady thumb | 6 of 6 | a few on Thursday and Friday |
| 150 | a quick one | 6 of 6, about $900 | almost none |

A person reads slower and mis-taps, so expect real first weeks to end
around Wednesday or Thursday, and Monday to be gentle. If it's too hard or
too easy, change `days` in `game.json` (`every`, `patience`) and run the
bot again.

### What was changed from the first plan, and why

- **The pickle is a bonus, not a part.** Requiring it on every plate was a
  chore; choosing it for $1 is a decision, and the Pickle Jar builds on it.
- **Bins turn over at 11am only when the last breakfast ticket is out**, so
  nobody is left with a ticket they can no longer make.
- **The special is held hot, not cooked**: special, then a side for each
  side it comes with. That is how the kitchen does it.
- **Gear and tricks became one pool with rarity**, dealt twice after close
  (one free, three for sale), with "Restock".
- **Heavy Spatula, Ticket Printer, Deli Cooler, Soup Pot and Choice of
  Side were dropped** (they needed controls the screen has no room for, or
  did nothing once taps were this simple). Counter Help covers what Soup
  Pot did.
- **Prices went up and tickets came faster** after the bot won every week
  with a dozen items.

### Next

1. Play it on real phones (GM-2 in CafeWork `TASKS.md`) and tune `days`.
2. Unlocks across runs; keep a half-finished week.
3. The Deep Fryer in the shop.
4. This week's real special as a dawn card (from `specials.json`).
5. The owners' go-ahead, then the link and the sitemap.
