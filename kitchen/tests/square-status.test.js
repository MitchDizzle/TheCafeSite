// Handed off: the board takes an online order's pickup step to COMPLETED and
// then closes the order itself, if it's paid (TASKS KB-20: Square doesn't
// close it on its own, and an order left OPEN is missed by the sales reports).
// Run: node --test kitchen/tests/
const { test } = require("node:test");
const assert = require("node:assert/strict");
require("./board.js");
const { live } = require("../lib/live");
const { moveFulfillment, withMockStates } = require("../lib/square-status");

const online = (id, extra = {}) => ({
  id, state: "OPEN", location_id: "L1", source: { name: "Ordering Profile - Web" },
  tenders: [{ type: "CARD" }], net_amount_due_money: { amount: 0, currency: "USD" },
  fulfillments: [{ uid: "f1", type: "PICKUP", state: "PROPOSED" }], ...extra,
});

test("Handed off closes a paid online order, step by step", async () => {
  live.rawOrders.set("PAID1", online("PAID1"));
  assert.equal(await moveFulfillment("PAID1", "COMPLETED"), "COMPLETED");
  const [o] = withMockStates([online("PAID1")]);
  assert.equal(o.fulfillments[0].state, "COMPLETED");
  assert.equal(o.state, "COMPLETED");
});

test("Ready alone leaves the order open", async () => {
  live.rawOrders.set("READY1", online("READY1"));
  await moveFulfillment("READY1", "PREPARED");
  const [o] = withMockStates([online("READY1")]);
  assert.equal(o.fulfillments[0].state, "PREPARED");
  assert.equal(o.state, "OPEN");
});

test("an order with money still due is picked up but not closed", async () => {
  const unpaid = { tenders: [], net_amount_due_money: { amount: 1095, currency: "USD" } };
  live.rawOrders.set("DUE1", online("DUE1", unpaid));
  await moveFulfillment("DUE1", "COMPLETED");
  const [o] = withMockStates([online("DUE1", unpaid)]);
  assert.equal(o.fulfillments[0].state, "COMPLETED");
  assert.equal(o.state, "OPEN");
});
