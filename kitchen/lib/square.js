// Square's API: every call the board makes goes through square(), with the
// token from config.json. Here too: the orders the board shows (fetchOrders).
const { cfg } = require("./config");
const { startOfToday } = require("./util");

const API =
  cfg.environment === "sandbox"
    ? "https://connect.squareupsandbox.com/v2"
    : "https://connect.squareup.com/v2";
const SQUARE_VERSION = "2025-01-23";
// The catalog (Specials, sides, desserts, photos) on a newer version: from
// 2025-05-21 an option picked already is said differently, and Square warns
// that older versions get modifier selection wrong (client 2026-10-19: Side 1
// came up with nothing picked). Orders stay where they were tested.
const CATALOG_VERSION = "2025-05-21";

// How far this PC's clock is from Square's, from the Date on Square's
// answers (to the second): positive when the PC is fast. Found 2026-11-13:
// the kitchen PC ran about a minute fast (its GitHub backups are dated a
// minute after GitHub got them), so a counter order rung up a second ago
// came up already at 1:00+ "waiting". The board's timers no longer depend on
// it (lib/addons.js), but due times ("in 8 min") still do, so it's written
// to the start log (read from the backup) whenever it's 20 s or more.
const clock = { offsetMs: 0, checkedAt: null, toldAt: 0 };
const CLOCK_WARN_MS = 20000;
function readClock(res, sentAt) {
  const said = Date.parse(res.headers.get("date") || "");
  if (!said) return;
  // Square's second, against the middle of the call; its Date is cut to the
  // second, so +0.5 s on average.
  const now = Date.now();
  clock.offsetMs = Math.round((sentAt + now) / 2 - (said + 500));
  clock.checkedAt = new Date(now).toISOString();
  if (Math.abs(clock.offsetMs) >= CLOCK_WARN_MS && now - clock.toldAt > 6 * 36e5) {
    clock.toldAt = now;
    const s = Math.round(Math.abs(clock.offsetMs) / 1000);
    const text = `this PC's clock is ${s} s ${clock.offsetMs > 0 ? "fast" : "slow"} (Windows: Settings > Time & language > Date & time > Sync now)`;
    console.log(`${new Date().toLocaleTimeString()}  ${text}`);
    try { require("./startlog").note(text); } catch {}
  }
}

async function square(method, endpoint, body) {
  const sentAt = Date.now();
  const res = await fetch(API + endpoint, {
    method,
    headers: {
      Authorization: `Bearer ${cfg.accessToken}`,
      "Square-Version": endpoint.startsWith("/catalog") ? CATALOG_VERSION : SQUARE_VERSION,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  if (res.headers && res.headers.get) readClock(res, sentAt);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = (json.errors || []).map((e) => e.detail || e.code).join("; ");
    throw new Error(`Square ${res.status}: ${detail || res.statusText}`);
  }
  return json;
}

let locationIds = cfg.locationIds;
const locations = () => locationIds; // for /check

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

// Today's counter sales and the open (pickup) orders of the last
// openLookbackDays: everything that could be on either screen.
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

module.exports = { clock, API, SQUARE_VERSION, square, locations, resolveLocations, fetchOrders };
