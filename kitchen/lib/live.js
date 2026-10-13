// What the last good poll of Square found, shared by everything that shows
// or counts it (orders.js fills it in). The same object for as long as the
// program runs.
const live = {
  all: [], // every ticket from the last good poll, bumped or not
  todaysOrders: [], // every order from the last good poll, for the day's stats
  rejected: [], // orders Square returned that never became tickets, for /check
  rawOrders: new Map(), // id -> the order exactly as Square sent it, last poll (for /check)
  lastOkAt: null,
  lastError: null,
  demo: null, // { startedAt, until } while practice orders are showing
};

module.exports = { live };
