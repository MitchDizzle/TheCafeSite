// The printed report (lib/report.js): what a day's, a week's and a long
// stretch's say, and that the page is made to fit one letter page.
// Run: node --test kitchen/tests/
const { test } = require("node:test");
const assert = require("node:assert/strict");
require("./board.js");
const report = require("../lib/report");

const p2 = (n) => String(n).padStart(2, "0");
let n = 0;
const rec = (date, h, m, net, extra = {}) => ({
  id: `r${n++}`, at: new Date(`${date}T${p2(h)}:${p2(m)}:00`).toISOString(), online: false, doordash: false, toGo: true, paid: true,
  sales: net * 1.1, net, tip: 0, items: [{ name: "Reuben", variation: null, qty: 1 }], done: true, kitchenItems: 1, kitchenMinutes: 8, waitMinutes: null, ...extra,
});
const day = (orders) => ({ savedAt: "", orders });

// Monday 2026-11-09 and Tuesday, and the Monday before.
const days = {
  "2026-11-09": day([
    rec("2026-11-09", 7, 30, 10, { tip: 2 }),
    rec("2026-11-09", 11, 0, 30, { items: [{ name: "Lunch Special", variation: "Meatloaf", qty: 2 }, { name: "Soup of the Day", variation: "Cup · Chicken Noodle", qty: 1 }], kitchenItems: 3 }),
    rec("2026-11-09", 11, 30, 20, { online: true, doordash: true, kitchenMinutes: 12, waitMinutes: 4 }),
    rec("2026-11-09", 12, 15, 40, { online: true, doordash: false }),
  ]),
  "2026-11-02": day([rec("2026-11-02", 8, 0, 50), rec("2026-11-02", 12, 0, 30)]),
  "2026-11-10": day([rec("2026-11-10", 9, 0, 15)]),
};

test("a day: counter, online and DoorDash apart, breakfast and lunch, specials, against last week", () => {
  const r = report.buildReport("2026-11-09", "2026-11-09", days);
  assert.equal(r.single, true);
  assert.equal(r.totals.orders, 4);
  assert.equal(r.totals.sales, 100);
  assert.equal(r.totals.tips, 2);
  assert.deepEqual(r.channels.map((c) => [c.key, c.orders, c.net, c.share]), [["counter", 2, 40, 40], ["online", 1, 40, 40], ["doordash", 1, 20, 20]]);
  assert.deepEqual(r.meals.map((m) => [m.meal, m.orders, m.net]), [["breakfast", 1, 10], ["lunch", 3, 90]]);
  assert.equal(r.doordash.list.length, 1);
  assert.equal(r.doordash.list[0].waitMinutes, 4);
  assert.equal(r.before.label, "last Monday");
  assert.equal(r.before.sales, 80);
  assert.deepEqual(r.specials.plates.map((x) => [x.name, x.qty]), [["Meatloaf", 2]]);
  const html = report.renderHtml(r);
  assert.match(html, /Daily report/);
  assert.match(html, /Monday, November 9, 2026/);
  assert.match(html, /▲ \$20\.00 \(25%\) over last Monday/);
  assert.match(html, /Lunch Special, Meatloaf:<\/b> 2 sold/);
  assert.match(html, /Dasher wait/);
  // DoorDash pays the sales tax on its orders: Square's on the $20 one is $2.
  assert.equal(r.doordash.tax, 2);
  assert.equal(r.totals.collected, 108); // 110 in Square, less DoorDash's $2 of tax
  assert.match(html, /\$2\.00 of Square's tax is on these orders/);
  // One letter page: the page size, and the script that zooms it to fit.
  assert.match(html, /@page \{ size: letter portrait/);
  assert.match(html, /10\.2 \* 96/);
  assert.equal(report.buildReport("2026-11-08", "2026-11-08", days), null); // nothing that day
  assert.equal(report.lastDayBefore("2026-11-10", days), "2026-11-09");
});

test("a week: day by day, against the week before", () => {
  const r = report.buildReport("2026-11-09", "2026-11-15", days);
  assert.equal(r.week, true);
  assert.deepEqual(r.dates, ["2026-11-09", "2026-11-10"]);
  assert.deepEqual(r.rows.map((d) => [d.date, d.orders, d.doordash]), [["2026-11-09", 4, 1], ["2026-11-10", 1, 0]]);
  assert.equal(r.totals.sales, 115);
  assert.equal(r.before.label, "the week before");
  assert.equal(r.before.sales, 80);
  const html = report.renderHtml(r);
  assert.match(html, /Weekly report/);
  assert.match(html, /Day by day/);
  assert.equal(report.titleOf(r).when, "Mon, Nov 9 to Sun, Nov 15, 2026");
});

test("a long stretch goes week by week, and any two dates work either way round", () => {
  const many = {};
  for (let i = 0; i < 40; i++) {
    const d = new Date(2026, 9, 1 + i, 12);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    const date = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
    many[date] = day([rec(date, 9, 0, 10)]);
  }
  const r = report.buildReport("2026-11-09", "2026-10-01", many);
  assert.equal(r.from, "2026-10-01");
  assert.equal(r.week, false);
  assert.equal(r.byWeek, true);
  assert.equal(r.rows[0].label, "Week of Sep 28");
  assert.equal(r.rows.reduce((a, x) => a + x.orders, 0), r.totals.orders);
  assert.match(report.renderHtml(r), /Week by week/);
  assert.equal(report.titleOf(r).kind, "Report");
});
