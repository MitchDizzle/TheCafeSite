// A bigger order for later goes on the kitchen board sooner: by the usual
// kitchen time of orders its size (lib/lead.js, client 2026-10-27).
// Run: node --test kitchen/tests/
const { test } = require("node:test");
const assert = require("node:assert/strict");
const board = require("./board.js");
const lead = require("../lib/lead");
const { cfg } = require("../lib/config");

const { toTicket, hiddenReason, minutesFromNow } = board;

// Days of history: `n` orders a day of `items` kitchen items taking `mins`.
function days(list) {
  const out = {};
  list.forEach(([date, items, mins, n]) => {
    out[date] = out[date] || { orders: [] };
    for (let i = 0; i < n; i++) out[date].orders.push({ kitchenItems: items, kitchenMinutes: mins, items: [] });
  });
  return out;
}

test("each size goes on as early as its usual kitchen time, never under showAheadMinutes", () => {
  lead.learn(days([["2026-10-20", 1, 6, 5], ["2026-10-21", 4, 12, 4], ["2026-10-22", 7, 22, 3], ["2026-10-23", 12, 70, 3]]), "2026-10-27");
  assert.equal(lead.leadMinutes(1), cfg.showAheadMinutes, "a small order: 6 + 5 is under 15");
  assert.equal(lead.leadMinutes(4), Math.max(cfg.showAheadMinutes, 12 + cfg.leadBufferMinutes));
  assert.equal(lead.leadMinutes(7), 22 + cfg.leadBufferMinutes);
  assert.equal(lead.leadMinutes(12), cfg.waitRowMinutes, "never past the WAIT UNTIL row");
});

test("a size without enough history goes by its item count", () => {
  lead.learn(days([["2026-10-20", 7, 30, 2]]), "2026-10-27");
  assert.equal(lead.leadMinutes(2), cfg.showAheadMinutes);
  assert.equal(lead.leadMinutes(8), cfg.showAheadMinutes + 4 * 2);
  // Only the last eight weeks, and never today.
  lead.learn(days([["2026-08-01", 7, 30, 9], ["2026-10-27", 7, 30, 9]]), "2026-10-27");
  assert.equal(lead.leadMinutes(7), cfg.showAheadMinutes + 3 * 2);
});

test("a phone order of five wraps goes on the board sooner than one sandwich", () => {
  lead.learn(days([["2026-10-22", 5, 25, 4], ["2026-10-22", 1, 6, 4]]), "2026-10-27");
  const order = (ticket_name, qty) => toTicket({
    id: `ORDER-${qty}`, state: "COMPLETED", created_at: minutesFromNow(-5), ticket_name,
    source: { name: "Square Point of Sale" }, tenders: [{ id: "abcd", type: "CARD" }],
    fulfillments: [{ uid: "f1", type: "PICKUP", state: "COMPLETED" }],
    line_items: [{ quantity: String(qty), name: "Chicken Bacon Wrap" }],
  }).ticket;
  const at = new Date(Date.now() + 25 * 6e4);
  const name = `Krystal ${at.getHours() % 12 || 12}:${String(at.getMinutes()).padStart(2, "0")}`;
  const big = order(name, 5), small = order(name, 1);
  assert.equal(big.leadMinutes, 30);
  assert.equal(small.leadMinutes, cfg.showAheadMinutes);
  assert.equal(hiddenReason(big, Date.now()), null, "five wraps due in 25 min: on the board");
  assert.match(hiddenReason(small, Date.now()), /more than/, "one sandwich due in 25 min: waits");
});
