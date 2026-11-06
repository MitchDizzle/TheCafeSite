// Auto off: the PC shuts down at 9pm Central, with a minute's countdown the
// board's Keep it on can stop, once a night, and never long after the time.
// Test mode: power() only says what it would have done. Run: node --test kitchen/tests/
const { test } = require("node:test");
const assert = require("node:assert/strict");
require("./board.js");
const off = require("../lib/auto-off");

const cst = (t) => new Date(`2026-11-06T${t}-06:00`);

test("9pm Central starts a countdown, then shuts down once", () => {
  off._reset();
  off.tick(cst("20:59:30"));
  assert.equal(off.view().endsAt, null);
  off.tick(cst("21:00:05"));
  assert.ok(off.view().endsAt);
  assert.equal(off.view().time, "9pm");
  off.tick(cst("21:01:10")); // the countdown has run out: shut down (test mode: logged only)
  assert.equal(off.view().endsAt, null);
  off.tick(cst("21:02:00")); // not again tonight
  assert.equal(off.view().endsAt, null);
});

test("Keep it on stops the countdown and stays off", () => {
  off._reset();
  off.tick(cst("21:00:05"));
  off.setOn(false);
  assert.equal(off.view().endsAt, null);
  off.tick(cst("21:05:00"));
  assert.equal(off.view().endsAt, null);
  assert.equal(off.view().on, false);
});

test("a PC turned on later in the evening is left alone", () => {
  off._reset();
  off.tick(cst("22:00:00"));
  assert.equal(off.view().endsAt, null);
});

test("Central time, whatever the PC's clock zone", () => {
  assert.deepEqual(off.central(new Date("2026-11-07T03:00:00Z")), { date: "2026-11-06", minutes: 21 * 60 });
});
