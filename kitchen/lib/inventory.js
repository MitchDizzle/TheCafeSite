// Square's stock counts, for Manage -> Desserts: how many of each kind are
// left. Square counts a variation down as it sells (at the till and online)
// once it is tracked, and online ordering shows it sold out at 0. The cafe
// is one location, so the counts are the first location's.
const { MOCK } = require("./config");
const { square, resolveLocations } = require("./square");
const { mockStock } = require("./mock");

// variation id -> count, for the ids given. One missing from Square's answer
// has never been counted: 0.
async function readCounts(ids) {
  const out = new Map(ids.map((id) => [id, 0]));
  if (!ids.length) return out;
  if (MOCK) {
    for (const id of ids) out.set(id, mockStock.get(id) || 0);
    return out;
  }
  const [location] = await resolveLocations();
  let cursor;
  do {
    const json = await square("POST", "/inventory/counts/batch-retrieve", { catalog_object_ids: ids, location_ids: [location], states: ["IN_STOCK"], cursor });
    for (const c of json.counts || []) out.set(c.catalog_object_id, Math.max(0, Math.round(Number(c.quantity) || 0)));
    cursor = json.cursor;
  } while (cursor);
  return out;
}

// counts: [{ id, count }]: what was counted, as of now.
async function setCounts(counts) {
  if (!counts.length) return;
  if (MOCK) {
    for (const c of counts) mockStock.set(c.id, c.count);
    return;
  }
  const [location] = await resolveLocations();
  const now = new Date().toISOString();
  await square("POST", "/inventory/changes/batch-create", {
    idempotency_key: `kitchen-stock-${Date.now()}`,
    ignore_unchanged_counts: true,
    changes: counts.map((c) => ({
      type: "PHYSICAL_COUNT",
      physical_count: { catalog_object_id: c.id, state: "IN_STOCK", location_id: location, quantity: String(c.count), occurred_at: now },
    })),
  });
}

module.exports = { readCounts, setCounts };
