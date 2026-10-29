// The specials' words in Square: the side lists each morning (sideSlots) and
// what online ordering and DoorDash show under Lunch Special and Soup of the
// Day (dayDescription, worded by the website's specialSides so it reads as
// on /menu). Run: node --test kitchen/tests/
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const board = require("./board.js");

const { sideSlots, swapsFor, specialSideOptions, leaveOffOptions, counterOnlyOn, overridesFor, dayDescription, plan } = board;

const day = (special, extra = {}) => ({ from: "site", items: { "Lunch Special": { today: special, prices: {} } }, ...extra });

beforeEach(() => { plan.includesDrink = false; plan.soupSide = false; plan.extraSides = {}; plan.leaveOff = {}; plan.counterOnly = {}; plan.swapSides = ["Tossed Salad", "Cottage Cheese"]; });

test("the side lists: a set side is picked already", () => {
  assert.deepEqual(sideSlots(day("Meatloaf", { sides: ["Mashed Potatoes & White Gravy", "Corn"] })), [
    { pick: "Mashed Potatoes & White Gravy", also: [] },
    { pick: "Corn", also: [] },
  ]);
});

test("the side lists: two sides with 'or' are both, nothing picked (no Chef's Choice)", () => {
  assert.deepEqual(sideSlots(day("Lasagna", { sides: ["Tossed Salad or Cooked Broccoli", "Breadstick"] })), [
    { pick: null, also: ["Tossed Salad", "Cooked Broccoli"] },
    { pick: "Breadstick", also: [] },
  ]);
});

test("the side lists: choice of side is one list, Chef's Choice", () => {
  assert.deepEqual(sideSlots(day("Meatloaf", { anySide: true, sides: ["ignored"] })), [{ pick: "Chef's Choice", also: [] }]);
});

test("the side lists: nothing planned, or no sides, is none", () => {
  assert.deepEqual(sideSlots(null), []);
  assert.deepEqual(sideSlots(day("Chili Dog")), []);
});

test("the Special Side: the plate's sides, each 'or' as both", () => {
  assert.deepEqual(specialSideOptions(day("Lasagna", { sides: ["Tossed Salad or Cooked Broccoli", "Breadstick"] })), ["Tossed Salad", "Cooked Broccoli", "Breadstick"]);
  assert.deepEqual(specialSideOptions(day("Sausage & Kraut", { sides: ["Cheesy Potatoes"] })), ["Cheesy Potatoes"]);
});

test("the Special Side: none on a choice-of-side day, or with no sides", () => {
  assert.deepEqual(specialSideOptions(day("Meatloaf", { anySide: true, sides: ["Corn"] })), []);
  assert.deepEqual(specialSideOptions(day("Chili Dog")), []);
  assert.deepEqual(specialSideOptions(null), []);
});

test("the swap list: the day's extra sides, the deli salads, then a cup of the soup", () => {
  const d = day("French Dip", { anySide: true, items: { "Lunch Special": { today: "French Dip", prices: {} }, "Soup of the Day": { today: "Broccoli Cheese", prices: {} } } });
  assert.deepEqual(swapsFor("2026-10-13", d), ["Tossed Salad", "Cottage Cheese"]);
  plan.soupSide = true;
  plan.extraSides = { "2026-10-13": ["Oven Browned Potatoes"] };
  assert.deepEqual(swapsFor("2026-10-13", d), ["Oven Browned Potatoes", "Tossed Salad", "Cottage Cheese", "Soup of the Day"]);
  assert.deepEqual(swapsFor("2026-10-14", day("Meatloaf")), ["Tossed Salad", "Cottage Cheese"], "extra sides are that day's only; no soup planned, no soup side");
});

test("Leave Off: that day's words as No options, kept if already written No", () => {
  plan.leaveOff = { "2026-10-20": ["Bacon", "No Onions"] };
  assert.deepEqual(leaveOffOptions("2026-10-20"), ["No Bacon", "No Onions"]);
  assert.deepEqual(leaveOffOptions("2026-10-21"), [], "that day's only");
});

test("Lunch Special's description: the plate, its sides, the drink, the swap", () => {
  plan.includesDrink = true;
  assert.equal(dayDescription("Lunch Special", day("Lasagna", { sides: ["Tossed Salad or Cooked Broccoli", "Breadstick"] })),
    "Lasagna with Tossed Salad or Cooked Broccoli and Breadstick. Includes a fountain drink or iced tea. Pick your side below. Served from 11am.");
});

test("At the counter only: hidden online on the item, the pick kept, that day's only", () => {
  plan.counterOnly = { "2026-10-29": ["Twice Baked Potato Casserole"] };
  const hidden = counterOnlyOn("2026-10-29");
  const mod = (id, name) => ({ id, modifier_data: { name } });
  const list = { modifier_list_data: { modifiers: [mod("A", "Oven Browned Potatoes"), mod("B", "Twice Baked Potato Casserole"), mod("C", "Tossed Salad")] } };
  assert.deepEqual(overridesFor(list, null, hidden), [{ modifier_id: "B", hidden_online_override: "YES" }]);
  assert.deepEqual(overridesFor(list, "C", hidden), [
    { modifier_id: "B", hidden_online_override: "YES" },
    { modifier_id: "C", on_by_default_override: "YES" },
  ]);
  assert.deepEqual(overridesFor(list, "C", counterOnlyOn("2026-10-30")), [{ modifier_id: "C", on_by_default_override: "YES" }]);
});

test("Lunch Special's description: a counter-only side is left out, and it still asks", () => {
  const d = day("Cheesy Steak Sandwich", { sides: ["Oven Browned Potatoes or Twice Baked Potato Casserole"] });
  assert.equal(dayDescription("Lunch Special", d, new Set(["twice baked potato casserole"])),
    "Cheesy Steak Sandwich with Oven Browned Potatoes. Pick your side below. Served from 11am.");
  assert.equal(dayDescription("Lunch Special", d),
    "Cheesy Steak Sandwich with Oven Browned Potatoes or Twice Baked Potato Casserole. Pick your side below. Served from 11am.");
});

test("Lunch Special's description: three sides read as a list", () => {
  assert.equal(dayDescription("Lunch Special", day("Pot Roast", { sides: ["Mashed Potatoes", "Carrots", "Roll"] })),
    "Pot Roast with Mashed Potatoes, Carrots and Roll. Swap a side below if you like. Served from 11am.");
});

test("Lunch Special's description: choice of side asks for a pick", () => {
  assert.equal(dayDescription("Lunch Special", day("Meatloaf", { anySide: true })),
    "Meatloaf with choice of side. Pick your side below. Served from 11am.");
});

test("Lunch Special's description: no sides, nothing to swap", () => {
  assert.equal(dayDescription("Lunch Special", day("Chili Dog")), "Chili Dog. Served from 11am.");
});

test("Soup of the Day's description: the soup, then its words", () => {
  const soup = { from: "site", items: { "Soup of the Day": { today: "Chicken Pot Pie", prices: {} } } };
  assert.equal(dayDescription("Soup of the Day", soup), "Chicken Pot Pie. Starting at 11am.");
});

test("a day with nothing planned puts back the plain words", () => {
  assert.equal(dayDescription("Lunch Special", null), "Served from 11am.");
  assert.equal(dayDescription("Soup of the Day", day("Lasagna")), "Starting at 11am.");
});

// Fake Square (mock.js) and a stand-in for the website, for the two below.
const { pullSite } = require("../lib/specials/plan");
const { applySides } = require("../lib/specials/sides");
const { mockItems } = require("../lib/mock");
const { loadCatalog } = require("../lib/catalog");
const { localDate } = require("../lib/util");

function website(days) {
  const real = global.fetch;
  global.fetch = async () => ({ ok: true, json: async () => ({ price: 10, days }) });
  return () => { global.fetch = real; };
}

test("today's sides changed on the website reach today once it's in Square; its names don't", async () => {
  const today = localDate();
  plan.days[today] = { from: "site", items: { "Lunch Special": { today: "Ham Steak", prices: { "": "10.00" } } }, sides: ["Sweet Potatoes", "Peas", "Carrots"] };
  plan.applied[today] = { sig: "x", at: new Date().toISOString() };
  const restore = website([{ date: today, special: "Ham Steak (renamed)", sides: ["Sweet Potatoes", "Peas & Carrots"] }]);
  try { await pullSite(); } finally { restore(); }
  assert.deepEqual(plan.days[today].sides, ["Sweet Potatoes", "Peas & Carrots"]);
  assert.equal(plan.days[today].items["Lunch Special"].today, "Ham Steak");
});

test("today's sides: a day set on the front page keeps its own", async () => {
  const today = localDate();
  plan.days[today] = { from: "front", items: { "Lunch Special": { today: "Ham Steak", prices: {} } }, sides: ["Corn"] };
  plan.applied[today] = { sig: "x", at: new Date().toISOString() };
  const restore = website([{ date: today, special: "Ham Steak", sides: ["Peas & Carrots"] }]);
  try { await pullSite(); } finally { restore(); }
  assert.deepEqual(plan.days[today].sides, ["Corn"]);
});

const { listsFor, isSandwich } = require("../lib/specials/plan");

test("a sandwich by its name: Sandwich, Wrap, Hoagie, Melt, Burger, ...", () => {
  for (const name of ["Cheesy Steak Sandwich", "Chicken Bacon Avocado Wrap", "French Dip on a Hoagie", "Patty Melt", "Bacon Cheeseburger Sliders", "BLT", "Cheese Burger", "Cheeseburger"]) {
    assert.equal(isSandwich(name), true, name);
  }
  for (const name of ["Chicken Fried Chicken", "BBQ Ribs", "Spaghetti & Meatballs", "Ham Steak", "Wrapped Pork Loin", ""]) {
    assert.equal(isSandwich(name), false, name);
  }
});

test("Add and Toppings: on by themselves on a sandwich day, none on another; Specials' ticks win", () => {
  Object.assign(plan, { dayLists: {}, dishLists: {} });
  assert.deepEqual(listsFor("2026-10-29", day("Cheesy Steak Sandwich")), { lists: ["Add", "Toppings"], from: "sandwich" });
  assert.deepEqual(listsFor("2026-10-28", day("Chicken Fried Chicken")), { lists: [], from: null });
  assert.deepEqual(listsFor("2026-10-28", null), { lists: [], from: null }, "nothing planned");
  plan.dishLists["hot beef sandwich"] = [];
  assert.deepEqual(listsFor("2026-10-21", day("Hot Beef Sandwich")), { lists: [], from: "dish" }, "unticked for that dish once");
  plan.dayLists["2026-10-29"] = ["Add"];
  assert.deepEqual(listsFor("2026-10-29", day("Cheesy Steak Sandwich")), { lists: ["Add"], from: "day" });
  Object.assign(plan, { dayLists: {}, dishLists: {} });
});

test("Add and Toppings go on Lunch Special in Square on a sandwich day and off the next day", async () => {
  const today = localDate();
  Object.assign(plan, { dayLists: {}, dishLists: {}, listsUsed: [] });
  await loadCatalog();
  const onItem = () => {
    const infos = mockItems.get("ITEM-Lunch Special").item_data.modifier_list_info || [];
    return Object.fromEntries(["LIST-Add", "LIST-Toppings"].map((id) => [id, (infos.find((x) => x.modifier_list_id === id) || {}).enabled]));
  };
  delete plan.sidesApplied[today];
  await applySides(today, day("Cheesy Steak Sandwich"));
  assert.deepEqual(onItem(), { "LIST-Add": true, "LIST-Toppings": true });
  delete plan.sidesApplied[today];
  await applySides(today, day("Chicken Fried Chicken", { sides: ["Mashed Potatoes & White Gravy", "Green Beans"] }));
  assert.deepEqual(onItem(), { "LIST-Add": false, "LIST-Toppings": false });
});

test("each side list has its side picked already, on the option and on the item", async () => {
  const today = localDate();
  await loadCatalog();
  delete plan.sidesApplied[today];
  await applySides(today, day("Ham Steak", { sides: ["Sweet Potatoes", "Peas & Carrots"] }));
  const lists = [...mockItems.values()].filter((o) => o.type === "MODIFIER_LIST" && /^Side \d$/.test(o.modifier_list_data.name));
  const infos = mockItems.get("ITEM-Lunch Special").item_data.modifier_list_info;
  for (const [name, side] of [["Side 1", "Sweet Potatoes"], ["Side 2", "Peas & Carrots"]]) {
    const list = lists.find((l) => l.modifier_list_data.name === name);
    const mods = list.modifier_list_data.modifiers;
    assert.deepEqual(mods.filter((m) => m.modifier_data.on_by_default).map((m) => m.modifier_data.name), [side], name);
    const info = infos.find((x) => x.modifier_list_id === list.id);
    assert.equal(info.enabled, true, name);
    assert.deepEqual(info.modifier_overrides, [{ modifier_id: mods.find((m) => m.modifier_data.name === side).id, on_by_default_override: "YES" }], name);
  }
});
