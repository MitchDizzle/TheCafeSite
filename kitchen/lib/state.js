// What the kitchen and the front have pressed (Done, Handed off, Canceled,
// Undo), what Square has been told, and the skip list: kept in state.json
// (gitignored), so it all survives a restart.
//
// The maps below are the same objects for as long as the program runs (they
// are filled in place, never replaced), so every module can hold on to them.
const fs = require("fs");
const path = require("path");
const { DATA, MOCK, cfg } = require("./config");
const { isDemo } = require("./mock");

const STATE_FILE = path.join(DATA, MOCK ? "state-mock.json" : "state.json");

const bumped = {}; // orderId -> ISO time a cook pressed Done (kitchen board)
// orderId -> { ms, at }: how long a ticket sat cleared before Undo brought it
// back, and when. Taken off its kitchen time, so a ticket undone and Done
// again counts only its time on the board, not the gap, in the stats.
const offBoard = {};

// Undo on the board: back on the screen, with the time it spent cleared kept
// out of the stats.
function unbump(id) {
  if (!bumped[id]) return;
  const now = Date.now();
  const gap = Math.max(0, now - Date.parse(bumped[id]));
  offBoard[id] = { ms: ((offBoard[id] && offBoard[id].ms) || 0) + gap, at: new Date(now).toISOString() };
  delete bumped[id];
}

const handedOff = {}; // orderId -> ISO time the front pressed Handed off (/front)
const canceled = {}; // orderId -> ISO time the front took an unpaid order off both screens
// orderId -> ISO time the front brought it back with Undo after it cleared
// itself (autoHandoffMinutes): it stays until someone hands it off by hand.
const keepOnFront = {};
// Square status written by the board (squareStatus): orderId -> ISO time.
// markedReady: Done turned into Ready in Square. byHand: Handed off pressed
// by a person (not the auto-clear), so Square may be told it was picked up.
// markedDone: Square told it was picked up.
const markedReady = {};
const byHand = {};
const markedDone = {};
const autoOff = new Set(); // ids cleared by autoHandoff, so Undo can say so
const readySince = {}; // orderId -> ms first seen ready, for autoHandoff (not saved)

const state = {
  // What the kitchen never makes: item names and whole Square categories.
  // Edited live from /front (Manage -> Leave off kitchen tickets) and kept in
  // state.json. config.json's skipItems is only the starting list, used until
  // the first edit.
  skip: { items: [], categories: [] },
  skipEdited: false, // false: still config.json's list, not written to state.json
  // "Reset for the day" (board Settings): nothing cleared before this time
  // can be brought back with Undo, on either screen. Stats are not affected.
  undoFloor: null,
  // Today's stats count from here (also set by Reset for the day), so test
  // orders rung up before opening don't count.
  statsFloor: null,
};

function loadState() {
  try {
    const saved = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    Object.assign(bumped, saved.bumped || {});
    Object.assign(offBoard, saved.offBoard || {});
    Object.assign(handedOff, saved.handedOff || {});
    Object.assign(canceled, saved.canceled || {});
    Object.assign(keepOnFront, saved.keepOnFront || {});
    Object.assign(markedReady, saved.markedReady || {});
    Object.assign(byHand, saved.byHand || {});
    Object.assign(markedDone, saved.markedDone || {});
    state.skipEdited = !!saved.skip;
    state.skip = saved.skip || { items: cfg.skipItems, categories: [] };
    state.undoFloor = saved.undoFloor || null;
    state.statsFloor = saved.statsFloor || null;
  } catch {
    state.skip = { items: cfg.skipItems, categories: [] };
    state.undoFloor = null;
    state.statsFloor = null;
  }
}

function saveState() {
  // Three days is plenty; nothing older can reappear on either screen anyway.
  const cutoff = Date.now() - 3 * 864e5;
  for (const map of [bumped, handedOff, canceled, keepOnFront, markedReady, byHand, markedDone]) {
    for (const [id, at] of Object.entries(map)) {
      if (Date.parse(at) < cutoff) delete map[id];
    }
  }
  for (const [id, o] of Object.entries(offBoard)) if (Date.parse(o.at) < cutoff) delete offBoard[id];
  // Demo tickets are practice: never written down, gone when the demo ends.
  const real = (map) => Object.fromEntries(Object.entries(map).filter(([id]) => !isDemo(id)));
  fs.writeFileSync(STATE_FILE, JSON.stringify({ bumped: real(bumped), offBoard: real(offBoard), handedOff: real(handedOff), canceled: real(canceled), keepOnFront: real(keepOnFront), markedReady: real(markedReady), byHand: real(byHand), markedDone: real(markedDone), skip: state.skipEdited ? state.skip : undefined, undoFloor: state.undoFloor, statsFloor: state.statsFloor }, null, 2));
}

loadState();

// The skip list in lower case, for matching (isSkipped in tickets.js).
const lowerSet = (list) => new Set(list.map((x) => String(x).trim().toLowerCase()));
const skipSets = { items: new Set(), categories: new Set() };
function setSkip(next) {
  const clean = (list) => [...new Set((Array.isArray(list) ? list : []).map((x) => String(x).trim()).filter(Boolean))];
  state.skip = { items: clean(next.items), categories: clean(next.categories) };
  skipSets.items = lowerSet(state.skip.items);
  skipSets.categories = lowerSet(state.skip.categories);
}
setSkip(state.skip);

const skipSummary = () => [...state.skip.categories.map((c) => `all of ${c}`), ...state.skip.items].join(", ") || "nothing";

module.exports = {
  bumped, offBoard, handedOff, canceled, keepOnFront, markedReady, byHand, markedDone, autoOff, readySince,
  state, unbump, saveState, setSkip, skipSets, skipSummary,
};
