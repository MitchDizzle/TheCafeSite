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
  assert.deepEqual(r.has, { sides: true, day: true, fridge: true });
  assert.match(r.html, /comes with <strong>both<\/strong> sides/);
  assert.match(r.html, /Twice Baked Potato Salad <small class="ts-today">today only/);
  assert.doesNotMatch(r.html, /<li>Corn <small/, "the plate's own side isn't a today-only extra");
  assert.match(r.html, /Cup \$5\.00 &middot; Bowl \$7\.00/);
  assert.match(r.html, /Includes a drink/);
  assert.equal((r.html.match(/data-page="/g) || []).length - 3, 3, "three pages (and the three rules that hide one)");
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
  plan.days[today] = day("Macho Nachos", "Chili");
  r = await signs.buildSigns(today);
  assert.equal(r.has.sides, false);
  assert.match(r.notes.join(" "), /Macho Nachos has no sides/);
  delete plan.days[today];
});

test("signs: the fridge follows Square until a dessert is ticked or unticked", async () => {
  const items = [
    { name: "Cookies", price: 2, kinds: [{ name: "Triple Chocolate Chip (2)", count: 4 }], lists: [] },
    { name: "Cheesecake", price: 3.5, kinds: [{ name: "Plain", count: 6 }], lists: [{ name: "Sauce", options: [{ name: "Caramel" }, { name: "Chocolate" }] }] },
    { name: "Bread Pudding", price: 4, kinds: [{ name: "Regular", count: 0 }, { name: "Raisin", count: 2 }], lists: [] },
  ];
  let rows = signs.fridgeRows(items);
  assert.deepEqual(rows.map((r) => [r.name, r.on]), [["Bread Pudding", false], ["Raisin Bread Pudding", true], ["Plain Cheesecake", false], ["Triple Chocolate Cookies (2)", true]],
    "dearest first; Square's 0 and the skipped Cheesecake are off; the cookie has its sign name");
  assert.equal(rows[3].treat, true);
  signs.saveFridge(["Bread Pudding", "Plain Cheesecake"], rows);
  const kept = signs.fridgeSettings();
  assert.deepEqual([kept.show, kept.hide], [["Bread Pudding", "Plain Cheesecake"], ["Raisin Bread Pudding", "Triple Chocolate Chip (2)"]]);
  rows = signs.fridgeRows(items);
  assert.deepEqual(rows.filter((r) => r.on).map((r) => r.key), ["Bread Pudding", "Plain Cheesecake"]);
  assert.match(signs.fridgePage(rows), /Sauce: Caramel or Chocolate/);
  signs.saveFridge(["Raisin Bread Pudding", "Triple Chocolate Chip (2)"], rows);
  assert.deepEqual([signs.fridgeSettings().show, signs.fridgeSettings().hide], [[], []], "ticks that agree with Square keep nothing");
});
