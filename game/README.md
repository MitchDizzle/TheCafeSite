# Order Up — the game's concept, art theme and style guide

A small phone game on lvcafetogo.com: a short-order cook's week at The Café,
played one shift at a time. Something to tap through while waiting for an
order, or at home, that feels like this kitchen and no other.

This folder is the plan and the look, not the game. **`style-sheet.html`**
beside this file shows everything below in colour: open it in a browser
(it needs no build). The game itself, when it's built, lives in `src/` like
any other page (§12).

Everything in the house `STYLE.md` still applies. This file only adds what a
game needs, and where the two meet it says which rule wins.

---

## 1. The idea in one paragraph

You are on the flat-top at 417 South 6th St. Tickets come in on the rail,
just like the kitchen board. Tap food onto the griddle, pull it when it's
done (not burnt), build the plate on the steel table, add the pickle spear,
and send it to the pass before the ticket goes late. A **run is one week,
Monday to Friday**; each **day is one shift, 6am to 2pm**, squeezed into
about 90 seconds. After close you spend the day's tips on gear and tricks
for the rest of the week. Get to Friday's catering order and finish it, and
the week is yours. Spill all three coffees and the week is over: start a new
one with whatever you unlocked.

Why this and not a generic game: everything in it is something a customer
has seen or eaten here. The pickle on every plate, the clamshell boxes, the
steel prep tables, the 6am sunrise over the parking lot, specials starting
at 11am with a drink included, no fryer, closed weekends.

---

## 2. The run

| Piece | What it is | Real thing it comes from |
|---|---|---|
| **Run** | One week, Monday – Friday. No weekends: the café is closed. | The hours |
| **Day** | One shift, 6am – 2pm, about 90 seconds of play. A clock on the HUD runs the real hours. | The hours |
| **Breakfast** (6am – 11am) | Short tickets: eggs, bacon, toast, Breakfast Sandwich, Burrito, Biscuit & Gravy | `menu.json` breakfast |
| **Lunch** (11am – 2pm) | Longer tickets: wraps, hot sandwiches, burgers, the special, soup | "Starting at 11am" |
| **The day's special** | Chosen at dawn: pick 1 of 3 plates. It pays the most and is the hardest ticket. | `specials.json`, `SPECIALS-HISTORY.md` |
| **Lives** | Three **coffee cups** on the HUD. A ticket that runs out of time is a walk-out and spills one. | |
| **After close** | Between days: the shop. Spend tips on one or two things, pick one free card of three. | |
| **Friday** | Ends on a **catering order**: one big ticket of platters (sliders, deviled eggs, veggie tray, shrimp) on its own clock. | The catering photos |
| **Win** | Finish Friday's catering. The week's tips become your score. | |
| **Lose** | Three spilled coffees in one day. | |

**Between runs** (kept on the phone only, §12):

- **The Recipe Box.** Every menu item you've served is filed as a card, by
  its real menu name, with its real photo once you've served it 10 times.
  Collecting them is the long-term goal; it is also the menu, quietly.
- **Unlocks.** Runs open new things to the pool: wraps after your first
  Wednesday, hot sandwiches after a finished week, more specials as you go.
  The first run is breakfast-heavy and gentle.
- **Best week** and **weeks finished**. Nothing else is tracked.

---

## 3. Power-ups

Three kinds, so a run can be built in different directions. Names are plain
and kitchen-true; each says what it does in one short line.

**Gear** (bought after close, lasts the run)

| Name | Does |
|---|---|
| Second Flat-Top | Two more spots on the griddle |
| Heavy Spatula | One tap flips or pulls two things at once |
| Warming Shelf | Done food waits 6 seconds before it can burn |
| Ticket Printer | Shows the next ticket before it lands |
| Order Bell | Each plate sent gives every other ticket 2 more seconds |
| Coffee Urn | Refills one spilled coffee, once a day |
| Deli Cooler | Deli Salads and Chips go on the plate with one tap |
| Soup Pot | A cup of soup goes out by itself every 20 seconds at lunch |

**Tricks** (pick one free card of three after close, lasts the run, stack them)

| Name | Does |
|---|---|
| Pickle Jar | Every plate with a pickle spear tips 1 more |
| Big Dill | A pickle spear counts as a side |
| Drink Included | Specials tip double |
| Early Bird | The first ticket of the day is already on the griddle |
| Clamshells | To-go tickets (online, DoorDash) give extra time |
| Cinnamon Roll Case | Each breakfast ticket has a chance to add a cinnamon roll: free tip |
| Choice of Side | Any side satisfies a ticket's side |
| The Regular | One ticket a day is "the usual": same order, big tip |

**Specials** (the dawn pick, one day only): real specials with their real
sides, e.g. French Dip, Brisket, Hot Turkey Sandwich, Meatloaf, BBQ Ribs,
Chicken Fried Chicken. Take them from the specials history so the game
grows with the café.

**One joke card that never works:** **Deep Fryer**, greyed out in the shop,
"Not for now." It is the honest answer on /feedback, and customers who ask
for fries will get it.

Balance is a later job; the table is the starting set, not the final one.

---

## 4. Art direction: "Sunrise on the line"

**Where it comes from** (the photos in `src/assets/`):

- **Outside:** the brick front at sunrise and after a storm. Pink, peach and
  lavender skies over wet asphalt, warm lights in the windows. The café
  opens at 6am, so dawn is its time of day.
- **Inside:** stainless steel prep tables, bright strip lights, the long
  kitchen line, black floor. Cool, clean, a little shiny.
- **The food:** white scalloped plates, a dill pickle spear on nearly every
  plate, clear clamshell boxes, soup in a paper cup, wood tables in the
  dining room, orange paper order slips.
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
   outline**, 2px at 1× (scale with the canvas). Never black.
3. **The house shadow.** Objects cast one **flat, unblurred shadow offset
   down and to the right**, teal-dark at 25%. The wordmark's red shadow is
   for the wordmark and the main button only, never on food.
4. **Rounded everything.** Corners round, ends round, no sharp points. It
   reads friendly and stays legible at phone size.
5. **Three-quarter top-down.** The griddle and table are seen from the
   cook's spot, a little above. Food is drawn from that angle, one sprite
   per state.
6. **Big and few.** At most 4 tickets and 6 griddle spots on screen. A
   thing smaller than a thumb can't be tapped and can't be read.
7. **No people.** The staff don't want their likeness online, so nobody is
   drawn. The game is seen from the cook's eyes; customers exist only as
   tickets (and "the regular" only as a mug on one). A hand with a spatula
   is the most of a person that ever appears.
8. **The sky tells the time.** A band of sky through the kitchen window:
   dawn pink and peach at 6am, gold by 8, clear blue by 11, bright at noon.
   On Friday it turns sunset-warm for the catering order.

### Food states

Every food that cooks has three looks, and **colour is never the only
signal** (colour-blind players):

| State | Look | Also shown by |
|---|---|---|
| Raw | Pale, flat, no marks | Empty ring around it |
| Done | Golden, grill marks, a little steam | Full ring, a small bounce |
| Burnt | Dark brown, smoke wisps | Ring turns to a cross, smoke |

---

## 5. Colour

The house palette from `src/assets/css/tokens.css`, plus a game palette for
food, steel and sky. **The house tokens keep their jobs; the game palette
never takes over a house job.**

### House tokens in the game

| Token | Game use |
|---|---|
| `--cream` `#FAF7F2` | Menus, the shop, the Recipe Box, ticket paper |
| `--teal` / `--teal-dark` | The HUD bar, title screen, after-close band. **Grounds only.** |
| `--accent` `#C0392F` | Buttons, and a ticket that is **about to go late**. Nothing else. |
| `--accent-dark` `#A02F26` | Pressed buttons |
| `--mint` `#8ED9D4` | Numbers and labels on the teal HUD |
| `--coral` `#EB5E64` | The wordmark's shadow on the title screen only |
| `--text-dark` `#22323A` | All text on cream |

**Red means one of two things: "tap me" (a button) or "late" (a ticket's
timer).** This is the kitchen board's own rule: red buttons, never red on an
order card except when it's late. So no red food plates, no red decoration.
And still **never red on teal, either way round.**

### Game palette

Kept in the game's own stylesheet/script, never added to `tokens.css`.

| Group | Name | Hex |
|---|---|---|
| Sky | Dawn pink | `#F4A9B8` |
| | Dawn peach | `#F8BE8A` |
| | Morning gold | `#F7D88C` |
| | Dawn lavender | `#9C8BC4` |
| | Noon blue | `#BFE2EC` |
| Building | Brick | `#8C5B4A` |
| | Brick dark | `#5F3D32` |
| | Window light | `#FFE7A8` |
| Kitchen | Steel light | `#E6ECEE` |
| | Steel | `#C5CFD3` |
| | Steel dark | `#8E9AA0` |
| | Flat-top | `#3A4247` |
| | Flat-top heat | `#F08A3C` |
| | Floor | `#1C2226` |
| | Wood table | `#B98552` |
| Food | Plate | `#FFFFFF` |
| | Bun / toast | `#DDA65E` |
| | Bun dark | `#A86B30` |
| | Beef, done | `#7A4A32` |
| | Burnt | `#3B2A22` |
| | Bacon | `#B95A41` |
| | Bacon fat | `#F2C1A0` |
| | Egg white | `#FFF8EA` |
| | Yolk | `#F7B22B` |
| | Cheese | `#F4C542` |
| | Lettuce | `#7DBE4F` |
| | Tomato | `#E4683F` |
| | Pickle | `#6F8C3A` |
| | Pickle light | `#A3BB5E` |
| | Gravy | `#ECE0CB` |
| | Tortilla | `#EFD9A8` |
| Paper | Order slip | `#F2913D` |
| | Clamshell | `#E9F3F5` at 70% |

Tomato and bacon lean orange on purpose so they never read as the red of a
button or a late ticket.

---

## 6. Type

| Role | Font | Size on a phone (CSS px, at 375 wide) |
|---|---|---|
| Title (the wordmark) | `assets/thecafe.svg`, inlined, house treatment | about 220px wide |
| Game name "Order Up", day names, item names, card names | Playfair Display 700 | 20 – 28 |
| Kickers ("After close", "Today's special") | Playfair Display italic 400 | 18 – 20 |
| Card text, ticket lines | Lato 700 | **16 minimum** |
| HUD numbers (tips, clock) | Lato 900, tabular figures | 20 – 24 |
| Labels ("TIPS", "MONDAY") | Lato 700, CAPITALS, spaced 0.18em | 12 – 13, mint on teal |
| Buttons | Lato 700, CAPITALS, spaced 0.12em | 16 |

**Item names are spelled exactly as `menu.json` spells them** ("Biscuit &
Gravy", "Breakfast Sandwich"), so the game is the menu too. Nothing a player
needs to read goes below 16px; the audience skews older here as everywhere.

---

## 7. The screen (phone, portrait)

Built for a phone held in one hand: **portrait, 9:16, everything in thumb
reach**, letterboxed on wider screens, never rotated.

```
┌───────────────────────────┐
│ HUD: Mon · 7:40am  ☕☕☕ $14│  teal band, mint labels, cream numbers
├───────────────────────────┤
│ [ticket][ticket][ticket]  │  the rail: cream slips, timer bar on each
├───────────────────────────┤
│  window: the sky + brick  │  thin band, tells the time
├───────────────────────────┤
│   FLAT-TOP: 4–6 spots     │  dark griddle, food cooking
├───────────────────────────┤
│   STEEL TABLE: the plate  │  white plate being built
├───────────────────────────┤
│ [bun][egg][bacon][pickle] │  the bins: tap to add, 56px+ each
│ [side][soup]   [ SEND  ]  │  red button, bottom right
└───────────────────────────┘
```

- **A ticket shows the item's name and its parts as small pictures**
  (bun, patty, cheese, pickle), so a player who doesn't know the menu can
  still build it, and one who does learns it. Three tickets fit across a
  360px phone with the name at 16px, wrapping to two lines.
- **Tap targets 48px minimum, 56px preferred**, with 8px between.
- **Tap only.** No dragging, no swipes, no tilt: one finger, one thumb.
  Drag can come later as an option, never as the only way.
- The bottom third holds every control. The top holds only things to read.
- A tap anywhere that does nothing gives a small grey "tick", never an error.
- Pause button top left of the HUD; the game pauses itself when the tab is
  hidden (a customer looks up when their name is called).

### Other screens

| Screen | Look |
|---|---|
| Title | Teal house gradient, the wordmark, "Order Up" in Playfair, one red **Start the week** button, a small **Recipe Box** link in mint |
| Dawn pick | Cream, "Today's special" kicker, three cards; each card names the plate and its sides as the weekly post does |
| After close | Cream body with teal band on top (like the weekly post): the day's tips, the shop (gear with prices), then three free trick cards |
| Week over | The week as five rows, Monday to Friday, like the weekly specials post: each day's tips. Best week below. |
| Recipe Box | A grid of cards, item names in Playfair; a served-10-times card shows the real photo |

The after-close and week-over screens deliberately look like the Facebook
weekly post, so the game and the café's posts read as one family.

---

## 8. Motion and feel

- Short and springy: things pop in at 150 – 250ms with a small overshoot,
  then sit still. Nothing loops forever except steam and the sky.
- A sent plate slides off to the right; the ticket tears off the rail.
- A late ticket shakes once, gently, and its timer turns red.
- **`prefers-reduced-motion`:** no shake, no overshoot, no screen flash;
  states change by fading. The game must be fully playable this way.
- Haptics: a short buzz on a walk-out, where the phone allows it, and off
  with the sound button.

## 9. Sound

- **Off until the player turns it on** (one button, remembered). Many people
  will open this in the dining room.
- Sounds of this kitchen: sizzle on the flat-top, a spatula scrape, a
  ticket printer, the order bell at the pass, a coffee cup set down. Short,
  quiet, no music track at first.
- Only sounds made for us or with a licence that allows it on a website;
  list each one's source in the game's folder.

---

## 10. Words

House voice (`STYLE.md` §2): plain words, short lines, **no emoji**, a
thank-you can have an exclamation mark, a sales line can't.

| Moment | Say | Not |
|---|---|---|
| Start | Start the week | Play now!!! |
| A plate sent | Order up | Awesome! |
| A walk-out | They left. One coffee down. | FAIL |
| Day over | Closed at 2pm. $46 in tips. | |
| Shop | After close | Power-up store |
| Lost the week | Rough week. Start a new one? | Game over |
| Won the week | Week done. Catering went out on time. | Victory |
| Deep Fryer | Not for now. | |

- **Name the café, not the game,** in anything posted about it: "a little
  game on The Café's website", with the town.
- **No prizes for scores** unless the owners decide to offer one, and
  that is their call, not the game's. The game never promises food,
  discounts or anything at the counter on its own.
- No reviews in the game. Never ask for a Google review from it: a review
  ask tied to playing could read as a reward, which Google's rules forbid.

---

## 11. Never

- No people drawn, no staff names, no photos of anyone.
- No red on teal; no red that isn't a button or a late ticket.
- No emoji, no exclamation marks in game lines except a thank-you.
- No fries, deep-fried anything, evenings or weekends: the game doesn't
  promise what the café doesn't do.
- No ads, no tracking, no accounts, no leaderboard server, no sign-in.
  Scores stay on the phone (§12). The site has no backend and the game
  doesn't add one.
- No sales or menu prices in the game. Tips are game money; menu prices
  change and belong to Square.
- Don't recreate any existing game's look or characters. This one looks
  like this kitchen.

---

## 12. How it's built (when it is)

- **A page of the site:** `src/play.njk` → `/play`, on `layouts/base.njk`
  without the nav (like the home page), `noSiteJs: true`. One link in the
  footer and on `/menu` ("Waiting on an order? Play a shift"). In the
  sitemap once it's worth finding.
- **No libraries.** One `<canvas>`, plain JavaScript in
  `src/assets/js/game/`, drawn in code from the shapes above, so there are
  no image files to load. The real food photos appear only in the Recipe
  Box, using the gallery thumbnails already on the site (`thumb` filter).
- **Small:** under 150 KB for the whole game before photos, so it opens fast
  on a phone in the dining room. Fonts are the site's own Google Fonts.
- **Saved on the phone only**, in `localStorage`, every read and write in a
  `try`/`catch`: best week, Recipe Box, unlocks, the sound setting. A
  private window just starts fresh; nothing breaks.
- **Data from the site's own files**, at build time: item names from
  `menu.json`, special plates and sides from `specials.json` (this week's
  special can be a dawn card, a nice tie-in), so the game never has its own
  copy of the menu to go stale. Prices are **not** read.
- Pauses on `visibilitychange`; resizes to any phone; works on an old
  iPhone SE (375 × 667) as the smallest target.
- CSS colours as custom properties on the page, house tokens from
  `tokens.css`, game palette in the game's own stylesheet.
- `bust` on its CSS and JS, like every other asset.

### First playable, in order

1. One day, breakfast only: rail, griddle, plate, send, three coffees.
2. Lunch and the day's special; the sky clock.
3. A week: after close, the shop, the trick cards.
4. Friday's catering order.
5. Recipe Box and unlocks.
6. Sound, haptics, polish; the footer link.
