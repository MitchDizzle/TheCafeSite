# Pumpkin cookie labels (personal)

Not The Cafe's: a personal bake, made here only to borrow the site's fonts,
palette and studio export. Kept out of `src/`, so the site never builds,
exports or publishes it.

- `label-pumpkin-cookies.njk`: the sheet, 14 bag labels on Avery 18262
  (same as 5162 / 5262 / 8162). The product, ingredients and allergens are
  in its front matter.
- `label-avery.css`: the label sheet's geometry and type.

## Printing it again

1. Copy `label-pumpkin-cookies.njk` to `src/studio/` and `label-avery.css` to
   `src/assets/css/` (the page names it as `/assets/css/label-avery.css`).
2. `npm start` and open `/studio/label-pumpkin-cookies`, or
   `node scripts/export-studio.js label-pumpkin-cookies` for the PDF.
3. Print at 100% (Actual size), on plain paper first, held over a label
   sheet to check the line-up.
4. Delete the two copies from `src/` again; don't commit them there.
