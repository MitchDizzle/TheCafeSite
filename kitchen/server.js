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
  skipItems: [], // item names the kitchen never makes, e.g. "Fountain Drink"
  frontOnNetwork: true, // serve /front to other devices on the wifi; false = this PC only
  frontKey: "", // if set, other devices must open /front?key=<this>
};

// Settings that are the cafe's own and have no meaningful default: never
// flagged as "differs from the default".
const OWN = new Set(["accessToken", "locationIds", "skipItems", "frontKey"]);

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
  cfg.skip = new Set(cfg.skipItems.map((s) => s.trim().toLowerCase()));
  return cfg;
}

const cfg = loadConfig();

// ---------------------------------------------------------------- bump state

let bumped = {}; // orderId -> ISO time a cook pressed Done (kitchen board)
let handedOff = {}; // orderId -> ISO time the front pressed Handed off (/front)

function loadState() {
  try {
    const state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    bumped = state.bumped || {};
    handedOff = state.handedOff || {};
  } catch {
    bumped = {};
    handedOff = {};
  }
}

function saveState() {
  // Three days is plenty; nothing older can reappear on either screen anyway.
  const cutoff = Date.now() - 3 * 864e5;
  for (const map of [bumped, handedOff]) {
    for (const [id, at] of Object.entries(map)) {
      if (Date.parse(at) < cutoff) delete map[id];
    }
  }
  fs.writeFileSync(STATE_FILE, JSON.stringify({ bumped, handedOff }, null, 2));
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
  const toItem = (li) => ({
    qty: Number(li.quantity) || 1,
    name: itemName(li),
    variation:
      li.variation_name && li.variation_name !== "Regular" ? li.variation_name : null,
    mods: (li.modifiers || []).map((m) =>
      Number(m.quantity) > 1 ? `${m.name} ×${Number(m.quantity)}` : m.name
    ),
    note: li.name && li.note ? li.note : null,
  });
  const food = lines.filter((li) => !NOT_FOOD.has(li.item_type));
  const isSkip = (li) => cfg.skip.has(itemName(li).trim().toLowerCase());
  // items: what the kitchen makes. front: what the counter adds to the bag.
  const items = food.filter((li) => !isSkip(li)).map(toItem);
  const front = food.filter(isSkip).map(toItem);
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

  return { ticket: {
    id: order.id,
    kind: online ? f.type : "COUNTER", // PICKUP, DELIVERY, SHIPMENT, or COUNTER
    name: (recipient && recipient.display_name) || order.ticket_name || null,
    shortId: order.id.slice(-4).toUpperCase(),
    source: (order.source && order.source.name) || null,
    createdAt: order.created_at,
    dueAt,
    items,
    front,
    // Marked ready in Order Manager: the customer has been texted.
    squareReady: !!(online && f.state === "PREPARED"),
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
  if (t.squareReady) return "front already marked it prepared";
  if (!t.items.length) return "every item is on the skip list (front only)";
  return outOfWindow(t, now);
}

// null if the ticket belongs on /front, else why not.
function frontHiddenReason(t, now) {
  if (handedOff[t.id]) return "handed off at the front";
  return outOfWindow(t, now);
}

// Ready for the front: the kitchen pressed Done, the front already marked it
// ready in Square, or there was nothing for the kitchen to make.
function readyAt(t) {
  if (bumped[t.id]) return bumped[t.id];
  if (t.squareReady || !t.items.length) return t.createdAt;
  return null;
}

// The most recently bumped ticket that could come back: what Undo restores.
// Kept on the server, so Undo still works after the page or PC restarts.
function lastCleared() {
  const byId = new Map(all.map((t) => [t.id, t]));
  const ids = Object.keys(bumped)
    .filter((id) => byId.has(id))
    .sort((a, b) => Date.parse(bumped[b]) - Date.parse(bumped[a]));
  if (!ids.length) return null;
  const t = byId.get(ids[0]);
  return { id: t.id, label: t.name || `#${t.shortId}` };
}

// The most recent hand-off that could come back: what Undo on /front restores.
function lastHandedOff() {
  const byId = new Map(all.map((t) => [t.id, t]));
  const ids = Object.keys(handedOff)
    .filter((id) => byId.has(id))
    .sort((a, b) => Date.parse(handedOff[b]) - Date.parse(handedOff[a]));
  if (!ids.length) return null;
  const t = byId.get(ids[0]);
  return { id: t.id, label: t.name || `#${t.shortId}` };
}

// ---------------------------------------------------------------- polling

let pollTimer = null;
let nextPollAt = null; // when the next scheduled Square check runs, for the board's countdown ring
let polling = null; // the in-flight poll, so "check now" never runs two at once
let all = []; // every ticket from the last good poll, bumped or not
let rejected = []; // orders Square returned that never became tickets, for /check
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
    const orders = MOCK ? mockOrders() : await fetchOrders();
    const seen = new Set();
    all = [];
    rejected = [];
    for (const o of orders) {
      if (seen.has(o.id)) continue;
      seen.add(o.id);
      const { ticket, reason } = toTicket(o);
      if (ticket) all.push(ticket);
      else rejected.push({ order: o, reason });
      if (!logged.has(o.id)) {
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
    pollSeconds: cfg.pollSeconds, nextPollAt, checking: !!polling };
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
    pollSeconds: cfg.pollSeconds };
}

// ---------------------------------------------------------------- mock data

const mockStart = Date.now();
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
      line_items: [li(1, "Cheeseburger", { modifiers: [{ name: "Add bacon" }, { name: "No onion" }] })],
    },
    {
      id: "MOCKCOUNTER0004",
      state: "COMPLETED",
      created_at: at(-2),
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
      kind: t.kind,
      detail: t.detail,
      items: t.items.map((i) => `${i.qty}× ${i.name}`).join(", "),
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
<p>Locations: ${esc(locationIds.join(", ") || "not looked up yet")} · Showing counter sales since
${esc(startOfToday().toLocaleString())} and pickups due within ${cfg.showAheadMinutes} min.</p>
${status}
${cfg.notes.length ? `<h2>config.json</h2><ul>${cfg.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : "<p>config.json: no problems found.</p>"}
<p>${rows.length} order(s) came back from Square. Refresh to update.</p>
<table><tr><th>Created</th><th>Order</th><th>Board type</th><th>From Square</th><th>Items</th><th>Board</th></tr>
${rows
  .map(
    (r) => `<tr><td>${esc(new Date(r.created).toLocaleTimeString())}</td><td>...${esc(r.id.slice(-6))}</td>
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

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
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
const NETWORK_PATHS = new Set(["/front", "/api/front", "/api/handoff", "/api/handoff-undo"]);
function networkAllowed(req, url) {
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
  if (req.method === "POST" && url.pathname === "/api/handoff-undo") {
    const last = lastHandedOff();
    if (last) {
      delete handedOff[last.id];
      saveState();
    }
    return send(res, 200, frontSnapshot());
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
      delete bumped[last.id];
      saveState();
    }
    return send(res, 200, snapshot());
  }
  if (req.method === "POST" && (url.pathname === "/api/bump" || url.pathname === "/api/unbump")) {
    const { id } = await readBody(req);
    if (typeof id !== "string" || !id) return send(res, 400, { error: "id required" });
    if (url.pathname === "/api/bump") bumped[id] = new Date().toISOString();
    else delete bumped[id];
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
server.listen(cfg.port, HOST, () => {
  console.log(`Kitchen board on http://localhost:${cfg.port}${MOCK ? "  (MOCK ORDERS)" : ""}`);
  console.log(cfg.frontOnNetwork ? `Front page for the counter: ${FRONT_URL}` : "Front page: this PC only (frontOnNetwork is false).");
  console.log(`Checking Square every ${cfg.pollSeconds} s.`);
  if (!cfg.sound || MUTE) console.log("Sound is OFF.");
  for (const note of cfg.notes) console.log(`config.json: ${note}`);
  poll();
});
