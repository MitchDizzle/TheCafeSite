// The phone page's numbers (/today): today beside the same weekday before,
// "by now" on both days, and the week so far. Run: node --test kitchen/tests/
const { test } = require("node:test");
const assert = require("node:assert/strict");
require("./board.js");
const { todayView, summarize, netSales } = require("../lib/stats");

// One history record at a local date and time, as dayRecords makes them.
const p2 = (n) => String(n).padStart(2, "0");
const rec = (date, h, m, sales, extra = {}) => ({
  id: `${date}-${h}${m}-${sales}`, at: new Date(`${date}T${p2(h)}:${p2(m)}:00`).toISOString(), meal: h < 11 ? "breakfast" : "lunch",
  online: false, toGo: true, paid: true, sales, items: [{ name: "Reuben", variation: null, qty: 1 }], done: true, kitchenMinutes: null, ...extra,
});
const day = (orders) => ({ savedAt: "", orders });

test("/today: by now against last week and a usual day, the week so far, pickups due later", () => {
  const now = new Date("2026-10-19T10:30:00"); // a Monday
  const today = [rec("2026-10-19", 8, 0, 10), rec("2026-10-19", 8, 5, 10), rec("2026-10-19", 9, 0, 10), rec("2026-10-19", 12, 0, 20, { online: true })];
  const days = {
    "2026-10-19": day([rec("2026-10-19", 7, 0, 99)]), // today's own saved copy: never compared with itself
    "2026-10-12": day([rec("2026-10-12", 8, 0, 10), rec("2026-10-12", 10, 30, 10), rec("2026-10-12", 11, 0, 15)]),
    "2026-10-05": day([rec("2026-10-05", 9, 0, 5), rec("2026-10-05", 9, 0, 5), rec("2026-10-05", 9, 0, 5), rec("2026-10-05", 9, 0, 5)]),
    "2026-10-13": day([rec("2026-10-13", 8, 0, 50)]), // last Tuesday: after last Monday, so not in last week's "so far"
  };
  const v = todayView(now, today, days);
  assert.equal(v.date, "2026-10-19");
  assert.equal(v.today.orders, 4);
  assert.equal(v.today.sales, 50);
  assert.equal(v.today.avgTicket, 12.5);
  assert.deepEqual(v.byNow, { orders: 3, sales: 30, avgTicket: 10 });
  assert.deepEqual(v.later, { orders: 1, sales: 20, avgTicket: 20 });
  assert.equal(v.lastWeek.date, "2026-10-12");
  assert.deepEqual(v.lastWeek.byNow, { orders: 2, sales: 20, avgTicket: 10 }); // 10:30 itself counts
  assert.equal(v.lastWeek.allDay.orders, 3);
  assert.equal(v.lastWeek.byHour[11], 1);
  assert.deepEqual(v.usual, { weeks: 2, byNow: { orders: 3, sales: 20 }, allDay: { orders: 4, sales: 27.5 } });
  assert.equal(v.week.from, "2026-10-19");
  assert.deepEqual(v.week.thisWeek, { orders: 3, sales: 30, avgTicket: 10 });
  assert.deepEqual(v.week.lastWeek, { orders: 2, sales: 20, avgTicket: 10 });
});

test("/today: nothing to compare with when the history has no earlier weekday", () => {
  const now = new Date("2026-10-21T13:00:00"); // a Wednesday
  const v = todayView(now, [rec("2026-10-21", 8, 0, 12)], {
    "2026-10-19": day([rec("2026-10-19", 8, 0, 10)]),
    "2026-10-20": day([rec("2026-10-20", 8, 0, 10), rec("2026-10-20", 14, 0, 10)]),
  });
  assert.equal(v.lastWeek, null);
  assert.equal(v.usual, null);
  assert.equal(v.week.from, "2026-10-19");
  assert.deepEqual(v.week.thisWeek, { orders: 4, sales: 42, avgTicket: 10.5 }); // Monday, all of Tuesday, today by now
  assert.equal(v.week.lastWeek, null);
});

test("summarize: the average ticket leaves out orders with no total", () => {
  const s = summarize([rec("2026-10-19", 8, 0, 9), rec("2026-10-19", 9, 0, null), rec("2026-10-19", 9, 30, 11)]);
  assert.equal(s.orders, 3);
  assert.equal(s.avgTicket, 10);
  assert.equal(summarize([]).avgTicket, null);
});

test("sales are Square's Net sales: items after discounts, no tax, tip or gift card", () => {
  const c = (amount) => ({ amount, currency: "USD" });
  const order = {
    total_money: c(2830), total_tax_money: c(180), total_tip_money: c(300),
    line_items: [
      { item_type: "ITEM", gross_sales_money: c(1200), total_discount_money: c(100) },
      { item_type: "CUSTOM_AMOUNT", gross_sales_money: c(250) },
      { item_type: "GIFT_CARD", gross_sales_money: c(2500) },
    ],
  };
  assert.equal(netSales(order), 13.5);
  // A day saved before the board kept Net sales counts its total until filled in.
  const s = summarize([rec("2026-10-20", 8, 0, 28.3, { net: 13.5, tip: 3 }), rec("2026-10-20", 9, 0, 10)]);
  assert.equal(s.sales, 23.5);
  assert.equal(s.collected, 38.3);
  assert.equal(s.tips, 3);
  assert.equal(s.tipped, 1);
});
