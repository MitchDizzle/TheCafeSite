// The emailed report (lib/report.js): what the day's and the week's say,
// and when they're due. Run: node --test kitchen/tests/
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

// Monday 2026-11-09 and the Monday before.
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

test("the day's report: counter, online and DoorDash apart, breakfast and lunch, specials, against last week", () => {
  const r = report.dayReport("2026-11-09", days);
  assert.equal(r.totals.orders, 4);
  assert.equal(r.totals.sales, 100);
  assert.equal(r.totals.tips, 2);
  assert.deepEqual(r.channels.map((c) => [c.key, c.orders, c.net, c.share]), [["counter", 2, 40, 40], ["online", 1, 40, 40], ["doordash", 1, 20, 20]]);
  assert.deepEqual(r.meals.map((m) => [m.meal, m.orders, m.net]), [["breakfast", 1, 10], ["lunch", 3, 90]]);
  assert.equal(r.doordash.list.length, 1);
  assert.equal(r.doordash.list[0].waitMinutes, 4);
  assert.equal(r.lastWeek.date, "2026-11-02");
  assert.equal(r.lastWeek.sales, 80);
  assert.deepEqual(r.specials.plates.map((x) => [x.name, x.qty]), [["Meatloaf", 2]]);
  assert.deepEqual(r.specials.soups.map((x) => [x.name, x.cups]), [["Chicken Noodle", 1]]);
  const html = report.renderHtml(r);
  assert.match(html, /Daily report/);
  assert.match(html, /DoorDash/);
  assert.match(html, /▲ \$20\.00 \(25%\) over last Monday/);
  assert.match(html, /Lunch Special, Meatloaf:<\/b> 2 sold/);
  assert.match(report.subjectOf(r), /^The Café, Mon, Nov 9: \$100\.00, 4 orders$/);
  assert.match(report.renderHtml(r, { page: true }), /^<!DOCTYPE html>/);
  assert.equal(report.dayReport("2026-11-08", days), null); // nothing that day
});

test("the week's report: day by day, against the week before", () => {
  const r = report.weekReport("2026-11-11", days);
  assert.equal(r.from, "2026-11-09");
  assert.equal(r.last, "2026-11-10");
  assert.deepEqual(r.perDay.map((d) => [d.date, d.orders, d.doordash]), [["2026-11-09", 4, 1], ["2026-11-10", 1, 0]]);
  assert.equal(r.totals.sales, 115);
  assert.equal(r.before.sales, 80);
  assert.match(report.renderHtml(r), /Day by day/);
  assert.match(report.subjectOf(r), /week of Nov 9/);
});

const cst = (date, t) => new Date(`${date}T${t}:00-06:00`);

test("due: the day's after the time on a day with orders, the week's on its last open day, nothing from before the start", () => {
  report._set({ started: "2026-11-09", settings: { daily: true, weekly: true, time: "14:10", to: [] } });
  assert.deepEqual(report.due(cst("2026-11-09", "14:05"), days), []);
  assert.deepEqual(report.due(cst("2026-11-09", "14:10"), days), [{ kind: "day", date: "2026-11-09" }]);
  // The next morning, with Monday's never sent: Monday's still goes; Tuesday's waits for 2:10.
  assert.deepEqual(report.due(cst("2026-11-10", "08:00"), days), [{ kind: "day", date: "2026-11-09" }]);
  // Friday at 2:10: the week (the days that had orders), and nothing for a Friday with none.
  report._set({ started: "2026-11-09", settings: { daily: true, weekly: true, time: "14:10", to: [] }, sent: { "day:2026-11-09": "x", "day:2026-11-10": "x" } });
  assert.deepEqual(report.due(cst("2026-11-13", "14:12"), days), [{ kind: "week", date: "2026-11-13" }]);
  report._set({ started: "2026-11-09", settings: { daily: true, weekly: true, time: "14:10", to: [] }, sent: { "day:2026-11-09": "x", "day:2026-11-10": "x", "week:2026-11-09": "x" } });
  assert.deepEqual(report.due(cst("2026-11-13", "14:12"), days), []);
  // Started after Monday: Monday's is never owed.
  report._set({ started: "2026-11-10", settings: { daily: true, weekly: false, time: "14:10", to: [] } });
  assert.deepEqual(report.due(cst("2026-11-10", "15:00"), days), [{ kind: "day", date: "2026-11-10" }]);
  // Switched off.
  report._set({ started: "2026-11-09", settings: { daily: false, weekly: false, time: "14:10", to: [] } });
  assert.deepEqual(report.due(cst("2026-11-13", "15:00"), days), []);
  report._set({});
});

test("Manage's settings: addresses checked, a time or none", () => {
  report._set({});
  assert.throws(() => report.saveSettings({ daily: true, to: "terry@example" }), /doesn't look like an email/);
  assert.throws(() => report.saveSettings({ daily: true, time: "2pm" }), /Pick a time/);
  const s = report.saveSettings({ daily: true, weekly: false, time: "14:30", to: "Terry@Example.com\nterry@example.com, dalton@example.com" });
  assert.deepEqual(s, { daily: true, weekly: false, time: "14:30", to: ["terry@example.com", "dalton@example.com"] });
  assert.equal(report.lastOpenDay("2026-11-09"), "2026-11-13"); // config.example's open days: Monday to Friday
  report._set({});
});
