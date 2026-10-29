// Reads the desserts from Square, as the kitchen board's Manage -> Desserts
// has them (kitchen/lib/desserts.js: config.json's dessertItems, then the
// rest of the Desserts category), and writes src/_data/desserts.json for
// the dessert signs. `npm run desserts`; `npm run build` runs it first.
//
// It needs the Square token in kitchen/config.json, which only the
// kitchen PC and the owner's own copy have. Without one (the GitHub
// deploy) it says so and leaves desserts.json as it was committed, so
// commit the file after it changes.
//
// Only what a sign needs is kept: names, prices, the options in each
// item's lists, and whether a kind is out (Square counts it at 0). How
// many are left, photos and Square's ids stay out of this public repo.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CONFIG = path.join(ROOT, "kitchen", "config.json");
const OUT = path.join(ROOT, "src", "_data", "desserts.json");

// A kind's name on a sign: "Regular" (a dessert made from Manage ->
// Desserts has only that) is the item itself, one word is a flavor of it
// ("Pumpkin" -> "Pumpkin Cheesecake"), and more is already a name of its
// own ("Magic Bar").
function label(item, kind) {
  if (kind.trim().toLowerCase() === "regular") return item;
  return /\s/.test(kind.trim()) ? kind : `${kind} ${item}`;
}

async function main() {
  let token = "";
  try { token = JSON.parse(fs.readFileSync(CONFIG, "utf8")).accessToken || ""; } catch { /* no config here */ }
  if (!token) {
    console.log("Desserts: no Square token here (kitchen/config.json), so src/_data/desserts.json is left as committed.");
    return;
  }
  // A development copy: the kitchen lib then never acts like the kitchen PC.
  process.env.KITCHEN_DEV = "1";
  const { dessertItems } = require("../kitchen/lib/desserts");
  const items = (await dessertItems())
    .filter((i) => !i.missing)
    .map((i) => ({
      name: i.name,
      price: i.price,
      kinds: i.kinds.map((k) => ({ name: label(i.name, k.name), ...(k.count === 0 ? { out: true } : {}) })),
      lists: i.lists
        .map((l) => ({ name: l.name, options: l.options.filter((o) => !o.off).map((o) => o.name) }))
        .filter((l) => l.options.length),
    }));

  const before = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
  const data = {
    _note: "Made by scripts/desserts.js (npm run desserts, and the start of npm run build) from Square's desserts, as the kitchen board's Manage -> Desserts has them. Don't edit it: change the desserts there, then run it again and commit this file. `out` is a kind Square counts at 0. Read by studio/sign-desserts-bw.njk and sign-dessert-bars-bw.njk.",
    updated: before.updated,
    items,
  };
  // The date moves only when the desserts do, so a build that finds nothing
  // new leaves the file (and git) alone.
  if (JSON.stringify(before.items) !== JSON.stringify(items)) {
    data.updated = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
    fs.writeFileSync(OUT, JSON.stringify(data, null, 2) + "\n");
    console.log(`Desserts: src/_data/desserts.json updated from Square (${items.length} items). Commit it.`);
  } else {
    console.log("Desserts: no change in Square.");
  }
}

// A failed read never stops a build: the signs use the file as it was.
main().catch((err) => {
  console.error(`Desserts: couldn't read Square (${err.message}); src/_data/desserts.json is left as it was.`);
});
