# Order Up's drawings

Every picture in the game is one SVG file here. Redraw a file, save it,
and the game uses it: `game/build.js` turns these into the sprite sheet
before every build, and `npm start` picks a change up as soon as it's saved
(reload `/play`). To see them all at once: `node game/make-style-sheet.js`,
then open `game/style-sheet.html`.

| Folder | What's in it |
|---|---|
| `cooking/` | Food that goes on the flat-top. These change colour as they cook (below). |
| `plate/` | Food that goes straight on the plate, and the soup, the special, the cookie |
| `finished/` | Finished plates (the Recipe Box, the style sheet) |
| `lives/` | The coffee cup, and the spilled one |
| `items/` | Gear and tricks, and the kitchen things the shop sells |
| `kitchen/` | The plate, the flare-up, family's speech bubble |
| `scene/` | `storefront.svg`, the title screen (not a sprite; see the end) |

**The file's name is the drawing's name**, and `src/_data/game.json` uses it
(`sprite` on a food, `icon` on an item or achievement). `cooking/egg.svg`
is the egg wherever the game shows one. The folders are only for finding
things: move a file between them freely, but never rename one without
changing `game.json` too, and no two files may share a name.

## Drawing one

- **The box is 64 × 64** (`viewBox="0 0 64 64"`); the plate is 120 × 120.
  Keep the drawing inside it with a little room to spare.
- **Save as plain SVG.** Inkscape: *Save As → Plain SVG*. Illustrator: *SVG
  1.1, styling: presentation attributes*. Figma and Affinity: *Export → SVG*.
  Whatever the program adds (metadata, its own tags) the build throws away.
- **Shapes only.** No pictures inside (PNG, JPG), no text (turn it into
  outlines, *Path → Object to Path*), no filters or blur. The share picture
  draws these on its own, without the page, and can't fetch anything.
- **Ids are fine:** the build puts the drawing's name in front of every id,
  so a gradient called `linearGradient1` in two files doesn't clash.

The look (all of it in `game/README.md` §5 and §6, in colour in the style
sheet): flat colours, one lighter highlight; **the outline is teal dark
`#1F4552`, 2.5 wide, never black**; corners and line ends round; seen a
little from above; **no people, ever**; **no red** (red means a button or a
late ticket). Don't draw a shadow: the game adds the house one.

## Food that cooks

One drawing serves raw, done and burnt. Draw the food **done**, then mark
the parts that change by giving them a `class`:

| class | What it does |
|---|---|
| `food` | Its colour becomes the food's raw colour until it's done (`raw` in `game.json`) |
| `food2` | The same for a second colour (`raw2`) |
| `marks` | The grill marks: hidden until the food is done (its opacity is kept) |
| `ou-steam` | Steam that rises (the soup, the coffee) |

Burnt is the game darkening the whole drawing, so it needs nothing.
`blade` and `blade2` mark the spatula's blade, for the game to recolour
later if it wants.

Setting a class: in Inkscape, *Edit → XML Editor* (Ctrl+Shift+X), pick the
shape, add an attribute `class` with the value `food`. Programs that don't
keep a class on export (Figma, some Illustrator settings): open the saved
file in a text editor and put `class="food"` into the shape's tag, as in
`cooking/egg.svg`.

## A new drawing

Add the file here (small letters, numbers and dashes in its name), then
name it in `game.json` where it's used. Nothing else to register.

## The storefront

`scene/storefront.svg` is the café's front at sunrise, 360 × 210, sky to
lot. The title screen shows it cropped a little at the top and fades the
bottom strip into teal; the link picture and the launch post
(`src/studio/share-order-up.njk`, `fb-order-up.njk`) use it too. Its ids
all start `sf-` and are kept as drawn, because the page points at some of
them (`sf-fade`, the fade under the title): keep those names if you redraw
it.

The name on the window is the café's real wordmark, filled in by the build
from `src/assets/thecafe.svg`, so in a drawing program that window sign
looks empty. Leave the path marked `data-wordmark` where it is (move or
resize it with its `transform`), and the name lands on it.
