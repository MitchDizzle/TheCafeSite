// The rules that turn Square's orders into tickets: what a ticket is called,
// to go or for here, what the kitchen makes and what the front adds, online
// or counter, and when a ticket is on each screen. Orders are shaped like
// the mock orders in server.js and the raw orders seen on /check.
// Run: node --test kitchen/tests/
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const board = require("./board.js");

const { toTicket, isOnline, hiddenReason, frontHiddenReason, readyAt, minutesFromNow } = board;
const { waitUntil, markSameTable } = require("../lib/tickets");

const li = (quantity, name, extra = {}) => ({ quantity: String(quantity), name, ...extra });

// A paid counter sale as the Restaurants POS sends it: COMPLETED, with its
// To Go fulfillment already COMPLETED too.
function counter(extra = {}) {
  return {
    id: "COUNTERORDER0001",
    state: "COMPLETED",
    created_at: minutesFromNow(-2),
    source: { name: "Square Point of Sale" },
    tenders: [{ id: "r7kq2mXpLw", type: "CARD" }],
    fulfillments: [{ uid: "f1", type: "PICKUP", state: "COMPLETED", pickup_details: { schedule_type: "ASAP" } }],
    line_items: [li(1, "Cheeseburger")],
    ...extra,
  };
}

// A Square Online pickup, named as Square names them since 2026-10-12.
function online(extra = {}, fulfillment = {}) {
  return {
    id: "WEBORDER00000002",
    state: "OPEN",
    created_at: minutesFromNow(-6),
    source: { name: "Ordering Profile - Web" },
    fulfillments: [{ uid: "f1", type: "PICKUP", state: "PROPOSED",
      pickup_details: { pickup_at: minutesFromNow(10), schedule_type: "SCHEDULED", recipient: { display_name: "Pat" } }, ...fulfillment }],
    line_items: [li(1, "Breakfast Sandwich", { modifiers: [{ name: "Biscuit" }, { name: "Bacon" }] })],
    ...extra,
  };
}

// A DoorDash delivery: DoorDash-managed, timed to the courier.
function doordash(extra = {}) {
  return {
    id: "DOORDASHORDER011",
    state: "OPEN",
    created_at: minutesFromNow(-5),
    source: { name: "DoorDash" },
    ticket_name: "DoorDash",
    tenders: [{ id: "DDTENDER", type: "OTHER" }],
    fulfillments: [{ uid: "f1", type: "DELIVERY", state: "PROPOSED",
      delivery_details: { schedule_type: "ASAP", courier_pickup_at: minutesFromNow(8), courier_provider_name: "DoorDash", managed_delivery: true } }],
    line_items: [li(1, "Fried Potatoes")],
    ...extra,
  };
}

const ticketOf = (order) => {
  const { ticket, reason } = toTicket(order);
  assert.ok(ticket, `expected a ticket, got "${reason}"`);
  return ticket;
};

beforeEach(() => board.reset());

// ---------------------------------------------------------------- names

test("a typed ticket name is what the ticket is called", () => {
  const t = ticketOf(counter({ ticket_name: "Bob" }));
  assert.equal(t.label, "Bob");
  assert.equal(t.name, "Bob");
  assert.equal(t.table, null);
});

test("an online order goes by the customer's name", () => {
  assert.equal(ticketOf(online()).label, "Pat");
});

test("a ticket name that is just a number is a table, and counts as For Here", () => {
  const t = ticketOf(counter({ ticket_name: "5" }));
  assert.equal(t.label, "Table 5");
  assert.equal(t.table, "5");
  // Rung up To Go (the POS default), but a table number means eating here.
  assert.equal(t.toGo, false);
});

test("a number is only a table on a counter order", () => {
  const t = ticketOf(online({ ticket_name: "12" }, { pickup_details: { pickup_at: minutesFromNow(10) } }));
  assert.equal(t.table, null);
  assert.equal(t.label, "12");
  assert.equal(t.toGo, true);
});

test("a time in a counter ticket's name makes it due then", () => {
  // Local times on the PC, as the POS rings them.
  const rung = (h, m) => new Date(2026, 9, 13, h, m).toISOString();
  const due = (name, at) => ticketOf(counter({ ticket_name: name, created_at: at }));
  let t = due("Mike 1:00", rung(12, 33));
  assert.equal(t.label, "Mike");
  assert.equal(t.dueAt, new Date(2026, 9, 13, 13, 0).toISOString(), "1:00 rung at 12:33 is 1pm");
  assert.equal(due("11:30 Sue", rung(8, 5)).dueAt, new Date(2026, 9, 13, 11, 30).toISOString());
  assert.equal(due("Bob 1pm", rung(9, 0)).dueAt, new Date(2026, 9, 13, 13, 0).toISOString());
  assert.equal(due("Ann 7:45am", rung(6, 30)).dueAt, new Date(2026, 9, 13, 7, 45).toISOString());
  assert.equal(due("Kay 12:15", rung(12, 33)).dueAt, new Date(2026, 9, 13, 12, 15).toISOString(), "a little before it was rung: due, and late");
  t = due("1:30", rung(12, 0));
  assert.equal(t.label, "#R7KQ", "only a time: the receipt number");
  assert.equal(t.dueAt, new Date(2026, 9, 13, 13, 30).toISOString());
  for (const name of ["Mike 2", "Table 5", "Mike", "Jo 99:00"]) assert.equal(due(name, rung(12, 0)).dueAt, null, name);
  assert.equal(due("5", rung(12, 0)).label, "Table 5");
});

test("a time cut off by Square's 30-character name limit is read as early as it could be", () => {
  const rung = (h, m) => new Date(2026, 9, 27, h, m).toISOString();
  const due = (name, at) => ticketOf(counter({ ticket_name: name, created_at: at }));
  // "Krystal (frontier heritage) 11:30", as Square sent it on 2026-10-27.
  let t = due("Krystal (frontier heritage) 11", rung(10, 11));
  assert.equal(t.dueAt, new Date(2026, 9, 27, 11, 0).toISOString());
  assert.equal(t.label, "Krystal (frontier heritage)");
  assert.equal(due("Krystal (frontier heritage) 11:", rung(10, 11)).dueAt, new Date(2026, 9, 27, 11, 0).toISOString());
  assert.equal(due("Krystal (frontier heritage 11:3", rung(10, 11)).dueAt, new Date(2026, 9, 27, 11, 30).toISOString());
  // Shorter than the limit, nothing was cut: a bare number is still just a name.
  assert.equal(due("Krystal 11", rung(10, 11)).dueAt, null);
});

test("with no name, a paid order shows its receipt number", () => {
  assert.equal(ticketOf(counter()).label, "#R7KQ");
});

test("with no name and no payment, the end of Square's order id", () => {
  assert.equal(ticketOf(counter({ tenders: [], state: "OPEN" })).label, "#0001");
});

test("a ticket named TEST is marked as a practice order", () => {
  assert.equal(ticketOf(counter({ ticket_name: "Test order" })).test, true);
  assert.equal(ticketOf(counter({ ticket_name: "TEST" })).test, true);
  assert.equal(ticketOf(counter({ ticket_name: "Testa" })).test, false);
});

// ---------------------------------------------------------------- to go or for here

test("To Go on the POS is a PICKUP fulfillment; For Here is IN_STORE; none is for here", () => {
  assert.equal(ticketOf(counter()).toGo, true);
  assert.equal(ticketOf(counter({ fulfillments: [{ type: "IN_STORE", state: "COMPLETED" }] })).toGo, false);
  assert.equal(ticketOf(counter({ fulfillments: undefined })).toGo, false);
});

test("online and DoorDash orders are always to go", () => {
  assert.equal(ticketOf(online()).toGo, true);
  assert.equal(ticketOf(doordash()).toGo, true);
});

test("a split order is a For Here ticket with the to-go items last", () => {
  const t = ticketOf(counter({
    ticket_name: "7",
    line_items: [
      li(2, "Lunch Special", { uid: "L3", variation_name: "Meatloaf" }),
      li(1, "Cheeseburger", { uid: "L1", variation_name: "Regular", modifiers: [{ name: "No onion" }] }),
      li(1, "Soup of the Day", { uid: "L2", variation_name: "Bowl" }),
    ],
    fulfillments: [
      { uid: "F1", type: "IN_STORE", state: "COMPLETED", line_item_application: "ENTRY_LIST", entries: [{ line_item_uid: "L1" }, { line_item_uid: "L2" }] },
      { uid: "F2", type: "PICKUP", state: "COMPLETED", line_item_application: "ENTRY_LIST", entries: [{ line_item_uid: "L3" }] },
    ],
  }));
  assert.equal(t.toGo, false);
  assert.deepEqual(t.items.map((it) => [it.name, !!it.toGo]), [
    ["Cheeseburger", false],
    ["Soup of the Day", false],
    ["Lunch Special", true],
  ]);
  assert.equal(t.items[0].variation, null, "Regular isn't printed");
  assert.equal(t.items[2].variation, "Meatloaf");
});

test("the meat that isn't the item's first variation is flagged", () => {
  const { catalog } = require("../lib/catalog");
  const saved = catalog.firstVariation;
  catalog.firstVariation = new Map([["cheeseburger", "Beef"], ["cordon bleu sandwich", "Chicken"]]);
  try {
    const t = ticketOf(counter({ line_items: [
      li(1, "Cheeseburger", { variation_name: "Beef" }),
      li(2, "Cheeseburger", { variation_name: "Chicken" }),
      li(1, "Cordon Bleu Sandwich", { variation_name: "Chicken" }),
      li(1, "Cordon Bleu Sandwich", { variation_name: "Beef" }),
      li(1, "Soup of the Day", { variation_name: "Bowl" }),
    ] }));
    assert.deepEqual(t.items.map((it) => it.insteadOf), [null, "Beef", null, "Chicken", null]);
    catalog.firstVariation = new Map();
    const unknown = ticketOf(counter({ line_items: [li(1, "Navajo Burger", { variation_name: "Chicken" }), li(1, "Hamburger", { variation_name: "Beef" })] }));
    assert.deepEqual(unknown.items.map((it) => it.insteadOf), ["Beef", null], "no catalog: chicken is the one flagged");
  } finally {
    catalog.firstVariation = saved;
  }
});

test("a To Go modifier marks that item to go on a For Here ticket, and isn't printed", () => {
  const t = ticketOf(counter({
    fulfillments: [{ type: "IN_STORE", state: "COMPLETED" }],
    line_items: [li(1, "Reuben", { modifiers: [{ name: "To Go" }, { name: "No kraut" }] }), li(1, "BLT")],
  }));
  assert.deepEqual(t.items.map((it) => it.name), ["BLT", "Reuben"]);
  assert.equal(t.items[1].toGo, true);
  assert.deepEqual(t.items[1].mods, ["No kraut"]);
});

test("on a To Go ticket nothing is singled out as to go", () => {
  const t = ticketOf(counter({ line_items: [li(1, "Reuben", { modifiers: [{ name: "to-go" }] })] }));
  assert.equal(t.toGo, true);
  assert.equal("toGo" in t.items[0], false);
});

// ---------------------------------------------------------------- what the kitchen makes, what the front adds

test("condiment packets come off the kitchen ticket and onto the front's list, totalled", () => {
  const t = ticketOf(counter({
    line_items: [
      li(2, "Cheeseburger", { modifiers: [{ name: "Add bacon" }, { name: "Ketchup packet" }] }),
      li(1, "Patty Melt", { modifiers: [{ name: "Ketchup packet", quantity: "2" }, { name: "Extra pickles", quantity: "2" }] }),
    ],
  }));
  assert.deepEqual(t.items[0].mods, ["Add bacon"]);
  assert.deepEqual(t.items[1].mods, ["Extra pickles ×2"]);
  assert.deepEqual(t.front.map((it) => [it.qty, it.name]), [[4, "Ketchup packet"]]);
});

test("skip-list items go on the front's list, matched by name in any case", () => {
  board.setSkip({ items: ["iced tea / fountain drink"], categories: [] });
  const t = ticketOf(counter({ line_items: [li(1, "Turkey Club"), li(2, "Iced Tea / Fountain Drink")] }));
  assert.deepEqual(t.items.map((it) => it.name), ["Turkey Club"]);
  assert.deepEqual(t.front.map((it) => [it.qty, it.name]), [[2, "Iced Tea / Fountain Drink"]]);
});

test("a whole skipped category covers its items, from Square's catalog", async () => {
  await board.loadCatalog(); // test mode's stand-in catalog
  board.setSkip({ items: [], categories: ["drinks"] });
  const t = ticketOf(counter({ line_items: [li(1, "Big Breakfast"), li(1, "Coffee")] }));
  assert.deepEqual(t.items.map((it) => it.name), ["Big Breakfast"]);
  assert.deepEqual(t.front.map((it) => it.name), ["Coffee"]);
});

test("a counter sale of only skipped items shows nowhere", () => {
  board.setSkip({ items: ["Chips"], categories: [] });
  assert.equal(toTicket(counter({ line_items: [li(1, "Chips")] })).reason, "every item is on the skip list (or a gift card or keypad amount)");
});

test("an online order goes to the kitchen whole: skipped items and packets too", () => {
  board.setSkip({ items: ["Chips", "Iced Tea / Fountain Drink"], categories: [] });
  const t = ticketOf(online({ line_items: [li(1, "Burger", { modifiers: [{ name: "Ketchup packet", quantity: "2" }] }), li(2, "Iced Tea / Fountain Drink")] }));
  assert.deepEqual(t.items.map((it) => [it.qty, it.name, it.mods]), [[1, "Burger", ["Ketchup packet ×2"]], [2, "Iced Tea / Fountain Drink", []]]);
  assert.deepEqual(t.front, [], "nothing for the front to add");
});

test("an online order of only skipped items goes to the kitchen like any other", () => {
  board.setSkip({ items: ["Chips", "V8"], categories: [] });
  const t = ticketOf(online({ line_items: [li(2, "V8"), li(1, "Chips", { variation_name: "BBQ", modifiers: [{ name: "Ketchup packet" }] })] }));
  assert.deepEqual(t.items.map((it) => [it.qty, it.name]), [[2, "V8"], [1, "Chips"]]);
  assert.deepEqual(t.front, []);
  assert.equal(hiddenReason(t, Date.now()), null);
  assert.equal(frontHiddenReason(t, Date.now()), null);
  assert.equal(readyAt(t), null, "ready once the kitchen presses Done");
});

test("gift cards and keypad amounts never go on a ticket", () => {
  const nowhere = "every item is on the skip list (or a gift card or keypad amount)";
  assert.equal(toTicket(counter({ line_items: [li(1, "eGift Card", { item_type: "GIFT_CARD" })] })).reason, nowhere);
  assert.equal(toTicket(counter({ line_items: [{ quantity: "1", note: "Brisket plate", item_type: "CUSTOM_AMOUNT" }] })).reason, nowhere);
  const t = ticketOf(counter({ line_items: [li(1, "Reuben"), { quantity: "1", item_type: "CUSTOM_AMOUNT" }] }));
  assert.deepEqual(t.items.map((it) => it.name), ["Reuben"]);
  assert.deepEqual(t.front, []);
});

test("an item's own note and the order's note are kept", () => {
  const t = ticketOf(online({ line_items: [li(1, "Build Your Own", { note: "Mayo on the side" })] },
    { pickup_details: { pickup_at: minutesFromNow(10), note: "Will call when outside" } }));
  assert.equal(t.items[0].note, "Mayo on the side");
  assert.equal(t.note, "Will call when outside");
});

test("an order with no items is no ticket", () => {
  assert.equal(toTicket(counter({ line_items: [] })).reason, "no items on the order");
});

// ---------------------------------------------------------------- online, DoorDash, counter

test("what counts as online", () => {
  const f = (extra) => ({ type: "PICKUP", state: "PROPOSED", ...extra });
  assert.equal(isOnline({ source: { name: "Ordering Profile - Web" } }, f()), true);
  assert.equal(isOnline({ source: { name: "Square Online" } }, f()), true);
  assert.equal(isOnline({ source: { name: "DoorDash" } }, f()), true);
  assert.equal(isOnline({ source: { name: "Uber Eats" } }, f()), true);
  // A scheduled pickup time, whatever the source says.
  assert.equal(isOnline({ source: { name: "Square Point of Sale" } }, f({ pickup_details: { pickup_at: minutesFromNow(30) } })), true);
  // A delivery DoorDash runs (a courier), even with no source name.
  assert.equal(isOnline({}, { type: "DELIVERY", delivery_details: { managed_delivery: true } }), true);
  assert.equal(isOnline({}, { type: "DELIVERY", delivery_details: { courier_provider_name: "DoorDash" } }), true);
  // The counter: an ASAP pickup step, a delivery rung on the POS, nothing at all.
  assert.equal(isOnline({ source: { name: "Square Point of Sale" } }, f({ pickup_details: { schedule_type: "ASAP" } })), false);
  assert.equal(isOnline({ source: { name: "Point of Sale" } }, { type: "DELIVERY", delivery_details: {} }), false);
  assert.equal(isOnline({}, undefined), false);
});

test("the kind of ticket, and when it's due", () => {
  const c = ticketOf(counter());
  assert.equal(c.kind, "COUNTER");
  assert.equal(c.dueAt, null);
  const o = online();
  assert.equal(ticketOf(o).kind, "PICKUP");
  assert.equal(ticketOf(o).dueAt, o.fulfillments[0].pickup_details.pickup_at);
  const d = doordash();
  assert.equal(ticketOf(d).kind, "DELIVERY");
  assert.equal(ticketOf(d).dueAt, d.fulfillments[0].delivery_details.courier_pickup_at);
  assert.equal(ticketOf(d).label, "DoorDash");
});

test("a counter sale's completed fulfillment means nothing; it waits for Done", () => {
  const t = ticketOf(counter());
  assert.equal(t.squareReady, false);
  assert.equal(hiddenReason(t, Date.now()), null);
  assert.equal(waitUntil(t, Date.now()), null);
});

test("an online order the front finished or canceled in Square is no ticket", () => {
  assert.equal(toTicket(online({}, { state: "COMPLETED" })).reason, "front already marked it completed");
  assert.equal(toTicket(online({}, { state: "FAILED" })).reason, "front already marked it failed");
  assert.equal(toTicket(online({}, { state: "CANCELED" })).reason, "canceled");
  assert.equal(toTicket(counter({ fulfillments: [{ type: "PICKUP", state: "CANCELED" }] })).reason, "canceled");
});

test("marked ready in Square: off the kitchen board, ready on the front", () => {
  const t = ticketOf(online({}, { state: "PREPARED" }));
  assert.equal(t.squareReady, true);
  assert.equal(hiddenReason(t, Date.now()), "front already marked it prepared");
  assert.equal(frontHiddenReason(t, Date.now()), null);
  assert.equal(readyAt(t), t.createdAt);
});

test("a Ready the board wrote itself follows Undo: the ticket comes back", () => {
  const t = ticketOf(online({}, { state: "PREPARED" }));
  board.markedReady[t.id] = new Date().toISOString();
  assert.equal(hiddenReason(t, Date.now()), null);
  assert.equal(readyAt(t), null);
});

// ---------------------------------------------------------------- paid or not

test("a counter sale with nothing paid is tagged NOT PAID with what's due", () => {
  const t = ticketOf(counter({ state: "OPEN", tenders: [], ticket_name: "Tammy", net_amount_due_money: { amount: 1200, currency: "USD" } }));
  assert.equal(t.unpaid, true);
  assert.equal(t.due, 12);
  assert.equal(hiddenReason(t, Date.now()), null, "cooked anyway");
});

test("paid, or online, is never NOT PAID", () => {
  assert.equal(ticketOf(counter({ state: "OPEN" })).unpaid, false);
  assert.equal(ticketOf(online()).unpaid, false);
  assert.equal(ticketOf(online()).due, null);
});

// ---------------------------------------------------------------- on which screen

test("Done takes a ticket off the kitchen board and makes it ready on the front", () => {
  const t = ticketOf(counter());
  board.bumped[t.id] = new Date().toISOString();
  assert.equal(hiddenReason(t, Date.now()), "cleared with Done");
  assert.equal(frontHiddenReason(t, Date.now()), null);
  assert.equal(readyAt(t), board.bumped[t.id]);
});

test("Handed off clears the front only; Canceled clears both", () => {
  const t = ticketOf(counter());
  board.handedOff[t.id] = new Date().toISOString();
  assert.equal(hiddenReason(t, Date.now()), null);
  assert.equal(frontHiddenReason(t, Date.now()), "handed off at the front");
  delete board.handedOff[t.id];
  board.canceled[t.id] = new Date().toISOString();
  assert.equal(hiddenReason(t, Date.now()), "not paid; canceled at the front");
  assert.equal(frontHiddenReason(t, Date.now()), "not paid; canceled at the front");
});

test("a pickup goes on the board 15 minutes before it's due, waits from an hour, and is timed from then", () => {
  const soon = ticketOf(online({}, { pickup_details: { pickup_at: minutesFromNow(10) } }));
  const later = ticketOf(online({}, { pickup_details: { pickup_at: minutesFromNow(45) } }));
  const much = ticketOf(online({}, { pickup_details: { pickup_at: minutesFromNow(90) } }));
  assert.equal(board.cfg.showAheadMinutes, 15);
  assert.equal(hiddenReason(soon, Date.now()), null);
  assert.equal(waitUntil(soon, Date.now()), null);
  assert.equal(hiddenReason(later, Date.now()), "pickup is more than 15 min away");
  assert.equal(waitUntil(later, Date.now()), later.boardAt, "in the WAIT UNTIL row");
  assert.equal(later.boardAt, new Date(Date.parse(later.dueAt) - 15 * 6e4).toISOString());
  assert.equal(frontHiddenReason(later, Date.now()), null, "the front has it");
  assert.equal(waitUntil(much, Date.now()), null);
  assert.equal(frontHiddenReason(much, Date.now()), "pickup is more than 60 min away");
});

test("a phone order for later goes on the board 15 minutes before its time", () => {
  const rung = new Date(); rung.setHours(12, 0, 0, 0);
  const t = ticketOf(counter({ ticket_name: "Mike 1:30", created_at: rung.toISOString() }));
  const due = new Date(rung); due.setHours(13, 30);
  assert.equal(t.dueAt, due.toISOString());
  assert.equal(t.boardAt, new Date(due.getTime() - 15 * 6e4).toISOString());
});

test("DoorDash: off the kitchen board until a Dasher is assigned or 15 minutes", () => {
  const waiting = ticketOf(doordash({ created_at: minutesFromNow(-5) }));
  assert.equal(waiting.courier, null);
  assert.ok(waiting.holdUntil);
  assert.match(hiddenReason(waiting, Date.now()), /^waiting for a Dasher/);
  assert.equal(waitUntil(waiting, Date.now()), waiting.holdUntil, "in the WAIT UNTIL row");
  assert.equal(frontHiddenReason(waiting, Date.now()), null, "the front still sees it");
  const old = ticketOf(doordash({ id: "DOORDASHOLD", created_at: minutesFromNow(-16) }));
  assert.equal(old.holdUntil, null);
  assert.equal(hiddenReason(old, Date.now()), null);
  const dashed = doordash({ id: "DOORDASHED", created_at: minutesFromNow(-3) });
  dashed.fulfillments[0].delivery_details.note = "Courier Name: Sam\r\nCourier Phone Number: +15555550100";
  const t = ticketOf(dashed);
  assert.equal(t.courier, "Sam");
  assert.equal(t.holdUntil, null);
  assert.equal(hiddenReason(t, Date.now()), null);
});

test("DoorDash scheduled for later: goes on by its time, not 15 minutes after it came in", () => {
  // As Square sent one on 2026-10-28: placed at 10:20 for a 12:45 Dasher.
  const later = (id, dueIn, note) => {
    const o = doordash({ id, created_at: minutesFromNow(-20) });
    Object.assign(o.fulfillments[0].delivery_details, { schedule_type: "SCHEDULED", courier_pickup_at: minutesFromNow(dueIn),
      deliver_at: minutesFromNow(dueIn), prep_time_duration: "PT300S" }, note ? { note } : {});
    return ticketOf(o);
  };
  const t = later("DOORDASHLATER1", 145);
  assert.equal(t.boardAt, new Date(Date.parse(t.dueAt) - 15 * 6e4).toISOString());
  assert.equal(t.holdUntil, null, "not waiting for a Dasher");
  assert.match(hiddenReason(t, Date.now()), /more than/);
  assert.equal(waitUntil(t, Date.now()), null, "not in the WAIT UNTIL row yet");
  // An hour out it's in the row, by its own time; a Dasher named early changes nothing.
  const soon = later("DOORDASHLATER2", 45, "Courier Name: Sam\r\nCourier Phone Number: +15555550100");
  assert.match(hiddenReason(soon, Date.now()), /more than/);
  assert.equal(waitUntil(soon, Date.now()), soon.boardAt);
  assert.equal(soon.boardAt, new Date(Date.parse(soon.dueAt) - 15 * 6e4).toISOString());
  assert.equal(hiddenReason(later("DOORDASHLATER3", 10), Date.now()), null, "on the board 15 min before");
});

test("yesterday's open order greets nobody", () => {
  const t = ticketOf(counter({ created_at: minutesFromNow(-25 * 60) }));
  assert.equal(hiddenReason(t, Date.now()), "due before today");
  assert.equal(frontHiddenReason(t, Date.now()), "due before today");
});

// ---------------------------------------------------------------- /check

test("/check's one line about what Square sent", () => {
  assert.equal(board.orderDetail(counter({ state: "OPEN", tenders: [], net_amount_due_money: { amount: 1200 } })),
    "source: Square Point of Sale · order OPEN · fulfillment PICKUP COMPLETED · schedule ASAP · no payment · still due 12.00");
});

test("orders rung under one table number are tagged 1 of 2, 2 of 2; the number later in the day is a new table", () => {
  const at = (id, min, name = "5") => toTicket(counter({ id, ticket_name: name, created_at: minutesFromNow(min) })).ticket;
  const list = [at("B0000000002", -50), at("A0000000001", -52), at("C0000000003", -5), at("D0000000004", -51, "6"), at("E0000000005", -51, "Pat")];
  markSameTable(list);
  const tag = Object.fromEntries(list.map((t) => [t.id, t.tableOf ? `${t.tableOf.n}/${t.tableOf.of}` : null]));
  assert.deepEqual(tag, { A0000000001: "1/2", B0000000002: "2/2", C0000000003: null, D0000000004: null, E0000000005: null });
});

test("a For Here ticket with items to go takes two Dones: plates first, then the to-go part; Undo steps back one", () => {
  const { bump, unbump } = require("../lib/state");
  const t = toTicket(counter({
    id: "SPLITPLATES0001", ticket_name: "7",
    line_items: [li(1, "Cheeseburger", { uid: "L1" }), li(1, "Lunch Special", { uid: "L2" })],
    fulfillments: [
      { uid: "F1", type: "IN_STORE", state: "COMPLETED", line_item_application: "ENTRY_LIST", entries: [{ line_item_uid: "L1" }] },
      { uid: "F2", type: "PICKUP", state: "COMPLETED", line_item_application: "ENTRY_LIST", entries: [{ line_item_uid: "L2" }] },
    ],
  })).ticket;
  const hasToGo = t.items.some((it) => it.toGo);
  assert.ok(hasToGo);
  bump(t.id, hasToGo);
  assert.ok(board.platesDone[t.id]);
  assert.equal(hiddenReason(t, Date.now()), null); // still on the board
  bump(t.id, hasToGo);
  assert.ok(board.bumped[t.id]);
  unbump(t.id);
  assert.ok(!board.bumped[t.id] && board.platesDone[t.id]);
  unbump(t.id);
  assert.ok(!board.platesDone[t.id]);
});
