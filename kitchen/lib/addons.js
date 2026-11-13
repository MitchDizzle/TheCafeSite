// Items added to a counter order after the kitchen has it (client
// 2026-11-04): a phone order is rung and cooked, the customer comes in, orders
// something more, and it's added to the same order so they pay once. Square
// keeps it one order, so the new item used to slip onto the ticket unnoticed,
// or nowhere at all once the ticket was Done. Now the kitchen's items are
// written down the first time the board shows the order, and anything added
// after that comes up as a card of its own ("ADDED"), with the chime, its own
// Done, and its own place on the front page.
//
// Counter sales only: an online or DoorDash order isn't added to at the
// counter, and the board writes their status back to Square by order id.
// Drinks and anything else the kitchen leaves off never make a card: they
// stay on the order's front list as before. Each added lot is a card (id
// "<order id>+1", "+2"...), so a second addition never hides in the first.
const { NOT_FOOD, isSkipped, toTicket, hiddenReason } = require("./tickets");
const { kitchenLines, bumped, platesDone, canceled } = require("./state");

// A line item's key: Square's uid (each line has one), or its place on the
// order for anything without.
const lineKey = (li, i) => li.uid || `#${i}`;
const qtyOf = (li) => Number(li.quantity) || 1;
const isKitchen = (li) => !NOT_FOOD.has(li.item_type) && !isSkipped(li);

// The order's kitchen items: line key -> quantity.
function kitchenCounts(order) {
  const counts = {};
  (order.line_items || []).forEach((li, i) => {
    if (isKitchen(li)) counts[lineKey(li, i)] = (counts[lineKey(li, i)] || 0) + qtyOf(li);
  });
  return counts;
}

// The order with its kitchen lines cut down to `limit` (line key -> how
// many), and its other lines (drinks, packets' items) kept or dropped.
function cut(order, limit, keepOthers) {
  const line_items = [];
  (order.line_items || []).forEach((li, i) => {
    if (!isKitchen(li)) {
      if (keepOthers) line_items.push(li);
      return;
    }
    const qty = Math.min(qtyOf(li), limit[lineKey(li, i)] || 0);
    if (qty > 0) line_items.push({ ...li, quantity: String(qty) });
  });
  return { ...order, line_items };
}

// The tickets one order makes: its own (what the kitchen first saw) and a
// card for each lot added since. `changed`: kitchenLines was written to, so
// state.json wants saving.
// A counter order the board got late, timed from when it got it (client
// 2026-11-13: a sale from the Square Terminal sometimes came up already at
// 1:30 "waiting"). Square sometimes hands an order over a minute or two
// after it was rung up, and the kitchen can't start what it hasn't seen.
// `seen` is when the board first had it; an order already in Square when the
// board started (`seen` not written) keeps its rung-up time, and so does one
// seen more than SEEN_LATE_MS after it (the board was off, not Square slow).
// Not one due at a time: that goes by its time.
const SEEN_LATE_MS = 10 * 6e4;
function seenLate(order, rec) {
  if (!rec || !rec.seen) return 0;
  const lag = Date.parse(rec.seen) - Date.parse(order.created_at);
  return lag > 0 && lag < SEEN_LATE_MS ? lag : 0;
}
function fromSeen(order, ticket, rec) {
  if (ticket && !ticket.dueAt && seenLate(order, rec)) ticket.boardAt = rec.seen;
  return ticket;
}

// startup: the board's first look at Square since it started, when every
// order is new to it, so none is counted as seen late.
function splitAdded(order, ticket, now = Date.now(), { startup = false } = {}) {
  if (!ticket || ticket.kind !== "COUNTER" || ticket.demo) return { tickets: ticket ? [ticket] : [], changed: false };
  const at = new Date(now).toISOString();
  const rec = kitchenLines[order.id];
  if (!rec) {
    // Not on the board yet (a phone order waiting for its time): anything
    // added now is simply part of the order.
    if (hiddenReason(ticket, now) && !bumped[order.id] && !platesDone[order.id]) return { tickets: [ticket], changed: false };
    kitchenLines[order.id] = { at, lines: kitchenCounts(order), added: [], ...(startup ? {} : { seen: at }) };
    return { tickets: [fromSeen(order, ticket, kitchenLines[order.id])], changed: true };
  }
  // Canceled at the front: the whole order is off both screens.
  if (canceled[order.id]) return { tickets: [ticket], changed: false };

  let changed = false;
  const known = { ...rec.lines };
  for (const lot of rec.added) for (const [k, n] of Object.entries(lot.lines)) known[k] = (known[k] || 0) + n;
  const added = {};
  for (const [k, n] of Object.entries(kitchenCounts(order))) if (n > (known[k] || 0)) added[k] = n - (known[k] || 0);
  if (Object.keys(added).length) {
    rec.added.push({ at, lines: added });
    changed = true;
  }
  if (!rec.added.length) return { tickets: [fromSeen(order, ticket, rec)], changed };

  const tickets = [];
  const main = toTicket(cut(order, rec.lines, true)).ticket;
  if (main) tickets.push(fromSeen(order, main, rec));
  rec.added.forEach((lot, i) => {
    const t = toTicket(cut(order, lot.lines, false)).ticket;
    if (!t) return; // taken off the order again
    tickets.push(Object.assign(t, {
      id: `${order.id}+${i + 1}`,
      orderId: order.id,
      addOn: i + 1,
      // On the board from when it was added, and wanted now: the customer
      // is at the counter, whatever time the phone order was for.
      createdAt: lot.at,
      boardAt: lot.at,
      dueAt: null,
      leadMinutes: null,
      holdUntil: null,
      note: null, // the order's note is on its first card
    }));
  });
  return { tickets, changed };
}

module.exports = { splitAdded, kitchenCounts, seenLate };
