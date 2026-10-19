// Reservations (lib/reservations.js): what a reservation may say, when a
// table shows on the screens, and that the screens never get a customer's
// phone number or email. In test mode, so nothing reaches Google.
// Run: node --test kitchen/tests/
const { test } = require("node:test");
const assert = require("node:assert/strict");
require("./board.js");
const rv = require("../lib/reservations");
const { localDate } = require("../lib/util");

const pad = (n) => String(n).padStart(2, "0");
// A table `min` minutes from now, as the book keeps it.
function tableIn(min, extra = {}) {
  const d = new Date(Date.now() + min * 6e4);
  return { id: `t${Math.random().toString(36).slice(2, 8)}`, status: "booked", source: "front", name: "Test Party", phone: "(913) 555-0199", email: "t@example.com",
    date: localDate(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}`, party: 8, notes: "", ...extra };
}

test("reservations: the form's fields are checked and tidied", () => {
  const r = rv.clean({ name: "  Jane   Smith ", phone: "913 555 0100", email: "Jane@Example.com", date: "2026-10-23", time: "11:30", party: "12", notes: "high chair" });
  assert.equal(r.name, "Jane Smith");
  assert.equal(r.email, "jane@example.com");
  assert.equal(r.party, 12);
  assert.throws(() => rv.clean({ ...r, name: "" }), /name/);
  assert.throws(() => rv.clean({ ...r, time: "25:00" }), /time/);
  assert.throws(() => rv.clean({ ...r, party: 0 }), /how many/);
  assert.throws(() => rv.clean({ ...r, email: "not-an-email" }), /email/);
});

test("reservations: a table shows from reservationAheadMinutes before, until the hold runs out", () => {
  const now = Date.now();
  // Keep these inside one day: near midnight the table falls on another date.
  if (new Date(now).getHours() >= 21 || new Date(now).getHours() < 3) return;
  assert.equal(rv.phase(tableIn(180), now), "later");
  assert.equal(rv.phase(tableIn(60), now), "soon");
  assert.equal(rv.phase(tableIn(10), now), "now");
  assert.equal(rv.phase(tableIn(-10), now), "held");
  assert.equal(rv.phase(tableIn(-45), now), "gone");
  assert.equal(rv.phase(tableIn(-10, { status: "seated" }), now), "seated");
});

test("reservations: the screens get today's tables and requests, never phone numbers or emails", () => {
  if (new Date().getHours() >= 21 || new Date().getHours() < 3) return;
  rv.book.list.length = 0;
  rv.book.list.push(tableIn(30), tableIn(120, { status: "canceled" }), tableIn(60 * 24 * 3), tableIn(60 * 24 * 2, { status: "request" }));
  const v = rv.screenView();
  assert.equal(v.today.length, 1);
  assert.equal(v.today[0].phase, "soon");
  assert.equal(v.upcoming.length, 1);
  assert.equal(v.requests, 1);
  const json = JSON.stringify(v);
  assert.ok(!json.includes("555-0199") && !json.includes("example.com"));
});

test("reservations: booked from the front page, a request accepted, seated from the band", async () => {
  rv.book.list.length = 0;
  const { id, message } = await rv.saveReservation({ name: "Lee", phone: "913-555-0102", date: "2099-01-05", time: "11:30", party: 4 }, true);
  assert.match(message, /Saved: Lee, party of 4/);
  assert.equal(rv.book.list.find((r) => r.id === id).status, "booked");

  rv.book.list.push({ ...tableIn(60), id: "web1", status: "request", source: "web" });
  assert.match(await rv.actOn("web1", "accept", true), /^Booked/);
  assert.equal(rv.book.list.find((r) => r.id === "web1").status, "booked");
  assert.ok(rv.markSeated("web1"));
  assert.equal(rv.book.list.find((r) => r.id === "web1").status, "seated");
  assert.ok(!rv.markSeated("web1"), "only a booked table can be seated");
  await assert.rejects(rv.actOn("nope", "accept"), /isn't in the book/);
});

test("reservations: a removed one stays in the file, so the website's copy can't come back as new", async () => {
  rv.book.list.length = 0;
  rv.book.list.push({ ...tableIn(60 * 24 * 2), id: "web2", status: "request", source: "web" });
  await rv.actOn("web2", "decline", false);
  await rv.actOn("web2", "remove", false);
  rv.load();
  assert.equal(rv.book.list.find((r) => r.id === "web2")?.status, "removed");
  assert.equal(rv.screenView().requests, 0);
  assert.ok(!rv.manageView().list.some((r) => r.id === "web2"), "hidden from Manage");
});
