// The specials' words in Square: the side lists each morning (sideSlots) and
// what online ordering and DoorDash show under Lunch Special and Soup of the
// Day (dayDescription, worded by the website's specialSides so it reads as
// on /menu). Run: node --test kitchen/tests/
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const board = require("./board.js");

const { sideSlots, swapsFor, dayDescription, plan } = board;

const day = (special, extra = {}) => ({ from: "site", items: { "Lunch Special": { today: special, prices: {} } }, ...extra });

beforeEach(() => { plan.includesDrink = false; plan.soupSide = false; plan.extraSides = {}; plan.swapSides = ["Tossed Salad", "Cottage Cheese"]; });

test("the side lists: a set side is picked already", () => {
  assert.deepEqual(sideSlots(day("Meatloaf", { sides: ["Mashed Potatoes & White Gravy", "Corn"] })), [
    { pick: "Mashed Potatoes & White Gravy", also: [] },
    { pick: "Corn", also: [] },
  ]);
});

test("the side lists: two sides with 'or' are Chef's Choice and both", () => {
  assert.deepEqual(sideSlots(day("Lasagna", { sides: ["Tossed Salad or Cooked Broccoli", "Breadstick"] })), [
    { pick: "Chef's Choice", also: ["Tossed Salad", "Cooked Broccoli"] },
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

test("the swap list: the day's extra sides, the deli salads, then a cup of the soup", () => {
  const d = day("French Dip", { anySide: true, items: { "Lunch Special": { today: "French Dip", prices: {} }, "Soup of the Day": { today: "Broccoli Cheese", prices: {} } } });
  assert.deepEqual(swapsFor("2026-10-13", d), ["Tossed Salad", "Cottage Cheese"]);
  plan.soupSide = true;
  plan.extraSides = { "2026-10-13": ["Oven Browned Potatoes"] };
  assert.deepEqual(swapsFor("2026-10-13", d), ["Oven Browned Potatoes", "Tossed Salad", "Cottage Cheese", "Soup of the Day"]);
  assert.deepEqual(swapsFor("2026-10-14", day("Meatloaf")), ["Tossed Salad", "Cottage Cheese"], "extra sides are that day's only; no soup planned, no soup side");
});

test("Lunch Special's description: the plate, its sides, the drink, the swap", () => {
  plan.includesDrink = true;
  assert.equal(dayDescription("Lunch Special", day("Lasagna", { sides: ["Tossed Salad or Cooked Broccoli", "Breadstick"] })),
    "Lasagna with Tossed Salad or Cooked Broccoli and Breadstick. Includes a fountain drink or iced tea. Swap a side below if you like. Served from 11am.");
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
