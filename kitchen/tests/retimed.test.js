// A time changed in Square on an order already cleared (Done, Handed off)
// brings it back for the new time (client 2026-11-06); deliveries don't.
// Run: node --test kitchen/tests/
const { test } = require("node:test");
const assert = require("node:assert/strict");
const board = require("./board.js");
const { retimed } = require("../lib/orders");
const { dueSeen, sentNow } = require("../lib/state");

const t = (id, due, kind = "COUNTER") => ({ id, kind, label: id, dueAt: due });

test("a cleared order comes back when its time changes", () => {
  board.reset();
  retimed([t("R1", board.minutesFromNow(10))]);
  board.bumped.R1 = new Date().toISOString();
  board.handedOff.R1 = new Date().toISOString();
  assert.equal(retimed([t("R1", board.minutesFromNow(60))]), true);
  assert.equal(board.bumped.R1, undefined);
  assert.equal(board.handedOff.R1, undefined);
  assert.equal(dueSeen.R1.due !== undefined, true);
});

test("the same time leaves a cleared order cleared", () => {
  board.reset();
  const due = board.minutesFromNow(10);
  retimed([t("R2", due)]);
  board.bumped.R2 = new Date().toISOString();
  retimed([t("R2", due)]);
  assert.ok(board.bumped.R2);
});

test("a delivery's moving courier time never brings it back", () => {
  board.reset();
  retimed([t("R3", board.minutesFromNow(10), "DELIVERY")]);
  board.bumped.R3 = new Date().toISOString();
  retimed([t("R3", board.minutesFromNow(25), "DELIVERY")]);
  assert.ok(board.bumped.R3);
});

test("a canceled order stays canceled", () => {
  board.reset();
  retimed([t("R4", board.minutesFromNow(10))]);
  board.canceled.R4 = new Date().toISOString();
  board.handedOff.R4 = new Date().toISOString();
  retimed([t("R4", board.minutesFromNow(40))]);
  assert.ok(board.handedOff.R4);
});

test("one sent to the kitchen early waits for its new time", () => {
  board.reset();
  retimed([t("R5", board.minutesFromNow(30))]);
  sentNow.R5 = new Date().toISOString();
  retimed([t("R5", board.minutesFromNow(90))]);
  assert.equal(sentNow.R5, undefined);
});
