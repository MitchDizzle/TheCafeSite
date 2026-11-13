// Items added to a counter order after the kitchen has it come up as a card
// of their own (lib/addons.js): the phone order the customer adds to at the
// counter before paying once.
// Run: node --test kitchen/tests/
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const board = require("./board.js");
const { splitAdded } = require("../lib/addons");
const { kitchenLines } = require("../lib/state");

const { toTicket, minutesFromNow } = board;
const li = (quantity, name, extra = {}) => ({ quantity: String(quantity), name, ...extra });

// A pay-later phone order: OPEN, nothing paid yet.
function phoneOrder(lines, extra = {}) {
  return {
    id: "PHONEORDER000001",
    state: "OPEN",
    created_at: minutesFromNow(-10),
    ticket_name: "Mike",
    source: { name: "Square Point of Sale" },
    fulfillments: [{ uid: "f1", type: "PICKUP", state: "PROPOSED", pickup_details: { schedule_type: "ASAP" } }],
    line_items: lines,
    ...extra,
  };
}

const split = (order) => splitAdded(order, toTicket(order).ticket);

beforeEach(() => {
  board.reset();
  for (const id of Object.keys(kitchenLines)) delete kitchenLines[id];
  board.setSkip({ items: ["Iced Tea / Fountain Drink"], categories: [] });
});

test("an order nothing was added to is one card, as before", () => {
  const o = phoneOrder([li(1, "Cheeseburger", { uid: "A" })]);
  assert.equal(split(o).tickets.length, 1);
  const again = split(o);
  assert.equal(again.tickets.length, 1);
  assert.equal(again.tickets[0].id, o.id);
  assert.equal(again.changed, false);
});

test("an item added after the board showed the order is a card of its own", () => {
  split(phoneOrder([li(1, "Cheeseburger", { uid: "A" })]));
  const { tickets, changed } = split(phoneOrder([li(1, "Cheeseburger", { uid: "A" }), li(1, "Reuben", { uid: "B" })]));
  assert.equal(changed, true);
  assert.equal(tickets.length, 2);
  const [main, added] = tickets;
  assert.deepEqual(main.items.map((it) => it.name), ["Cheeseburger"]);
  assert.equal(added.id, "PHONEORDER000001+1");
  assert.equal(added.addOn, 1);
  assert.equal(added.label, "Mike");
  assert.deepEqual(added.items.map((it) => it.name), ["Reuben"]);
  assert.equal(added.dueAt, null);
});

test("the added card still comes up after the order was Done", () => {
  const first = phoneOrder([li(1, "Cheeseburger", { uid: "A" })]);
  split(first);
  board.bumped[first.id] = new Date().toISOString();
  const { tickets } = split(phoneOrder([li(1, "Cheeseburger", { uid: "A" }), li(1, "Reuben", { uid: "B" })]));
  const added = tickets.find((t) => t.addOn);
  assert.ok(added);
  assert.equal(board.hiddenReason(added, Date.now()), null);
  assert.ok(board.hiddenReason(tickets.find((t) => !t.addOn), Date.now()));
});

test("more of the same item counts as added", () => {
  split(phoneOrder([li(1, "Cheeseburger", { uid: "A" })]));
  const { tickets } = split(phoneOrder([li(3, "Cheeseburger", { uid: "A" })]));
  assert.equal(tickets[0].items[0].qty, 1);
  assert.equal(tickets[1].items[0].qty, 2);
});

test("a second addition is a second card, and the first keeps its items", () => {
  split(phoneOrder([li(1, "Cheeseburger", { uid: "A" })]));
  split(phoneOrder([li(1, "Cheeseburger", { uid: "A" }), li(1, "Reuben", { uid: "B" })]));
  const { tickets } = split(phoneOrder([li(1, "Cheeseburger", { uid: "A" }), li(1, "Reuben", { uid: "B" }), li(1, "BLT", { uid: "C" })]));
  assert.deepEqual(tickets.map((t) => [t.id.slice(-2), t.items.map((it) => it.name).join()]),
    [["01", "Cheeseburger"], ["+1", "Reuben"], ["+2", "BLT"]]);
});

test("a drink added makes no card: it joins the front's list", () => {
  split(phoneOrder([li(1, "Cheeseburger", { uid: "A" })]));
  const { tickets } = split(phoneOrder([li(1, "Cheeseburger", { uid: "A" }), li(1, "Iced Tea / Fountain Drink", { uid: "D" })]));
  assert.equal(tickets.length, 1);
  assert.deepEqual(tickets[0].front.map((it) => it.name), ["Iced Tea / Fountain Drink"]);
});

test("added before the order is on the board, it's part of the order", () => {
  // A phone order for 1pm rung at 10am: waiting, not on the board yet.
  const later = { created_at: minutesFromNow(-5), ticket_name: `Mike ${new Date(Date.now() + 3 * 36e5).getHours() % 12 || 12}:00${new Date(Date.now() + 3 * 36e5).getHours() >= 12 ? "pm" : "am"}` };
  const o = phoneOrder([li(1, "Cheeseburger", { uid: "A" })], later);
  if (!board.hiddenReason(toTicket(o).ticket, Date.now())) return; // too near midnight to test
  split(o);
  const { tickets } = split(phoneOrder([li(1, "Cheeseburger", { uid: "A" }), li(1, "Reuben", { uid: "B" })], later));
  assert.equal(tickets.length, 1);
  assert.equal(tickets[0].items.length, 2);
});

test("online orders are never split", () => {
  const web = (lines) => ({ id: "WEBORDER00000002", state: "OPEN", created_at: minutesFromNow(-3), source: { name: "Ordering Profile - Web" },
    fulfillments: [{ uid: "f1", type: "PICKUP", state: "PROPOSED", pickup_details: { pickup_at: minutesFromNow(5), recipient: { display_name: "Pat" } } }], line_items: lines });
  split(web([li(1, "Cheeseburger", { uid: "A" })]));
  assert.equal(split(web([li(1, "Cheeseburger", { uid: "A" }), li(1, "Reuben", { uid: "B" })])).tickets.length, 1);
  assert.equal(kitchenLines.WEBORDER00000002, undefined);
});

// Client 2026-11-13: a Square Terminal sale sometimes came up already at
// 1:30 "waiting". Square handed it over late; the board counts from when it
// got it.
test("a counter sale Square hands over late is timed from when the board got it", () => {
  const o = phoneOrder([li(1, "Cheeseburger", { uid: "A" })], { state: "COMPLETED", created_at: minutesFromNow(-1.5), fulfillments: [] });
  const t = split(o).tickets[0];
  assert.ok(Math.abs(Date.parse(t.boardAt) - Date.now()) < 2000, "counts from now");
  assert.ok(Date.parse(t.createdAt) < Date.now() - 80000, "Square's time is kept");
  // and it stays so on the next check
  assert.ok(Math.abs(Date.parse(split(o).tickets[0].boardAt) - Date.now()) < 2000);
});

test("orders already in Square when the board starts keep their rung-up time", () => {
  const o = phoneOrder([li(1, "Cheeseburger", { uid: "A" })], { state: "COMPLETED", created_at: minutesFromNow(-1.5), fulfillments: [] });
  const t = splitAdded(o, toTicket(o).ticket, Date.now(), { startup: true }).tickets[0];
  assert.equal(t.boardAt, toTicket(o).ticket.boardAt);
  assert.equal(split(o).tickets[0].boardAt, toTicket(o).ticket.boardAt);
});

test("one seen long after it was rung up (the board was off) keeps its rung-up time", () => {
  const o = phoneOrder([li(1, "Cheeseburger", { uid: "A" })], { state: "COMPLETED", created_at: minutesFromNow(-25), fulfillments: [] });
  assert.equal(split(o).tickets[0].boardAt, toTicket(o).ticket.boardAt);
});
