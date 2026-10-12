// Square vs the repo: what the Square catalog has against what
// square/catalog-import.csv (built from menu.json by `npm run square`) and the
// modifier-list table in square/README.md say it should have. READ-ONLY: it
// never writes to Square. It prints the differences for a person to decide,
// one by one, whether the repo or Square is right (CafeWork TASKS SQ-1).
//
//   npm run square-check
//
// The token is the kitchen board's, from kitchen/config.json (gitignored), or
// SQUARE_ACCESS_TOKEN. Nothing private is printed: names, prices and
// descriptions only, all of them already public on /menu.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const token = process.env.SQUARE_ACCESS_TOKEN
  || (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, "kitchen", "config.json"), "utf8")).accessToken; } catch { return ""; } })();
if (!token) {
  console.error("No Square token: put it in kitchen/config.json (accessToken) or set SQUARE_ACCESS_TOKEN.");
  process.exit(1);
}

// Items that live only in Square on purpose: the specials the kitchen board
// renames each morning, and the Special Side (square/README.md).
const SQUARE_ONLY = new Set(["lunch special", "special side"]);
// The specials' variation names change daily ("Cup · Chicken Pot Pie"), so
// only their prices are compared, by position.
const DAILY = new Set(["lunch special", "soup of the day"]);
// Lists the kitchen board rewrites every morning: checked for existence only.
const BOARD_LISTS = /^side \d$/i;
// The README's names for lists Square calls something shorter.
const ALIAS = {
  "breakfast fillings": "fillings",
  "byo meats & salads": "meats & salads",
  "byo cheese": "cheese",
  "byo bread": "bread",
  "kids main": "main",
  "kids side": "sides",
  "add (on the food)": "add",
  "packets (in the bag)": "packets",
};

const low = (s) => String(s || "").trim().toLowerCase();
const money = (cents) => (cents == null ? "priced at the till" : `$${(cents / 100).toFixed(2)}`);

// ---- the repo

function parseCsv(text) {
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(f); rows.push(row); row = []; f = ""; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows;
}

const csv = parseCsv(fs.readFileSync(path.join(ROOT, "square", "catalog-import.csv"), "utf8").replace(/^﻿/, ""));
const head = csv.findIndex((r) => r.includes("Item Name") && r.includes("Variation Name"));
const col = (name) => csv[head].indexOf(name);
const C = { item: col("Item Name"), variation: col("Variation Name"), description: col("Description"), price: col("Price"),
  skip: col("Skip Detail Screen in POS") >= 0 ? col("Skip Detail Screen in POS") : col("Auto Add Item to Check") };
const repoItems = new Map(); // lower name -> { name, description, skip, variations: Map(lower name -> { name, cents }) }
for (const r of csv.slice(head + 1)) {
  if (!r[C.item]) continue;
  const key = low(r[C.item]);
  if (!repoItems.has(key)) repoItems.set(key, { name: r[C.item], description: r[C.description] || "", skip: r[C.skip] === "Y", variations: new Map() });
  repoItems.get(key).variations.set(low(r[C.variation]), { name: r[C.variation], cents: r[C.price] ? Math.round(Number(r[C.price]) * 100) : null });
}

// The README's modifier-list table: | **Name** | options | rule | attach to |
const readme = fs.readFileSync(path.join(ROOT, "square", "README.md"), "utf8");
const repoLists = [];
for (const line of readme.split(/\r?\n/)) {
  const m = /^\| \*\*(.+?)\*\* \| (.+?) \| (.+?) \| (.+?) \|\s*$/.exec(line);
  if (!m || m[1] === "Modifier list") continue;
  const text = m[2];
  // Rows described in words ("same as Bread", "plus the Bread list", written
  // by the board) can't be compared option by option.
  const loose = /same as|plus the|not made by hand/i.test(text);
  const options = loose ? null : text
    .replace(/\*\*/g, "").replace(/\([^)]*\)/g, "").replace(/\+\$\d+(\.\d+)?/g, "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  repoLists.push({ name: m[1], options, loose });
}

// ---- Square

const API = "https://connect.squareup.com/v2";
let objects = [], cursor;
do {
  const res = await fetch(`${API}/catalog/list?types=ITEM,MODIFIER_LIST${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    { headers: { Authorization: `Bearer ${token}`, "Square-Version": "2025-01-23" } });
  const json = await res.json();
  if (!res.ok) { console.error(`Square ${res.status}: ${JSON.stringify(json.errors)}`); process.exit(1); }
  objects = objects.concat(json.objects || []);
  cursor = json.cursor;
} while (cursor);
const sqItems = objects.filter((o) => o.type === "ITEM" && !o.is_deleted);
const sqLists = objects.filter((o) => o.type === "MODIFIER_LIST" && !o.is_deleted);
const listById = new Map(sqLists.map((l) => [l.id, l]));

// ---- compare

const out = [];
const section = (title, lines) => { out.push(`\n## ${title}${lines.length ? "" : ": none"}`); for (const l of lines) out.push(`- ${l}`); };

const live = sqItems.filter((o) => !o.item_data.is_archived);
const archived = sqItems.filter((o) => o.item_data.is_archived);
const sqByName = new Map(live.map((o) => [low(o.item_data.name), o]));

section("In the repo, not in Square", [...repoItems.values()]
  .filter((r) => !sqByName.has(low(r.name)))
  .map((r) => `${r.name}${archived.some((o) => low(o.item_data.name) === low(r.name)) ? " (archived in Square)" : ""}`));

section("In Square, not in the repo", live
  .filter((o) => !repoItems.has(low(o.item_data.name)))
  .map((o) => `${o.item_data.name}${SQUARE_ONLY.has(low(o.item_data.name)) ? " (Square-only on purpose)" : ""}`));

const prices = [], descriptions = [], oneTap = [], variations = [];
for (const r of repoItems.values()) {
  const o = sqByName.get(low(r.name));
  if (!o) continue;
  const d = o.item_data;
  const sqVars = (d.variations || []).map((v) => ({ name: v.item_variation_data.name, cents: v.item_variation_data.price_money ? v.item_variation_data.price_money.amount : null }));
  if (DAILY.has(low(r.name))) {
    const repoVars = [...r.variations.values()];
    repoVars.forEach((rv, i) => { const sv = sqVars[i]; if (sv && sv.cents !== rv.cents) prices.push(`${r.name} / ${rv.name}: repo ${money(rv.cents)}, Square ${money(sv.cents)}`); });
  } else {
    for (const [key, rv] of r.variations) {
      const sv = sqVars.find((v) => low(v.name) === key);
      if (!sv) variations.push(`${r.name}: the repo's "${rv.name}" isn't a size in Square (Square has ${sqVars.map((v) => `"${v.name}"`).join(", ")})`);
      else if (sv.cents !== rv.cents) prices.push(`${r.name}${r.variations.size > 1 ? ` / ${rv.name}` : ""}: repo ${money(rv.cents)}, Square ${money(sv.cents)}`);
    }
    for (const sv of sqVars) if (!r.variations.has(low(sv.name))) variations.push(`${r.name}: Square's "${sv.name}" isn't in the repo`);
  }
  const sqDesc = (d.description_plaintext || d.description || "").trim();
  if (sqDesc !== r.description.trim()) descriptions.push(`${r.name}\n    repo:   ${r.description || "(none)"}\n    Square: ${sqDesc || "(none)"}`);
  if (!!d.skip_modifier_screen !== r.skip) oneTap.push(`${r.name}: repo ${r.skip ? "one tap (adds straight to the check)" : "opens its screen"}, Square ${d.skip_modifier_screen ? "one tap" : "opens its screen"}`);
}
section("Prices that differ", prices);
section("Sizes (variations) that differ", variations);
section("Descriptions that differ", descriptions);
section("One tap vs opens its screen", oneTap);

// Modifier lists
const usedBy = new Map(); // list id -> item names
for (const o of live) for (const info of o.item_data.modifier_list_info || []) {
  if (info.enabled === false) continue;
  if (!usedBy.has(info.modifier_list_id)) usedBy.set(info.modifier_list_id, []);
  usedBy.get(info.modifier_list_id).push(o.item_data.name);
}
const optionsOf = (l) => (l.modifier_list_data.modifiers || [])
  .sort((a, b) => (a.modifier_data.ordinal ?? 0) - (b.modifier_data.ordinal ?? 0))
  .map((m) => m.modifier_data.name + (m.modifier_data.price_money && m.modifier_data.price_money.amount ? ` ${money(m.modifier_data.price_money.amount)}` : ""));
const matched = new Set();
const listLines = [];
for (const r of repoLists) {
  if (/^side 1/i.test(r.name)) {
    const have = sqLists.filter((l) => BOARD_LISTS.test(l.modifier_list_data.name)).map((l) => l.modifier_list_data.name);
    have.forEach((n) => matched.add(low(n)));
    listLines.push(`${r.name}: written by the kitchen board each morning; in Square now: ${have.join(", ") || "none yet"}`);
    continue;
  }
  let found = sqLists.filter((l) => low(l.modifier_list_data.name) === low(r.name));
  if (!found.length && ALIAS[low(r.name)]) found = sqLists.filter((l) => low(l.modifier_list_data.name) === ALIAS[low(r.name)]);
  if (!found.length) { listLines.push(`${r.name}: in the README, no list of that name in Square`); continue; }
  for (const l of found) {
    matched.add(l.id);
    const label = low(l.modifier_list_data.name) === low(r.name) ? r.name : `${r.name} (Square: "${l.modifier_list_data.name}")`;
    const twin = found.length > 1 ? ` [one of ${found.length} Square lists with this name, used by ${(usedBy.get(l.id) || ["nothing"]).join(", ")}]` : "";
    if (r.loose) { listLines.push(`${label}${twin}: README describes it in words; Square has ${optionsOf(l).join(", ")}`); continue; }
    const sqNames = (l.modifier_list_data.modifiers || []).map((m) => low(m.modifier_data.name));
    const missing = r.options.filter((o) => !sqNames.includes(low(o)));
    const extra = (l.modifier_list_data.modifiers || []).map((m) => m.modifier_data.name).filter((n) => !r.options.some((o) => low(o) === low(n)));
    if (missing.length || extra.length) listLines.push(`${label}${twin}: ${missing.length ? `README only: ${missing.join(", ")}` : ""}${missing.length && extra.length ? "; " : ""}${extra.length ? `Square only: ${extra.join(", ")}` : ""}`);
  }
}
section("Modifier lists: README table vs Square", listLines);
section("Modifier lists in Square that the README doesn't list", sqLists
  .filter((l) => !matched.has(l.id) && !matched.has(low(l.modifier_list_data.name)))
  .map((l) => `${l.modifier_list_data.name}: ${optionsOf(l).join(", ")} (used by ${(usedBy.get(l.id) || ["nothing"]).join(", ")})`));

console.log(`# Square vs the repo, ${new Date().toLocaleString("en-US", { timeZone: "America/Chicago" })}`);
console.log(`Square: ${live.length} items (${archived.length} archived), ${sqLists.length} modifier lists. Repo: ${repoItems.size} items in catalog-import.csv, ${repoLists.length} lists in square/README.md.`);
console.log(out.join("\n"));
console.log("\nNothing was changed. Decide each difference: fix the repo (menu.json, then npm run square), or Square.");
