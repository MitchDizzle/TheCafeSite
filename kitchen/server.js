#!/usr/bin/env node
/**
 * Kitchen order board — runs on the kitchen mini PC, nowhere else.
 *
 *   node server.js          → live, reads config.json
 *   KITCHEN_MOCK=1 node server.js → fake orders, no Square account needed
 *
 * Polls Square's Orders API every few seconds and serves a full-screen board
 * at http://localhost:8090 for Chrome in kiosk mode (start-kitchen.bat).
 *
 * Why a local program and not a page on the website: the board needs a Square
 * access token, and a token can never go in this public repo or on the public
 * site. Here it lives in config.json on the kitchen PC (gitignored), the server
 * binds to 127.0.0.1 only, and nothing new is exposed to the internet.
 *
 * What shows on the board:
 *   - Counter (POS) sales from today. Square marks these COMPLETED the moment
 *     they're paid, so Square never "finishes" them for us — the cooks bump
 *     them off with Done. Bumps are kept in state.json, local to this PC.
 *   - A counter sale with nothing paid on it shows like any other, tagged
 *     NOT PAID: a pay-later phone order is cooked straight away and kept
 *     warm. If it was a sale that fell through (card declined, payment
 *     canceled on the terminal), the front takes it off both screens with
 *     "Canceled". Once it's paid in Square the tag goes away by itself.
 *   - Online / pickup orders due today (or within SHOW_AHEAD of now), until a
 *     cook bumps them OR the front marks them ready/picked up in Square —
 *     whichever comes first.
 *
 * Bumping is LOCAL ONLY. It does not mark the order ready in Square or text the
 * customer; the front still does that in Order Manager. That keeps one person
 * in charge of telling customers their food is ready.
 *
 * The front page (/front) is the same orders for the counter, on a laptop or
 * tablet over the cafe wifi: what's cooking, what's ready (the kitchen pressed
 * Done), and what the front adds to the bag (the skip-list items: drinks,
 * chips). The front clears its own list with "Handed off"; that never touches
 * the kitchen board. Only /front and its own two actions answer the network;
 * the kitchen board, the power menu and updates answer this PC alone.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFile, spawn } = require("child_process");

const DIR = __dirname;
const CONFIG_FILE = path.join(DIR, "config.json");
const MOCK = process.env.KITCHEN_MOCK === "1";
// KITCHEN_MUTE=1 silences the board for testing on another computer. On the
// kitchen PC, leave sound on: the chime is how a new order gets noticed.
const MUTE = process.env.KITCHEN_MUTE === "1";
const STATE_FILE = path.join(DIR, MOCK ? "state-mock.json" : "state.json");
const BOARD_FILE = path.join(DIR, "board.html");
const FRONT_FILE = path.join(DIR, "front.html");


const DEFAULTS = {
  accessToken: "",
  environment: "production", // or "sandbox"
  locationIds: [], // empty = every active location on the account
  port: 8090,
  pollSeconds: 5,
  sound: true, // new-order chime and lost-connection alarm
  showAheadMinutes: 60, // pickup orders appear this long before they're due
  openLookbackDays: 14, // how far back to look for pre-ordered pickups
  skipItems: [], // the skip list to start from; after that it's edited live on /front (Manage)
  frontOnNetwork: true, // serve /front to other devices on the wifi; false = this PC only
  frontKey: "", // if set, other devices must open /front?key=<this>
  updatePin: "", // if set, /front can run Check for updates with this PIN
  // Items whose price (and, for a one-size item, what it is today) the front
  // can set each morning: Manage -> Today's specials. Names as in Square.
  dailyItems: ["Lunch Special", "Soup of the Day", "Salad of the Day"],
  // Items whose photo and options (flavors) the front can change: Manage ->
  // Desserts. Names as in Square.
  dessertItems: ["Cheesecake", "Dessert Bar"],
  // The week's specials as the website publishes them (built from the site's
  // src/_data/specials.json). Read every half hour into Manage -> Plan the
  // week; "" turns that off and the plan is only what the front types in.
  specialsUrl: "https://lvcafetogo.com/specials.json",
  // Days the cafe is open (0 = Sunday ... 6 = Saturday): the days Plan the
  // week offers.
  openDays: [1, 2, 3, 4, 5],
  // A ready order nobody pressed Handed off for leaves the front page by
  // itself after this many minutes (it goes on Undo like any hand-off).
  // 0 = never. Not for unpaid orders, or online orders not yet marked ready
  // in Square: those still need someone.
  autoHandoffMinutes: 10,
};

// Settings that are the cafe's own and have no meaningful default: never
// flagged as "differs from the default".
const OWN = new Set(["accessToken", "locationIds", "skipItems", "frontKey", "updatePin", "dailyItems", "dessertItems", "openDays", "autoHandoffMinutes"]);

// What's worth knowing about config.json, in plain words. Written to the
// program window at startup and shown on /check.
//
// The point: a line in config.json pins that setting forever, so when a
// default improves in an update (pollSeconds went 10 -> 5), a PC whose config
// still says 10 never gets it. Saying so is how an update reaches it.
function reviewConfig(file) {
  const notes = [];
  for (const [key, value] of Object.entries(file)) {
    if (key.startsWith("_")) continue; // notes, not settings
    if (!(key in DEFAULTS)) {
      notes.push(`"${key}" is not a setting the board knows; check the spelling. It is being ignored.`);
    } else if (!OWN.has(key) && JSON.stringify(value) !== JSON.stringify(DEFAULTS[key])) {
      notes.push(
        `"${key}" is set to ${JSON.stringify(value)} in config.json; the current default is ` +
          `${JSON.stringify(DEFAULTS[key])}. Delete that line to use the default, or keep it if it's on purpose.`
      );
    }
  }
  return notes;
}

function loadConfig() {
  let file = {};
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      file = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
    } catch (err) {
      console.error(
        `config.json has a typo and can't be read (${err.message}).
` +
          "Usual causes: a missing comma between lines, a comma after the last line, or a missing quote."
      );
      process.exit(1);
    }
  } else if (MOCK) {
    // Test mode with no config: borrow the example's settings (skip list etc.).
    file = JSON.parse(fs.readFileSync(path.join(DIR, "config.example.json"), "utf8"));
  } else {
    console.error(
      "No config.json. Copy config.example.json to config.json and add the Square access token.\n" +
        "To try the board without Square: set KITCHEN_MOCK=1"
    );
    process.exit(1);
  }
  const known = Object.fromEntries(Object.entries(file).filter(([k]) => k in DEFAULTS));
  const cfg = { ...DEFAULTS, ...known };
  cfg.notes = fs.existsSync(CONFIG_FILE) ? reviewConfig(file) : [];
  if (!MOCK && !cfg.accessToken) {
    console.error("config.json has no accessToken.");
    process.exit(1);
  }
  return cfg;
}

const cfg = loadConfig();

// ---------------------------------------------------------------- bump state

let bumped = {}; // orderId -> ISO time a cook pressed Done (kitchen board)
// orderId -> { ms, at }: how long a ticket sat cleared before Undo brought it
// back, and when. Taken off its kitchen time, so a ticket undone and Done
// again counts only its time on the board, not the gap, in the stats.
let offBoard = {};

// Undo on the board: back on the screen, with the time it spent cleared kept
// out of the stats.
function unbump(id) {
  if (!bumped[id]) return;
  const now = Date.now();
  const gap = Math.max(0, now - Date.parse(bumped[id]));
  offBoard[id] = { ms: ((offBoard[id] && offBoard[id].ms) || 0) + gap, at: new Date(now).toISOString() };
  delete bumped[id];
}

// Demo mode (board Settings): practice orders for training, mixed in with
// the real ones, which keep showing. Practice tickets carry DEMO- ids, are
// marked DEMO on both screens, are never saved and never counted in the
// stats, and the demo turns itself off after DEMO_MINUTES.
const DEMO_PREFIX = "DEMO-";
const DEMO_MINUTES = 30;
let demo = null; // { startedAt, until } while running
const isDemo = (id) => String(id).startsWith(DEMO_PREFIX);
let handedOff = {}; // orderId -> ISO time the front pressed Handed off (/front)
let canceled = {}; // orderId -> ISO time the front took an unpaid order off both screens
// orderId -> ISO time the front brought it back with Undo after it cleared
// itself (autoHandoffMinutes): it stays until someone hands it off by hand.
let keepOnFront = {};
const autoOff = new Set(); // ids cleared by autoHandoff, so Undo can say so
const readySince = {}; // orderId -> ms first seen ready, for autoHandoff (not saved)
// What the kitchen never makes: item names and whole Square categories.
// Edited live from /front (Manage -> What the kitchen skips) and kept in
// state.json. config.json's skipItems is only the starting list, used until
// the first edit.
let skip = { items: [], categories: [] };
let skipEdited = false; // false: still config.json's list, not written to state.json
// "Reset for the day" (board Settings): nothing cleared before this time
// can be brought back with Undo, on either screen. Stats are not affected.
let undoFloor = null;
// Today's stats count from here (also set by Reset for the day), so test
// orders rung up before opening don't count.
let statsFloor = null;

function loadState() {
  try {
    const state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    bumped = state.bumped || {};
    offBoard = state.offBoard || {};
    handedOff = state.handedOff || {};
    canceled = state.canceled || {};
    keepOnFront = state.keepOnFront || {};
    skipEdited = !!state.skip;
    skip = state.skip || { items: cfg.skipItems, categories: [] };
    undoFloor = state.undoFloor || null;
    statsFloor = state.statsFloor || null;
  } catch {
    bumped = {};
    offBoard = {};
    handedOff = {};
    canceled = {};
    keepOnFront = {};
    skip = { items: cfg.skipItems, categories: [] };
    undoFloor = null;
    statsFloor = null;
  }
}

function saveState() {
  // Three days is plenty; nothing older can reappear on either screen anyway.
  const cutoff = Date.now() - 3 * 864e5;
  for (const map of [bumped, handedOff, canceled, keepOnFront]) {
    for (const [id, at] of Object.entries(map)) {
      if (Date.parse(at) < cutoff) delete map[id];
    }
  }
  for (const [id, o] of Object.entries(offBoard)) if (Date.parse(o.at) < cutoff) delete offBoard[id];
  // Demo tickets are practice: never written down, gone when the demo ends.
  const real = (map) => Object.fromEntries(Object.entries(map).filter(([id]) => !isDemo(id)));
  fs.writeFileSync(STATE_FILE, JSON.stringify({ bumped: real(bumped), offBoard: real(offBoard), handedOff: real(handedOff), canceled: real(canceled), keepOnFront: real(keepOnFront), skip: skipEdited ? skip : undefined, undoFloor, statsFloor }, null, 2));
}

loadState();

// ---------------------------------------------------------------- Square

const API =
  cfg.environment === "sandbox"
    ? "https://connect.squareupsandbox.com/v2"
    : "https://connect.squareup.com/v2";
const SQUARE_VERSION = "2025-01-23";

async function square(method, endpoint, body) {
  const res = await fetch(API + endpoint, {
    method,
    headers: {
      Authorization: `Bearer ${cfg.accessToken}`,
      "Square-Version": SQUARE_VERSION,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = (json.errors || []).map((e) => e.detail || e.code).join("; ");
    throw new Error(`Square ${res.status}: ${detail || res.statusText}`);
  }
  return json;
}

let locationIds = cfg.locationIds;

async function resolveLocations() {
  if (locationIds.length) return locationIds;
  const { locations = [] } = await square("GET", "/locations");
  locationIds = locations.filter((l) => l.status === "ACTIVE").map((l) => l.id);
  if (!locationIds.length) throw new Error("No active Square locations on this account");
  console.log(`Watching location(s): ${locationIds.join(", ")}`);
  return locationIds;
}

async function searchAll(filter) {
  const orders = [];
  let cursor;
  for (let page = 0; page < 5; page++) {
    const res = await square("POST", "/orders/search", {
      location_ids: await resolveLocations(),
      limit: 100,
      cursor,
      query: { filter, sort: { sort_field: "CREATED_AT", sort_order: "ASC" } },
    });
    orders.push(...(res.orders || []));
    cursor = res.cursor;
    if (!cursor) break;
  }
  return orders;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// ---------------------------------------------------------------- catalog

// Square's item list, for skipping whole categories: an order's line item
// names its variation, not its category, so the catalog says which
// categories each item is in. Read at startup, every CATALOG_MINUTES, and
// whenever the skip list is opened on /front, so a category made in Square
// today can be picked without a restart.
const CATALOG_MINUTES = 10;
let catalog = { byVariation: new Map(), byName: new Map(), itemIds: new Map(), categories: [], menuItems: [], loadedAt: null, error: null };

function buildCatalog(objects) {
  // Ordinary categories only. The Restaurants POS also keeps MENU categories
  // (the Breakfast and Lunch screens and their tabs), with some of the same
  // names; skipping "Breakfast" must not mean the whole breakfast screen.
  const catName = new Map(objects
    .filter((o) => o.type === "CATEGORY" && (o.category_data || {}).category_type !== "MENU_CATEGORY")
    .map((o) => [o.id, (o.category_data || {}).name || ""]));
  const byVariation = new Map();
  const byName = new Map();
  const itemIds = new Map(); // item name (lower case) -> catalog id, for Today's specials
  const members = new Map(); // category name -> item names
  const menuItems = []; // for Photo post: what each item is called, says and costs in Square
  for (const o of objects) {
    if (o.type !== "ITEM" || o.is_deleted) continue;
    const d = o.item_data || {};
    const ids = new Set([...(d.categories || []).map((c) => c.id), d.category_id, d.reporting_category && d.reporting_category.id].filter(Boolean));
    const cats = [...ids].map((id) => catName.get(id)).filter(Boolean);
    const entry = { name: d.name || "", cats };
    const fixed = (d.variations || [])
      .map((v) => v.item_variation_data || {})
      .filter((v) => v.pricing_type !== "VARIABLE_PRICING" && v.price_money && v.price_money.amount != null)
      .map((v) => v.price_money.amount);
    menuItems.push({
      name: entry.name,
      category: cats[0] || "",
      description: String(d.description_plaintext || d.description || "").replace(/<[^>]+>/g, "").trim(),
      price: fixed.length ? Math.min(...fixed) / 100 : null,
      sizes: fixed.length > 1,
    });
    for (const v of d.variations || []) byVariation.set(v.id, entry);
    byName.set(entry.name.trim().toLowerCase(), cats);
    itemIds.set(entry.name.trim().toLowerCase(), o.id);
    for (const c of cats.length ? cats : ["(No category)"]) {
      if (!members.has(c)) members.set(c, new Set());
      members.get(c).add(entry.name);
    }
  }
  const categories = [...members]
    .map(([name, items]) => ({ name, items: [...items].sort((a, b) => a.localeCompare(b)) }))
    .sort((a, b) => (a.name === "(No category)") - (b.name === "(No category)") || a.name.localeCompare(b.name));
  menuItems.sort((a, b) => (a.category || "~").localeCompare(b.category || "~") || a.name.localeCompare(b.name));
  return { byVariation, byName, itemIds, categories, menuItems };
}

async function loadCatalog() {
  try {
    let objects = [];
    if (MOCK) objects = mockCatalog();
    else {
      let cursor;
      do {
        const q = `/catalog/list?types=ITEM,CATEGORY${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
        const json = await square("GET", q);
        objects = objects.concat(json.objects || []);
        cursor = json.cursor;
      } while (cursor);
    }
    catalog = { ...buildCatalog(objects), loadedAt: new Date().toISOString(), error: null };
  } catch (err) {
    // Keep the last good catalog; skipping by item name works without one.
    if (catalog.error !== err.message) console.error(`Square catalog: ${err.message}`);
    catalog.error = err.message;
  }
  return catalog;
}

// ---------------------------------------------------------------- today's specials

// The front sets the day's prices from Manage -> Today's specials. This is
// the one place the board WRITES to Square, so it is narrow on purpose: only
// the items in cfg.dailyItems, only their variations' prices and names.
// "What it is today" goes in the variation name, because that is what
// prints on the kitchen ticket after the item name: a one-size item's only
// size becomes "BBQ Ribs"; an item in sizes keeps them, as "Cup · Chicken
// Dumpling" and "Bowl · Chicken Dumpling". The item's own name never
// changes, so nothing that finds it by name (this list, the skip list)
// loses track of it. Every save reads the item fresh
// and sends it back whole with Square's version number, so a change made in
// the Dashboard meanwhile is never overwritten: Square refuses the save
// instead, and the front is told to try again.
const mockItems = new Map(); // test mode's stand-in for Square's copy

async function readItem(id) {
  if (MOCK) return structuredClone(mockItems.get(id));
  return (await square("GET", `/catalog/object/${encodeURIComponent(id)}`)).object;
}

async function writeItem(object) {
  if (MOCK) {
    if (object.version !== mockItems.get(object.id).version) throw new Error("Square 409: version mismatch");
    mockItems.set(object.id, { ...object, version: object.version + 1 });
    return;
  }
  await square("POST", "/catalog/object", { idempotency_key: `kitchen-${object.id}-${Date.now()}`, object });
}

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
      throw Object.assign(new Error("That item isn't on the Today's specials list."), { plain: true });
    }
    const item = await readItem(ch.id);
    const vars = item.item_data.variations || [];
    let changed = false;
    for (const vc of ch.variations || []) {
      const v = vars.find((x) => x.id === vc.id);
      if (!v) throw Object.assign(new Error(`${item.item_data.name} changed in Square; open Today's specials again.`), { plain: true });
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
    console.log(`Today's specials changed from ${who} (${new Date().toLocaleTimeString()}): ${done.join(", ")}.`);
    await loadCatalog();
  }
  return done;
}

// ---------------------------------------------------------------- desserts

// Manage -> Desserts: for each item in cfg.dessertItems, its photo and the
// options in its modifier lists (cheesecake flavors). The front can:
//   - turn an option off or on. Off is Square's hidden_online: gone from
//     online ordering, kept in Square, one tap to bring back. Square lets
//     only the iPad itself mark an option sold out at the till.
//   - add an option (no price: the flavors cost the same).
//   - replace the item's photo (what online ordering shows).
// Each save reads the list fresh and writes it back with Square's version,
// like Today's specials.
const mockImages = new Map(); // test mode: item id -> data URL

async function readObject(id) {
  if (MOCK) return structuredClone(mockItems.get(id));
  return (await square("GET", `/catalog/object/${encodeURIComponent(id)}`)).object;
}

async function writeObject(object) {
  if (MOCK) return writeItem(object);
  await square("POST", "/catalog/object", { idempotency_key: `kitchen-${object.id}-${Date.now()}`, object });
}

async function dessertItems() {
  await loadCatalog();
  const out = [];
  for (const name of cfg.dessertItems) {
    const id = catalog.itemIds.get(name.trim().toLowerCase());
    if (!id) { out.push({ name, missing: true }); continue; }
    const item = await readObject(id);
    let photo = null;
    const imageId = (item.item_data.image_ids || [])[0];
    if (MOCK) photo = mockImages.get(id) || null;
    else if (imageId) {
      try { photo = (await readObject(imageId)).image_data.url || null; } catch { photo = null; }
    }
    const lists = [];
    for (const info of item.item_data.modifier_list_info || []) {
      if (info.enabled === false) continue;
      const list = await readObject(info.modifier_list_id);
      const d = list.modifier_list_data;
      lists.push({
        id: list.id,
        name: d.name,
        options: [...(d.modifiers || [])]
          .sort((a, b) => (a.modifier_data.ordinal ?? 0) - (b.modifier_data.ordinal ?? 0))
          .map((m) => ({ id: m.id, name: m.modifier_data.name, off: !!m.modifier_data.hidden_online })),
      });
    }
    out.push({ id, name: item.item_data.name, photo, lists });
  }
  return out;
}

// The lists the dessert items use: the only lists this may write.
async function dessertListIds() {
  const ids = new Set();
  for (const name of cfg.dessertItems) {
    const id = catalog.itemIds.get(name.trim().toLowerCase());
    if (!id) continue;
    for (const info of (await readObject(id)).item_data.modifier_list_info || []) ids.add(info.modifier_list_id);
  }
  return ids;
}

// changes: [{ id: listId, options: [{ id, off }], add: ["Turtle"] }]
async function saveDesserts(changes) {
  const allowed = await dessertListIds();
  const done = [];
  for (const ch of changes || []) {
    if (!allowed.has(ch.id)) throw Object.assign(new Error("That list isn't on a dessert item."), { plain: true });
    const list = await readObject(ch.id);
    const d = list.modifier_list_data;
    const mods = (d.modifiers ||= []);
    let changed = false;
    for (const oc of ch.options || []) {
      const m = mods.find((x) => x.id === oc.id);
      if (!m) throw Object.assign(new Error(`${d.name} changed in Square; open Desserts again.`), { plain: true });
      if (!!m.modifier_data.hidden_online !== !!oc.off) { m.modifier_data.hidden_online = !!oc.off; changed = true; }
    }
    const names = new Set(mods.map((m) => m.modifier_data.name.trim().toLowerCase()));
    let next = Math.max(-1, ...mods.map((m) => m.modifier_data.ordinal ?? 0)) + 1;
    for (const raw of ch.add || []) {
      const name = String(raw).replace(/\s+/g, " ").trim().slice(0, 60);
      if (!name || names.has(name.toLowerCase())) continue;
      names.add(name.toLowerCase());
      const where = { present_at_all_locations: list.present_at_all_locations, present_at_location_ids: list.present_at_location_ids };
      mods.push({ type: "MODIFIER", id: `#new-${next}`, ...where, modifier_data: { name, ordinal: next++, modifier_list_id: list.id } });
      changed = true;
    }
    if (changed) {
      await writeObject(list);
      done.push(d.name);
    }
  }
  if (done.length) console.log(`Desserts changed from the front page (${new Date().toLocaleTimeString()}): ${done.join(", ")}.`);
  return done;
}

// A new photo for a dessert item, as the online menu's picture. The phone
// has already shrunk it and re-drawn it, which also drops its GPS data.
async function saveDessertPhoto(itemId, dataUrl) {
  const allowed = cfg.dessertItems.map((n) => catalog.itemIds.get(n.trim().toLowerCase()));
  if (!allowed.includes(itemId)) throw Object.assign(new Error("That item isn't on the Desserts list."), { plain: true });
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ""));
  if (!m) throw Object.assign(new Error("That photo didn't come through. Try again."), { plain: true });
  const bytes = Buffer.from(m[1], "base64");
  if (bytes.length > 5 * 1024 * 1024) throw Object.assign(new Error("That photo is too big."), { plain: true });
  if (MOCK) { mockImages.set(itemId, dataUrl); return; }
  const item = await readObject(itemId);
  const form = new FormData();
  form.append("request", new Blob([JSON.stringify({
    idempotency_key: `kitchen-photo-${itemId}-${Date.now()}`,
    object_id: itemId,
    is_primary: true,
    image: { type: "IMAGE", id: "#photo", image_data: { name: `${item.item_data.name} ${new Date().toISOString().slice(0, 10)}` } },
  })], { type: "application/json" }), "request.json");
  form.append("image_file", new Blob([bytes], { type: "image/jpeg" }), "photo.jpg");
  const res = await fetch(`${API}/catalog/images`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.accessToken}`, "Square-Version": SQUARE_VERSION },
    body: form,
    signal: AbortSignal.timeout(30000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Square ${res.status}: ${(json.errors || []).map((e) => e.detail || e.code).join("; ") || res.statusText}`);
  console.log(`Dessert photo changed from the front page (${new Date().toLocaleTimeString()}): ${item.item_data.name}.`);
}

// ---------------------------------------------------------------- the week's specials, planned ahead

// Manage -> Plan the week: what each daily item is, and its price if that
// changes, for the days to come. Each morning the board puts that day's into
// Square by itself, through saveDaily (the same narrow write as Today's
// specials), as soon as it starts or the date turns over. Nobody has to open
// anything on the day.
//
// Two things fill the plan:
//   - the website's published week (cfg.specialsUrl, built from the site's
//     src/_data/specials.json: the same days as the /menu box and the
//     Facebook post), read every SITE_MINUTES. It adds the days it lists and
//     keeps them in step with the site, but it NEVER changes today, an
//     earlier day, or a day set on the front page;
//   - the front page. A day changed there is the front's from then on: the
//     website's copy no longer touches it.
// Kept in specials-plan.json beside state.json (gitignored).
const PLAN_FILE = path.join(DIR, MOCK ? "specials-plan-mock.json" : "specials-plan.json");
const SITE_MINUTES = 30;
const RETRY_MINUTES = 5; // after Square refuses the morning's write
const PLAN_DAYS = 14; // how far ahead Plan the week reaches

// days:    { "YYYY-MM-DD": { from: "site" | "front", items: { "<dailyItems name>": { today, prices: { "<size>" | "": "10.50" } } } } }
// applied: { "YYYY-MM-DD": { sig, at } after a good write, { sig, failedAt, error } after a bad one }
// site:    the last read of the website, for the front to show
let plan = { days: {}, applied: {}, site: { checkedAt: null, error: null } };
try {
  plan = { ...plan, ...JSON.parse(fs.readFileSync(PLAN_FILE, "utf8")) };
} catch {}

function savePlan() {
  // Two weeks back is plenty; a past day is never written again.
  const old = localDate(new Date(Date.now() - 14 * 864e5));
  for (const map of [plan.days, plan.applied]) for (const d of Object.keys(map)) if (d < old) delete map[d];
  fs.writeFileSync(PLAN_FILE, JSON.stringify(plan, null, 2));
}

// The kitchen PC's own calendar date, "2026-10-08". The PC is on the cafe's
// time, so this is Central time.
function localDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// "Thu Oct 8", for messages.
const dayWords = (date) => new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const cleanText = (s) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
const PRICE = /^\d{1,3}(\.\d{1,2})?$/;

// Which of the website's fields goes into which daily item, by the item's
// name: "Soup of the Day" takes the soup, "Lunch Special" the plate. One that
// matches none of them is left for the front to fill.
function siteFieldFor(name) {
  if (/soup/i.test(name)) return "soup";
  if (/salad/i.test(name)) return "salad";
  if (/special/i.test(name)) return "special";
  return null;
}

async function pullSite() {
  if (!cfg.specialsUrl) return;
  const today = localDate();
  try {
    const res = await fetch(cfg.specialsUrl, { cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`the website answered ${res.status}`);
    const json = await res.json();
    // `days` is the shape; `week` is the older one, read so a board updated
    // before the website still works.
    const listed = (Array.isArray(json.days) ? json.days : Array.isArray(json.week) ? json.week : [])
      .filter((d) => d && /^\d{4}-\d{2}-\d{2}$/.test(d.date));
    const changed = [];
    for (const d of listed) {
      if (d.date < today) continue;
      const have = plan.days[d.date];
      if (have && have.from !== "site") continue; // set on the front page: theirs
      // Today is never changed once it's in Square. It's only added, when
      // the board starts on a day it had no plan for.
      if (d.date === today && (have || (plan.applied[today] && plan.applied[today].sig !== "clear"))) continue;
      const items = {};
      for (const name of cfg.dailyItems) {
        const field = siteFieldFor(name);
        const text = field ? cleanText(d[field]) : "";
        if (text) items[name] = { today: text, prices: {} };
      }
      if (!Object.keys(items).length) continue;
      // The sides go nowhere in Square; Photo post words the special with them.
      const sides = Array.isArray(d.sides) ? d.sides.map(cleanText).filter(Boolean) : [];
      if (have && JSON.stringify(have.items) === JSON.stringify(items) && JSON.stringify(have.sides || []) === JSON.stringify(sides)) continue;
      plan.days[d.date] = { from: "site", items, sides };
      changed.push(d.date);
    }
    // A day still to come that the website has since taken off.
    const onSite = new Set(listed.map((d) => d.date));
    for (const [date, day] of Object.entries(plan.days)) {
      if (date > today && day.from === "site" && !onSite.has(date)) {
        delete plan.days[date];
        changed.push(date);
      }
    }
    if (changed.length) console.log(`Specials from the website (${new Date().toLocaleTimeString()}): ${changed.sort().join(", ")}.`);
    if (plan.site.error) console.log("Website specials readable again.");
    plan.site = { checkedAt: new Date().toISOString(), error: null };
  } catch (err) {
    const message = err.name === "TimeoutError" ? "the website didn't answer"
      : err.cause ? `can't reach the website (${err.cause.code || err.cause.message})` : err.message;
    if (plan.site.error !== message) console.error(`Website specials: ${message}`);
    plan.site = { checkedAt: new Date().toISOString(), error: message };
  }
  savePlan();
}

// Put today's planned specials into Square, once. Runs at startup, every
// minute after (which is what catches the date turning over), and right
// after the front saves today. A day with nothing planned puts the plain
// size names back, so yesterday's plate never prints on today's tickets;
// that happens only once the plan is in use, so a board that has never had
// one leaves Square alone.
let applying = null;
function applyToday() {
  if (!applying) applying = applyTodayOnce().finally(() => { applying = null; });
  return applying;
}

async function applyTodayOnce() {
  const today = localDate();
  const day = plan.days[today];
  const sig = day ? JSON.stringify(day.items) : "clear";
  const last = plan.applied[today];
  if (last && last.sig === sig && (last.at || Date.now() - Date.parse(last.failedAt) < RETRY_MINUTES * 6e4)) return last;
  if (!day && !Object.values(plan.applied).some((a) => a.at && a.sig !== "clear")) return null;
  try {
    const current = await dailyItems();
    const changes = [];
    for (const it of current) {
      if (it.missing) continue;
      const want = day ? day.items[it.key] : { today: "", prices: {} };
      if (!want) continue; // not planned today: left as it is
      changes.push({
        id: it.id,
        // Only a price planned and no name: the name in Square stays.
        today: day ? want.today || undefined : "",
        // A planned price, or the price Square has now ("" is priced at the till).
        variations: it.variations.map((v) => ({ id: v.id, price: (want.prices || {})[v.size] || v.price })),
      });
    }
    const saved = await saveDaily(changes, "the week's plan");
    plan.applied[today] = { sig, at: new Date().toISOString() };
    console.log(day
      ? `Today's specials put in Square from the plan (${new Date().toLocaleTimeString()}): ${saved.join(", ") || "already there"}.`
      : `Nothing planned for today: the specials' names are back to plain (${new Date().toLocaleTimeString()}).`);
  } catch (err) {
    if (!last || last.error !== err.message) console.error(`Today's specials from the plan: ${err.message}`);
    plan.applied[today] = { sig, failedAt: new Date().toISOString(), error: err.message };
  }
  savePlan();
  return plan.applied[today];
}

// What Plan the week shows: today and the next PLAN_DAYS days the cafe is
// open (plus any other day something is planned for), with Square's own
// sizes and prices for the price boxes.
async function planView() {
  const items = await dailyItems();
  const dates = [];
  for (let i = 0; i < PLAN_DAYS; i++) {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + i);
    const date = localDate(d);
    if (cfg.openDays.includes(d.getDay()) || plan.days[date]) dates.push(date);
  }
  return {
    today: localDate(),
    items: items.filter((it) => !it.missing).map(({ key, name, variations }) => ({ key, name, sizes: variations.map((v) => ({ size: v.size, price: v.price })) })),
    missing: items.filter((it) => it.missing).map((it) => it.name),
    days: dates.map((date) => ({ date, plan: plan.days[date] || null, applied: plan.applied[date] || null })),
    site: { url: cfg.specialsUrl, ...plan.site },
  };
}

// changes: { "YYYY-MM-DD": { items: { "<dailyItems name>": { today, prices: { "<size>": "10.50" } } } } }
// Only the days the front changed. A day left with nothing in it is taken off
// the plan (if the website lists it, its copy comes back on the next read).
// Everything is checked before anything is kept.
function savePlanDays(changes) {
  const today = localDate();
  const next = {};
  for (const [date, change] of Object.entries(changes || {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today) {
      throw Object.assign(new Error("That day has already gone. Open Plan the week again."), { plain: true });
    }
    const items = {};
    for (const [name, it] of Object.entries((change && change.items) || {})) {
      if (!cfg.dailyItems.includes(name)) throw Object.assign(new Error(`"${name}" isn't on the specials list.`), { plain: true });
      const prices = {};
      for (const [size, raw] of Object.entries((it && it.prices) || {})) {
        const text = String(raw ?? "").replace(/[$\s]/g, "");
        if (!text) continue;
        if (!PRICE.test(text)) throw Object.assign(new Error(`"${raw}" isn't a price. Use numbers like 10 or 10.50. Nothing was saved.`), { plain: true });
        prices[String(size)] = Number(text).toFixed(2);
      }
      const text = cleanText(it && it.today);
      if (text || Object.keys(prices).length) items[name] = { today: text, prices };
    }
    // What comes with the plate. Not sent to Square (the ticket says the
    // plate); Photo post words the special with it.
    const sides = (Array.isArray(change && change.sides) ? change.sides : []).map(cleanText).filter(Boolean).slice(0, 6);
    next[date] = Object.keys(items).length || sides.length ? { from: "front", items, ...(sides.length ? { sides } : {}) } : null;
  }
  for (const [date, day] of Object.entries(next)) {
    if (day) plan.days[date] = day;
    else delete plan.days[date];
  }
  savePlan();
  const dates = Object.keys(next).sort();
  if (dates.length) console.log(`Plan the week changed from the front page (${new Date().toLocaleTimeString()}): ${dates.join(", ")}.`);
  return dates;
}

// The categories a line item's item is in: by its catalog id, or by name
// for anything the catalog id doesn't match.
function categoriesOf(li) {
  const hit = li.catalog_object_id && catalog.byVariation.get(li.catalog_object_id);
  if (hit) return hit.cats;
  return catalog.byName.get(itemName(li).trim().toLowerCase()) || [];
}

const lowerSet = (list) => new Set(list.map((x) => String(x).trim().toLowerCase()));
let skipItemSet = new Set();
let skipCatSet = new Set();
function setSkip(next) {
  const clean = (list) => [...new Set((Array.isArray(list) ? list : []).map((x) => String(x).trim()).filter(Boolean))];
  skip = { items: clean(next.items), categories: clean(next.categories) };
  skipItemSet = lowerSet(skip.items);
  skipCatSet = lowerSet(skip.categories);
}
setSkip(skip);

const skipSummary = () => [...skip.categories.map((c) => `all of ${c}`), ...skip.items].join(", ") || "nothing";

// On the skip list by name, or in a skipped category.
function isSkipped(li) {
  if (skipItemSet.has(itemName(li).trim().toLowerCase())) return true;
  return categoriesOf(li).some((c) => skipCatSet.has(c.trim().toLowerCase()));
}

async function fetchOrders() {
  const today = startOfToday().toISOString();
  const openSince = new Date(Date.now() - cfg.openLookbackDays * 864e5).toISOString();
  const [open, completed] = await Promise.all([
    searchAll({
      state_filter: { states: ["OPEN"] },
      date_time_filter: { created_at: { start_at: openSince } },
    }),
    searchAll({
      state_filter: { states: ["COMPLETED"] },
      date_time_filter: { created_at: { start_at: today } },
    }),
  ]);
  return [...open, ...completed];
}

// ---------------------------------------------------------------- photo posts

// Manage -> Photo post: the phone draws the post itself (canvas), from a
// photo it just took and words it fills from the plan or Square's menu. The
// kitchen PC only keeps the result, for the website later: the photo (already
// shrunk to 2000px and re-drawn on the phone, which drops its GPS data) and
// the finished post, in photos/, with photos/photos.json in the same shape as
// the site's src/_data/photos.json so they can be moved over as they are.
// Gitignored.
const PHOTO_DIR = path.join(DIR, MOCK ? "photos-mock" : "photos");

// What the screen starts from: today's planned special and soup (with the
// website's sides), and every item in Square with its words and price.
async function photoSetup() {
  await loadCatalog();
  const date = localDate();
  const day = plan.days[date];
  const today = {};
  if (day) {
    for (const [name, it] of Object.entries(day.items)) {
      const field = siteFieldFor(name);
      if (field && it.today) today[field] = it.today;
    }
    if (day.sides && day.sides.length) today.sides = day.sides;
  }
  return { date, today, items: catalog.menuItems, catalogError: catalog.error };
}

const slugOf = (s) => String(s).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "photo";

function jpegFrom(dataUrl, what) {
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ""));
  if (!m) throw Object.assign(new Error(`The ${what} didn't come through. Try again.`), { plain: true });
  const bytes = Buffer.from(m[1], "base64");
  if (bytes.length > 8 * 1024 * 1024) throw Object.assign(new Error(`The ${what} is too big.`), { plain: true });
  return bytes;
}

// body: { photo, post: JPEG data URLs, meta: { title, item, special, includesDrink, description, kicker } }
function savePhotoPost(body) {
  const meta = body.meta || {};
  const title = cleanText(meta.title);
  if (!title) throw Object.assign(new Error("The post needs a name."), { plain: true });
  const photo = jpegFrom(body.photo, "photo");
  const post = jpegFrom(body.post, "finished post");
  fs.mkdirSync(PHOTO_DIR, { recursive: true });
  const indexFile = path.join(PHOTO_DIR, "photos.json");
  let index = { photos: [] };
  try { index = JSON.parse(fs.readFileSync(indexFile, "utf8")); } catch {}
  const date = localDate();
  // Same dish twice (a retake): a new name, never over the earlier one.
  let slug = slugOf(title);
  for (let n = 2; fs.existsSync(path.join(PHOTO_DIR, `${date}-${slug}.jpg`)); n++) slug = `${slugOf(title)}-${n}`;
  fs.writeFileSync(path.join(PHOTO_DIR, `${date}-${slug}.jpg`), photo);
  fs.writeFileSync(path.join(PHOTO_DIR, `${date}-${slug}-post.jpg`), post);
  index.photos.push({
    file: `/assets/photos/${slug}.jpg`,
    item: meta.special ? null : String(meta.item || "") || null,
    special: !!meta.special,
    ...(meta.special && meta.includesDrink ? { includesDrink: true } : {}),
    variant: null,
    title,
    description: String(meta.description || "").replace(/\s+/g, " ").trim().slice(0, 200),
    alt: "", // written when it moves to the website: describe the picture
    date,
    saved: `${date}-${slug}.jpg`,
    post: `${date}-${slug}-post.jpg`,
  });
  fs.writeFileSync(indexFile, JSON.stringify(index, null, 2));
  console.log(`Photo post saved from the front page (${new Date().toLocaleTimeString()}): ${title} -> photos/${date}-${slug}.jpg`);
  return `${date}-${slug}.jpg`;
}

// ---------------------------------------------------------------- tickets

// An online order the front has picked up, canceled or failed is finished
// everywhere. PREPARED (marked ready in Order Manager, which texts the
// customer) is finished for the kitchen but not for the front: the bag is
// still on the counter waiting for the customer.
const GONE_FULFILLMENT = new Set(["COMPLETED", "CANCELED", "FAILED"]);
// Keypad (custom amount) sales DO show: staff may ring a special or an
// off-menu plate that way, and a missed ticket is worse than an extra one.
const NOT_FOOD = new Set(["GIFT_CARD"]);

const itemName = (li) => li.name || li.note || "Custom amount";
const TO_GO_TYPES = /^(PICKUP|DELIVERY|SHIPMENT)$/;

// Online vs. front counter. The Restaurants POS attaches a fulfillment to a
// counter sale and marks it COMPLETED the instant it's paid, so a completed
// fulfillment only means "the front finished it" on an online order. An
// order is online if Square names it so or it carries a scheduled pickup
// time; anything else is treated as a counter sale and waits for Done. When
// in doubt it stays on the board — an extra ticket beats a missed one.
function isOnline(order, f) {
  const source = (order.source && order.source.name) || "";
  return /online/i.test(source) || !!(f && f.pickup_details && f.pickup_details.pickup_at);
}

// Returns { ticket } or { reason } — the reason is what /check shows for an
// order that came back from Square but isn't on the board.
function toTicket(order) {
  const f = (order.fulfillments || [])[0];
  const online = isOnline(order, f);
  if (f && f.state === "CANCELED") return { reason: "canceled" };
  if (online && GONE_FULFILLMENT.has(f.state)) {
    return { reason: `front already marked it ${f.state.toLowerCase()}` };
  }

  const lines = order.line_items || [];
  // Condiment packets ("Ketchup packet") are chosen as modifiers in Square
  // but go in the bag, not on the food: they come off the kitchen ticket
  // and onto the front's list. See the Packets list in square/README.md.
  const isPacket = (m) => /\bpackets?\b/i.test(m.name || "");
  // Items to go on a For Here ticket: "we're eating here, and a plate to
  // take home". The POS sets the dining option per item; the Restaurants
  // POS records dining options as fulfillments, so such an order is
  // expected to carry one per option, each listing its own items
  // (line_item_application ENTRY_LIST, entries[].line_item_uid). A "To Go"
  // modifier on an item is read the same way, in case it arrives as one.
  // Check a real split order on /check (its "raw" link) if they don't show.
  const lineToGo = new Map(); // line item uid -> true (to go) | false (here)
  for (const ff of order.fulfillments || []) {
    if (ff.line_item_application !== "ENTRY_LIST") continue;
    for (const e of ff.entries || []) lineToGo.set(e.line_item_uid, TO_GO_TYPES.test(ff.type));
  }
  const isToGoMod = (m) => /^\s*to[\s-]?go\s*$/i.test(m.name || "");
  const toItem = (li) => ({
    qty: Number(li.quantity) || 1,
    name: itemName(li),
    variation:
      li.variation_name && li.variation_name !== "Regular" ? li.variation_name : null,
    mods: (li.modifiers || []).filter((m) => !isPacket(m) && !isToGoMod(m)).map((m) =>
      Number(m.quantity) > 1 ? `${m.name} ×${Number(m.quantity)}` : m.name
    ),
    note: li.name && li.note ? li.note : null,
    toGo: (li.modifiers || []).some(isToGoMod) || lineToGo.get(li.uid) === true,
  });
  const food = lines.filter((li) => !NOT_FOOD.has(li.item_type));
  const isSkip = isSkipped;
  // items: what the kitchen makes. front: what the counter adds to the bag.
  const items = food.filter((li) => !isSkip(li)).map(toItem);
  const front = food.filter(isSkip).map(toItem);
  // Packets, totalled across the order: 2 burgers each wanting ketchup is
  // "2 Ketchup packet", one line.
  const packets = new Map();
  for (const li of food) {
    for (const m of li.modifiers || []) {
      if (!isPacket(m)) continue;
      const n = (Number(li.quantity) || 1) * (Number(m.quantity) || 1);
      packets.set(m.name, (packets.get(m.name) || 0) + n);
    }
  }
  for (const [name, qty] of packets) front.push({ qty, name, variation: null, mods: [], note: null });
  if (!lines.length) return { reason: "no items on the order" };
  // A counter sale of only drinks or chips is handed over as it's rung up;
  // it belongs on neither screen. An online one still needs bagging, so it
  // stays a ticket and shows on /front only (see hiddenReason).
  if (!items.length && (!online || !front.length)) {
    return { reason: "every item is on the skip list (or a gift card)" };
  }

  const details = f && (f.pickup_details || f.delivery_details || f.shipment_details);
  const recipient = details && details.recipient;
  const dueAt = (f && f.pickup_details && f.pickup_details.pickup_at) || null;
  // A counter sale still OPEN with nothing paid: usually a pay-later phone
  // order (cooked now, kept warm), sometimes a sale that fell through (card
  // declined, payment canceled on the terminal). Shown and cooked either
  // way, tagged NOT PAID; the front removes a dead one with "Canceled".
  const unpaid = !online && order.state === "OPEN" && !(order.tenders || []).length;
  const due = order.net_amount_due_money && order.net_amount_due_money.amount;
  // The ticket name the counter typed. A bare number is a table number (the
  // cafe hands them out to people eating in); TEST marks a practice order.
  const ticketName = (order.ticket_name || "").trim();
  const table = !online && /^\d{1,3}$/.test(ticketName) ? ticketName : null;
  const test = /^test\b/i.test(ticketName);
  // To go or for here. The Restaurants POS records the dining option as the
  // fulfillment: "To Go" is PICKUP, "For Here" is IN_STORE. To Go is the
  // POS default, so a table number wins: someone sitting down with a number
  // is eating here even if nobody changed the dining option.
  // An order split between for here and to go carries an IN_STORE
  // fulfillment as well: it's a For Here ticket with some items to go.
  const anyHere = (order.fulfillments || []).some((x) => x.type === "IN_STORE");
  const toGo = online || (!table && !anyHere && !!(f && TO_GO_TYPES.test(f.type)));
  // On a For Here ticket, the to-go items go last, under their own TO GO
  // line on both screens, so they're made (and bagged) after the plates.
  // On a To Go ticket everything goes, so nothing is singled out.
  for (const list of [items, front]) {
    for (const it of list) if (toGo || !it.toGo) delete it.toGo;
    list.sort((a, b) => !!a.toGo - !!b.toGo);
  }
  // What to call it. Square's own order id means nothing at the counter;
  // the receipt number (the start of the payment's id, as printed on the
  // receipt) does, so an order with no name goes by that once it's paid.
  const tender = (order.tenders || [])[0];
  const receipt = tender && tender.id ? tender.id.slice(0, 4).toUpperCase() : null;

  return { ticket: {
    id: order.id,
    kind: online ? f.type : "COUNTER", // PICKUP, DELIVERY, SHIPMENT, or COUNTER
    name: (recipient && recipient.display_name) || order.ticket_name || null,
    shortId: order.id.slice(-4).toUpperCase(),
    label: table ? `Table ${table}` : (recipient && recipient.display_name) || ticketName || `#${receipt || order.id.slice(-4).toUpperCase()}`,
    table,
    test,
    source: (order.source && order.source.name) || null,
    createdAt: order.created_at,
    dueAt,
    items,
    front,
    // Marked ready in Order Manager: the customer has been texted.
    squareReady: !!(online && f.state === "PREPARED"),
    unpaid,
    toGo,
    due: unpaid && due ? due / 100 : null,
    note: (details && details.note) || null,
    detail: orderDetail(order),
  } };
}

// Today's work only, on both screens: a stale order from yesterday that
// nobody closed in Square should not greet anyone every morning.
function outOfWindow(t, now) {
  const due = Date.parse(t.dueAt || t.createdAt);
  if (due < startOfToday().getTime()) return "due before today";
  if (due > now + cfg.showAheadMinutes * 6e4) return "pickup is more than " + cfg.showAheadMinutes + " min away";
  return null;
}

// null if the ticket belongs on the kitchen board, else why not.
function hiddenReason(t, now) {
  if (bumped[t.id]) return "cleared with Done";
  if (canceled[t.id]) return "not paid; canceled at the front";
  if (t.squareReady) return "front already marked it prepared";
  if (!t.items.length) return "every item is on the skip list (front only)";
  return outOfWindow(t, now);
}

// null if the ticket belongs on /front, else why not.
function frontHiddenReason(t, now) {
  if (handedOff[t.id]) return "handed off at the front";
  if (canceled[t.id]) return "not paid; canceled at the front";
  return outOfWindow(t, now);
}

// Ready for the front: the kitchen pressed Done, the front already marked it
// ready in Square, or there was nothing for the kitchen to make.
function readyAt(t) {
  if (bumped[t.id]) return bumped[t.id];
  if (t.squareReady || !t.items.length) return t.createdAt;
  return null;
}

// Everything cleared that could come back, newest first: what Undo offers.
// Kept on the server, so Undo still works after the page or PC restarts.
// `main` is the first thing on the order, so a list of them can be told
// apart ("#4F2A · Cheeseburger"). Nothing from before a Reset for the day.
function undoList(map) {
  const byId = new Map(all.map((t) => [t.id, t]));
  const floor = undoFloor ? Date.parse(undoFloor) : 0;
  return Object.keys(map)
    .filter((id) => byId.has(id) && Date.parse(map[id]) > floor)
    .sort((a, b) => Date.parse(map[b]) - Date.parse(map[a]))
    .slice(0, 12)
    .map((id) => {
      const t = byId.get(id);
      const first = t.items[0] || t.front[0];
      return { id, label: t.label, main: first ? first.name : "", at: map[id] };
    });
}

// The most recently bumped ticket that could come back: what Undo restores.
function lastCleared() {
  return undoList(bumped)[0] || null;
}

// The most recent hand-off that could come back: what Undo on /front restores.
function lastHandedOff() {
  return undoList(handedOff)[0] || null;
}

// ---------------------------------------------------------------- polling

let pollTimer = null;
let nextPollAt = null; // when the next scheduled Square check runs, for the board's countdown ring
let polling = null; // the in-flight poll, so "check now" never runs two at once
let all = []; // every ticket from the last good poll, bumped or not
let todaysOrders = []; // every order from the last good poll, for the day's stats
let rejected = []; // orders Square returned that never became tickets, for /check
let rawOrders = new Map(); // id -> the order exactly as Square sent it, last poll (for /check)
const logged = new Set(); // order ids already announced in the console
let lastOkAt = null;
let lastError = null;

function poll() {
  if (polling) return polling;
  clearTimeout(pollTimer);
  polling = pollOnce().finally(() => {
    polling = null;
    pollTimer = setTimeout(poll, cfg.pollSeconds * 1000);
    nextPollAt = new Date(Date.now() + cfg.pollSeconds * 1000).toISOString();
  });
  return polling;
}

async function pollOnce() {
  try {
    const real = MOCK ? mockOrders() : await fetchOrders();
    todaysOrders = real; // the stats never see demo orders
    if (demo && Date.now() > Date.parse(demo.until)) endDemo();
    const orders = demo ? [...real, ...demoOrders(Date.parse(demo.startedAt))] : real;
    rawOrders = new Map(real.map((o) => [o.id, o]));
    const seen = new Set();
    all = [];
    rejected = [];
    for (const o of orders) {
      if (seen.has(o.id)) continue;
      seen.add(o.id);
      const { ticket, reason } = toTicket(o);
      if (ticket) {
        if (isDemo(o.id)) ticket.demo = true;
        all.push(ticket);
      } else rejected.push({ order: o, reason });
      if (!logged.has(o.id) && !isDemo(o.id)) {
        logged.add(o.id);
        const why = ticket ? hiddenReason(ticket, Date.now()) : reason;
        console.log(
          `${new Date().toLocaleTimeString()}  order ...${o.id.slice(-4)}: ` +
            (why ? `not shown (${why})` : "on the board")
        );
      }
    }
    lastOkAt = new Date().toISOString();
    if (lastError) console.log("Square connection restored");
    lastError = null;
    autoHandoff();
    recordHistory();
  } catch (err) {
    if (err.message !== lastError) console.error(new Date().toLocaleTimeString(), err.message);
    lastError = err.message; // keep showing the last good tickets
  }
}

function snapshot() {
  const now = Date.now();
  const tickets = all
    .filter((t) => !hiddenReason(t, now))
    .sort((a, b) => Date.parse(a.dueAt || a.createdAt) - Date.parse(b.dueAt || b.createdAt));
  return { tickets, lastOkAt, error: lastError, mock: MOCK, sound: cfg.sound && !MUTE, lastCleared: lastCleared(),
    clearedList: undoList(bumped), stats: statsToday(), demo, pollSeconds: cfg.pollSeconds, nextPollAt, checking: !!polling };
}

// ---------------------------------------------------------------- stats

// The day so far, for /front and the board's Settings. Breakfast or lunch is
// by the clock, as the menu draws it: rung up (or due, for a pickup) before
// BREAKFAST_ENDS is breakfast. Counted from Square's orders, so an online
// order the front has already handed over still counts. Canceled orders and
// unpaid open checks don't.
const BREAKFAST_ENDS = 11; // hour, local time

// One record per order that counts today, the same orders the numbers are
// made from. These are what the daily history keeps (see recordHistory), so
// any report can be made later from them, not only the numbers shown now.
// No customer names: the ticket's label is left out on purpose.
function dayRecords() {
  // From midnight, or from the last Reset for the day if that was today.
  const today = Math.max(startOfToday().getTime(), statsFloor ? Date.parse(statsFloor) : 0);
  const tomorrow = startOfToday().getTime() + 864e5;
  const tickets = new Map(all.filter((t) => !t.demo).map((t) => [t.id, t]));
  const seen = new Set();
  const out = [];
  for (const o of todaysOrders) {
    if (seen.has(o.id)) continue;
    seen.add(o.id);
    const f = (o.fulfillments || [])[0];
    if (o.state === "CANCELED" || (f && (f.state === "CANCELED" || f.state === "FAILED"))) continue;
    if (o.state === "OPEN" && !(o.tenders || []).length && !(f && f.pickup_details && f.pickup_details.pickup_at)) continue;
    if (/^test\b/i.test((o.ticket_name || "").trim())) continue; // a practice order
    const when = Date.parse((f && f.pickup_details && f.pickup_details.pickup_at) || o.created_at);
    if (when < today || when >= tomorrow) continue;
    const food = (o.line_items || []).filter((li) => !NOT_FOOD.has(li.item_type));
    if (!food.length) continue;
    const online = isOnline(o, f);
    const t = tickets.get(o.id);
    // Time in the kitchen: rung up to Done, counter orders only. A pickup's
    // order time can be hours before it's started, so it would skew this.
    // Time a ticket sat cleared before an Undo doesn't count.
    let kitchenMinutes = null;
    if (t && !online && bumped[o.id]) {
      const m = (Date.parse(bumped[o.id]) - Date.parse(o.created_at) - ((offBoard[o.id] && offBoard[o.id].ms) || 0)) / 6e4;
      if (m >= 0 && m < 240) kitchenMinutes = Math.round(m * 10) / 10;
    }
    out.push({
      id: o.id,
      at: new Date(when).toISOString(),
      meal: new Date(when).getHours() < BREAKFAST_ENDS ? "breakfast" : "lunch",
      online,
      toGo: t ? t.toGo : online,
      paid: !!(o.tenders || []).length,
      sales: o.total_money && o.total_money.amount != null ? o.total_money.amount / 100 : null,
      items: food.map((li) => ({
        name: itemName(li),
        variation: li.variation_name && li.variation_name !== "Regular" ? li.variation_name : null,
        qty: Number(li.quantity) || 1,
      })),
      done: !!bumped[o.id],
      kitchenMinutes,
    });
  }
  return out;
}

// The numbers for a list of records: one day's (the front's Today) or any
// range's (Reports). Same shape either way.
function summarize(records) {
  const out = { orders: records.length, breakfast: 0, lunch: 0, counter: 0, online: 0, toGo: 0, forHere: 0,
    kitchenDone: 0, avgMinutes: null, longestMinutes: null, sales: 0, items: [], topItems: [], byHour: {} };
  const qty = new Map();
  const times = [];
  for (const r of records) {
    out[r.meal]++;
    out[r.online ? "online" : "counter"]++;
    out[r.toGo ? "toGo" : "forHere"]++;
    if (r.done) out.kitchenDone++;
    if (r.kitchenMinutes != null) times.push(r.kitchenMinutes);
    out.sales += r.sales || 0;
    const h = new Date(r.at).getHours();
    out.byHour[h] = (out.byHour[h] || 0) + 1;
    for (const it of r.items) qty.set(it.name, (qty.get(it.name) || 0) + it.qty);
  }
  out.sales = Math.round(out.sales * 100) / 100;
  if (times.length) {
    out.avgMinutes = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
    out.longestMinutes = Math.round(Math.max(...times));
  }
  out.items = [...qty].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name, n]) => ({ name, qty: n }));
  out.topItems = out.items.slice(0, 5);
  return out;
}

// The full item list stays out: the screens poll this every few seconds
// and show only the top five.
function statsToday() {
  const { items, ...today } = summarize(dayRecords());
  return today;
}

// ---------------------------------------------------------------- daily history

// Every day's records, kept for good in stats-history.json (gitignored) so
// a week, a month or any range can be reported on later: Manage -> Reports
// on the front page, or the file itself. Today's entry is rewritten as the
// day goes (at most every HISTORY_SECONDS), so nothing waits on the board
// being closed properly at night. A day the board never ran is missing.
// Counts from the same orders as Today, so a Reset for the day restarts
// that day's history too, and test and demo orders never get in.
const HISTORY_FILE = path.join(DIR, MOCK ? "stats-history-mock.json" : "stats-history.json");
const HISTORY_SECONDS = 30;
let history = { days: {} };
try {
  history = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"));
  if (!history.days) history.days = {};
} catch {}
let historyWrittenAt = 0;
let historyLast = "";

function recordHistory() {
  if (Date.now() - historyWrittenAt < HISTORY_SECONDS * 1000) return;
  const records = dayRecords();
  if (!records.length) return;
  const json = JSON.stringify(records);
  if (json === historyLast) return;
  const date = localDate();
  history.days[date] = { savedAt: new Date().toISOString(), orders: records };
  try {
    // Write the copy whole, then swap it in: a power cut mid-write never
    // leaves a half-written history.
    fs.writeFileSync(HISTORY_FILE + ".tmp", JSON.stringify(history));
    fs.renameSync(HISTORY_FILE + ".tmp", HISTORY_FILE);
    historyLast = json;
    historyWrittenAt = Date.now();
  } catch (err) {
    console.error(`Stats history: ${err.message}`);
  }
}

// Manage -> Reports: the days in [from, to], each with its numbers, and the
// numbers for the whole range. `orders` (every record) only when asked, for
// the CSV download.
function historyReport(from, to, withOrders) {
  const dates = Object.keys(history.days).filter((d) => d >= from && d <= to).sort();
  const days = dates.map((date) => ({ date, ...summarize(history.days[date].orders) }));
  const records = dates.flatMap((d) => history.days[d].orders);
  const out = { from, to, first: Object.keys(history.days).sort()[0] || null, days, total: summarize(records) };
  if (withOrders) out.orders = dates.flatMap((date) => history.days[date].orders.map((r) => ({ date, ...r })));
  return out;
}

// A ready order nobody pressed Handed off for clears itself off the front
// page after cfg.autoHandoffMinutes, as if they had: one person watches the
// front, and a list of finished orders hides the ones that aren't. Never an
// unpaid order (money is still owed), never an online order the front hasn't
// marked ready in Square (that's what texts the customer), and never one
// brought back with Undo. Timed from when it turned ready: the kitchen's
// Done, or for anything else the first poll that saw it ready.
function autoHandoff() {
  if (!cfg.autoHandoffMinutes) return;
  const now = Date.now();
  const cleared = [];
  for (const t of all) {
    const ready = readyAt(t);
    if (!ready) { delete readySince[t.id]; continue; }
    if (!readySince[t.id]) readySince[t.id] = bumped[t.id] ? Date.parse(bumped[t.id]) : now;
    if (handedOff[t.id] || canceled[t.id] || keepOnFront[t.id]) continue;
    if (t.unpaid || (t.kind !== "COUNTER" && !t.squareReady)) continue;
    if (now - readySince[t.id] < cfg.autoHandoffMinutes * 6e4) continue;
    handedOff[t.id] = new Date(now).toISOString();
    autoOff.add(t.id);
    cleared.push(t.label);
  }
  if (cleared.length) {
    saveState();
    console.log(`${new Date().toLocaleTimeString()}  front page: ready ${cfg.autoHandoffMinutes}+ min, cleared by itself: ${cleared.join(", ")}`);
  }
}

// /front: ready orders first, oldest-ready at the top (the one waiting
// longest on the counter), then what's still cooking in board order.
function frontSnapshot() {
  const now = Date.now();
  const orders = all
    .filter((t) => !frontHiddenReason(t, now))
    .map((t) => ({ ...t, readyAt: readyAt(t) }))
    .sort((a, b) => {
      if (!!a.readyAt !== !!b.readyAt) return a.readyAt ? -1 : 1;
      if (a.readyAt) return Date.parse(a.readyAt) - Date.parse(b.readyAt);
      return Date.parse(a.dueAt || a.createdAt) - Date.parse(b.dueAt || b.createdAt);
    });
  return { orders, lastOkAt, error: lastError, mock: MOCK, lastHandedOff: lastHandedOff(),
    handedOffList: undoList(handedOff).map((h) => ({ ...h, auto: autoOff.has(h.id) })), stats: statsToday(), demo,
    updatePin: !!cfg.updatePin, pollSeconds: cfg.pollSeconds, autoHandoffMinutes: cfg.autoHandoffMinutes };
}

// ---------------------------------------------------------------- mock data

const mockStart = Date.now();
// A For Here order with one item to go, split the way the Restaurants POS
// is expected to record it (see lineToGo in toTicket).
function mockSplitOrder(created) {
  return {
    id: "MOCKSPLIT0010",
    state: "COMPLETED",
    created_at: created,
    ticket_name: "7",
    source: { name: "Square Point of Sale" },
    tenders: [{ id: "SPLT1234", type: "CARD" }],
    line_items: [
      { uid: "L1", quantity: "1", name: "Cheeseburger", variation_name: "Regular", modifiers: [{ name: "No onion" }] },
      { uid: "L2", quantity: "1", name: "Soup of the Day", variation_name: "Bowl" },
      { uid: "L3", quantity: "2", name: "Lunch Special", variation_name: "Meatloaf" },
    ],
    fulfillments: [
      { uid: "F1", type: "IN_STORE", state: "COMPLETED", line_item_application: "ENTRY_LIST", entries: [{ line_item_uid: "L1" }, { line_item_uid: "L2" }] },
      { uid: "F2", type: "PICKUP", state: "COMPLETED", line_item_application: "ENTRY_LIST", entries: [{ line_item_uid: "L3" }] },
    ],
  };
}

function mockOrders() {
  const ago = (min) => new Date(Date.now() - min * 6e4).toISOString();
  const at = (min) => new Date(mockStart + min * 6e4).toISOString();
  const li = (quantity, name, extra = {}) => ({ quantity: String(quantity), name, ...extra });
  const orders = [
    {
      id: "MOCKCOUNTER0001",
      state: "COMPLETED",
      created_at: at(-17),
      line_items: [
        li(1, "Turkey Club", { variation_name: "Sourdough", modifiers: [{ name: "No tomato" }] }),
        li(1, "Soup of the Day", { variation_name: "Bowl" }),
        li(1, "Iced Tea / Fountain Drink"),
      ],
    },
    {
      id: "MOCKPICKUP00002",
      state: "OPEN",
      created_at: ago(40),
      fulfillments: [
        {
          type: "PICKUP",
          state: "RESERVED",
          pickup_details: {
            pickup_at: at(12),
            recipient: { display_name: "Linda Parker" },
            note: "Will call when outside",
          },
        },
      ],
      line_items: [
        li(2, "Chicken Salad Croissant"),
        li(1, "Build Your Own", {
          variation_name: "Two meats",
          modifiers: [{ name: "Ham" }, { name: "Roast beef" }, { name: "Swiss" }, { name: "Wheat" }],
          note: "Mayo on the side",
        }),
        li(3, "Chocolate Chip Cookie"),
      ],
    },
    {
      id: "MOCKCOUNTER0003",
      state: "COMPLETED",
      created_at: at(-9),
      ticket_name: "Bob",
      fulfillments: [{ type: "PICKUP", state: "COMPLETED", pickup_details: { schedule_type: "ASAP" } }],
      line_items: [li(1, "Cheeseburger", { modifiers: [{ name: "Add bacon" }, { name: "No onion" }, { name: "Ketchup packet", quantity: "2" }] })],
    },
    {
      id: "MOCKCOUNTER0004",
      state: "COMPLETED",
      created_at: at(-2),
      ticket_name: "5",
      fulfillments: [{ type: "PICKUP", state: "COMPLETED", pickup_details: { schedule_type: "ASAP" } }],
      tenders: [{ id: "R7KQ2mXpLw", type: "CARD" }],
      line_items: [li(2, "Grilled Cheese"), li(2, "Kids Side", { variation_name: "Applesauce" })],
    },
    {
      id: "MOCKPICKUP00005",
      state: "OPEN",
      created_at: ago(300),
      fulfillments: [
        {
          type: "PICKUP",
          state: "RESERVED",
          pickup_details: { pickup_at: at(180), recipient: { display_name: "Catering — Hale" } },
        },
      ],
      line_items: [li(1, "Sandwich Tray", { variation_name: "Large" })],
    },
  ];
  // The Restaurants POS: a paid counter sale arrives with its fulfillment
  // already COMPLETED. It must stay on the board until Done.
  orders.push({
    id: "MOCKRESTPOS0006",
    state: "COMPLETED",
    created_at: at(-5),
    source: { name: "Square for Restaurants" },
    fulfillments: [{ type: "PICKUP", state: "COMPLETED", pickup_details: {} }],
    line_items: [li(1, "Philly Steak Sandwich")],
  });
  // Online, drinks and chips only: nothing for the kitchen, but the front
  // still bags it. Shows on /front only.
  orders.push({
    id: "MOCKONLINEDRNK8",
    state: "OPEN",
    created_at: at(-3),
    source: { name: "Square Online" },
    fulfillments: [{ type: "PICKUP", state: "PROPOSED", pickup_details: { pickup_at: at(15), recipient: { display_name: "Dee" } } }],
    line_items: [li(2, "Iced Tea / Fountain Drink"), li(1, "Chips", { variation_name: "BBQ" })],
  });
  // An online order the front already handed over: must NOT show.
  orders.push({
    id: "MOCKONLINEDONE7",
    state: "COMPLETED",
    created_at: at(-30),
    source: { name: "Square Online" },
    fulfillments: [{ type: "PICKUP", state: "COMPLETED", pickup_details: { pickup_at: at(-10) } }],
    line_items: [li(1, "Chef Salad")],
  });
  // A counter sale whose card payment was canceled on the terminal: OPEN,
  // nothing paid. Held on /front under "Not paid", never on the board.
  orders.push({
    id: "MOCKUNPAID00009",
    state: "OPEN",
    created_at: at(-4),
    ticket_name: "Tammy",
    source: { name: "Point of Sale" },
    net_amount_due_money: { amount: 1200, currency: "USD" },
    fulfillments: [{ type: "PICKUP", state: "PROPOSED", pickup_details: { schedule_type: "ASAP" } }],
    line_items: [li(1, "Breakfast Burrito")],
  });
  // A new counter order every 45 seconds, so the chime can be heard.
  const extra = Math.floor((Date.now() - mockStart) / 45000);
  for (let i = 0; i < Math.min(extra, 6); i++) {
    orders.push({
      id: `MOCKNEW${String(i).padStart(8, "0")}`,
      state: "COMPLETED",
      created_at: new Date(mockStart + (i + 1) * 45000).toISOString(),
      line_items: [li(1, ["Reuben", "BLT", "Patty Melt"][i % 3], { variation_name: "Rye" })],
    });
  }
  orders.push(mockSplitOrder(ago(3)));
  return orders;
}

// Test mode's stand-in for the Square catalog, by item name: enough to try
// skipping a whole category.
function mockCatalog() {
  const groups = {
    Drinks: ["Iced Tea / Fountain Drink", "Coffee", "Bottle Juice", "Bottle Water"],
    "Chips & Sweets": ["Chips", "Chocolate Chip Cookie"],
    Breakfast: ["Big Breakfast", "Breakfast Burrito", "Breakfast Sandwich"],
    Sandwiches: ["Turkey Club", "Reuben", "BLT", "Patty Melt", "Chicken Salad Croissant", "Build Your Own", "Grilled Cheese",
      "Cheeseburger", "Philly Steak Sandwich", "Clubhouse Wrap", "Reuben Sandwich", "BLT Sandwich", "Cordon Bleu Burger"],
    "Soups & Salads": ["Soup of the Day", "Chef Salad"],
    Kids: ["Kids Meal", "Kids Side"],
    Catering: ["Sandwich Tray"],
  };
  const out = [];
  for (const [name, items] of Object.entries(groups)) {
    const id = `CAT-${name}`;
    out.push({ type: "CATEGORY", id, category_data: { name } });
    for (const item of items) out.push({ type: "ITEM", id: `ITEM-${item}`, item_data: { name: item, categories: [{ id }] } });
  }
  // A Restaurants POS menu screen with a clashing name: must not show up
  // as a category to skip.
  out.push({ type: "CATEGORY", id: "MENU-Breakfast", category_data: { name: "Breakfast", category_type: "MENU_CATEGORY" } });
  // The daily items, shaped like Square's: Lunch Special priced at the till,
  // soup in two fixed sizes.
  const v = (id, name, price) => ({ id, type: "ITEM_VARIATION", item_variation_data: price == null
    ? { name, pricing_type: "VARIABLE_PRICING" } : { name, pricing_type: "FIXED_PRICING", price_money: { amount: price, currency: "USD" } } });
  const daily = [
    { type: "ITEM", id: "ITEM-Lunch Special", version: 1, item_data: { name: "Lunch Special", categories: [{ id: "CAT-Specials" }], variations: [v("VAR-LS", "Regular", null)] } },
    { type: "ITEM", id: "ITEM-Soup of the Day", version: 1, item_data: { name: "Soup of the Day", categories: [{ id: "CAT-Soups & Salads" }], variations: [v("VAR-SC", "Cup", 500), v("VAR-SB", "Bowl", 700)] } },
  ];
  out.push({ type: "CATEGORY", id: "CAT-Specials", category_data: { name: "Lunch Specials" } });
  const flavor = (id, name, ordinal) => ({ type: "MODIFIER", id, modifier_data: { name, ordinal, modifier_list_id: "LIST-Flavors" } });
  daily.push(
    { type: "ITEM", id: "ITEM-Cheesecake", version: 1, item_data: { name: "Cheesecake", categories: [{ id: "CAT-Chips & Sweets" }],
      variations: [v("VAR-CC", "Regular", 350)], modifier_list_info: [{ modifier_list_id: "LIST-Flavors", enabled: true }] } },
    { type: "ITEM", id: "ITEM-Dessert Bar", version: 1, item_data: { name: "Dessert Bar", categories: [{ id: "CAT-Chips & Sweets" }],
      variations: [v("VAR-DB", "Regular", 150)] } },
    { type: "MODIFIER_LIST", id: "LIST-Flavors", version: 1, modifier_list_data: { name: "Cheesecake Flavors", selection_type: "MULTIPLE",
      modifiers: [flavor("MOD-Plain", "Plain", 0), flavor("MOD-Caramel", "Caramel", 1), flavor("MOD-Pumpkin", "Pumpkin", 2)] } },
  );
  for (const item of daily) {
    if (!mockItems.has(item.id)) mockItems.set(item.id, item);
    const i = out.findIndex((o) => o.id === item.id);
    if (i >= 0) out.splice(i, 1);
    out.push(mockItems.get(item.id));
  }
  return out;
}

// ---------------------------------------------------------------- demo

function startDemo() {
  const now = Date.now();
  demo = { startedAt: new Date(now).toISOString(), until: new Date(now + DEMO_MINUTES * 6e4).toISOString() };
  console.log(`Demo started (${new Date().toLocaleTimeString()}): practice orders for ${DEMO_MINUTES} min.`);
}

function endDemo() {
  demo = null;
  for (const map of [bumped, offBoard, handedOff, canceled]) for (const id of Object.keys(map)) if (isDemo(id)) delete map[id];
  console.log(`Demo ended (${new Date().toLocaleTimeString()}).`);
}

// A lunch rush in miniature, from the real menu: counter tickets of
// different ages (so the colours show), online pickups, an allergy note,
// condiment packets and a drink for the front, then a new order every
// minute so the NEW tag, the edge flash and the chime can be shown.
function demoOrders(start) {
  const at = (min) => new Date(start + min * 6e4).toISOString();
  const li = (quantity, name, extra = {}) => ({ quantity: String(quantity), name, ...extra });
  const counter = (n, mins, name, items) => ({
    id: `${DEMO_PREFIX}COUNTER${n}`, state: "COMPLETED", created_at: at(mins), ticket_name: name, line_items: items,
  });
  const online = (n, mins, dueIn, name, items, note) => ({
    id: `${DEMO_PREFIX}ONLINE${n}`, state: "OPEN", created_at: at(mins), source: { name: "Square Online" },
    fulfillments: [{ type: "PICKUP", state: "RESERVED", pickup_details: { pickup_at: at(dueIn), recipient: { display_name: name }, note } }],
    line_items: items,
  });
  const orders = [
    counter(1, -16, "Linda", [li(1, "Big Breakfast", { modifiers: [{ name: "Scrambled" }, { name: "Bacon" }] }), li(1, "Coffee")]),
    counter(2, -9, "Ray", [li(1, "Clubhouse Wrap", { modifiers: [{ name: "No tomato" }] }), li(1, "Chips", { variation_name: "BBQ" })]),
    counter(3, -3, "Bob", [li(2, "Cheeseburger", { modifiers: [{ name: "No onion" }, { name: "Ketchup packet" }] })]),
    online(4, -25, 6, "Marge", [li(1, "Reuben Sandwich"), li(1, "Soup of the Day", { variation_name: "Cup" })], "Peanut allergy"),
    online(5, -5, 40, "Dee", [li(1, "Chef Salad", { variation_name: "Full", modifiers: [{ name: "Ranch" }] }), li(1, "Bottle Juice", { variation_name: "Apple" })]),
  ];
  const later = [
    ["Sue", [li(1, "Philly Steak Sandwich")]],
    ["Hank", [li(1, "Kids Meal", { modifiers: [{ name: "Chicken Strips" }, { name: "Mac & Cheese" }] }), li(1, "Grilled Cheese")]],
    ["Jo", [li(1, "BLT Sandwich", { modifiers: [{ name: "Mayo packet" }] }), li(1, "Iced Tea / Fountain Drink", { variation_name: "Iced Tea" })]],
    ["Al", [li(1, "Breakfast Sandwich", { modifiers: [{ name: "Sausage" }, { name: "Biscuit" }] })]],
    ["Pat", [li(1, "Cordon Bleu Burger", { variation_name: "Chicken", modifiers: [{ name: "Gluten-free bun" }] })]],
    ["Vic", [li(2, "Soup of the Day", { variation_name: "Bowl" })]],
  ];
  const arrived = Math.min(later.length, Math.floor((Date.now() - start) / 60000));
  for (let i = 0; i < arrived; i++) orders.push(counter(10 + i, i + 1, later[i][0], later[i][1]));
  return orders;
}

// ---------------------------------------------------------------- /check

// What Square said about an order, in one line, for /check.
function orderDetail(o) {
  const f = (o.fulfillments || [])[0];
  const parts = [`source: ${(o.source && o.source.name) || "none"}`, `order ${o.state}`];
  if (f) {
    parts.push(`fulfillment ${f.type} ${f.state}`);
    const p = f.pickup_details || {};
    if (p.schedule_type) parts.push(`schedule ${p.schedule_type}`);
    if (p.pickup_at) parts.push(`pickup_at ${p.pickup_at}`);
  } else {
    parts.push("no fulfillment");
  }
  // Paid or not: a counter sale whose payment was canceled on the terminal
  // can come back as an OPEN order with nothing paid on it.
  const tenders = o.tenders || [];
  const due = o.net_amount_due_money && o.net_amount_due_money.amount;
  parts.push(tenders.length ? `paid (${tenders.map((t) => t.type).join(", ")})` : "no payment");
  if (due) parts.push(`still due ${(due / 100).toFixed(2)}`);
  return parts.join(" · ");
}

// A plain troubleshooting page: every order Square returned on the last poll
// and whether it's on the board, and if not, why. Open
// http://localhost:8090/check in a normal Chrome window.
function checkPage() {
  const esc = (v) =>
    String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const now = Date.now();
  const rows = [
    ...all.map((t) => ({
      id: t.id,
      created: t.createdAt,
      kind: `${t.kind} · ${t.toGo ? "to go" : "for here"}${t.table ? ` · table ${t.table}` : ""}${t.unpaid ? " · NOT PAID" : ""}${t.test ? " · TEST" : ""}`,
      detail: t.detail,
      items: t.items.map((i) => `${i.qty}× ${i.name}${i.toGo ? " (TO GO)" : ""}`).join(", "),
      status: hiddenReason(t, now) || "ON THE BOARD",
    })),
    ...rejected.map(({ order: o, reason }) => ({
      id: o.id,
      created: o.created_at,
      kind: "—",
      detail: orderDetail(o),
      items: (o.line_items || [])
        .map((li) => `${li.quantity}× ${itemName(li)} [${li.item_type || "ITEM"}]`)
        .join(", "),
      status: reason,
    })),
  ].sort((a, b) => Date.parse(b.created) - Date.parse(a.created));

  const status = lastError
    ? `<p style="color:#A02F26"><b>Square error:</b> ${esc(lastError)}</p>`
    : `<p>Last successful check with Square: ${lastOkAt ? esc(new Date(lastOkAt).toLocaleTimeString()) : "not yet"}</p>`;
  return `<!DOCTYPE html><meta charset="utf-8"><title>Kitchen board check</title>
<style>body{font:16px system-ui,sans-serif;margin:24px;color:#22323A}table{border-collapse:collapse;width:100%}
td,th{border:1px solid #ccc;padding:6px 8px;text-align:left;vertical-align:top}th{background:#EEE}</style>
<p><a href="/" style="font-size:20px">&larr; Back to the board</a></p>
<h1>Kitchen board check</h1>
${MOCK ? "<p><b>TEST MODE</b> — fake orders, not Square.</p>" : ""}
<p>Front page for the counter: ${cfg.frontOnNetwork ? `<b>${esc(FRONT_URL)}</b>` : "this PC only (frontOnNetwork is false)"}</p>
${cfg.frontOnNetwork ? frontAddresses().map((a) => `<p>&nbsp;&nbsp;or by address: <b>${esc(a.url)}</b> (${esc(a.adapter)}, hardware address <code>${esc(a.mac)}</code>)</p>`).join("") : ""}
<p>Locations: ${esc(locationIds.join(", ") || "not looked up yet")} · Showing counter sales since
${esc(startOfToday().toLocaleString())} and pickups due within ${cfg.showAheadMinutes} min.</p>
${status}
<p>Kitchen skips: ${esc(skipSummary())}. Square catalog:
${catalog.error ? `<b style="color:#A02F26">${esc(catalog.error)}</b> (skipping whole categories needs it)` : catalog.loadedAt ? `${catalog.categories.length} categories, read at ${esc(new Date(catalog.loadedAt).toLocaleTimeString())}` : "not read yet"}.</p>
${cfg.notes.length ? `<h2>config.json</h2><ul>${cfg.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : "<p>config.json: no problems found.</p>"}
<p>${rows.length} order(s) came back from Square. Refresh to update.</p>
<table><tr><th>Created</th><th>Order</th><th>Board type</th><th>From Square</th><th>Items</th><th>Board</th></tr>
${rows
  .map(
    (r) => `<tr><td>${esc(new Date(r.created).toLocaleTimeString())}</td><td>...${esc(r.id.slice(-6))}${rawOrders.has(r.id) ? ` <a href="/check/raw?id=${encodeURIComponent(r.id)}">raw</a>` : ""}</td>
<td>${esc(r.kind)}</td><td>${esc(r.detail)}</td><td>${esc(r.items)}</td><td>${esc(r.status)}</td></tr>`
  )
  .join("")}
</table>`;
}

// ---------------------------------------------------------------- http

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

// Up to 20 MB: photos arrive as base64 in JSON. A dessert photo is shrunk
// to about 1600px first, Photo post's to 2000px plus the finished post, so
// one to three MB is usual.
const MAX_BODY = 20 * 1024 * 1024;
function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > MAX_BODY) { data = ""; req.destroy(); }
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(data || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}

// Power menu: close the board window, restart or shut down this PC.
//
// Only the board page itself may ask. The server listens on 127.0.0.1, but
// any web page open in any browser on this PC could still send a request to
// localhost, so the request must carry the X-Kitchen-Board header (a page
// from another site can't add a custom header without a preflight, which
// this server never answers) and, if the browser sent an Origin, it must be
// this board's own.
function fromBoard(req) {
  if (!isLocal(req)) return false;
  if (req.headers["x-kitchen-board"] !== "1") return false;
  const origin = req.headers.origin;
  return !origin || origin === `http://localhost:${cfg.port}` || origin === `http://127.0.0.1:${cfg.port}`;
}

// The same match start-kitchen.bat uses: the board's own Chrome profile, so
// no other Chrome window on the PC is touched.
const CLOSE_BOARD =
  "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*--user-data-dir=*KitchenBoard*' } | " +
  "ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }";

function power(action) {
  const what = { close: "closed the board", restart: "restarted the PC", shutdown: "shut down the PC" }[action];
  if (!what) return { ok: false, message: "Unknown action." };
  // Test mode is how the board gets tried on other computers. Shutting one
  // of those down from a test board would be a nasty surprise.
  if (MOCK) return { ok: false, message: `Test mode: this would have ${what}.` };
  if (process.platform !== "win32") return { ok: false, message: "The power menu only works on the Windows kitchen PC." };
  console.log(`Power menu: ${what} (${new Date().toLocaleTimeString()}).`);
  // Run after the reply has gone out, so the board hears back first.
  setTimeout(() => {
    const run = (cmd, args) => execFile(cmd, args, { windowsHide: true }, (err) => err && console.error(`Power menu: ${err.message}`));
    if (action === "close") run("powershell", ["-NoProfile", "-Command", CLOSE_BOARD]);
    if (action === "restart") run("shutdown", ["/r", "/t", "0"]);
    if (action === "shutdown") run("shutdown", ["/s", "/t", "0"]);
  }, 300);
  return { ok: true };
}

// "Check for updates": fetch the branch this copy is on and compare. If
// anything is new, re-run start-kitchen.bat, which pulls it and restarts the
// program and the board window — the same as double-clicking it, so there
// is one update path, not two. That run replaces this process.
function git(args) {
  return new Promise((resolve, reject) =>
    execFile("git", ["-C", path.join(DIR, ".."), ...args], { windowsHide: true, timeout: 30000 }, (err, out) =>
      err ? reject(err) : resolve(String(out).trim())
    )
  );
}

async function checkUpdates() {
  let branch, behind;
  try {
    branch = await git(["rev-parse", "--abbrev-ref", "HEAD"]);
    await git(["fetch", "origin", branch]);
    behind = Number(await git(["rev-list", "--count", `HEAD..origin/${branch}`]));
  } catch (err) {
    console.error(`Update check: ${err.message}`);
    return { ok: false, message: "Couldn't check for updates. Is the internet up, and is git installed?" };
  }
  if (!behind) return { ok: true, message: "The board is up to date." };
  const n = `${behind} update${behind === 1 ? "" : "s"}`;
  if (MOCK) return { ok: true, message: `Test mode: ${n} found. Run start-kitchen.bat to install them.` };
  if (process.platform !== "win32") return { ok: true, message: `${n} found. Run start-kitchen.bat to install them.` };
  console.log(`Update check: ${n} on ${branch}. Restarting through start-kitchen.bat.`);
  setTimeout(() => {
    // Verbatim, because start's empty "" window title must reach cmd as-is;
    // Node's own quoting would turn it into \"\". Started through `start`
    // so the batch file is not a child of this process: its first act is
    // to close this program's window, and taskkill /T would take it too.
    spawn("cmd.exe", ["/c", `start "" "${path.join(DIR, "start-kitchen.bat")}"`], {
      cwd: DIR,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      windowsVerbatimArguments: true,
    }).unref();
  }, 300);
  return { ok: true, restarting: true, message: `Installing ${n}. The board will be back in about 10 seconds.` };
}

// A request from this PC itself (the kitchen board), as opposed to another
// device on the wifi (the front page).
function isLocal(req) {
  const a = req.socket.remoteAddress || "";
  return a === "127.0.0.1" || a === "::1" || a === "::ffff:127.0.0.1";
}

// What another device on the wifi may reach: the front page and its own
// actions. With frontKey set, it must also carry ?key=<frontKey>.
const NETWORK_PATHS = new Set(["/front", "/api/front", "/api/handoff", "/api/cancel-unpaid", "/api/front-skip", "/api/front-skip-save", "/api/front-daily", "/api/front-daily-save", "/api/front-unlock", "/api/front-desserts", "/api/front-desserts-save", "/api/front-dessert-photo", "/api/handoff-undo", "/api/unhandoff", "/api/front-update", "/api/front-reset", "/api/front-plan", "/api/front-plan-save", "/api/front-report", "/api/front-photo", "/api/front-photo-save"]);
// The front page's home-screen icon and app manifest: what a phone fetches to
// put /front on its home screen. Nothing in them is private, and a phone
// fetches the icons without the page's ?key=, so they never need it.
const APP_FILES = {
  "/front.webmanifest": null, // built per request, see below
  "/front-icon-180.png": "icon-180.png",
  "/front-icon-192.png": "icon-192.png",
  "/front-icon-512.png": "icon-512.png",
  "/front-wordmark.svg": "wordmark.svg", // drawn into Photo post's pictures
};

// Wrong update PINs from /front: after 5 in 10 minutes, refuse for 10.
let pinFails = [];
let pinLockedUntil = 0;

// null if the PIN is right, else what to tell the person.
function pinRefusal(pin) {
  const now = Date.now();
  if (!cfg.updatePin) return "Not set up: add \"updatePin\" to config.json on the kitchen PC.";
  if (now < pinLockedUntil) return "Too many wrong PINs. Try again in 10 minutes.";
  if (String(pin || "") !== String(cfg.updatePin)) {
    pinFails = pinFails.filter((t) => now - t < 10 * 6e4).concat(now);
    if (pinFails.length >= 5) { pinLockedUntil = now + 10 * 6e4; pinFails = []; }
    console.log(`Front page: wrong PIN (${new Date().toLocaleTimeString()}).`);
    return "Wrong PIN.";
  }
  pinFails = [];
  return null;
}

// Reset for the day: the Undo lists empty and today's stats start from
// now. With clearBoard, every order on the board and the front page is
// cleared too, for the morning after testing. Cleared at the same instant
// as the floor, so none of them can be brought back with Undo either.
function resetDay(clearBoard, from) {
  const now = new Date().toISOString();
  undoFloor = now;
  statsFloor = now;
  if (clearBoard) {
    for (const t of all) {
      if (!bumped[t.id]) bumped[t.id] = now;
      if (!handedOff[t.id]) handedOff[t.id] = now;
    }
  }
  saveState();
  console.log(`Reset for the day from ${from} (${new Date().toLocaleTimeString()})${clearBoard ? ", board cleared" : ""}.`);
}
function networkAllowed(req, url) {
  if (req.method === "GET" && url.pathname in APP_FILES) return true;
  if (!NETWORK_PATHS.has(url.pathname)) return false;
  return !cfg.frontKey || url.searchParams.get("key") === cfg.frontKey;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");

  if (!isLocal(req) && !networkAllowed(req, url)) {
    // The kitchen board's address opened from a laptop: send it to the
    // front page rather than a bare refusal.
    if (req.method === "GET" && url.pathname === "/" && !cfg.frontKey) {
      res.writeHead(302, { Location: "/front" });
      return res.end();
    }
    return send(res, 403, "This page only opens on the kitchen PC. The front page is /front.", "text/plain; charset=utf-8");
  }

  if (req.method === "GET" && url.pathname === "/front") {
    return send(res, 200, fs.readFileSync(FRONT_FILE, "utf8"), "text/html; charset=utf-8");
  }
  // Added to a phone's home screen, /front opens like an app: its own icon,
  // full screen, no address bar. start_url carries the key when the page
  // asking for the manifest had the right one, so the icon keeps working
  // with frontKey set.
  if (req.method === "GET" && url.pathname === "/front.webmanifest") {
    const key = cfg.frontKey && url.searchParams.get("key") === cfg.frontKey ? `?key=${encodeURIComponent(cfg.frontKey)}` : "";
    return send(res, 200, {
      name: "The Café · Front",
      short_name: "Café Front",
      start_url: `/front${key}`,
      scope: "/",
      display: "standalone",
      background_color: "#FAF7F2",
      theme_color: "#1F4552",
      icons: [
        { src: "/front-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
        { src: "/front-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
      ],
    }, "application/manifest+json; charset=utf-8");
  }
  if (req.method === "GET" && APP_FILES[url.pathname]) {
    res.writeHead(200, { "Content-Type": url.pathname.endsWith(".svg") ? "image/svg+xml" : "image/png", "Cache-Control": "max-age=86400" });
    return res.end(fs.readFileSync(path.join(DIR, APP_FILES[url.pathname])));
  }
  if (req.method === "GET" && url.pathname === "/api/front") {
    return send(res, 200, frontSnapshot());
  }
  if (req.method === "POST" && url.pathname === "/api/handoff") {
    const { id } = await readBody(req);
    if (typeof id !== "string" || !id) return send(res, 400, { error: "id required" });
    handedOff[id] = new Date().toISOString();
    saveState();
    return send(res, 200, frontSnapshot());
  }
  // An unpaid order that was never going to be paid (card declined, sale
  // abandoned): off the kitchen board and the front page at once. It goes
  // on the front's Undo list like a hand-off, so a wrong tap comes back.
  if (req.method === "POST" && url.pathname === "/api/cancel-unpaid") {
    const { id } = await readBody(req);
    if (typeof id !== "string" || !id) return send(res, 400, { error: "id required" });
    const at = new Date().toISOString();
    canceled[id] = at;
    handedOff[id] = at;
    saveState();
    console.log(`Front page: unpaid order ...${id.slice(-4)} canceled (${new Date().toLocaleTimeString()}).`);
    return send(res, 200, frontSnapshot());
  }
  // Desserts, behind the PIN: read (photos and options), save options, and
  // replace a photo.
  if (req.method === "POST" && /^\/api\/front-dessert(s|s-save|-photo)$/.test(url.pathname)) {
    const body = await readBody(req);
    const refused = pinRefusal(body.pin);
    if (refused) return send(res, 200, { ok: false, message: refused });
    try {
      if (url.pathname === "/api/front-desserts") return send(res, 200, { ok: true, items: await dessertItems() });
      if (url.pathname === "/api/front-dessert-photo") {
        await loadCatalog();
        await saveDessertPhoto(body.itemId, body.photo);
        return send(res, 200, { ok: true, message: "Photo saved. Online ordering shows it within a few minutes." });
      }
      await loadCatalog();
      const saved = await saveDesserts(body.lists);
      return send(res, 200, { ok: true, message: saved.length
        ? `Saved in Square: ${saved.join(", ")}. Online ordering updates within a minute or so.`
        : "Nothing changed." });
    } catch (err) {
      console.error(`Desserts: ${err.message}`);
      if (err.plain) return send(res, 200, { ok: false, message: err.message });
      const conflict = /409|VERSION_MISMATCH|version/i.test(err.message);
      return send(res, 200, { ok: false, message: conflict
        ? "Someone changed that in Square a moment ago. Open Desserts again."
        : `Square didn't take it: ${err.message}` });
    }
  }
  // Manage's first screen: is the PIN right? (Every action checks it again;
  // this only lets the front say "Wrong PIN" before showing the menu.)
  if (req.method === "POST" && url.pathname === "/api/front-unlock") {
    const refused = pinRefusal((await readBody(req)).pin);
    return send(res, 200, refused ? { ok: false, message: refused } : { ok: true });
  }
  // What the kitchen skips, behind the PIN: read it (with a fresh read of
  // the Square catalog to choose from) and save it. A save applies at once,
  // to the tickets already up too.
  if (req.method === "POST" && (url.pathname === "/api/front-skip" || url.pathname === "/api/front-skip-save")) {
    const body = await readBody(req);
    const refused = pinRefusal(body.pin);
    if (refused) return send(res, 200, { ok: false, message: refused });
    if (url.pathname === "/api/front-skip-save") {
      setSkip(body.skip || {});
      skipEdited = true;
      saveState();
      console.log(`Skip list changed from the front page (${new Date().toLocaleTimeString()}): ${skipSummary()}.`);
      await poll();
      return send(res, 200, { ok: true, message: "Saved. The kitchen board is updated." });
    }
    await loadCatalog();
    return send(res, 200, { ok: true, skip, categories: catalog.categories, catalogError: catalog.error });
  }
  // Today's specials, behind the PIN: read the items fresh from Square, and
  // save the prices (see saveDaily). The save is the board's only write to
  // Square.
  if (req.method === "POST" && (url.pathname === "/api/front-daily" || url.pathname === "/api/front-daily-save")) {
    const body = await readBody(req);
    const refused = pinRefusal(body.pin);
    if (refused) return send(res, 200, { ok: false, message: refused });
    try {
      if (url.pathname === "/api/front-daily") return send(res, 200, { ok: true, items: await dailyItems() });
      const saved = await saveDaily(body.items);
      return send(res, 200, { ok: true, message: saved.length
        ? `Saved in Square: ${saved.join(", ")}. The POS picks it up within a minute or so.`
        : "Nothing changed." });
    } catch (err) {
      console.error(`Today's specials: ${err.message}`);
      const conflict = /409|VERSION_MISMATCH|version/i.test(err.message);
      if (err.plain) return send(res, 200, { ok: false, message: err.message });
      return send(res, 200, { ok: false, message: conflict
        ? "Someone changed that item in Square a moment ago. Open Today's specials again and re-enter it."
        : `Square didn't take it: ${err.message}` });
    }
  }
  // Plan the week, behind the PIN: read the plan (with Square's sizes and
  // prices for the boxes) and save the days the front changed. Saving today
  // puts it into Square straight away; other days go in on their morning.
  if (req.method === "POST" && (url.pathname === "/api/front-plan" || url.pathname === "/api/front-plan-save")) {
    const body = await readBody(req);
    const refused = pinRefusal(body.pin);
    if (refused) return send(res, 200, { ok: false, message: refused });
    try {
      if (url.pathname === "/api/front-plan") {
        await pullSite(); // so the website's latest is what's shown
        return send(res, 200, { ok: true, ...(await planView()) });
      }
      const dates = savePlanDays(body.days);
      if (!dates.length) return send(res, 200, { ok: true, message: "Nothing changed." });
      let message = `Saved: ${dates.map(dayWords).join(", ")}.`;
      if (dates.includes(localDate())) {
        const r = await applyToday();
        message += r && r.error ? ` Today's didn't go into Square yet (${r.error}); the board tries again in ${RETRY_MINUTES} minutes.`
          : " Today's is in Square now.";
      }
      if (dates.some((d) => d > localDate())) message += " The rest go into Square by themselves on the morning of each day.";
      return send(res, 200, { ok: true, message });
    } catch (err) {
      console.error(`Plan the week: ${err.message}`);
      return send(res, 200, { ok: false, message: err.plain ? err.message : `Didn't work: ${err.message}` });
    }
  }
  // Photo post, behind the PIN: what the screen starts from, and keeping
  // the photo and the finished post on this PC.
  if (req.method === "POST" && (url.pathname === "/api/front-photo" || url.pathname === "/api/front-photo-save")) {
    const body = await readBody(req);
    const refused = pinRefusal(body.pin);
    if (refused) return send(res, 200, { ok: false, message: refused });
    try {
      if (url.pathname === "/api/front-photo") return send(res, 200, { ok: true, ...(await photoSetup()) });
      const name = savePhotoPost(body);
      return send(res, 200, { ok: true, message: `Kept on the kitchen PC for the website (photos\\${name}).` });
    } catch (err) {
      console.error(`Photo post: ${err.message}`);
      return send(res, 200, { ok: false, message: err.plain ? err.message : `Couldn't keep it: ${err.message}` });
    }
  }
  // Reports, behind the PIN: the saved daily history for a date range.
  // Today is saved first, so a report that ends today is up to the minute.
  if (req.method === "POST" && url.pathname === "/api/front-report") {
    const body = await readBody(req);
    const refused = pinRefusal(body.pin);
    if (refused) return send(res, 200, { ok: false, message: refused });
    const day = /^\d{4}-\d{2}-\d{2}$/;
    if (!day.test(body.from || "") || !day.test(body.to || "") || body.from > body.to) {
      return send(res, 200, { ok: false, message: "Pick a start date on or before the end date." });
    }
    historyWrittenAt = 0;
    recordHistory();
    return send(res, 200, { ok: true, ...historyReport(body.from, body.to, !!body.orders) });
  }
  if (req.method === "POST" && url.pathname === "/api/unhandoff") {
    const { id } = await readBody(req);
    if (typeof id !== "string" || !id) return send(res, 400, { error: "id required" });
    delete handedOff[id];
    delete canceled[id];
    // Back on the front page to stay: it won't clear itself again.
    keepOnFront[id] = new Date().toISOString();
    autoOff.delete(id);
    saveState();
    return send(res, 200, frontSnapshot());
  }
  if (req.method === "POST" && url.pathname === "/api/reset-day") {
    if (!fromBoard(req)) return send(res, 403, { ok: false, message: "Not from the board." });
    const { clearBoard } = await readBody(req);
    resetDay(!!clearBoard, "the board");
    return send(res, 200, snapshot());
  }
  if (req.method === "POST" && url.pathname === "/api/handoff-undo") {
    const last = lastHandedOff();
    if (last) {
      delete handedOff[last.id];
      delete canceled[last.id];
      keepOnFront[last.id] = new Date().toISOString();
      autoOff.delete(last.id);
      saveState();
    }
    return send(res, 200, frontSnapshot());
  }

  // Check for updates and Reset for the day from the front page, both
  // behind the PIN in config.json. Same actions as the board's own.
  if (req.method === "POST" && (url.pathname === "/api/front-update" || url.pathname === "/api/front-reset")) {
    const body = await readBody(req);
    const refused = pinRefusal(body.pin);
    if (refused) return send(res, 200, { ok: false, message: refused });
    if (url.pathname === "/api/front-update") {
      console.log(`Update from the front page (${new Date().toLocaleTimeString()}).`);
      return send(res, 200, await checkUpdates());
    }
    resetDay(!!body.clearBoard, "the front page");
    return send(res, 200, { ok: true, message: body.clearBoard
      ? "Reset: the Undo lists and today's stats start fresh, and every order on the board was cleared."
      : "Reset: the Undo lists and today's stats start fresh." });
  }
  if (req.method === "POST" && url.pathname === "/api/demo") {
    if (!fromBoard(req)) return send(res, 403, { ok: false, message: "Not from the board." });
    const { on } = await readBody(req);
    if (on) startDemo();
    else if (demo) endDemo();
    await poll();
    return send(res, 200, snapshot());
  }
  if (req.method === "POST" && url.pathname === "/api/update") {
    if (!fromBoard(req)) return send(res, 403, { ok: false, message: "Not from the board." });
    return send(res, 200, await checkUpdates());
  }
  if (req.method === "POST" && url.pathname === "/api/power") {
    if (!fromBoard(req)) return send(res, 403, { ok: false, message: "Not from the board." });
    const { action } = await readBody(req);
    return send(res, 200, power(action));
  }

  if (req.method === "GET" && url.pathname === "/") {
    return send(res, 200, fs.readFileSync(BOARD_FILE, "utf8"), "text/html; charset=utf-8");
  }
  // One order exactly as Square sent it, for checking how the POS recorded
  // something (a split to-go order, say). This PC only, like /check.
  if (req.method === "GET" && url.pathname === "/check/raw") {
    const o = rawOrders.get(url.searchParams.get("id") || "");
    return o ? send(res, 200, JSON.stringify(o, null, 2)) : send(res, 404, { error: "not in the last check; refresh /check" });
  }
  if (req.method === "GET" && url.pathname === "/check") {
    return send(res, 200, checkPage(), "text/html; charset=utf-8");
  }
  if (req.method === "GET" && url.pathname === "/api/tickets") {
    return send(res, 200, snapshot());
  }
  if (req.method === "POST" && url.pathname === "/api/refresh") {
    await poll();
    return send(res, 200, snapshot());
  }
  if (req.method === "POST" && url.pathname === "/api/undo") {
    const last = lastCleared();
    if (last) {
      unbump(last.id);
      saveState();
    }
    return send(res, 200, snapshot());
  }
  if (req.method === "POST" && (url.pathname === "/api/bump" || url.pathname === "/api/unbump")) {
    const { id } = await readBody(req);
    if (typeof id !== "string" || !id) return send(res, 400, { error: "id required" });
    if (url.pathname === "/api/bump") bumped[id] = new Date().toISOString();
    else unbump(id);
    saveState();
    return send(res, 200, snapshot());
  }
  send(res, 404, { error: "not found" });
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `Port ${cfg.port} is already in use: another copy of the board program is running.
` +
        "Close every \"Kitchen board program\" window (or restart the PC), then run start-kitchen.bat."
    );
    process.exit(1);
  }
  throw err;
});

// The kitchen board is for this PC's own screen. With frontOnNetwork the
// program also listens on the wifi, for /front; isLocal() and
// networkAllowed() above keep everything else to this PC.
const HOST = cfg.frontOnNetwork ? "0.0.0.0" : "127.0.0.1";
const FRONT_URL = `http://${os.hostname().toLowerCase()}:${cfg.port}/front${cfg.frontKey ? "?key=" + encodeURIComponent(cfg.frontKey) : ""}`;
// The same page by this PC's address on the wifi, with the adapter it's on
// and that adapter's hardware (MAC) address: what a router needs to always
// give this PC the same address (a DHCP reservation), so an iPad bookmark
// to it keeps working. See "A fixed address for the front page" in README.md.
function frontAddresses() {
  const out = [];
  for (const [adapter, list] of Object.entries(os.networkInterfaces())) {
    // Virtual adapters (Hyper-V, VirtualBox, VMware) aren't the wifi.
    if (/vEthernet|VirtualBox|VMware|Loopback/i.test(adapter)) continue;
    for (const a of list || []) {
      if (a.family !== "IPv4" || a.internal || a.address.startsWith("169.254.")) continue;
      out.push({ adapter, mac: a.mac, url: FRONT_URL.replace(`//${os.hostname().toLowerCase()}:`, `//${a.address}:`) });
    }
  }
  return out;
}
server.listen(cfg.port, HOST, () => {
  console.log(`Kitchen board on http://localhost:${cfg.port}${MOCK ? "  (MOCK ORDERS)" : ""}`);
  console.log(cfg.frontOnNetwork ? `Front page for the counter: ${FRONT_URL}` : "Front page: this PC only (frontOnNetwork is false).");
  if (cfg.frontOnNetwork) {
    for (const a of frontAddresses()) console.log(`  or by address: ${a.url}   (${a.adapter}, hardware address ${a.mac})`);
  }
  console.log(`Checking Square every ${cfg.pollSeconds} s.`);
  if (!cfg.sound || MUTE) console.log("Sound is OFF.");
  for (const note of cfg.notes) console.log(`config.json: ${note}`);
  // The catalog first, so a skipped category is never on the first board.
  // Then the website's week, then today's specials into Square.
  loadCatalog().finally(() => {
    poll();
    pullSite().finally(applyToday);
  });
  setInterval(loadCatalog, CATALOG_MINUTES * 6e4);
  setInterval(pullSite, SITE_MINUTES * 6e4);
  setInterval(applyToday, 6e4);
});
