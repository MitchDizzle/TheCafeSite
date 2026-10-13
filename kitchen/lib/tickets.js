// Square's orders into tickets: what each is called, to go or for here,
// what the kitchen makes and what the front adds, and when it's on each
// screen. The rules the tests check (tests/tickets.test.js).
const { cfg } = require("./config");
const { startOfToday } = require("./util");
const { catalog } = require("./catalog");
const { bumped, canceled, handedOff, markedReady, skipSets } = require("./state");

// An online order the front has picked up, canceled or failed is finished
// everywhere. PREPARED (marked ready in Order Manager, which texts the
// customer) is finished for the kitchen but not for the front: the bag is
// still on the counter waiting for the customer.
const GONE_FULFILLMENT = new Set(["COMPLETED", "CANCELED", "FAILED"]);
// Keypad (custom amount) sales DO show: staff may ring a special or an
// off-menu plate that way, and a missed ticket is worse than an extra one.
const NOT_FOOD = new Set(["GIFT_CARD"]);

const itemName = (li) => li.name || li.note || "Custom amount";
const TO_GO_TYPES = /^(PICKUP|DELIVERY|SHIPMENT)$/;

// Online vs. front counter. The Restaurants POS attaches a fulfillment to a
// counter sale and marks it COMPLETED the instant it's paid, so a completed
// fulfillment only means "the front finished it" on an online order. An
// order is online if Square names it so or it carries a scheduled pickup
// time; anything else is treated as a counter sale and waits for Done. When
// in doubt it stays on the board — an extra ticket beats a missed one.
// Square Online orders arrive as "Ordering Profile - Web" (seen 2026-10-12)
// and DoorDash ones as "DoorDash" with a DELIVERY fulfillment that DoorDash
// manages (a courier, a courier pickup time); both count as online. A
// delivery rung on the POS (no courier) stays a counter sale.
const OFFSITE_SOURCE = /online|ordering profile|doordash|uber ?eats|grubhub/i;
function isOnline(order, f) {
  const source = (order.source && order.source.name) || "";
  const d = f && f.delivery_details;
  return OFFSITE_SOURCE.test(source) || !!(f && f.pickup_details && f.pickup_details.pickup_at)
    || !!(f && f.type === "DELIVERY" && d && (d.managed_delivery || d.courier_provider_name));
}

// The categories a line item's item is in: by its catalog id, or by name
// for anything the catalog id doesn't match.
function categoriesOf(li) {
  const hit = li.catalog_object_id && catalog.byVariation.get(li.catalog_object_id);
  if (hit) return hit.cats;
  return catalog.byName.get(itemName(li).trim().toLowerCase()) || [];
}

// On the skip list by name, or in a skipped category.
function isSkipped(li) {
  if (skipSets.items.has(itemName(li).trim().toLowerCase())) return true;
  return categoriesOf(li).some((c) => skipSets.categories.has(c.trim().toLowerCase()));
}

// Returns { ticket } or { reason } — the reason is what /check shows for an
// order that came back from Square but isn't on the board.
function toTicket(order) {
  const f = (order.fulfillments || [])[0];
  const online = isOnline(order, f);
  if (f && f.state === "CANCELED") return { reason: "canceled" };
  if (online && f && GONE_FULFILLMENT.has(f.state)) {
    return { reason: `front already marked it ${f.state.toLowerCase()}` };
  }

  const lines = order.line_items || [];
  // Condiment packets ("Ketchup packet") are chosen as modifiers in Square
  // but go in the bag, not on the food: they come off the kitchen ticket
  // and onto the front's list. See the Packets list in square/README.md.
  const isPacket = (m) => /\bpackets?\b/i.test(m.name || "");
  // Items to go on a For Here ticket: "we're eating here, and a plate to
  // take home". The POS sets the dining option per item; the Restaurants
  // POS records dining options as fulfillments, so such an order is
  // expected to carry one per option, each listing its own items
  // (line_item_application ENTRY_LIST, entries[].line_item_uid). A "To Go"
  // modifier on an item is read the same way, in case it arrives as one.
  // Check a real split order on /check (its "raw" link) if they don't show.
  const lineToGo = new Map(); // line item uid -> true (to go) | false (here)
  for (const ff of order.fulfillments || []) {
    if (ff.line_item_application !== "ENTRY_LIST") continue;
    for (const e of ff.entries || []) lineToGo.set(e.line_item_uid, TO_GO_TYPES.test(ff.type));
  }
  const isToGoMod = (m) => /^\s*to[\s-]?go\s*$/i.test(m.name || "");
  const toItem = (li) => ({
    qty: Number(li.quantity) || 1,
    name: itemName(li),
    variation:
      li.variation_name && li.variation_name !== "Regular" ? li.variation_name : null,
    mods: (li.modifiers || []).filter((m) => !isPacket(m) && !isToGoMod(m)).map((m) =>
      Number(m.quantity) > 1 ? `${m.name} ×${Number(m.quantity)}` : m.name
    ),
    note: li.name && li.note ? li.note : null,
    toGo: (li.modifiers || []).some(isToGoMod) || lineToGo.get(li.uid) === true,
  });
  const food = lines.filter((li) => !NOT_FOOD.has(li.item_type));
  const isSkip = isSkipped;
  // items: what the kitchen makes. front: what the counter adds to the bag.
  let items = food.filter((li) => !isSkip(li)).map(toItem);
  let front = food.filter(isSkip).map(toItem);
  // An online or DoorDash order of only drinks or chips goes to the kitchen
  // as an ordinary ticket all the same (2026-10-13: two V8s from DoorDash
  // showed on the front page only, and the back never saw them). Its Done is
  // also what tells Square it's ready.
  if (online && !items.length) [items, front] = [front, []];
  // Packets, totalled across the order: 2 burgers each wanting ketchup is
  // "2 Ketchup packet", one line.
  const packets = new Map();
  for (const li of food) {
    for (const m of li.modifiers || []) {
      if (!isPacket(m)) continue;
      const n = (Number(li.quantity) || 1) * (Number(m.quantity) || 1);
      packets.set(m.name, (packets.get(m.name) || 0) + n);
    }
  }
  for (const [name, qty] of packets) front.push({ qty, name, variation: null, mods: [], note: null });
  if (!lines.length) return { reason: "no items on the order" };
  // A counter sale of only drinks or chips is handed over as it's rung up;
  // it belongs on neither screen.
  if (!items.length) {
    return { reason: "every item is on the skip list (or a gift card)" };
  }

  const details = f && (f.pickup_details || f.delivery_details || f.shipment_details);
  const recipient = details && details.recipient;
  // When it's wanted: a pickup's time, or when the delivery courier comes for it.
  const dueAt = (f && f.pickup_details && f.pickup_details.pickup_at)
    || (f && f.delivery_details && (f.delivery_details.courier_pickup_at || f.delivery_details.pickup_at)) || null;
  // A counter sale still OPEN with nothing paid: usually a pay-later phone
  // order (cooked now, kept warm), sometimes a sale that fell through (card
  // declined, payment canceled on the terminal). Shown and cooked either
  // way, tagged NOT PAID; the front removes a dead one with "Canceled".
  const unpaid = !online && order.state === "OPEN" && !(order.tenders || []).length;
  const due = order.net_amount_due_money && order.net_amount_due_money.amount;
  // The ticket name the counter typed. A bare number is a table number (the
  // cafe hands them out to people eating in); TEST marks a practice order.
  const ticketName = (order.ticket_name || "").trim();
  const table = !online && /^\d{1,3}$/.test(ticketName) ? ticketName : null;
  const test = /^test\b/i.test(ticketName);
  // To go or for here. The Restaurants POS records the dining option as the
  // fulfillment: "To Go" is PICKUP, "For Here" is IN_STORE. To Go is the
  // POS default, so a table number wins: someone sitting down with a number
  // is eating here even if nobody changed the dining option.
  // An order split between for here and to go carries an IN_STORE
  // fulfillment as well: it's a For Here ticket with some items to go.
  const anyHere = (order.fulfillments || []).some((x) => x.type === "IN_STORE");
  const toGo = online || (!table && !anyHere && !!(f && TO_GO_TYPES.test(f.type)));
  // On a For Here ticket, the to-go items go last, under their own TO GO
  // line on both screens, so they're made (and bagged) after the plates.
  // On a To Go ticket everything goes, so nothing is singled out.
  for (const list of [items, front]) {
    for (const it of list) if (toGo || !it.toGo) delete it.toGo;
    list.sort((a, b) => !!a.toGo - !!b.toGo);
  }
  // What to call it. Square's own order id means nothing at the counter;
  // the receipt number (the start of the payment's id, as printed on the
  // receipt) does, so an order with no name goes by that once it's paid.
  const tender = (order.tenders || [])[0];
  const receipt = tender && tender.id ? tender.id.slice(0, 4).toUpperCase() : null;

  return { ticket: {
    id: order.id,
    kind: online ? (f && f.type) || "PICKUP" : "COUNTER", // PICKUP, DELIVERY, SHIPMENT, or COUNTER
    name: (recipient && recipient.display_name) || order.ticket_name || null,
    shortId: order.id.slice(-4).toUpperCase(),
    label: table ? `Table ${table}` : (recipient && recipient.display_name) || ticketName || `#${receipt || order.id.slice(-4).toUpperCase()}`,
    table,
    test,
    source: (order.source && order.source.name) || null,
    createdAt: order.created_at,
    dueAt,
    items,
    front,
    // Marked ready in Order Manager: the customer has been texted.
    squareReady: !!(online && f && f.state === "PREPARED"),
    unpaid,
    toGo,
    due: unpaid && due ? due / 100 : null,
    note: (details && details.note) || null,
    detail: orderDetail(order),
  } };
}

// Today's work only, on both screens: a stale order from yesterday that
// nobody closed in Square should not greet anyone every morning.
function outOfWindow(t, now) {
  const due = Date.parse(t.dueAt || t.createdAt);
  if (due < startOfToday().getTime()) return "due before today";
  if (due > now + cfg.showAheadMinutes * 6e4) return "pickup is more than " + cfg.showAheadMinutes + " min away";
  return null;
}

// null if the ticket belongs on the kitchen board, else why not.
function hiddenReason(t, now) {
  if (bumped[t.id]) return "cleared with Done";
  if (canceled[t.id]) return "not paid; canceled at the front";
  // A Ready the board wrote itself follows Done/Undo, so Undo still
  // brings the ticket back after Square has been told.
  if (t.squareReady && !markedReady[t.id]) return "front already marked it prepared";
  return outOfWindow(t, now);
}

// null if the ticket belongs on /front, else why not.
function frontHiddenReason(t, now) {
  if (handedOff[t.id]) return "handed off at the front";
  if (canceled[t.id]) return "not paid; canceled at the front";
  return outOfWindow(t, now);
}

// Ready for the front: the kitchen pressed Done, or the front already marked
// it ready in Square.
function readyAt(t) {
  if (bumped[t.id]) return bumped[t.id];
  if (t.squareReady && !markedReady[t.id]) return t.createdAt;
  return null;
}

// What Square said about an order, in one line, for /check.
function orderDetail(o) {
  const f = (o.fulfillments || [])[0];
  const parts = [`source: ${(o.source && o.source.name) || "none"}`, `order ${o.state}`];
  if (f) {
    parts.push(`fulfillment ${f.type} ${f.state}`);
    const p = f.pickup_details || {};
    if (p.schedule_type) parts.push(`schedule ${p.schedule_type}`);
    if (p.pickup_at) parts.push(`pickup_at ${p.pickup_at}`);
  } else {
    parts.push("no fulfillment");
  }
  // Paid or not: a counter sale whose payment was canceled on the terminal
  // can come back as an OPEN order with nothing paid on it.
  const tenders = o.tenders || [];
  const due = o.net_amount_due_money && o.net_amount_due_money.amount;
  parts.push(tenders.length ? `paid (${tenders.map((t) => t.type).join(", ")})` : "no payment");
  if (due) parts.push(`still due ${(due / 100).toFixed(2)}`);
  return parts.join(" · ");
}

module.exports = { NOT_FOOD, itemName, isOnline, toTicket, hiddenReason, frontHiddenReason, readyAt, orderDetail };
