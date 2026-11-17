// Manage -> Desserts against test mode's stand-in for Square: each kind is
// a variation with a count left, and the cheesecake's sauce is its own list.
// Run: node --test kitchen/tests/
const { test } = require("node:test");
const assert = require("node:assert/strict");
require("./board.js");
const { dessertItems, saveDesserts } = require("../lib/desserts");

const item = async (name) => (await dessertItems()).find((i) => i.name === name);
const kind = (it, name) => it.kinds.find((k) => k.name === name);

test("desserts: kinds with their counts, and the sauce list", async () => {
  const cake = await item("Cheesecake");
  assert.equal(cake.price, 3.5);
  assert.deepEqual(cake.kinds.map((k) => [k.name, k.count]), [["Plain", 6], ["Pumpkin", 8]]);
  assert.deepEqual(cake.lists.map((l) => [l.name, l.options.map((o) => o.name)]), [["Cheesecake Sauce", ["Caramel", "Chocolate"]]]);
  const bar = await item("Dessert Bar");
  assert.deepEqual(bar.kinds.map((k) => [k.name, k.count]), [["Magic Bar", null], ["M&M Chocolate Rice Crispy Treat", null]], "not counted: blank");
});

test("desserts: a count is set, blank stops counting, a number starts it", async () => {
  const cake = await item("Cheesecake");
  const bar = await item("Dessert Bar");
  await saveDesserts({ kinds: [
    { item: cake.id, counts: [{ id: kind(cake, "Pumpkin").id, count: "0" }, { id: kind(cake, "Plain").id, count: "" }] },
    { item: bar.id, counts: [{ id: kind(bar, "Magic Bar").id, count: "12" }] },
  ] });
  assert.deepEqual((await item("Cheesecake")).kinds.map((k) => [k.name, k.count]), [["Plain", null], ["Pumpkin", 0]]);
  assert.equal(kind(await item("Dessert Bar"), "Magic Bar").count, 12);
});

test("desserts: add a kind at the item's price, remove one", async () => {
  const cake = await item("Cheesecake");
  const done = await saveDesserts({ kinds: [{ item: cake.id, remove: [kind(cake, "Pumpkin").id], add: [{ name: " Turtle ", count: "5" }] }] });
  assert.match(done.join(), /Cheesecake \(removed 1; added Turtle\)/);
  const now = await item("Cheesecake");
  assert.deepEqual(now.kinds.map((k) => [k.name, k.count]), [["Plain", null], ["Turtle", 5]]);
  assert.equal(now.price, 3.5);
});

test("desserts: the last kind can't go, a bad count is refused, other items are off limits", async () => {
  const bar = await item("Dessert Bar");
  await assert.rejects(saveDesserts({ kinds: [{ item: bar.id, remove: bar.kinds.map((k) => k.id) }] }), /at least one kind/);
  await assert.rejects(saveDesserts({ kinds: [{ item: bar.id, counts: [{ id: bar.kinds[0].id, count: "2.5" }] }] }), /whole number/);
  await assert.rejects(saveDesserts({ kinds: [{ item: "ITEM-Lunch Special", counts: [] }] }), /isn't a dessert/);
  assert.equal((await item("Dessert Bar")).kinds.length, 2);
});

test("desserts: nothing changed is nothing saved", async () => {
  const cake = await item("Cheesecake");
  assert.deepEqual(await saveDesserts({ kinds: [{ item: cake.id, counts: [] }], lists: [] }), []);
});

test("desserts: everything in the Desserts category is listed, one kind shown as itself", async () => {
  const puffs = await item("Cream Puffs");
  assert.equal(puffs.price, 3);
  assert.deepEqual(puffs.kinds.map((k) => k.name), ["Regular"]);
});

test("desserts: a new dessert at its own price, set up like the one on the most channels", async () => {
  const { newDessert } = require("../lib/desserts");
  assert.equal(await newDessert({ name: "  Pecan  Pie ", price: "4.25", count: "3" }), "Pecan Pie");
  const pie = await item("Pecan Pie");
  assert.equal(pie.price, 4.25);
  assert.deepEqual(pie.kinds.map((k) => [k.name, k.count]), [["Regular", 3]]);
  const { mockItems } = require("../lib/mock");
  const made = [...mockItems.values()].find((o) => o.item_data && o.item_data.name === "Pecan Pie");
  assert.deepEqual(made.item_data.channels, ["CH-POS", "CH-Online"]);
  assert.deepEqual(made.item_data.categories, [{ id: "CAT-Desserts" }, { id: "MENU-Lunch-Desserts", ordinal: 16777216 * 2 }, { id: "MENU-Breakfast-Desserts", ordinal: 16777216 * 2 }],
    "on the POS's Desserts tabs, after the last one there");
  await assert.rejects(newDessert({ name: "Pecan Pie", price: "4" }), /already an item/);
  await assert.rejects(newDessert({ name: "Brownie", price: "" }), /price/);
});

test("desserts: On the POS takes one off the POS's Desserts tabs and puts it back at the end", async () => {
  const { readObject } = require("../lib/catalog");
  const tabs = ["MENU-Lunch-Desserts", "MENU-Breakfast-Desserts"];
  const inTabs = async (id) => ((await readObject(id)).item_data.categories || []).filter((c) => tabs.includes(c.id));
  assert.equal((await item("Cheesecake")).pos, true);
  assert.equal((await item("Cream Puffs")).pos, false, "in Desserts, not on a POS tab");
  const cake = await item("Cheesecake");
  let done = await saveDesserts({ pos: [{ item: cake.id, on: false }] });
  assert.match(done.join(), /Cheesecake \(off the POS\)/);
  assert.deepEqual(await inTabs(cake.id), []);
  assert.ok(((await readObject(cake.id)).item_data.categories || []).some((c) => c.id === "CAT-Desserts"), "still a dessert");
  assert.equal((await item("Cheesecake")).kinds.length > 0, true, "its kinds and counts stay");
  done = await saveDesserts({ pos: [{ item: cake.id, on: true }] });
  assert.match(done.join(), /Cheesecake \(back on the POS\)/);
  const back = await inTabs(cake.id);
  assert.deepEqual(back.map((c) => c.id), tabs);
  const others = [];
  for (const it of await dessertItems()) if (it.id !== cake.id) others.push(...(await inTabs(it.id)));
  assert.ok(back.every((c) => others.filter((o) => o.id === c.id).every((o) => o.ordinal < c.ordinal)), "the last one in each tab");
  assert.deepEqual(await saveDesserts({ pos: [{ item: cake.id, on: true }] }), [], "already on: nothing to do");
});

test("desserts: one off the POS is left off the fridge sign", () => {
  const { fridgeRows } = require("../lib/signs");
  const rows = fridgeRows([
    { name: "Cream Puffs", price: 3, pos: false, kinds: [{ name: "Regular", count: 4 }], lists: [] },
    { name: "Dessert Bar", price: 1.5, pos: true, kinds: [{ name: "Magic Bar", count: null }], lists: [] },
  ], { skipItems: [], treats: [], names: {}, show: [], hide: [] });
  assert.deepEqual(rows.map((r) => r.name), ["Magic Bar"]);
});

test("desserts: a dessert given a second kind gets the iPad asking which again", async () => {
  const { newDessert } = require("../lib/desserts");
  const { readObject } = require("../lib/catalog");
  await newDessert({ name: "Cobbler", price: "3.50" });
  let cob = await item("Cobbler");
  assert.equal((await readObject(cob.id)).item_data.skip_modifier_screen, true, "one kind: straight in");
  assert.equal(cob.noAsk, false);
  // A kind added in Square (as with Cookies and Pies): Square still skips the screen.
  const { mockItems } = require("../lib/mock");
  const o = mockItems.get(cob.id);
  o.item_data.variations.push({ type: "ITEM_VARIATION", id: "VAR-Cob-Peach", item_variation_data: { item_id: cob.id, name: "Peach", ordinal: 1, pricing_type: "VARIABLE_PRICING" } });
  cob = await item("Cobbler");
  assert.deepEqual([cob.noAsk, cob.noPrice], [true, true]);
  const done = await saveDesserts({ kinds: [{ item: cob.id, counts: [], price: "$3.75" }] });
  assert.match(done.join(), /Cobbler \(\$3\.75 each; the iPad asks which kind again\)/);
  const now = await readObject(cob.id);
  assert.equal(now.item_data.skip_modifier_screen, false);
  assert.deepEqual(now.item_data.variations.map((v) => [v.item_variation_data.pricing_type, v.item_variation_data.price_money.amount]), [["FIXED_PRICING", 375], ["FIXED_PRICING", 375]]);
  cob = await item("Cobbler");
  assert.deepEqual([cob.noAsk, cob.noPrice, cob.price], [false, false, 3.75]);
  await assert.rejects(saveDesserts({ kinds: [{ item: cob.id, price: "abc" }] }), /isn't a price/);
});
