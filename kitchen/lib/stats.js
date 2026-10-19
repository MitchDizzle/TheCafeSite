// The day so far, for /front and the board's Settings. Breakfast or lunch is
// by the clock, as the menu draws it: rung up (or due, for a pickup) before
// BREAKFAST_ENDS is breakfast. Counted from Square's orders, so an online
// order the front has already handed over still counts. Canceled orders and
// unpaid open checks don't.
const fs = require("fs");
const path = require("path");
const { DATA, MOCK } = require("./config");
const { startOfToday, localDate } = require("./util");
const { live } = require("./live");
const { bumped, offBoard, state } = require("./state");
const { NOT_FOOD, itemName, isOnline } = require("./tickets");
const { mockHistory } = require("./mock");

const BREAKFAST_ENDS = 11; // hour, local time

// One record per order that counts today, the same orders the numbers are
// made from. These are what the daily history keeps (see recordHistory), so
// any report can be made later from them, not only the numbers shown now.
// No customer names: the ticket's label is left out on purpose.
function dayRecords() {
  // From midnight, or from the last Reset for the day if that was today.
  const today = Math.max(startOfToday().getTime(), state.statsFloor ? Date.parse(state.statsFloor) : 0);
  const tomorrow = startOfToday().getTime() + 864e5;
  const tickets = new Map(live.all.filter((t) => !t.demo).map((t) => [t.id, t]));
  const seen = new Set();
  const out = [];
  for (const o of live.todaysOrders) {
    if (seen.has(o.id)) continue;
    seen.add(o.id);
    const f = (o.fulfillments || [])[0];
    if (o.state === "CANCELED" || (f && (f.state === "CANCELED" || f.state === "FAILED"))) continue;
    if (o.state === "OPEN" && !(o.tenders || []).length && !(f && f.pickup_details && f.pickup_details.pickup_at)) continue;
    if (/^test\b/i.test((o.ticket_name || "").trim())) continue; // a practice order
    const when = Date.parse((f && f.pickup_details && f.pickup_details.pickup_at) || o.created_at);
    if (when < today || when >= tomorrow) continue;
    const food = (o.line_items || []).filter((li) => !NOT_FOOD.has(li.item_type));
    if (!food.length) continue;
    const online = isOnline(o, f);
    const t = tickets.get(o.id);
    // Time in the kitchen: rung up to Done, counter orders only. A pickup's
    // order time can be hours before it's started, so it would skew this.
    // Time a ticket sat cleared before an Undo doesn't count.
    let kitchenMinutes = null;
    if (t && !online && bumped[o.id]) {
      const m = (Date.parse(bumped[o.id]) - Date.parse(o.created_at) - ((offBoard[o.id] && offBoard[o.id].ms) || 0)) / 6e4;
      if (m >= 0 && m < 240) kitchenMinutes = Math.round(m * 10) / 10;
    }
    out.push({
      id: o.id,
      at: new Date(when).toISOString(),
      meal: new Date(when).getHours() < BREAKFAST_ENDS ? "breakfast" : "lunch",
      online,
      toGo: t ? t.toGo : online,
      paid: !!(o.tenders || []).length,
      sales: o.total_money && o.total_money.amount != null ? o.total_money.amount / 100 : null,
      items: food.map((li) => ({
        name: itemName(li),
        variation: li.variation_name && li.variation_name !== "Regular" ? li.variation_name : null,
        qty: Number(li.quantity) || 1,
      })),
      done: !!bumped[o.id],
      kitchenMinutes,
    });
  }
  return out;
}

// The numbers for a list of records: one day's (the front's Today) or any
// range's (Reports). Same shape either way.
function summarize(records) {
  const out = { orders: records.length, breakfast: 0, lunch: 0, counter: 0, online: 0, toGo: 0, forHere: 0,
    kitchenDone: 0, avgMinutes: null, longestMinutes: null, sales: 0, avgTicket: null, items: [], topItems: [], byHour: {} };
  const qty = new Map();
  const times = [];
  let priced = 0;
  for (const r of records) {
    out[r.meal]++;
    out[r.online ? "online" : "counter"]++;
    out[r.toGo ? "toGo" : "forHere"]++;
    if (r.done) out.kitchenDone++;
    if (r.kitchenMinutes != null) times.push(r.kitchenMinutes);
    out.sales += r.sales || 0;
    if (r.sales != null) priced++;
    const h = new Date(r.at).getHours();
    out.byHour[h] = (out.byHour[h] || 0) + 1;
    for (const it of r.items) qty.set(it.name, (qty.get(it.name) || 0) + it.qty);
  }
  out.sales = Math.round(out.sales * 100) / 100;
  if (priced) out.avgTicket = Math.round((out.sales / priced) * 100) / 100;
  if (times.length) {
    out.avgMinutes = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
    out.longestMinutes = Math.round(Math.max(...times));
  }
  out.items = [...qty].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name, n]) => ({ name, qty: n }));
  out.topItems = out.items.slice(0, 5);
  return out;
}

// The full item list stays out: the screens poll this every few seconds
// and show only the top five.
function statsToday() {
  const { items, ...today } = summarize(dayRecords());
  return today;
}

// ---------------------------------------------------------------- daily history

// Every day's records, kept for good in stats-history.json (gitignored) so
// a week, a month or any range can be reported on later: Manage -> Reports
// on the front page, or the file itself. Today's entry is rewritten as the
// day goes (at most every HISTORY_SECONDS), so nothing waits on the board
// being closed properly at night. A day the board never ran is missing.
// Counts from the same orders as Today, so a Reset for the day restarts
// that day's history too, and test and demo orders never get in.
const HISTORY_FILE = path.join(DATA, MOCK ? "stats-history-mock.json" : "stats-history.json");
const HISTORY_SECONDS = 30;
let history = { days: {} };
try {
  history = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"));
  if (!history.days) history.days = {};
} catch {}
// Test mode: four made-up weeks before today, so /today and Reports have
// something to compare with. Only in the test mode's own history file.
if (MOCK) history.days = { ...mockHistory(localDate()), ...history.days };
let historyWrittenAt = 0;
let historyLast = "";

function recordHistory() {
  if (Date.now() - historyWrittenAt < HISTORY_SECONDS * 1000) return;
  const records = dayRecords();
  if (!records.length) return;
  const json = JSON.stringify(records);
  if (json === historyLast) return;
  const date = localDate();
  history.days[date] = { savedAt: new Date().toISOString(), orders: records };
  try {
    // Write the copy whole, then swap it in: a power cut mid-write never
    // leaves a half-written history.
    fs.writeFileSync(HISTORY_FILE + ".tmp", JSON.stringify(history));
    fs.renameSync(HISTORY_FILE + ".tmp", HISTORY_FILE);
    historyLast = json;
    historyWrittenAt = Date.now();
  } catch (err) {
    console.error(`Stats history: ${err.message}`);
  }
}

// Today written now, however recently it last was: a report that ends today
// is up to the minute.
function recordHistoryNow() {
  historyWrittenAt = 0;
  recordHistory();
}

// Manage -> Reports: the days in [from, to], each with its numbers, and the
// numbers for the whole range. `orders` (every record) only when asked, for
// the CSV download.
function historyReport(from, to, withOrders) {
  const dates = Object.keys(history.days).filter((d) => d >= from && d <= to).sort();
  const days = dates.map((date) => ({ date, ...summarize(history.days[date].orders) }));
  const records = dates.flatMap((d) => history.days[d].orders);
  const out = { from, to, first: Object.keys(history.days).sort()[0] || null, days, total: summarize(records) };
  if (withOrders) out.orders = dates.flatMap((date) => history.days[date].orders.map((r) => ({ date, ...r })));
  return out;
}

// ---------------------------------------------------------------- the phone page

// /today, for the owner's phone, on the wifi or away from the shop: today's
// numbers beside the same weekday before, from the daily history. "By now"
// counts the orders up to this time of day on both days, so a morning is
// compared with a morning; a pickup due later today is in today's numbers
// but not in its "by now". The weeks before are what the history has (a day
// the board never ran is missing, and then simply isn't compared).
const COMPARE_WEEKS = 4;
const minuteOfDay = (iso) => { const d = new Date(iso); return d.getHours() * 60 + d.getMinutes(); };
const shiftDate = (date, n) => { const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() + n); return localDate(d); };
const brief = (records) => { const s = summarize(records); return { orders: s.orders, sales: s.sales, avgTicket: s.avgTicket }; };

function todayView(now = new Date(), records = dayRecords(), days = history.days) {
  const date = localDate(now);
  const cut = now.getHours() * 60 + now.getMinutes();
  const byNow = (rs) => rs.filter((r) => minuteOfDay(r.at) <= cut);
  const dayOf = (d) => (d !== date && days[d] ? days[d].orders : null);
  const { items, ...today } = summarize(records);
  today.items = items.slice(0, 10);
  const later = records.filter((r) => Date.parse(r.at) > now.getTime());

  // The same weekday in each of the weeks before.
  const before = [];
  for (let w = 1; w <= COMPARE_WEEKS; w++) {
    const d = shiftDate(date, -7 * w);
    const rs = dayOf(d);
    if (rs) before.push({ date: d, byNow: brief(byNow(rs)), allDay: brief(rs), byHour: summarize(rs).byHour });
  }
  const lastWeek = before[0] && before[0].date === shiftDate(date, -7) ? before[0] : null;
  // A usual day: the average of the weeks before, from two of them up.
  const avg = (list, key) => ({
    orders: Math.round(list.reduce((a, b) => a + b[key].orders, 0) / list.length),
    sales: Math.round((list.reduce((a, b) => a + b[key].sales, 0) / list.length) * 100) / 100,
  });
  const usual = before.length >= 2 ? { weeks: before.length, byNow: avg(before, "byNow"), allDay: avg(before, "allDay") } : null;

  // The week so far (Monday on), by now, against last week's to the same
  // weekday and time.
  const monday = shiftDate(date, -((new Date(`${date}T12:00:00`).getDay() + 6) % 7));
  const weekRecords = (from, to, last) => {
    const out = [];
    let found = 0;
    for (let d = from; d < to; d = shiftDate(d, 1)) {
      const rs = dayOf(d);
      if (rs) { out.push(...rs); found++; }
    }
    const lastDay = last === date ? records : dayOf(last);
    if (lastDay) { out.push(...byNow(lastDay)); found++; }
    return found ? out : null;
  };
  const lastWeekRecords = weekRecords(shiftDate(monday, -7), shiftDate(date, -7), shiftDate(date, -7));
  const week = {
    from: monday,
    thisWeek: brief(weekRecords(monday, date, date)),
    lastWeek: lastWeekRecords ? brief(lastWeekRecords) : null,
  };

  return { date, at: now.toISOString(), today, byNow: brief(byNow(records)),
    later: later.length ? brief(later) : null, lastWeek, usual, week };
}

module.exports = { statsToday, recordHistory, recordHistoryNow, historyReport, todayView, summarize };
