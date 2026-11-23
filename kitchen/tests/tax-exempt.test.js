// Manage -> Tax exempt: which sales are tax-free, numbers saved against
// them, sales added by hand, and each number's total. Run: node --test kitchen/tests/
const { test } = require("node:test");
const assert = require("node:assert/strict");
require("./board.js");
const tx = require("../lib/tax-exempt");

const rec = (id, at, extra = {}) => ({ id, at, online: false, paid: true, net: 10, sales: 10.9, tax: 0.9, receipt: id.slice(0, 4).toUpperCase(),
  items: [{ name: "Reuben", variation: null, qty: 1 }], ...extra });
const days = {
  "2026-11-23": { orders: [
    rec("a1", "2026-11-23T14:00:00.000Z", { tax: 0, sales: 10 }), // tax-free
    rec("a2", "2026-11-23T15:00:00.000Z"), // taxed
    rec("a3", "2026-11-23T15:30:00.000Z", { tax: 0, online: true }), // online: never
    rec("a4", "2026-11-23T16:00:00.000Z", { tax: undefined }), // saved before the tax was kept
    rec("a5", "2026-11-23T16:30:00.000Z", { tax: 0, net: 0, sales: 0 }), // nothing sold
  ] },
  "2026-11-24": { orders: [rec("b1", "2026-11-24T14:00:00.000Z", { tax: 0, net: 20, sales: 20 })] },
};

test("tax exempt: only paid counter sales with no tax, and each number's total", () => {
  let r = tx.taxExemptReport("2026-11-23", "2026-11-24", days);
  assert.deepEqual(r.rows.map((s) => s.id), ["a1", "b1"]);
  assert.equal(r.toDo, 2);
  assert.equal(r.total, 0);

  assert.equal(tx.setNumber("a1", { number: " 7936 06H ", name: "J" }).ok, true);
  assert.equal(tx.setNumber("b1", { number: "793606h" }).ok, true);
  r = tx.taxExemptReport("2026-11-23", "2026-11-24", days);
  assert.equal(r.toDo, 0);
  assert.equal(r.rows[0].number, "7936 06H");
  assert.equal(r.total, 30);

  // A number typed in another case is the same card.
  tx.setNumber("a1", { number: "793606H", name: "J" });
  r = tx.taxExemptReport("2026-11-23", "2026-11-24", days);
  assert.deepEqual(r.byNumber, [{ number: "793606H", name: "J", sales: 2, amount: 30 }]);

  // Not an exemption: off the list's totals; an empty number takes it off again.
  tx.setNotExempt("b1", true);
  r = tx.taxExemptReport("2026-11-23", "2026-11-24", days);
  assert.equal(r.total, 10);
  assert.equal(r.rows.find((s) => s.id === "b1").notExempt, true);
  tx.setNotExempt("b1", false);
  tx.setNumber("a1", { number: "" });
  assert.equal(tx.taxExemptReport("2026-11-23", "2026-11-24", days).toDo, 2);
});

test("tax exempt: a sale added by hand needs a day, an amount and a number", () => {
  assert.equal(tx.addSale({ date: "2026-11-20", amount: "abc", number: "X1" }).ok, false);
  assert.equal(tx.addSale({ date: "2026-11-20", amount: "12.50" }).ok, false);
  assert.equal(tx.addSale({ date: "2999-01-01", amount: "12.50", number: "X1" }).ok, false);
  assert.equal(tx.addSale({ date: "2026-11-20", time: "09:15", amount: "$12.50", number: "X1" }).ok, true);
  const r = tx.taxExemptReport("2026-11-20", "2026-11-20", days);
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].byHand, true);
  assert.equal(r.total, 12.5);
  assert.equal(tx.setNumber(r.rows[0].id, { number: "" }).ok, false);
  assert.equal(tx.removeAdded(r.rows[0].id).ok, true);
  assert.equal(tx.taxExemptReport("2026-11-20", "2026-11-20", days).rows.length, 0);
});
