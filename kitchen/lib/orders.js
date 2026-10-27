// Polling Square and what each screen is sent: the kitchen board's tickets
// (snapshot) and the front page's orders (frontSnapshot), Undo's lists, the
// ready orders that clear themselves, the demo, and Reset for the day.
const { MOCK, MUTE, cfg } = require("./config");
const { fetchOrders } = require("./square");
const { live } = require("./live");
const { bumped, platesDone, offBoard, handedOff, canceled, keepOnFront, autoOff, readySince, state, saveState } = require("./state");
const { toTicket, markSameTable, hiddenReason, waitUntil, frontHiddenReason, readyAt } = require("./tickets");
const { withMockStates } = require("./square-status");
const { statsToday, recordHistory } = require("./stats");
const { DEMO_MINUTES, isDemo, mockOrders, demoOrders } = require("./mock");
const { screenView } = require("./reservations");

// Everything cleared that could come back, newest first: what Undo offers.
// Kept on the server, so Undo still works after the page or PC restarts.
// `main` is the first thing on the order, so a list of them can be told
// apart ("#4F2A · Cheeseburger"). Nothing from before a Reset for the day.
function undoList(map, plates) {
  const byId = new Map(live.all.map((t) => [t.id, t]));
  const floor = state.undoFloor ? Date.parse(state.undoFloor) : 0;
  return Object.keys(map)
    .filter((id) => byId.has(id) && Date.parse(map[id]) > floor)
    .sort((a, b) => Date.parse(map[b]) - Date.parse(map[a]))
    .slice(0, 12)
    .map((id) => {
      const t = byId.get(id);
      const first = t.items[0] || t.front[0];
      return { id, label: plates && !bumped[id] ? `${t.label} plates` : t.label, main: first ? first.name : "", at: map[id] };
    });
}

// What Done cleared on the board: whole tickets, and the plates of a
// ticket whose to-go part is still on it.
const boardCleared = () => undoList({ ...platesDone, ...bumped }, true);

// The most recently bumped ticket that could come back: what Undo restores.
function lastCleared() {
  return boardCleared()[0] || null;
}

// The most recent hand-off that could come back: what Undo on /front restores.
function lastHandedOff() {
  return undoList(handedOff)[0] || null;
}

let pollTimer = null;
let nextPollAt = null; // when the next scheduled Square check runs, for the board's countdown ring
let polling = null; // the in-flight poll, so "check now" never runs two at once
const logged = new Set(); // order ids already announced in the console

// Someone has the front page or the phone page open: they ask the kitchen
// PC for orders every few seconds, so after hours that's someone working
// (an order rung after 2pm, testing), and Square is checked at full speed
// until they've been gone WATCH_MS (client 2026-10-27: the front page took
// up to 5 minutes to show a change). The board's own screen doesn't count:
// it's on all the time.
const WATCH_MS = 2 * 6e4;
let watchedAt = 0;
function watched() {
  const wasIdle = Date.now() - watchedAt > WATCH_MS;
  watchedAt = Date.now();
  // Back from the quiet pace now, not when the 5-minute wait runs out.
  if (wasIdle && pollEvery > cfg.pollSeconds) poll();
}

// Seconds to the next check: pollSeconds in the kitchen's hours (or while
// someone has the front page open), and quietPollSeconds otherwise, but
// never past the moment the hours start.
function pollDelay(now = new Date()) {
  const [from, to] = cfg.kitchenHours;
  const open = (d) => cfg.openDays.includes(d.getDay()) && d.getHours() >= from && d.getHours() < to;
  if (open(now) || live.demo || Date.now() - watchedAt < WATCH_MS) return cfg.pollSeconds; // a demo moves as fast as real orders
  const next = new Date(now);
  next.setHours(from, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  while (!cfg.openDays.includes(next.getDay()) && next - now < 8 * 864e5) next.setDate(next.getDate() + 1);
  return Math.max(cfg.pollSeconds, Math.min(cfg.quietPollSeconds, Math.ceil((next - now) / 1000)));
}
let pollEvery = cfg.pollSeconds; // the wait before the check now scheduled

function poll() {
  if (polling) return polling;
  clearTimeout(pollTimer);
  polling = pollOnce().finally(() => {
    polling = null;
    const every = pollDelay();
    if (every !== pollEvery) console.log(`${new Date().toLocaleTimeString()}  checking Square every ${every >= 60 ? `${Math.round(every / 60)} min` : `${every} s`}`);
    pollEvery = every;
    pollTimer = setTimeout(poll, every * 1000);
    nextPollAt = new Date(Date.now() + every * 1000).toISOString();
  });
  return polling;
}

async function pollOnce() {
  try {
    const real = MOCK ? withMockStates(mockOrders()) : await fetchOrders();
    live.todaysOrders = real; // the stats never see demo orders
    if (live.demo && Date.now() > Date.parse(live.demo.until)) endDemo();
    const orders = live.demo ? [...real, ...demoOrders(Date.parse(live.demo.startedAt))] : real;
    live.rawOrders = new Map(real.map((o) => [o.id, o]));
    const seen = new Set();
    live.all = [];
    live.rejected = [];
    for (const o of orders) {
      if (seen.has(o.id)) continue;
      seen.add(o.id);
      const { ticket, reason } = toTicket(o);
      if (ticket) {
        if (isDemo(o.id)) ticket.demo = true;
        live.all.push(ticket);
      } else live.rejected.push({ order: o, reason });
      if (!logged.has(o.id) && !isDemo(o.id)) {
        logged.add(o.id);
        const why = ticket ? hiddenReason(ticket, Date.now()) : reason;
        console.log(
          `${new Date().toLocaleTimeString()}  order ...${o.id.slice(-4)}: ` +
            (why ? `not shown (${why})` : "on the board")
        );
      }
    }
    markSameTable(live.all);
    live.lastOkAt = new Date().toISOString();
    if (live.lastError) console.log("Square connection restored");
    live.lastError = null;
    autoHandoff();
    recordHistory();
  } catch (err) {
    if (err.message !== live.lastError) console.error(new Date().toLocaleTimeString(), err.message);
    live.lastError = err.message; // keep showing the last good tickets
  }
}

function snapshot() {
  const now = Date.now();
  const tickets = live.all
    .filter((t) => !hiddenReason(t, now))
    .map((t) => ({ ...t, platesDone: platesDone[t.id] || null }))
    .sort((a, b) => Date.parse(a.dueAt || a.createdAt) - Date.parse(b.dueAt || b.createdAt));
  // The WAIT UNTIL row: what comes on the board next, soonest first.
  const waiting = live.all
    .map((t) => ({ ...t, waitUntil: waitUntil(t, now) }))
    .filter((t) => t.waitUntil)
    .sort((a, b) => Date.parse(a.waitUntil) - Date.parse(b.waitUntil));
  return { tickets, waiting, lastOkAt: live.lastOkAt, error: live.lastError, mock: MOCK, sound: cfg.sound && !MUTE, lastCleared: lastCleared(),
    clearedList: boardCleared(), stats: statsToday(), demo: live.demo, pollSeconds: pollEvery, nextPollAt, checking: !!polling,
    reservations: screenView() };
}

// A ready order nobody pressed Handed off for clears itself off the front
// page after cfg.autoHandoffMinutes, as if they had: one person watches the
// front, and a list of finished orders hides the ones that aren't. Never an
// unpaid order (money is still owed), never an online order the front hasn't
// marked ready in Square (that's what texts the customer), and never one
// brought back with Undo. Timed from when it turned ready: the kitchen's
// Done, or for anything else the first poll that saw it ready.
function autoHandoff() {
  if (!cfg.autoHandoffMinutes) return;
  const now = Date.now();
  const cleared = [];
  for (const t of live.all) {
    const ready = readyAt(t);
    if (!ready) { delete readySince[t.id]; continue; }
    if (!readySince[t.id]) readySince[t.id] = bumped[t.id] ? Date.parse(bumped[t.id]) : now;
    if (handedOff[t.id] || canceled[t.id] || keepOnFront[t.id]) continue;
    // Online orders wait for a person while the board tells Square: their
    // Handed off is what marks them picked up there.
    if (t.unpaid || (t.kind !== "COUNTER" && (cfg.squareStatus || !t.squareReady))) continue;
    if (now - readySince[t.id] < cfg.autoHandoffMinutes * 6e4) continue;
    handedOff[t.id] = new Date(now).toISOString();
    autoOff.add(t.id);
    cleared.push(t.label);
  }
  if (cleared.length) {
    saveState();
    console.log(`${new Date().toLocaleTimeString()}  front page: ready ${cfg.autoHandoffMinutes}+ min, cleared by itself: ${cleared.join(", ")}`);
  }
}

// /front: ready orders first, oldest-ready at the top (the one waiting
// longest on the counter), then what's still cooking in board order.
function frontSnapshot() {
  const now = Date.now();
  const orders = live.all
    .filter((t) => !frontHiddenReason(t, now))
    .map((t) => ({ ...t, readyAt: readyAt(t), platesDone: platesDone[t.id] || null, autoSquare: !!cfg.squareStatus && !t.demo }))
    .sort((a, b) => {
      if (!!a.readyAt !== !!b.readyAt) return a.readyAt ? -1 : 1;
      if (a.readyAt) return Date.parse(a.readyAt) - Date.parse(b.readyAt);
      return Date.parse(a.dueAt || a.createdAt) - Date.parse(b.dueAt || b.createdAt);
    });
  return { orders, lastOkAt: live.lastOkAt, error: live.lastError, mock: MOCK, lastHandedOff: lastHandedOff(),
    handedOffList: undoList(handedOff).map((h) => ({ ...h, auto: autoOff.has(h.id) })), stats: statsToday(), demo: live.demo,
    updatePin: !!cfg.updatePin, pollSeconds: pollEvery, autoHandoffMinutes: cfg.autoHandoffMinutes,
    reservations: screenView() };
}

// ---------------------------------------------------------------- demo

function startDemo() {
  const now = Date.now();
  live.demo = { startedAt: new Date(now).toISOString(), until: new Date(now + DEMO_MINUTES * 6e4).toISOString() };
  console.log(`Demo started (${new Date().toLocaleTimeString()}): practice orders for ${DEMO_MINUTES} min.`);
}

function endDemo() {
  live.demo = null;
  for (const map of [bumped, platesDone, offBoard, handedOff, canceled]) for (const id of Object.keys(map)) if (isDemo(id)) delete map[id];
  console.log(`Demo ended (${new Date().toLocaleTimeString()}).`);
}

// Reset for the day: the Undo lists empty and today's stats start from
// now. With clearBoard, every order on the board and the front page is
// cleared too, for the morning after testing. Cleared at the same instant
// as the floor, so none of them can be brought back with Undo either.
function resetDay(clearBoard, from) {
  const now = new Date().toISOString();
  state.undoFloor = now;
  state.statsFloor = now;
  if (clearBoard) {
    for (const t of live.all) {
      if (!bumped[t.id]) bumped[t.id] = now;
      if (!handedOff[t.id]) handedOff[t.id] = now;
    }
  }
  saveState();
  console.log(`Reset for the day from ${from} (${new Date().toLocaleTimeString()})${clearBoard ? ", board cleared" : ""}.`);
}

module.exports = { poll, pollDelay, watched, snapshot, frontSnapshot, lastCleared, lastHandedOff, startDemo, endDemo, resetDay };
