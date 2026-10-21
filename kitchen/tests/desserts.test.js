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
  assert.deepEqual(made.item_data.categories, [{ id: "CAT-Desserts" }]);
  await assert.rejects(newDessert({ name: "Pecan Pie", price: "4" }), /already an item/);
  await assert.rejects(newDessert({ name: "Brownie", price: "" }), /price/);
});
