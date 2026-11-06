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
const { bumped, platesDone, offBoard, byHand, state } = require("./state");
const { NOT_FOOD, itemName, isOnline, isSkipped } = require("./tickets");
const { mockHistory } = require("./mock");
const lead = require("./lead");

// Minutes after midnight, local time: 10:30am (Mitch 2026-11-06; 11am
// until then). Every split is worked out from an order's time with mealOf,
// days already saved too, so a report never mixes the two cutoffs.
const BREAKFAST_ENDS = 10 * 60 + 30;
const mealOf = (iso) => { const d = new Date(iso); return d.getHours() * 60 + d.getMinutes() < BREAKFAST_ENDS ? "breakfast" : "lunch"; };

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
    const net = netSales(o);
    if (!food.length && !net) continue;
    const online = isOnline(o, f);
    const t = tickets.get(o.id);
    // Time in the kitchen: from when it went on the kitchen board to Done,
    // so a pickup ordered hours ahead or a DoorDash order waiting for its
    // Dasher counts only its time on the board (counter orders only until
    // 2026-10-21, timed from when they were rung). Time a ticket sat
    // cleared before an Undo doesn't count. A For Here ticket with items to
    // go is timed to its plates (the first Done): the bag comes later.
    let kitchenMinutes = null;
    const doneAt = platesDone[o.id] || bumped[o.id];
    if (t && doneAt) {
      const m = (Date.parse(doneAt) - Date.parse(t.boardAt || o.created_at) - ((offBoard[o.id] && offBoard[o.id].ms) || 0)) / 6e4;
      if (m >= 0 && m < 240) kitchenMinutes = Math.round(m * 10) / 10;
    }
    // An online order's wait at the front: Done to Handed off, pressed by a
    // person (not the automatic hand-off). For DoorDash it's the Dasher's
    // wait, kept apart from the kitchen's time (from 2026-11-02).
    let waitMinutes = null;
    if (online && doneAt && byHand[o.id]) {
      const m = (Date.parse(byHand[o.id]) - Date.parse(doneAt)) / 6e4;
      if (m >= 0 && m < 240) waitMinutes = Math.round(m * 10) / 10;
    }
    const tender = (o.tenders || [])[0];
    out.push({
      id: o.id,
      // The number on the receipt (as the board shows a ticket with no
      // name), to find the order in Square from Reports.
      receipt: tender && tender.id ? tender.id.slice(0, 4).toUpperCase() : null,
      at: new Date(when).toISOString(),
      meal: mealOf(when),
      online,
      doordash: online ? isDoorDash(o, f) : false,
      toGo: t ? t.toGo : online,
      paid: !!(o.tenders || []).length,
      // What the customer paid, tax and tip in, and Square's Net sales.
      sales: o.total_money && o.total_money.amount != null ? o.total_money.amount / 100 : null,
      net,
      tip: tipOf(o),
      items: food.map((li) => ({
        name: itemName(li),
        variation: li.variation_name && li.variation_name !== "Regular" ? li.variation_name : null,
        qty: Number(li.quantity) || 1,
      })),
      done: !!(bumped[o.id] || platesDone[o.id]),
      // What the kitchen made (5 x a wrap is 5; drinks and chips at the
      // front aren't), for the time by order size (lib/lead.js).
      kitchenItems: t ? t.items.reduce((n, it) => n + it.qty, 0) : null,
      kitchenMinutes,
      waitMinutes,
    });
  }
  return out;
}

const isDoorDash = (o, f) => /doordash/i.test(`${(o.source && o.source.name) || ""} ${(f && f.delivery_details && f.delivery_details.courier_provider_name) || ""}`);

// Square's Net sales for an order: what its items sold for after discounts,
// without tax, tips, service charges or gift cards sold, as Square's
// Dashboard counts sales (client 2026-10-27: the board counted each order's
// total, tax and tip in, so it ran about 15% over Square). A keypad (custom
// amount) sale counts here though the kitchen never sees it.
function netSales(o) {
  const cents = (o.line_items || [])
    .filter((li) => li.item_type !== "GIFT_CARD")
    .reduce((a, li) => a + ((li.gross_sales_money && li.gross_sales_money.amount) || 0) - ((li.total_discount_money && li.total_discount_money.amount) || 0), 0);
  return Math.round(cents) / 100;
}

const tipOf = (o) => ((o.total_tip_money && o.total_tip_money.amount) || 0) / 100;

// A day's order, as sales: Net sales, or its total for an order saved
// before the board kept Net sales and not yet filled in (fillNet).
const netOf = (r) => (r.net != null ? r.net : r.sales != null ? r.sales : 0);

// A dish as Reports lists it: the daily items by what they were that day
// (Square keeps it as the variation: "Meatloaf", "Cup · Ham & Beans").
const DISH_MIN_ORDERS = 3; // fewer timed orders than this says nothing
function dishName(it) {
  const v = it.variation || "";
  if (/^lunch special$/i.test(it.name) && v) return `Lunch Special: ${v}`;
  if (/^soup of the day$/i.test(it.name)) {
    const m = /^(cup|bowl)\s*·\s*(.+)$/i.exec(v);
    if (m) return `Soup: ${m[2]}`;
  }
  return it.name;
}

// One order, as a stat's detail shows it: what and when, never who.
const orderBrief = (r) => ({
  at: r.at, receipt: r.receipt || null, where: r.doordash ? "DoorDash" : r.online ? "Online" : "Counter", toGo: r.toGo,
  kitchenItems: r.kitchenItems, kitchenMinutes: r.kitchenMinutes,
  items: r.items.map((i) => `${i.qty > 1 ? `${i.qty} ` : ""}${i.name}${i.variation ? ` (${i.variation})` : ""}`),
});

// The numbers for a list of records: one day's (the front's Today) or any
// range's (Reports). Same shape either way.
function summarize(records) {
  const out = { orders: records.length, breakfast: 0, lunch: 0, counter: 0, online: 0, toGo: 0, forHere: 0,
    kitchenDone: 0, avgMinutes: null, longestMinutes: null, sales: 0, collected: 0, tips: 0, tipped: 0, avgTicket: null, items: [], topItems: [], byHour: {} };
  const qty = new Map();
  const times = [];
  const bySize = lead.SIZES.map(() => []);
  let priced = 0;
  for (const r of records) {
    out[mealOf(r.at)]++;
    out[r.online ? "online" : "counter"]++;
    out[r.toGo ? "toGo" : "forHere"]++;
    if (r.done) out.kitchenDone++;
    if (r.kitchenMinutes != null) {
      times.push(r.kitchenMinutes);
      const n = lead.itemsOf(r);
      if (n > 0) bySize[lead.sizeOf(n)].push(r.kitchenMinutes);
    }
    out.sales += netOf(r);
    out.collected += r.sales || 0;
    if (r.tip) { out.tips += r.tip; out.tipped++; }
    if (r.sales != null) priced++;
    const h = new Date(r.at).getHours();
    out.byHour[h] = (out.byHour[h] || 0) + 1;
    for (const it of r.items) qty.set(it.name, (qty.get(it.name) || 0) + it.qty);
  }
  out.sales = Math.round(out.sales * 100) / 100;
  out.collected = Math.round(out.collected * 100) / 100;
  out.tips = Math.round(out.tips * 100) / 100;
  if (priced) out.avgTicket = Math.round((out.sales / priced) * 100) / 100;
  if (times.length) {
    out.avgMinutes = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
    out.longestMinutes = Math.round(Math.max(...times));
  }
  out.items = [...qty].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name, n]) => ({ name, qty: n }));
  out.topItems = out.items.slice(0, 5);
  // Behind the times, for a tap or a hover on them (Mitch 2026-11-02): the
  // slowest orders, the dishes whose orders took longest, and the kitchen's
  // time hour by hour.
  const timed = records.filter((r) => r.kitchenMinutes != null);
  out.slowest = [...timed].sort((a, b) => b.kitchenMinutes - a.kitchenMinutes).slice(0, 3).map(orderBrief);
  out.longest = out.slowest[0] || null;
  const byDish = new Map();
  // Only what the kitchen makes: a drink or chips handed over at the front
  // (the skip list) would only take on the times of the orders it was in.
  for (const r of timed) for (const name of new Set(r.items.filter((it) => !isSkipped({ name: it.name })).map(dishName))) byDish.set(name, [...(byDish.get(name) || []), r.kitchenMinutes]);
  out.dishes = [...byDish].filter(([, list]) => list.length >= DISH_MIN_ORDERS)
    .map(([name, list]) => ({ name, orders: list.length, medianMinutes: Math.round(lead.median(list)) }))
    .sort((a, b) => b.medianMinutes - a.medianMinutes || b.orders - a.orders).slice(0, 12);
  out.hours = Object.keys(out.byHour).map(Number).sort((a, b) => a - b).map((hour) => {
    const list = timed.filter((r) => new Date(r.at).getHours() === hour).map((r) => r.kitchenMinutes);
    return { hour, orders: out.byHour[hour], avgMinutes: list.length ? Math.round(list.reduce((a, b) => a + b, 0) / list.length) : null };
  });
  // Online pickups and DoorDash: the kitchen's time, then the wait at the
  // front until Handed off. Only orders saved from 2026-11-02 on say which
  // they were, so older ones are left out rather than guessed.
  const handoff = (list) => {
    const kitchen = list.map((r) => r.kitchenMinutes).filter((m) => m != null);
    const wait = list.map((r) => r.waitMinutes).filter((m) => m != null);
    return { orders: list.length, kitchenMinutes: kitchen.length ? Math.round(lead.median(kitchen)) : null,
      waitMinutes: wait.length ? Math.round(lead.median(wait)) : null, waited: wait.length };
  };
  const known = records.filter((r) => r.online && r.doordash !== undefined);
  out.handoff = known.length ? { online: handoff(known.filter((r) => !r.doordash)), doordash: handoff(known.filter((r) => r.doordash)) } : null;
  // Time in the kitchen by order size, so a big order doesn't make a day
  // look slow: median and average for each size.
  out.bySize = lead.SIZES.map((s, i) => {
    const list = bySize[i];
    const med = lead.median(list);
    return { label: s.label, orders: list.length, medianMinutes: med == null ? null : Math.round(med),
      avgMinutes: list.length ? Math.round(list.reduce((a, b) => a + b, 0) / list.length) : null };
  });
  return out;
}

// The full item list stays out: the screens poll this every few seconds
// and show only the top five.
function statsToday() {
  const { items, slowest, dishes, hours, handoff, ...today } = summarize(dayRecords());
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
lead.learn(history.days, localDate());
let historyWrittenAt = 0;
let historyLast = "";

function writeHistory() {
  // Write the copy whole, then swap it in: a power cut mid-write never
  // leaves a half-written history.
  fs.writeFileSync(HISTORY_FILE + ".tmp", JSON.stringify(history));
  fs.renameSync(HISTORY_FILE + ".tmp", HISTORY_FILE);
}

// Days saved before the board kept Net sales and tips (2026-10-27) get them from
// Square once, by order id, a hundred orders a call, so Reports and /today
// compare like with like. Runs at start; an order Square can't find keeps
// its total.
async function fillNet() {
  const { square, resolveLocations } = require("./square");
  const todo = new Map();
  for (const day of Object.values(history.days)) for (const r of day.orders) if ((r.net === undefined || r.tip === undefined) && r.id) todo.set(r.id, r);
  if (!todo.size) return;
  const ids = [...todo.keys()];
  const [location_id] = await resolveLocations();
  let filled = 0;
  for (let i = 0; i < ids.length; i += 100) {
    const { orders = [] } = await square("POST", "/orders/batch-retrieve", { location_id, order_ids: ids.slice(i, i + 100) });
    for (const o of orders) Object.assign(todo.get(o.id), { net: netSales(o), tip: tipOf(o) }), filled++;
  }
  for (const r of todo.values()) if (r.net === undefined) Object.assign(r, { net: null, tip: null });
  writeHistory();
  console.log(`Stats history: Net sales and tips filled in for ${filled} earlier order(s)`);
}
if (!MOCK) setTimeout(() => fillNet().catch((err) => console.error(`Stats history: ${err.message}`)), 10000).unref();

function recordHistory() {
  if (lead.learnedOn() !== localDate()) lead.learn(history.days, localDate());
  if (Date.now() - historyWrittenAt < HISTORY_SECONDS * 1000) return;
  const records = dayRecords();
  if (!records.length) return;
  const json = JSON.stringify(records);
  if (json === historyLast) return;
  const date = localDate();
  history.days[date] = { savedAt: new Date().toISOString(), orders: records };
  try {
    writeHistory();
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
function historyReport(from, to, withOrders, days = history.days) {
  const datesIn = (a, b) => Object.keys(days).filter((d) => d >= a && d <= b).sort();
  const dates = datesIn(from, to);
  const records = dates.flatMap((d) => days[d].orders);
  const out = { from, to, first: Object.keys(days).sort()[0] || null,
    days: dates.map((date) => { const { slowest, dishes, hours, handoff, ...s } = summarize(days[date].orders); return { date, ...s }; }),
    total: summarize(records), lead: lead.leadTable(), specials: specialsSold(dates.map((date) => ({ date, orders: days[date].orders }))) };
  // The same stretch before, to say up or down: the same weekdays a week
  // (or whole weeks) back, or for a range starting on the 1st, the same
  // days of the month before.
  const prev = previousRange(from, to);
  const before = datesIn(prev.from, prev.to);
  if (before.length) {
    const s = summarize(before.flatMap((d) => days[d].orders));
    out.before = { ...prev, days: before.length, orders: s.orders, sales: s.sales, tips: s.tips, avgMinutes: s.avgMinutes, avgTicket: s.avgTicket };
  }
  if (withOrders) out.orders = dates.flatMap((date) => days[date].orders.map((r) => ({ date, ...r, meal: mealOf(r.at) })));
  return out;
}

function previousRange(from, to) {
  const span = Math.round((Date.parse(`${to}T12:00:00`) - Date.parse(`${from}T12:00:00`)) / 864e5) + 1;
  if (from.endsWith("-01") && from.slice(0, 7) === to.slice(0, 7)) {
    const start = new Date(`${from}T12:00:00`);
    start.setMonth(start.getMonth() - 1);
    const last = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
    const whole = Number(to.slice(8)) === new Date(start.getFullYear(), start.getMonth() + 2, 0).getDate(); // to is its month's last day
    const end = new Date(start.getFullYear(), start.getMonth(), whole ? last : Math.min(Number(to.slice(8)), last), 12);
    return { from: localDate(start), to: localDate(end), label: whole ? "the month before" : "the same days the month before" };
  }
  const weeks = Math.ceil(span / 7);
  return { from: shiftDate(from, -7 * weeks), to: shiftDate(to, -7 * weeks),
    label: span === 7 && weeks === 1 ? "the week before" : weeks === 1 ? "the same days the week before" : `the same days ${weeks} weeks before` };
}

// The daily items sold each day, by what they were that day, and each plate
// across the range by how many sold a day it was on, to see which to repeat.
function specialsSold(days) {
  const plates = new Map();
  const soups = new Map();
  const out = { days: [], plates: [], soups: [] };
  const tally = (map, name, date, n, cupOrBowl) => {
    const e = map.get(name) || { name, dates: new Set(), qty: 0, cups: 0, bowls: 0 };
    e.dates.add(date);
    e.qty += n;
    if (cupOrBowl) e[`${cupOrBowl}s`] += n;
    map.set(name, e);
  };
  for (const { date, orders } of days) {
    const day = { date, plates: {}, soups: {} };
    for (const r of orders) for (const it of r.items) {
      const v = it.variation || "";
      if (/^lunch special$/i.test(it.name) && v) {
        day.plates[v] = (day.plates[v] || 0) + it.qty;
        tally(plates, v, date, it.qty);
      } else if (/^soup of the day$/i.test(it.name)) {
        const m = /^(cup|bowl)\s*·\s*(.+)$/i.exec(v);
        if (!m) continue;
        const kind = m[1].toLowerCase();
        const s = day.soups[m[2]] || (day.soups[m[2]] = { cups: 0, bowls: 0 });
        s[`${kind}s`] += it.qty;
        tally(soups, m[2], date, it.qty, kind);
      }
    }
    if (Object.keys(day.plates).length || Object.keys(day.soups).length) out.days.push(day);
  }
  const ranked = (map) => [...map.values()].map((e) => ({ name: e.name, days: e.dates.size, qty: e.qty, cups: e.cups, bowls: e.bowls, perDay: Math.round((e.qty / e.dates.size) * 10) / 10 }))
    .sort((a, b) => b.perDay - a.perDay || a.name.localeCompare(b.name));
  out.plates = ranked(plates);
  out.soups = ranked(soups);
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

module.exports = { statsToday, recordHistory, recordHistoryNow, historyReport, todayView, summarize, netSales, previousRange, specialsSold };
