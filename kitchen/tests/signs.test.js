// Manage -> Signs (lib/signs.js): the day's counter signs from the plan and
// test mode's stand-in for Square.
// Run: node --test kitchen/tests/
const { test } = require("node:test");
const assert = require("node:assert/strict");
require("./board.js");
const { plan } = require("../lib/specials/plan");
const { localDate } = require("../lib/util");
const signs = require("../lib/signs");

const today = localDate();
const day = (special, soup, more = {}) => ({ from: "site", items: { "Lunch Special": { today: special, prices: {} }, "Soup of the Day": { today: soup, prices: {} } }, ...more });

test("signs: three pages from the day's plan and Square's desserts", async () => {
  plan.swapSides = ["Potato Salad", "Coleslaw"];
  plan.soupSide = true;
  plan.includesDrink = true;
  plan.days[today] = day("Meatloaf", "Potato Cheese", { sides: ["Mashed Potatoes", "Corn"] });
  plan.extraSides[today] = ["Corn", "Twice Baked Potato Salad"];
  const r = await signs.buildSigns(today);
  assert.deepEqual(r.has, { sides: true, day: true, fridge: true, week: false });
  assert.match(r.html, /comes with <strong>both<\/strong> sides/);
  assert.match(r.html, /Twice Baked Potato Salad <small class="ts-today">today only/);
  assert.doesNotMatch(r.html, /<li>Corn <small/, "the plate's own side isn't a today-only extra");
  assert.match(r.html, /Cup \$5\.00 &middot; Bowl \$7\.00/);
  assert.match(r.html, /Includes a drink/);
  plan.days[today].items["Lunch Special"].prices = { "": "10.00" };
  const priced = await signs.buildSigns(today);
  assert.equal((priced.html.match(/\$10\.00/g) || []).length, 2, "the plate's price on the sides sign and the special & soup sign");
  assert.match(priced.html, /class="ts-price">\$10\.00/);
  assert.equal((r.html.match(/data-page="/g) || []).length - 4, 3, "three pages (and the four rules that hide one)");
});

test("signs: a pick of two sides, choice of side, and a plate with none", async () => {
  plan.extraSides[today] = [];
  plan.days[today] = day("Ham", "Chili", { sides: ["Tossed Salad or Cooked Broccoli"] });
  let r = await signs.buildSigns(today);
  assert.match(r.html, /comes with <strong>one<\/strong> side\. Pick from:/);
  assert.match(r.html, /ts-pick">Tossed Salad<\/p><p class="ts-or">or<\/p>/);
  plan.days[today] = day("Club Wrap", "Chili", { anySide: true });
  r = await signs.buildSigns(today);
  assert.match(r.html, /Comes with one side\. Pick from:/);
  assert.match(r.html, /Choice of side/);
  plan.days[today] = day("Lasagna", "Chili", { anySide: true, defaultSide: "Tossed Salad" });
  r = await signs.buildSigns(today);
  assert.match(r.html, /<p class="ts-one">comes with<\/p>/);
  assert.match(r.html, /ts-pick">Tossed Salad<\/p>/);
  assert.match(r.html, /Or swap it for any of these/);
  assert.doesNotMatch(r.html, /<li>Tossed Salad<\/li>/, "the default isn't in the swap list too");
  plan.days[today] = day("Macho Nachos", "Chili");
  r = await signs.buildSigns(today);
  assert.equal(r.has.sides, false);
  assert.match(r.notes.join(" "), /Macho Nachos has no sides/);
  delete plan.days[today];
});

test("signs: the fridge follows Square, with ticks for today only", async () => {
  const items = [
    { name: "Cookies", price: 2, kinds: [{ name: "Triple Chocolate Chip (2)", count: 4 }], lists: [] },
    { name: "Cinnamon Roll", price: 2.5, kinds: [{ name: "Regular", count: 3 }], lists: [] },
    { name: "Cheesecake", price: 3.5, kinds: [{ name: "Plain", count: 0 }, { name: "Pumpkin", count: 6 }], lists: [{ name: "Sauce", options: [{ name: "Caramel" }, { name: "Chocolate" }] }] },
    { name: "Bread Pudding", price: 4, kinds: [{ name: "Regular", count: 0 }, { name: "Raisin", count: 2 }], lists: [] },
  ];
  let rows = signs.fridgeRows(items);
  assert.deepEqual(rows.map((r) => [r.name, r.on]), [["Bread Pudding", false], ["Raisin Bread Pudding", true], ["Plain Cheesecake", false], ["Pumpkin Cheesecake", true], ["Cinnamon Roll", false], ["Triple Chocolate Cookies (2)", true]],
    "dearest first; Square's 0 and the skipped Cinnamon Roll are off; the cookie has its sign name");
  assert.equal(rows[5].treat, true);
  signs.saveFridge(["Bread Pudding", "Plain Cheesecake"], rows);
  const kept = signs.fridgeSettings();
  assert.deepEqual([kept.show, kept.hide], [["Bread Pudding", "Plain Cheesecake"], ["Raisin Bread Pudding", "Pumpkin Cheesecake", "Triple Chocolate Chip (2)"]]);
  rows = signs.fridgeRows(items);
  assert.deepEqual(rows.filter((r) => r.on).map((r) => r.key), ["Bread Pudding", "Plain Cheesecake"]);
  const page = signs.fridgePage(rows);
  assert.match(page, /Sauce: Caramel or Chocolate/);
  assert.match(page, /dc-caution--small[\s\S]*Not self serve[\s\S]*Please do not open/, "the small caution panel at the foot");
  const tomorrow = signs.fridgeSettings("2999-01-01");
  assert.deepEqual([tomorrow.show, tomorrow.hide], [[], []], "the next day the ticks are gone and Square decides");
  assert.deepEqual(signs.fridgeRows(items, tomorrow).filter((r) => r.on).map((r) => r.key), ["Raisin Bread Pudding", "Pumpkin Cheesecake", "Triple Chocolate Chip (2)"]);
  signs.saveFridge(["Raisin Bread Pudding", "Pumpkin Cheesecake", "Triple Chocolate Chip (2)"], rows);
  assert.deepEqual([signs.fridgeSettings().show, signs.fridgeSettings().hide], [[], []], "ticks that agree with Square keep nothing");
});

test("signs: a fridge file from before day-only ticks follows Square and the new defaults", () => {
  const fs = require("fs");
  const path = require("path");
  const { DATA } = require("../lib/config");
  const file = path.join(DATA, "signs-mock.json");
  fs.writeFileSync(file, JSON.stringify({ skipItems: ["Cheesecake", "Cinnamon Roll", "Pecan Sticky Bun"], treats: ["Cookies", "Dessert Bar"], show: ["Lemon Layered Dessert"], hide: ["Carrot Cake"] }));
  const o = signs.fridgeSettings();
  assert.deepEqual([o.show, o.hide], [[], []], "old ticks with no day are dropped");
  assert.deepEqual(o.skipItems, ["Cinnamon Roll", "Pecan Sticky Bun"], "the old default skip list means the new default");
  assert.equal(o.caution, "Not self serve");
  fs.writeFileSync(file, JSON.stringify({ caution: "" }));
  assert.doesNotMatch(signs.fridgePage([{ name: "Carrot Cake", price: 3, lists: [], on: true, treat: false }]), /dc-caution/, "caution \"\" drops the panel");
  fs.rmSync(file, { force: true });
});

test("signs: only the pages asked for, and none just answers the days", async () => {
  plan.days[today] = day("Meatloaf", "Potato Cheese", { sides: ["Mashed Potatoes", "Corn"] });
  const none = await signs.buildSigns(today, null, []);
  assert.deepEqual(none.has, { sides: false, day: false, fridge: false, week: false });
  assert.equal(none.html, "");
  assert.deepEqual(none.notes, []);
  assert.ok(none.days.includes(today));
  const one = await signs.buildSigns(today, null, ["day"]);
  assert.deepEqual(one.has, { sides: false, day: true, fridge: false, week: false });
  assert.deepEqual(one.made, ["day"]);
  assert.equal((one.html.match(/data-page="/g) || []).length - 4, 1, "one page (and the four rules that hide one)");
});

test("signs: a closed day makes no special signs, and the week's handout shows it", async () => {
  const next = new Date(); next.setHours(12, 0, 0, 0); next.setDate(next.getDate() + ((8 - next.getDay()) % 7 || 7));
  const mon = localDate(next);
  const thu = localDate(new Date(next.getTime() + 3 * 864e5));
  plan.price = 10;
  plan.days[mon] = day("Meatloaf", "Potato Cheese", { sides: ["Mashed Potatoes"], message: "Back after the holiday" });
  plan.days[thu] = { from: "front", items: {}, closed: "Thanksgiving", message: "Happy Thanksgiving!" };
  const shut = await signs.buildSigns(thu, null, ["sides", "day"]);
  assert.deepEqual(shut.has, { sides: false, day: false, fridge: false, week: false });
  assert.match(shut.notes.join(" "), /Closed for Thanksgiving/);
  const r = await signs.buildSigns(today, null, ["week"], "next");
  assert.equal(r.has.week, true);
  assert.match(r.html, /Closed for Thanksgiving/);
  assert.match(r.html, /Happy Thanksgiving!/);
  assert.match(r.html, /Back after the holiday/);
  assert.equal((r.html.match(/This week&rsquo;s specials/g) || []).length, 2, "two copies on the page");
  assert.equal((r.html.match(/class="sw-qr"/g) || []).length, 2, "the menu's QR code on each");
  delete plan.days[mon]; delete plan.days[thu];
});

test("signs: the week's handout shows a day's price only when it isn't the usual, even before the usual is known", () => {
  const days = [
    { date: "2026-11-23", special: "Meatloaf", soup: "", price: 10, soupSizes: [] },
    { date: "2026-11-24", special: "Ribs", soup: "", price: 12, soupSizes: [] },
    { date: "2026-11-25", special: "Tacos", soup: "", price: 10, soupSizes: [] },
  ];
  const html = signs.weekPage(days, {});
  assert.equal((html.match(/sw-day-price/g) || []).length, 2, "only Ribs, on both copies");
  assert.match(html, /sw-day-price ink-accent">\$12/);
  // Square's prices are text ("10.00"), the website's usual price a number.
  const text = days.map((d) => ({ ...d, price: d.price.toFixed(2) }));
  assert.equal((signs.weekPage(text, { price: 10 }).match(/sw-day-price/g) || []).length, 2, "\"10.00\" is the usual $10");
  assert.equal((signs.weekPage(text, {}).match(/sw-day-price/g) || []).length, 2, "and so is the most common one");
});
