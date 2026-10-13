// Specials into Square: the daily items' names and prices (cfg.dailyItems,
// Lunch Special and Soup of the Day), read and written for Manage -> Specials
// and each morning's plan (today.js).
//
// The front sets the day's specials from Manage -> Specials. With Desserts,
// this is the one place the board WRITES to Square, so it is narrow on
// purpose: only the items in cfg.dailyItems, only their variations' prices
// and names.
// "What it is today" goes in the variation name, because that is what
// prints on the kitchen ticket after the item name: a one-size item's only
// size becomes "BBQ Ribs"; an item in sizes keeps them, as "Cup · Chicken
// Dumpling" and "Bowl · Chicken Dumpling". The item's own name never
// changes, so nothing that finds it by name (this list, the skip list)
// loses track of it. Every save reads the item fresh
// and sends it back whole with Square's version number, so a change made in
// the Dashboard meanwhile is never overwritten: Square refuses the save
// instead, and the front is told to try again.
const { cfg } = require("../config");
const { catalog, loadCatalog, readItem, writeItem } = require("../catalog");

const dollars = (m) => (m && m.amount != null ? (m.amount / 100).toFixed(2) : "");
const TODAY_SEP = " · ";
// A size's own name, without today's text: "Cup · Chicken Dumpling" -> "Cup".
const sizeOf = (name) => String(name || "").split(TODAY_SEP)[0].trim();
// What today's text is, read back from the variation names.
function todayOf(vars) {
  if (vars.length === 1) {
    const n = vars[0].item_variation_data.name || "";
    return n === "Regular" ? "" : n;
  }
  const n = (vars[0] && vars[0].item_variation_data.name) || "";
  return n.includes(TODAY_SEP) ? n.slice(n.indexOf(TODAY_SEP) + TODAY_SEP.length) : "";
}

async function dailyItems() {
  await loadCatalog();
  const out = [];
  for (const name of cfg.dailyItems) {
    const id = catalog.itemIds.get(name.trim().toLowerCase());
    if (!id) { out.push({ key: name, name, missing: true }); continue; }
    const item = await readItem(id);
    const raw = item.item_data.variations || [];
    const vars = raw.map((v) => ({
      id: v.id,
      size: raw.length === 1 ? "" : sizeOf(v.item_variation_data.name),
      price: v.item_variation_data.pricing_type === "VARIABLE_PRICING" ? "" : dollars(v.item_variation_data.price_money),
    }));
    // key: the name as config.json lists it, which is what the week's plan
    // is filed under (Square's own spelling of it may differ in case).
    out.push({ id, key: name, name: item.item_data.name, today: todayOf(raw), variations: vars });
  }
  return out;
}

// changes: [{ id, today: "BBQ Ribs" | "", variations: [{ id, price: "10.00" | "" }] }]
// A blank price means "typed at the till" (variable pricing); a blank today
// puts the plain size names back ("Regular", "Cup", "Bowl").
async function saveDaily(changes, who = "the front page") {
  const done = [];
  // Every price checked before anything is written, so a typo in the last
  // box never leaves the first items saved and the rest not.
  for (const ch of changes || []) {
    for (const vc of ch.variations || []) {
      const text = String(vc.price ?? "").replace(/[$\s]/g, "");
      if (text !== "" && !/^\d{1,3}(\.\d{1,2})?$/.test(text)) {
        throw Object.assign(new Error(`"${vc.price}" isn't a price. Use numbers like 10 or 10.50. Nothing was saved.`), { plain: true });
      }
    }
  }
  for (const ch of changes || []) {
    if (!cfg.dailyItems.some((n) => catalog.itemIds.get(n.trim().toLowerCase()) === ch.id)) {
      throw Object.assign(new Error("That item isn't on the specials list."), { plain: true });
    }
    const item = await readItem(ch.id);
    const vars = item.item_data.variations || [];
    let changed = false;
    for (const vc of ch.variations || []) {
      const v = vars.find((x) => x.id === vc.id);
      if (!v) throw Object.assign(new Error(`${item.item_data.name} changed in Square; open Specials again.`), { plain: true });
      const d = v.item_variation_data;
      const text = String(vc.price ?? "").replace(/[$\s]/g, "");
      if (text === "") {
        if (d.pricing_type !== "VARIABLE_PRICING") { d.pricing_type = "VARIABLE_PRICING"; delete d.price_money; changed = true; }
      } else {
        if (!/^\d{1,3}(\.\d{1,2})?$/.test(text)) {
          throw Object.assign(new Error(`"${vc.price}" isn't a price. Use numbers like 10 or 10.50. Nothing was saved.`), { plain: true });
        }
        const amount = Math.round(Number(text) * 100);
        if (d.pricing_type !== "FIXED_PRICING" || !d.price_money || d.price_money.amount !== amount) {
          d.pricing_type = "FIXED_PRICING";
          d.price_money = { amount, currency: (d.price_money && d.price_money.currency) || "USD" };
          changed = true;
        }
      }
      if (ch.today !== undefined) {
        const today = String(ch.today).replace(/\s+/g, " ").trim().slice(0, 60);
        const name = vars.length === 1 ? today || "Regular" : today ? `${sizeOf(d.name)}${TODAY_SEP}${today}` : sizeOf(d.name);
        if (d.name !== name) { d.name = name; changed = true; }
      }
    }
    if (changed) {
      await writeItem(item);
      done.push(item.item_data.name);
    }
  }
  if (done.length) {
    console.log(`Specials changed in Square from ${who} (${new Date().toLocaleTimeString()}): ${done.join(", ")}.`);
    await loadCatalog();
  }
  return done;
}

module.exports = { dailyItems, saveDaily };
