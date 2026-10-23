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

// Beef or chicken on a burger: the item's first variation in Square is what
// it usually comes with (Beef, or Chicken on the Cordon Bleu), and the other
// one is flagged on the ticket so the cook doesn't grab the usual patty.
// Returns the usual meat when this line isn't it, else null. With no catalog
// to ask, Chicken is the one flagged: beef is the usual on all but one.
const MEAT = /^(beef|chicken)$/i;
function meatSwap(li) {
  const v = (li.variation_name || "").trim();
  if (!MEAT.test(v)) return null;
  const hit = li.catalog_object_id && catalog.byVariation.get(li.catalog_object_id);
  const usual = (hit && hit.firstVariation) || catalog.firstVariation.get(itemName(li).trim().toLowerCase())
    || (/^chicken$/i.test(v) ? "Beef" : null);
  return usual && MEAT.test(usual) && usual.toLowerCase() !== v.toLowerCase() ? usual : null;
}

// On the skip list by name, or in a skipped category.
function isSkipped(li) {
  if (skipSets.items.has(itemName(li).trim().toLowerCase())) return true;
  return categoriesOf(li).some((c) => skipSets.categories.has(c.trim().toLowerCase()));
}

// A time typed in a counter ticket's name ("Mike 1:00", "Sue 11:30am",
// "Bob 1pm"): when a phone order is wanted (client 2026-10-13). It needs a
// colon or am/pm, so "Table 5" or "Mike 2" is never read as one. Without
// am/pm it's the first of the two that isn't more than half an hour before
// the order was rung ("1:00" rung at 12:33 is 1pm). Returns { at, rest }
// (rest: the name without the time) or null.
const NAME_TIME = /(?:^|\s)(\d{1,2})(?::([0-5]\d))?\s*([ap])\.?m?\.?(?=\s|$)|(?:^|\s)(\d{1,2}):([0-5]\d)(?=\s|$)/i;
function timeInName(name, createdAt) {
  const m = NAME_TIME.exec(name);
  if (!m) return null;
  const h = Number(m[1] ?? m[4]), min = Number(m[2] ?? m[5] ?? 0), ap = m[3] && m[3].toLowerCase();
  if (h > 23 || (ap && (h < 1 || h > 12))) return null;
  const hours = ap ? [h % 12 + (ap === "p" ? 12 : 0)] : h >= 13 || h === 0 ? [h] : h === 12 ? [12] : [h, h + 12];
  const rung = Date.parse(createdAt);
  for (const hh of hours) {
    const at = new Date(rung);
    at.setHours(hh, min, 0, 0);
    if (at.getTime() >= rung - 30 * 6e4) {
      return { at: at.toISOString(), rest: `${name.slice(0, m.index)} ${name.slice(m.index + m[0].length)}`.replace(/\s+/g, " ").trim() };
    }
  }
  return null;
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
  // but go in the bag, not on the food: on a counter sale they come off the
  // kitchen ticket and onto the front's list (an online order's stay, see
  // below). See the Packets list in square/README.md.
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
    // Not the usual meat: the usual one's name (the board highlights it).
    insteadOf: meatSwap(li),
    // An online order's packets stay on its items: the kitchen bags it all.
    mods: (li.modifiers || []).filter((m) => !(isPacket(m) && !online) && !isToGoMod(m)).map((m) =>
      Number(m.quantity) > 1 ? `${m.name} ×${Number(m.quantity)}` : m.name
    ),
    note: li.name && li.note ? li.note : null,
    toGo: (li.modifiers || []).some(isToGoMod) || lineToGo.get(li.uid) === true,
  });
  const food = lines.filter((li) => !NOT_FOOD.has(li.item_type));
  const isSkip = isSkipped;
  // items: what the kitchen makes. front: what the counter adds to the bag.
  // An online or DoorDash order is the kitchen's whole (client 2026-10-13:
  // the kitchen needs the full order): every item, drinks and chips too,
  // with its packets, and nothing on the front's list. Its Done is also
  // what tells Square it's ready.
  const items = food.filter((li) => online || !isSkip(li)).map(toItem);
  const front = online ? [] : food.filter(isSkip).map(toItem);
  // A counter sale's packets, totalled across the order: 2 burgers each
  // wanting ketchup is "2 Ketchup packet", one line.
  const packets = new Map();
  for (const li of online ? [] : food) {
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
  let dueAt = (f && f.pickup_details && f.pickup_details.pickup_at)
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
  // A counter order with a time in its name is due then, like a pickup.
  const wanted = !online && !table ? timeInName(ticketName, order.created_at) : null;
  const test = /^test\b/i.test(ticketName);
  if (wanted) dueAt = wanted.at;
  // DoorDash writes "Courier Name: ..." into the order's note once a Dasher
  // has taken it (seen 2026-10-21). Until then, and for no more than
  // dasherWaitMinutes, the kitchen doesn't see it: food made the minute it
  // comes in can sit for most of an hour waiting for a Dasher.
  const doordash = online && /doordash/i.test(`${(order.source && order.source.name) || ""} ${(f && f.delivery_details && f.delivery_details.courier_provider_name) || ""}`);
  const courier = doordash ? ((/Courier Name:\s*([^\r\n]+)/i.exec((details && details.note) || "") || [])[1] || "").trim() || null : null;
  const boardAt = onBoardAt(order, { dueAt, doordash, courier });
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
    label: table ? `Table ${table}` : (recipient && recipient.display_name) || (wanted ? wanted.rest : ticketName) || `#${receipt || order.id.slice(-4).toUpperCase()}`,
    table,
    test,
    source: (order.source && order.source.name) || null,
    createdAt: order.created_at,
    dueAt,
    // When it goes on the kitchen board, which the kitchen time counts
    // from; holdUntil is that time while a DoorDash order waits for a Dasher.
    boardAt,
    holdUntil: doordash && !courier && Date.parse(boardAt) > Date.now() ? boardAt : null,
    courier,
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

// When an order goes on the kitchen board: a DoorDash order when its
// Dasher is first seen or dasherWaitMinutes after it came in, whichever is
// first; one due later (a pickup, a time in the name) showAheadMinutes
// before it's due; anything else as it's rung up.
const courierSeen = new Map(); // order id -> when the board first saw its Dasher
function onBoardAt(order, { dueAt, doordash, courier }) {
  const created = Date.parse(order.created_at);
  let at = created;
  if (doordash) {
    at = created + cfg.dasherWaitMinutes * 6e4;
    if (courier) {
      if (!courierSeen.has(order.id)) courierSeen.set(order.id, Date.now());
      at = Math.min(at, courierSeen.get(order.id));
    }
  } else if (dueAt) at = Date.parse(dueAt) - cfg.showAheadMinutes * 6e4;
  return new Date(Math.max(created, at)).toISOString();
}

// Today's work only, on both screens: a stale order from yesterday that
// nobody closed in Square should not greet anyone every morning.
function outOfWindow(t, now, ahead = cfg.showAheadMinutes) {
  const due = Date.parse(t.dueAt || t.createdAt);
  if (due < startOfToday().getTime()) return "due before today";
  if (due > now + ahead * 6e4) return "pickup is more than " + ahead + " min away";
  return null;
}

// Off the kitchen board for good (done, canceled, ready), not just for now.
function goneReason(t) {
  if (bumped[t.id]) return "cleared with Done";
  if (canceled[t.id]) return "not paid; canceled at the front";
  // A Ready the board wrote itself follows Done/Undo, so Undo still
  // brings the ticket back after Square has been told.
  if (t.squareReady && !markedReady[t.id]) return "front already marked it prepared";
  return null;
}

// null if the ticket belongs on the kitchen board, else why not.
function hiddenReason(t, now) {
  const gone = goneReason(t);
  if (gone) return gone;
  if (t.holdUntil && now < Date.parse(t.holdUntil)) return `waiting for a Dasher (on the board by ${new Date(t.holdUntil).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} at the latest)`;
  return outOfWindow(t, now);
}

// When a ticket that's waiting goes on the kitchen board, for the WAIT
// UNTIL row: a DoorDash order waiting for its Dasher, or one due within
// waitRowMinutes but not yet showAheadMinutes. null for anything else.
function waitUntil(t, now) {
  if (goneReason(t) || !hiddenReason(t, now)) return null;
  if (t.holdUntil && now < Date.parse(t.holdUntil)) return t.holdUntil;
  if (outOfWindow(t, now, cfg.waitRowMinutes)) return null;
  return t.boardAt;
}

// null if the ticket belongs on /front, else why not. The front sees an
// order as soon as it's in the WAIT UNTIL row.
function frontHiddenReason(t, now) {
  if (handedOff[t.id]) return "handed off at the front";
  if (canceled[t.id]) return "not paid; canceled at the front";
  return outOfWindow(t, now, Math.max(cfg.showAheadMinutes, cfg.waitRowMinutes));
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

// Two or more orders rung under one table number: the counter rings people
// sitting together as separate orders, for speed. Each gets tableOf
// { n, of } ("1 of 2", in the order they were rung), so the kitchen sends
// them out together. Orders count as one table when each was rung within
// SAME_TABLE_MINUTES of the one before: a number handed out again later in
// the day starts a new group. An order canceled at the front doesn't count.
const SAME_TABLE_MINUTES = 15;
function markSameTable(list) {
  const byTable = new Map();
  for (const t of list) {
    delete t.tableOf;
    if (!t.table || canceled[t.id]) continue;
    if (!byTable.has(t.table)) byTable.set(t.table, []);
    byTable.get(t.table).push(t);
  }
  for (const group of byTable.values()) {
    group.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    let run = [];
    const close = () => { if (run.length > 1) run.forEach((t, i) => { t.tableOf = { n: i + 1, of: run.length }; }); };
    for (const t of group) {
      const prev = run[run.length - 1];
      if (prev && Date.parse(t.createdAt) - Date.parse(prev.createdAt) > SAME_TABLE_MINUTES * 6e4) { close(); run = []; }
      run.push(t);
    }
    close();
  }
}

module.exports = { NOT_FOOD, itemName, isOnline, toTicket, markSameTable, hiddenReason, waitUntil, frontHiddenReason, readyAt, orderDetail };
