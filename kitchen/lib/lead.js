// How long before it's due an order for later (a pickup, a time in the
// name) goes on the kitchen board, by how much the kitchen has to make
// (client 2026-10-27: five wraps can't be started 15 minutes out like one
// sandwich). Learned from the daily history: the median kitchen time of
// orders the same size over the last LOOKBACK_DAYS, plus leadBufferMinutes.
// Never less than showAheadMinutes, never more than waitRowMinutes (the
// WAIT UNTIL row has it from then). A size with fewer than MIN_ORDERS timed
// orders goes by FALLBACK_PER_ITEM minutes for each item past the fourth.
// Stats (lib/stats.js) teaches it at start and each new day; tickets ask it.
const { cfg } = require("./config");

const LOOKBACK_DAYS = 56;
const MIN_ORDERS = 3;
const FALLBACK_PER_ITEM = 2;
// Order sizes, by the number of things the kitchen makes (5 × a wrap is 5).
const SIZES = [
  { max: 2, label: "1–2 items" },
  { max: 5, label: "3–5 items" },
  { max: 9, label: "6–9 items" },
  { max: Infinity, label: "10+ items" },
];
const sizeOf = (count) => SIZES.findIndex((s) => count <= s.max);

// An order record's size: kitchenItems (kept since 2026-10-27), or for an
// older one every food item it had, drinks and chips too.
const itemsOf = (r) => (r.kitchenItems != null ? r.kitchenItems : (r.items || []).reduce((n, it) => n + (it.qty || 1), 0));

function median(list) {
  if (!list.length) return null;
  const s = [...list].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// Per size: { label, orders, median } from the history's days.
let learned = SIZES.map((s) => ({ label: s.label, orders: 0, median: null }));
let learnedOn = null;

function learn(days, today) {
  const from = new Date(`${today}T12:00:00`);
  from.setDate(from.getDate() - LOOKBACK_DAYS);
  const first = from.toISOString().slice(0, 10);
  const times = SIZES.map(() => []);
  for (const [date, day] of Object.entries(days || {})) {
    if (date < first || date >= today) continue;
    for (const r of day.orders || []) {
      if (r.kitchenMinutes == null) continue;
      const n = itemsOf(r);
      if (n > 0) times[sizeOf(n)].push(r.kitchenMinutes);
    }
  }
  learned = SIZES.map((s, i) => ({ label: s.label, orders: times[i].length, median: times[i].length >= MIN_ORDERS ? median(times[i]) : null }));
  learnedOn = today;
}

// Minutes ahead of its due time for an order of `count` kitchen items.
function leadMinutes(count) {
  const size = learned[sizeOf(Math.max(1, count || 1))];
  const want = size && size.median != null
    ? Math.ceil(size.median) + cfg.leadBufferMinutes
    : cfg.showAheadMinutes + Math.max(0, (count || 0) - 4) * FALLBACK_PER_ITEM;
  return Math.min(Math.max(cfg.showAheadMinutes, want), Math.max(cfg.showAheadMinutes, cfg.waitRowMinutes));
}

// For Reports: each size, its usual kitchen time, and how far ahead such an
// order goes on the board now. `count` is a size's smallest order.
function leadTable() {
  return learned.map((s, i) => ({ ...s, ahead: leadMinutes(i ? SIZES[i - 1].max + 1 : 1) }));
}

module.exports = { SIZES, sizeOf, itemsOf, median, learn, leadMinutes, leadTable, learnedOn: () => learnedOn };
