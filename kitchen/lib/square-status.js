// squareStatus (client 2026-10-12): the board writes what the kitchen and
// the front did back to Square, for online and delivery orders, so nobody
// has to open them on the POS. Counter sales are left alone: Square
// finishes them when they're paid.
//   - Done on the board, and readyDelaySeconds pass without Undo: Ready
//     (PREPARED). Square texts a Square Online customer; DoorDash hears the
//     food is waiting. Undo inside the delay and Square never hears of it.
//     Undo after it: the ticket still comes back on the board, but Square
//     stays Ready (the text has gone).
//   - Handed off pressed on the front page (by a person, not the 10-minute
//     auto-clear, which skips these orders): picked up (COMPLETED), after
//     the same delay, so the front's Undo can catch a wrong tap. The order
//     itself is then closed (COMPLETED) too, if it's paid: Square doesn't
//     close it when its fulfillment completes, and an order left OPEN is
//     missed by the sales reports (TASKS KB-20, 2026-10-23).
// A fulfillment only moves forward one state at a time, PROPOSED ->
// RESERVED -> PREPARED -> COMPLETED, each step read fresh from Square for
// its version. A failure is logged and tried again a minute later, five
// times at most; it never touches the tickets on either screen.
const { MOCK, cfg } = require("./config");
const { square } = require("./square");
const { live } = require("./live");
const { bumped, markedReady, byHand, markedDone, saveState } = require("./state");

const FLOW = ["PROPOSED", "RESERVED", "PREPARED", "COMPLETED"];
const markTries = {}; // orderId -> { n, at, error } (not saved)
const mockStates = new Map(); // test mode: orderId -> the state the board set
const mockClosed = new Set(); // test mode: orders the board closed
let syncing = false;

function withMockStates(orders) {
  for (const o of orders) {
    const state = mockStates.get(o.id);
    if (state && o.fulfillments && o.fulfillments[0]) {
      o.fulfillments[0].state = state;
    }
    if (mockClosed.has(o.id)) o.state = "COMPLETED";
  }
  return orders;
}

async function readOrder(id) {
  if (MOCK) {
    const o = live.rawOrders.get(id);
    return o && { ...o, version: 1 };
  }
  return (await square("GET", `/orders/${encodeURIComponent(id)}`)).order;
}

// Moves the order's first fulfillment forward to `target`. Returns the
// state it ends in.
async function moveFulfillment(id, target) {
  const want = FLOW.indexOf(target);
  for (let step = 0; step < FLOW.length; step++) {
    const order = await readOrder(id);
    const f = order && (order.fulfillments || [])[0];
    if (!f) throw new Error("it has no pickup or delivery step in Square");
    const at = FLOW.indexOf(f.state);
    if (at < 0) throw new Error(`Square has it as ${f.state.toLowerCase()}`);
    if (at >= want) {
      if (target === "COMPLETED") await closeOrder(order);
      return f.state;
    }
    const next = FLOW[at + 1];
    if (MOCK) { mockStates.set(id, next); live.rawOrders.get(id).fulfillments[0].state = next; continue; }
    await square("PUT", `/orders/${encodeURIComponent(id)}`, {
      idempotency_key: `kitchen-${id}-${next}`,
      order: { location_id: order.location_id, version: order.version, fulfillments: [{ uid: f.uid, state: next }] },
    });
  }
  return target;
}

// Closes a picked-up order in Square. Only an OPEN order with nothing left to
// pay: Square refuses to close one that isn't paid, and DoorDash closes its
// own deliveries, so those are already COMPLETED by now.
async function closeOrder(order) {
  if (order.state !== "OPEN") return;
  const due = (order.net_amount_due_money && order.net_amount_due_money.amount) || 0;
  if (due > 0) {
    console.log(`${new Date().toLocaleTimeString()}  order ...${order.id.slice(-4)}: picked up, but left open in Square: $${(due / 100).toFixed(2)} still to pay.`);
    return;
  }
  if (MOCK) { mockClosed.add(order.id); live.rawOrders.get(order.id).state = "COMPLETED"; return; }
  await square("PUT", `/orders/${encodeURIComponent(order.id)}`, {
    idempotency_key: `kitchen-${order.id}-closed`,
    order: { location_id: order.location_id, version: order.version, state: "COMPLETED" },
  });
}

async function mark(t, target, map, words) {
  const tries = markTries[`${t.id}:${target}`];
  if (tries && (tries.n >= 5 || Date.now() - tries.at < 6e4)) return;
  try {
    await moveFulfillment(t.id, target);
    map[t.id] = new Date().toISOString();
    delete markTries[`${t.id}:${target}`];
    saveState();
    console.log(`${new Date().toLocaleTimeString()}  order ...${t.id.slice(-4)} (${t.label}): ${words} in Square.`);
  } catch (err) {
    const n = ((tries && tries.n) || 0) + 1;
    markTries[`${t.id}:${target}`] = { n, at: Date.now(), error: err.message };
    if (!tries || tries.error !== err.message) console.error(`${new Date().toLocaleTimeString()}  order ...${t.id.slice(-4)} (${t.label}): couldn't mark it ${words} in Square (${err.message})${n >= 5 ? "; giving up, do it on the POS" : "; trying again in a minute"}.`);
    else if (n >= 5) console.error(`${new Date().toLocaleTimeString()}  order ...${t.id.slice(-4)}: giving up marking it ${words}; do it on the POS.`);
  }
}

async function syncSquare() {
  if (!cfg.squareStatus || syncing) return;
  syncing = true;
  try {
    const due = Date.now() - cfg.readyDelaySeconds * 1000;
    for (const t of live.all) {
      if (t.demo || t.kind === "COUNTER") continue;
      if (bumped[t.id] && !markedReady[t.id] && !t.squareReady && Date.parse(bumped[t.id]) <= due) {
        await mark(t, "PREPARED", markedReady, "ready");
      }
      if (byHand[t.id] && !markedDone[t.id] && Date.parse(byHand[t.id]) <= due) {
        await mark(t, "COMPLETED", markedDone, "picked up");
      }
    }
  } finally {
    syncing = false;
  }
}

module.exports = { withMockStates, syncSquare, moveFulfillment };
