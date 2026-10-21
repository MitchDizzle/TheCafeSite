// Square's API: every call the board makes goes through square(), with the
// token from config.json. Here too: the orders the board shows (fetchOrders).
const { cfg } = require("./config");
const { startOfToday } = require("./util");

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

module.exports = { API, SQUARE_VERSION, square, locations, resolveLocations, fetchOrders };
