// Specials typed on the front page go to the website (Mitch 2026-11-13):
// a saved day is the front's with its savedAt, siteExport hands it over in
// the website's own shape, and once the website lists it with that same
// boardSavedAt the day is the website's again, so a later fix there comes
// back. Run: node --test kitchen/tests/
const { test, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");
require("./board.js");
const { plan, savePlanDays, siteExport, pullSite } = require("../lib/specials/plan");
const { localDate } = require("../lib/util");
const { cfg } = require("../lib/config");

const ahead = (n) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return localDate(d); };
const day = (special, soup, extra = {}) => ({ items: { "Lunch Special": { today: special, prices: {} }, "Soup of the Day": { today: soup, prices: {} } }, ...extra });

const realFetch = global.fetch;
const realUrl = cfg.specialsUrl;
let site = { days: [] };
beforeEach(() => {
  for (const k of Object.keys(plan.days)) delete plan.days[k];
  plan.applied = {};
  cfg.specialsUrl = "https://example.test/specials.json";
  global.fetch = async () => ({ ok: true, json: async () => site });
});
after(() => { global.fetch = realFetch; cfg.specialsUrl = realUrl; });

test("a day saved here is the front's, stamped, and handed to the website in its shape", () => {
  const d = ahead(3);
  savePlanDays({ [d]: day("Meatloaf", "Potato Cheese", { sides: ["Mashed Potatoes & Brown Gravy", "Corn"] }) });
  assert.equal(plan.days[d].from, "front");
  assert.ok(plan.days[d].savedAt);
  const out = siteExport().days.find((x) => x.date === d);
  assert.deepEqual(out, { date: d, special: "Meatloaf", soup: "Potato Cheese", sides: ["Mashed Potatoes & Brown Gravy", "Corn"], savedAt: plan.days[d].savedAt });
});

test("the export: choice of side, a typed price, nothing past or from the website", () => {
  const d = ahead(4);
  savePlanDays({ [d]: { items: { "Lunch Special": { today: "Lasagna", prices: { "": "12" } } }, anySide: true, sides: [] } });
  plan.days[ahead(5)] = { from: "site", ...day("Chili Dog", "Chili") };
  const out = siteExport().days;
  assert.deepEqual(out.find((x) => x.date === d), { date: d, special: "Lasagna", price: 12, anySide: true, savedAt: plan.days[d].savedAt });
  assert.equal(out.find((x) => x.date === ahead(5)), undefined, "a website day isn't sent back");
});

test("the export: choice of side with its default side", () => {
  const d = ahead(4);
  savePlanDays({ [d]: { items: { "Lunch Special": { today: "Lasagna", prices: {} } }, anySide: true, defaultSide: " Tossed  Salad ", sides: [] } });
  assert.equal(plan.days[d].defaultSide, "Tossed Salad");
  assert.deepEqual(siteExport().days.find((x) => x.date === d), { date: d, special: "Lasagna", anySide: true, defaultSide: "Tossed Salad", savedAt: plan.days[d].savedAt });
  savePlanDays({ [d]: { items: { "Lunch Special": { today: "Lasagna", prices: {} } }, anySide: false, defaultSide: "Tossed Salad", sides: ["Corn"] } });
  assert.equal(plan.days[d].defaultSide, undefined, "only with a choice of side");
});

test("once the website has that save, the day is the website's again and later fixes come through", async () => {
  const d = ahead(3);
  savePlanDays({ [d]: day("Meatloaf", "Potato Cheese") });
  const stamp = plan.days[d].savedAt;
  // The website hasn't got it yet: its old copy is ignored.
  site = { price: 10, days: [{ date: d, special: "Hot Turkey", soup: "Chili" }] };
  await pullSite();
  assert.equal(plan.days[d].from, "front");
  assert.equal(plan.days[d].items["Lunch Special"].today, "Meatloaf");
  // The website has this save: the day goes back to the website.
  site = { price: 10, days: [{ date: d, special: "Meatloaf", soup: "Potato Cheese", boardSavedAt: stamp }] };
  await pullSite();
  assert.equal(plan.days[d].from, "site");
  assert.equal(siteExport().days.length, 0, "nothing left to send");
  // A fix made on the website afterwards reaches the board.
  site = { price: 10, days: [{ date: d, special: "Meat Loaf", soup: "Potato Cheese", boardSavedAt: stamp }] };
  await pullSite();
  assert.equal(plan.days[d].items["Lunch Special"].today, "Meat Loaf");
});

test("saved here again after the website took it: ours until the website has the new save", async () => {
  const d = ahead(3);
  savePlanDays({ [d]: day("Meatloaf", "Potato Cheese") });
  const first = plan.days[d].savedAt;
  await new Promise((r) => setTimeout(r, 5));
  savePlanDays({ [d]: day("Brisket", "Potato Cheese") });
  site = { price: 10, days: [{ date: d, special: "Meatloaf", soup: "Potato Cheese", boardSavedAt: first }] };
  await pullSite();
  assert.equal(plan.days[d].from, "front");
  assert.equal(plan.days[d].items["Lunch Special"].today, "Brisket");
});

test("a closed day with its reason and a message goes to the website without a plate (Mitch 2026-11-18)", async () => {
  const d = ahead(4);
  savePlanDays({ [d]: day("Turkey", "Chili", { closed: true, closedFor: "Thanksgiving", message: "Happy Thanksgiving!" }) });
  assert.deepEqual(plan.days[d].items, {}, "a closed day keeps no dishes");
  assert.equal(plan.days[d].closed, "Thanksgiving");
  const out = siteExport().days.find((x) => x.date === d);
  assert.equal(out.closed, "Thanksgiving");
  assert.equal(out.message, "Happy Thanksgiving!");
  assert.equal(out.special, undefined);
  // Closed without a reason, and a message on an open day.
  const e = ahead(5);
  savePlanDays({ [e]: day("", "", { closed: true }) });
  assert.equal(plan.days[e].closed, true);
  const f = ahead(6);
  savePlanDays({ [f]: day("Meatloaf", "", { message: "Last day before the break" }) });
  assert.equal(plan.days[f].message, "Last day before the break");
  assert.equal(plan.days[f].items["Lunch Special"].today, "Meatloaf");
  // And from the website: a closed day comes in with no dishes.
  const g = ahead(7);
  site = { days: [{ date: g, closed: "Black Friday", message: "See you Monday" }] };
  await pullSite();
  assert.equal(plan.days[g].closed, "Black Friday");
  assert.equal(plan.days[g].message, "See you Monday");
  assert.deepEqual(plan.days[g].items, {});
});
