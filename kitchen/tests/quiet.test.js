// Square is checked every few seconds in the kitchen's hours and every few
// minutes outside them (client 2026-10-27: the PC may stay on overnight).
// Run: node --test kitchen/tests/
const { test } = require("node:test");
const assert = require("node:assert/strict");
require("./board.js");
const { pollDelay } = require("../lib/orders");
const { cfg } = require("../lib/config");

test("fast in the kitchen's hours, slow after 2pm and at weekends, fast again on the dot", () => {
  const at = (s) => new Date(s); // local time, like the PC's clock
  assert.equal(pollDelay(at("2026-10-27T05:00:00")), cfg.pollSeconds, "Tuesday 5am");
  assert.equal(pollDelay(at("2026-10-27T13:59:59")), cfg.pollSeconds, "Tuesday just before 2pm");
  assert.equal(pollDelay(at("2026-10-27T14:00:00")), cfg.quietPollSeconds, "Tuesday 2pm");
  assert.equal(pollDelay(at("2026-10-31T10:00:00")), cfg.quietPollSeconds, "Saturday");
  assert.equal(pollDelay(at("2026-10-28T04:58:00")), 120, "Wednesday 4:58am: the next check is at 5");
  assert.equal(pollDelay(at("2026-11-01T04:58:00")), cfg.quietPollSeconds, "Sunday 4:58am: closed all day");
});
