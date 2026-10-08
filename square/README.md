# Square catalog import

`catalog-import.csv` is Square's own catalog template (`template.csv`, a blank
export from the Square Dashboard) filled in from `src/_data/menu.json`.
Prices and descriptions are read straight from the menu data, never retyped,
so it cannot disagree with `/menu`, the printed menus or the board.

This folder is outside `src/`, so it is not built and not uploaded with
`_site/`. Nothing here is private: every price and description is already
public on `/menu`.

**Rebuild it after any menu change** instead of editing the CSV by hand:

```bash
npm run square
```

That runs `scripts/square-catalog.py`, which is where every layout decision
below lives. Commit the regenerated CSV with the `menu.json` change that
caused it.

## Importing

Square Dashboard → **Items → Import** (or Actions → Import library) → upload
`catalog-import.csv` → choose **add to library**, not replace. Leave the five
instruction rows at the top; they are Square's own header. Review the preview
before confirming — Square lists anything it rejects.

## How the menu was mapped

| On the menu | In Square | Why |
|---|---|---|
| Full / Half (salads, biscuits & gravy), Cup / Bowl, 2 / 3 egg | **Variations** of one item | One tile on the POS, the size prints on the ticket |
| "Hamburger or Chicken" etc. | Item "Hamburger", variations **Beef / Chicken** at the same price | The kitchen needs to see which one; the name reads cleanly |
| Build Your Own 1 / 2 / 3 meats, half | One item, four **variations** | Price is set by the variation; the picks are modifiers (below) |
| Toast / biscuit / muffin, chips flavours, iced tea vs fountain | **Variations** at one price | Counts which one sells, for ordering stock |
| Wraps, kids meals | One price per item | Choices are modifiers (below) |
| Everything | Item type *Prepared food and beverage*, not stockable, category = reporting category | No inventory tracking yet |

"Skip Detail Screen in POS" is **Y** only on items with one variation and no
choices (a side of bacon, a bottle of water) so the counter can ring them in
one tap. Everything that needs a choice opens the detail screen.

Some descriptions say more in Square than on the printed menu, because Square
is where the choice is made: the Big Breakfast reads "2 eggs your way…"
(the Eggs list below), sandwiches name their default bread.

**Not in the file on purpose:** dietary marks (GF/V) — not kitchen-confirmed,
see `dietsConfirmed` in `menu.json`; the consumer advisory; any tax setup
(Square applies it by location); catering, which will be its own category of
pre-packaged items later.

## Modifier lists — create these by hand in the Dashboard

Square's import template has no columns for modifiers, so these have to be
built under **Items → Modifiers** and then attached to the items listed.
**Every choice is $0 except Extras** — bread swaps never cost extra; extras
like extra cheese are $0.50.

**Default bread is White** unless the item names its own (Kaiser on the
burgers, rye on the Reuben and Patty Melt, hoagie on the Philly). Some come
**toasted** by default — Clubhouse and BLT on white toast, Big Breakfast
toast — and the description says so. A blank Bread choice means "the
default in the description". (`defaultBread` in `menu.json`.)

| Modifier list | Options | Rule | Attach to |
|---|---|---|---|
| **Bread** | White, Wheat, 12 Grain, Rye, Croissant, Hoagie, Kaiser | Pick 1, optional | Every Cold and Hot Sandwich except the burgers |
| **Toasting** | Toasted, Not toasted | Pick 1, optional (blank = as described) | Every Cold Sandwich incl. Build Your Own |
| **Extras** | Extra cheese **+$0.50** (add further extras here at $0.50) | Pick any, optional | All sandwiches, burgers, wraps, Breakfast Sandwich, Burrito, Omelet |
| **Bun** | Kaiser (default), plus the Bread list | Pick 1, optional | The 7 burgers |
| **Wrap** | Flour (white) tortilla, Spinach, Tomato | Pick 1, required | All 7 wraps |
| **BYO Meats & Salads** | Turkey, Ham, Bacon, Curry Chicken Salad, Walnut Tuna Salad, Egg Salad | Pick 1–3, required | Build Your Own Sandwich (staff match the count to the 1/2/3-meat variation; Square can't tie them together) |
| **BYO Cheese** | American, Pepper Jack, Colby Jack, Provolone, Swiss | Pick 1, required | Build Your Own Sandwich |
| **BYO Bread** | same as Bread | Pick 1, required | Build Your Own Sandwich |
| **Breakfast Fillings** | Bacon, Sausage, Ham, Cheese, Onion, Tomato, Jalapeno, Potato, Mushroom, Olives | Pick any | Burrito, Omelet |
| **Sour Cream or Salsa** | Sour cream, Salsa | Pick 1 | Burrito, Omelet |
| **Breakfast Meat** | Bacon, Sausage, Ham | Pick 1, required | Breakfast Sandwich, Big Breakfast |
| **Eggs** | Scrambled, Sunny side up, Over easy, Over medium, Over hard | Pick 1, required. Every style **except poached**, which the kitchen does not do. Add basted or boiled only if the kitchen offers them. | Big Breakfast |
| **Breakfast Base** | **Biscuit, Croissant, English Muffin** (the three the menu names — list them first), then White, Wheat, 12 Grain, Rye | Pick 1, required | Breakfast Sandwich |
| **Kids Main** | Corn Dog, Chicken Strips, Hamburger, Grilled Cheese | Pick 1, required | Kids Meal |
| **Kids Side** | Cinnamon Apples, Mac & Cheese, Tater Tots, Fresh Fruit | Pick 1, required | Kids Meal |
| **Salad Protein** | Chicken salad, Tuna salad | Pick 1, required | Salad Plate |
| **Plate Protein** | Grilled chicken, Hamburger patty | Pick 1, required | Healthy Plate |
| **Dressing** | Ranch, Italian, Caesar, Honey Dijon | Pick 1, required | Strawberry Chicken, Buffalo Chicken, Chef and Dinner Salads. **Not** the Taco Salad — it comes with salsa & sour cream. |
| **Add (on the food)** | Ketchup, Mustard, Mayo | Pick any, optional | Every Hot and Cold Sandwich, the burgers, Build Your Own, Breakfast Sandwich. **Not the wraps** — each comes with its own dressing (ranch, sesame, caesar, dijon), so ketchup, mustard and mayo don't belong on them. A cooking instruction: prints on the kitchen ticket. |
| **Packets (in the bag)** | Ketchup packet, Mustard packet, Mayo packet | Pick any, optional | The same items (so not the wraps either), plus Kids Meal and Fried Potatoes. **Keep the word "packet" in each name**: the kitchen board moves any modifier named "… packet" off the kitchen ticket and onto the front page's "Add from the front" list. |

Juice is one item, **Bottle Juice**, with a variation per flavour (Orange,
Apple, Cranberry today; they're left over from the old contract and change
as they run out). Edit the list in `menu.json` and rebuild, or just
deactivate a variation in the Dashboard when a flavour runs out.

Fountain drinks are **self-serve Pepsi products** — no flavour list; the
variation only records that a fountain cup was sold.

Also worth setting in Square Online: an **availability schedule** so the
Breakfast category only shows until 11am and Soup only from 11am.

Modifier lists are NOT generated from `menu.json`: if a pick list changes on
the menu (a new bread, a new kids side), update this table and the list in
the Dashboard by hand.
