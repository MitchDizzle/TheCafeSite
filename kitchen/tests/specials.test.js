// The specials' words in Square: the side lists each morning (sideSlots) and
// what online ordering and DoorDash show under Lunch Special and Soup of the
// Day (dayDescription, worded by the website's specialSides so it reads as
// on /menu). Run: node --test kitchen/tests/
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const board = require("./board.js");

const { sideSlots, swapsFor, specialSideOptions, leaveOffOptions, counterOnlyOn, overridesFor, dayDescription, plan } = board;

const day = (special, extra = {}) => ({ from: "site", items: { "Lunch Special": { today: special, prices: {} } }, ...extra });

beforeEach(() => { plan.includesDrink = false; plan.soupSide = false; plan.extraSides = {}; plan.leaveOff = {}; plan.counterOnly = {}; plan.frontExtra = {}; plan.dayMods = {}; plan.dishMods = {}; plan.siteMods = {}; plan.swapSides = ["Tossed Salad", "Cottage Cheese"]; });

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

const { listsFor, modsFor, modOption, savePlanDays } = require("../lib/specials/plan");
const { modifierOptions } = require("../lib/specials/sides");

test("Preset Modifiers: picked for the day, else as last time for the dish; none by a sandwich's name", () => {
  Object.assign(plan, { dayLists: {}, dishLists: {} });
  assert.deepEqual(listsFor("2026-10-29", day("Cheesy Steak Sandwich")), { lists: [], from: null });
  assert.deepEqual(listsFor("2026-10-28", null), { lists: [], from: null }, "nothing planned");
  plan.dishLists["hot beef sandwich"] = ["Toppings"];
  assert.deepEqual(listsFor("2026-10-21", day("Hot Beef Sandwich")), { lists: ["Toppings"], from: "dish" });
  plan.dayLists["2026-10-29"] = ["Add"];
  assert.deepEqual(listsFor("2026-10-29", day("Cheesy Steak Sandwich")), { lists: ["Add"], from: "day" });
  Object.assign(plan, { dayLists: {}, dishLists: {} });
});

test("a Specials Modifier as typed: free, or priced with +$1, +1 or $1.50", () => {
  assert.deepEqual(modOption("No onion"), { name: "No onion", price: null });
  assert.deepEqual(modOption("Extra Cheese +$1"), { name: "Extra Cheese", price: "1.00" });
  assert.deepEqual(modOption("Add bacon +1.5"), { name: "Add bacon", price: "1.50" });
  assert.deepEqual(modOption("Side of gravy $0.75"), { name: "Side of gravy", price: "0.75" });
  assert.deepEqual(modOption("Add 2 eggs"), { name: "Add 2 eggs", price: null }, "a number with no + or $ is words");
});

test("Specials Modifiers: the day's typed, else the website's (Leave Off first), else the dish's last", () => {
  const d = day("Chicken Bacon Avocado Wrap");
  assert.deepEqual(modsFor("2026-10-20", d), { words: [], from: null });
  plan.dishMods["chicken bacon avocado wrap"] = ["No Avocado"];
  assert.deepEqual(modsFor("2026-10-20", d), { words: ["No Avocado"], from: "dish" });
  plan.leaveOff = { "2026-10-20": ["Bacon"] };
  plan.siteMods = { "2026-10-20": ["Extra Cheese +$1"] };
  assert.deepEqual(modsFor("2026-10-20", d), { words: ["No Bacon", "Extra Cheese +$1"], from: "site" });
  assert.deepEqual(modifierOptions("2026-10-20", d), [{ name: "No Bacon", price: null }, { name: "Extra Cheese", price: "1.00" }]);
  plan.dayMods = { "2026-10-20": [] };
  assert.deepEqual(modsFor("2026-10-20", d), { words: [], from: "day" }, "emptied in Specials: none that day");
});

test("Specials: typed modifiers and extra sides are saved for the day, and the modifiers for the dish", () => {
  const today = localDate();
  plan.days[today] = { from: "site", items: { "Lunch Special": { today: "Patty Melt", prices: {} } }, sides: ["Chips"] };
  savePlanDays({}, {}, {}, new Set(), {}, {
    mods: { [today]: ["No onion", "Extra cheese +$1"] },
    extras: { [today]: { sides: ["Twice Baked Potato Casserole"], counterOnly: true } },
  });
  assert.deepEqual(plan.dayMods[today], ["No onion", "Extra cheese +$1"]);
  assert.deepEqual(plan.dishMods["patty melt"], ["No onion", "Extra cheese +$1"]);
  assert.equal(plan.days[today].from, "site", "the day itself stays the website's");
  assert.deepEqual(swapsFor(today, plan.days[today]), ["Twice Baked Potato Casserole", "Tossed Salad", "Cottage Cheese"]);
  assert.deepEqual(specialSideOptions(plan.days[today], today), ["Chips", "Twice Baked Potato Casserole"]);
  assert.deepEqual([...counterOnlyOn(today)], ["twice baked potato casserole"]);
  savePlanDays({}, {}, {}, new Set(), {}, { extras: { [today]: { sides: [], counterOnly: true } } });
  assert.deepEqual(swapsFor(today, plan.days[today]), ["Tossed Salad", "Cottage Cheese"], "emptied: gone");
  assert.throws(() => savePlanDays({}, {}, {}, new Set(), {}, { mods: { [today]: ["+$1"] } }), /needs a name/);
  delete plan.days[today];
});

test("Doubling up: the plate's own sides as extra sides put each on the other's list, its own still picked", async () => {
  const today = localDate();
  plan.extraSides = { [today]: ["Mac & Cheese", "Baked Beans"] };
  await loadCatalog();
  delete plan.sidesApplied[today];
  await applySides(today, day("BBQ Ribs", { sides: ["Mac & Cheese", "Baked Beans"] }));
  const names = (name) => [...mockItems.values()].find((o) => o.type === "MODIFIER_LIST" && o.modifier_list_data.name === name)
    .modifier_list_data.modifiers.map((m) => [m.modifier_data.name, m.modifier_data.on_by_default]);
  assert.deepEqual(names("Side 1"), [["Mac & Cheese", true], ["Baked Beans", false], ["Tossed Salad", false], ["Cottage Cheese", false]]);
  assert.deepEqual(names("Side 2"), [["Baked Beans", true], ["Mac & Cheese", false], ["Tossed Salad", false], ["Cottage Cheese", false]]);
  assert.deepEqual(names("Today's Side").map(([n]) => n), ["Mac & Cheese", "Baked Beans"]);
  delete plan.sidesApplied[today];
});

test("Specials Modifiers go on Lunch Special in Square as one list, priced; Leave Off and unpicked presets go off", async () => {
  const today = localDate();
  Object.assign(plan, { dayLists: {}, dishLists: {}, listsUsed: [] });
  plan.dayMods = { [today]: ["No Onion", "Extra Cheese +$1"] };
  await loadCatalog();
  delete plan.sidesApplied[today];
  await applySides(today, day("Cheesy Steak Sandwich", { sides: ["Chips"] }));
  const list = [...mockItems.values()].find((o) => o.type === "MODIFIER_LIST" && o.modifier_list_data.name === "Specials Modifiers");
  assert.ok(list, "the list is made");
  assert.equal(list.modifier_list_data.selection_type, "MULTIPLE");
  assert.deepEqual(list.modifier_list_data.modifiers.map((m) => [m.modifier_data.name, m.modifier_data.price_money.amount]), [["No Onion", 0], ["Extra Cheese", 100]]);
  const on = (id) => ((mockItems.get("ITEM-Lunch Special").item_data.modifier_list_info || []).find((x) => x.modifier_list_id === id) || {}).enabled;
  assert.equal(on(list.id), true);
  assert.equal(on("LIST-Add"), undefined, "a sandwich no longer gets Add by its name");
  plan.dayLists = { [today]: ["Add"] };
  plan.listsUsed = ["Add"];
  delete plan.sidesApplied[today];
  await applySides(today, day("Cheesy Steak Sandwich", { sides: ["Chips"] }));
  assert.equal(on("LIST-Add"), true, "picked as a preset: on");
  plan.dayMods = {};
  plan.dayLists = {};
  delete plan.sidesApplied[today];
  await applySides(today, day("Meatloaf", { sides: ["Corn"] }));
  assert.equal(on(list.id), false, "a day without any: off");
  assert.equal(on("LIST-Add"), false);
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
