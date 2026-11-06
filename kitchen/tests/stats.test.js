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

test("summarize: the slowest orders, dishes by kitchen time, the hours, and online timing only where it's known", () => {
  const items = (...names) => names.map((name) => ({ name, variation: null, qty: 1 }));
  const s = summarize([
    rec("2026-11-02", 11, 0, 10, { kitchenMinutes: 20, receipt: "SLOW", items: items("Reuben", "Chips") }),
    rec("2026-11-02", 11, 30, 10, { kitchenMinutes: 12, items: items("Reuben") }),
    rec("2026-11-02", 12, 0, 10, { kitchenMinutes: 14, items: items("Reuben") }),
    rec("2026-11-02", 12, 10, 10, { kitchenMinutes: 4, items: [{ name: "Soup of the Day", variation: "Cup · Chili", qty: 1 }] }),
    rec("2026-11-02", 12, 20, 10, { kitchenMinutes: 5, online: true, doordash: true, waitMinutes: 9 }),
    rec("2026-11-02", 12, 30, 10, { kitchenMinutes: 6, online: true }), // saved before doordash was kept
  ]);
  assert.equal(s.longest.kitchenMinutes, 20);
  assert.equal(s.longest.receipt, "SLOW");
  assert.deepEqual(s.longest.items, ["Reuben", "Chips"]);
  assert.equal(s.slowest.length, 3);
  assert.deepEqual(s.dishes, [{ name: "Reuben", orders: 5, medianMinutes: 12 }]);
  assert.deepEqual(s.hours.map((h) => [h.hour, h.orders]), [[11, 2], [12, 4]]);
  assert.equal(s.handoff.doordash.orders, 1);
  assert.equal(s.handoff.doordash.waitMinutes, 9);
  assert.equal(s.handoff.online.orders, 0);
});

test("Reports: the same days before, and the specials sold by what they were", () => {
  const { previousRange, specialsSold } = require("../lib/stats");
  assert.deepEqual(previousRange("2026-11-02", "2026-11-08"), { from: "2026-10-26", to: "2026-11-01", label: "the week before" });
  assert.equal(previousRange("2026-11-02", "2026-11-03").from, "2026-10-26");
  assert.deepEqual(previousRange("2026-11-01", "2026-11-30"), { from: "2026-10-01", to: "2026-10-31", label: "the month before" });
  assert.deepEqual(previousRange("2026-11-01", "2026-11-02"), { from: "2026-10-01", to: "2026-10-02", label: "the same days the month before" });
  const sp = (date, variation, qty, name = "Lunch Special") => rec(date, 12, 0, 10, { items: [{ name, variation, qty }] });
  const out = specialsSold([
    { date: "2026-10-26", orders: [sp("2026-10-26", "Meatloaf", 30), sp("2026-10-26", "Cup · Chili", 4, "Soup of the Day"), sp("2026-10-26", "Bowl · Chili", 2, "Soup of the Day")] },
    { date: "2026-10-27", orders: [sp("2026-10-27", "Lasagna", 20)] },
    { date: "2026-11-02", orders: [sp("2026-11-02", "Meatloaf", 50)] },
  ]);
  assert.deepEqual(out.plates.map((p) => [p.name, p.days, p.qty, p.perDay]), [["Meatloaf", 2, 80, 40], ["Lasagna", 1, 20, 20]]);
  assert.deepEqual(out.soups.map((p) => [p.name, p.cups, p.bowls]), [["Chili", 4, 2]]);
});

test("breakfast ends at 10:30, for saved days too (their meal was set at 11)", () => {
  const s = summarize([rec("2026-10-19", 10, 29, 10), rec("2026-10-19", 10, 30, 10), rec("2026-10-19", 10, 45, 10)]);
  assert.equal(s.breakfast, 1);
  assert.equal(s.lunch, 2);
});
