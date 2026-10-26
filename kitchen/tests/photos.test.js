// The specials' photos: every photo the board can use (the website's
// photos.json beside it, and Photo post's), and a photo picked for a day in
// Specials, which goes on the item that day instead of the dish's own.
// Run: node --test kitchen/tests/
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { plan } = require("./board.js");
const { allPhotos, photoFile, dayPhotos } = require("../lib/specials/photos");
const { savePlanDays } = require("../lib/specials/plan");
const { localDate } = require("../lib/util");

const today = localDate();
const tomorrow = localDate(new Date(Date.now() + 864e5));
const ids = () => new Set(allPhotos().map((p) => p.id));
const ribs = () => allPhotos().find((p) => p.title === "BBQ Ribs");
const day = (special) => ({ from: "site", items: { "Lunch Special": { today: special, prices: {} } } });

test("the website's photos are listed, with an id and where they are", () => {
  const p = ribs();
  assert.ok(p, "BBQ Ribs is in src/_data/photos.json");
  assert.equal(p.from, "website");
  assert.equal(p.id, "/assets/photos/bbq-ribs.jpg");
  assert.ok(photoFile(p.id).bytes.length > 0);
  assert.equal(photoFile("../config.json"), null);
});

test("a dish's own photo is the usual", () => {
  plan.photoPick = {};
  assert.match(dayPhotos(today, day("BBQ Ribs"))["Lunch Special"], /bbq-ribs\.jpg$/);
});

test("a photo picked for the day wins, and none means none", () => {
  const lasagna = allPhotos().find((p) => p.id !== ribs().id);
  savePlanDays({}, {}, { [today]: { "Lunch Special": lasagna.id } }, ids());
  assert.equal(dayPhotos(today, day("BBQ Ribs"))["Lunch Special"].endsWith(lasagna.id.split("/").pop()), true);
  savePlanDays({}, {}, { [today]: { "Lunch Special": "none" } }, ids());
  assert.equal(dayPhotos(today, day("BBQ Ribs"))["Lunch Special"], null);
  savePlanDays({}, {}, { [today]: { "Lunch Special": "" } }, ids());
  assert.equal(plan.photoPick[today], undefined);
  assert.match(dayPhotos(today, day("BBQ Ribs"))["Lunch Special"], /bbq-ribs\.jpg$/);
});

test("a pick doesn't make a website day the front's", () => {
  plan.days[tomorrow] = day("BBQ Ribs");
  savePlanDays({}, {}, { [tomorrow]: { "Lunch Special": ribs().id } }, ids());
  assert.equal(plan.days[tomorrow].from, "site");
  assert.equal(plan.photoPick[tomorrow]["Lunch Special"], ribs().id);
});

test("a photo that isn't kept, or an item not on the list, is refused", () => {
  assert.throws(() => savePlanDays({}, {}, { [tomorrow]: { "Lunch Special": "/assets/photos/nope.jpg" } }, ids()), /isn't on the kitchen PC/);
  assert.throws(() => savePlanDays({}, {}, { [tomorrow]: { "Pancakes": "none" } }, ids()), /isn't on the specials list/);
});
