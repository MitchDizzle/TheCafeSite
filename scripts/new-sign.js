#!/usr/bin/env node
/**
 * Start a fill-in counter sign (layouts/quick-sign.njk).
 *
 *   npm run new-sign -- open-fridge "Desserts"
 *
 * writes src/studio/sign-open-fridge-bw.njk with every kind of block in it
 * as an example: delete what the sign doesn't need, fill in the rest, then
 *
 *   npm run export -- sign-open-fridge-bw
 *
 * and print _site/studio/downloads/sign-open-fridge-bw.pdf at 100%.
 * Never overwrites a sign that's already there.
 */
const fs = require("fs");
const path = require("path");

const [name, heading = "Heading"] = process.argv.slice(2);
if (!name || !/^[a-z0-9-]+$/.test(name)) {
  console.error('Usage: npm run new-sign -- <name-in-lowercase-with-dashes> "<Heading>"');
  process.exit(1);
}
const slug = `sign-${name.replace(/^sign-/, "").replace(/-bw$/, "")}-bw`;
const file = path.join(__dirname, "..", "src", "studio", `${slug}.njk`);
if (fs.existsSync(file)) {
  console.error(`${path.relative(process.cwd(), file)} is already there. Edit it, or pick another name.`);
  process.exit(1);
}
const today = new Date().toISOString().slice(0, 10);
const q = (s) => JSON.stringify(s);

fs.writeFileSync(file, `---
layout: layouts/quick-sign.njk
title: ${q(`The Café — ${heading} sign (black & white)`)}
canvasW: "8.5in"
canvasH: "11in"
pageSize: "8.5in 11in"
pageCss: "/assets/css/studio/sign.css"
bw: true
tags: studio
studioData: ["desserts.json", "menu.json"]
studioTitle: ${q(`${heading} sign — black & white`)}
studioCategory: "Signs"
studioSize: "8.5 × 11 in portrait · letter"
studioNote: "Fill-in sign (${today}). Say where it goes and what it's for."
studioW: 816
studioH: 1056
studioOrder: 40
# Blocks go top to bottom. Delete the ones this sign doesn't need.
# Every kind is explained at the top of src/_includes/layouts/quick-sign.njk.
sign:
  heading: ${q(heading)}
  blocks:
    - rows:
        - square: "Banana Pudding"
        - name: "Something not in Square"
          priceOf: "Strawberry Trifle"
        - name: "Typed price"
          price: 2
    - label: "Treats"
    - boxes: ["First", "Second"]
      joiner: "or"
    - text: "A line of plain text."
    - list: ["One", "Two", "Three"]
      title: "A boxed list"
    - caution: "Not self serve"
      sub: "Please do not open. Ask at the counter."
---
`);
console.log(`Made src/studio/${slug}.njk. Fill in sign:, then: npm run export -- ${slug}`);
