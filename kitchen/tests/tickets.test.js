// The rules that turn Square's orders into tickets: what a ticket is called,
// to go or for here, what the kitchen makes and what the front adds, online
// or counter, and when a ticket is on each screen. Orders are shaped like
// the mock orders in server.js and the raw orders seen on /check.
// Run: node --test kitchen/tests/
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const board = require("./board.js");

const { toTicket, isOnline, hiddenReason, frontHiddenReason, readyAt, minutesFromNow } = board;

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
  assert.equal(toTicket(counter({ line_items: [li(1, "Chips")] })).reason, "every item is on the skip list (or a gift card)");
});

test("an online order of only skipped items is a ticket for the front only", () => {
  board.setSkip({ items: ["Chips"], categories: [] });
  const t = ticketOf(online({ line_items: [li(1, "Chips", { variation_name: "BBQ" })] }));
  assert.equal(t.items.length, 0);
  assert.equal(t.front.length, 1);
  assert.equal(hiddenReason(t, Date.now()), "every item is on the skip list (front only)");
  assert.equal(frontHiddenReason(t, Date.now()), null);
  assert.equal(readyAt(t), t.createdAt, "nothing to cook, so it's ready");
});

test("gift cards never go on a ticket; keypad amounts do, under their note", () => {
  assert.equal(toTicket(counter({ line_items: [li(1, "eGift Card", { item_type: "GIFT_CARD" })] })).reason,
    "every item is on the skip list (or a gift card)");
  const t = ticketOf(counter({ line_items: [{ quantity: "1", note: "Brisket plate", item_type: "CUSTOM_AMOUNT" }, { quantity: "1" }] }));
  assert.deepEqual(t.items.map((it) => [it.name, it.note]), [["Brisket plate", null], ["Custom amount", null]]);
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

test("a pickup shows from an hour before it's due", () => {
  const soon = ticketOf(online({}, { pickup_details: { pickup_at: minutesFromNow(30) } }));
  const later = ticketOf(online({}, { pickup_details: { pickup_at: minutesFromNow(90) } }));
  assert.equal(board.cfg.showAheadMinutes, 60);
  assert.equal(hiddenReason(soon, Date.now()), null);
  assert.equal(hiddenReason(later, Date.now()), "pickup is more than 60 min away");
  assert.equal(frontHiddenReason(later, Date.now()), "pickup is more than 60 min away");
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
