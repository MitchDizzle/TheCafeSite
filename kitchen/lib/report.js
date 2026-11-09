// The emailed report (Mitch 2026-11-08): the day's numbers at 2:10pm, after
// closing, and the week's on the week's last open day, emailed to the cafe
// as a page to read and a PDF to print (Terry prints them). Square sends a
// sales summary of its own; this one has what Square's doesn't put together:
// counter, online and DoorDash side by side, breakfast and lunch, the
// kitchen's times, Dasher waits, the specials sold and everything else sold,
// against the same day (or week) before.
//
// Made from the daily history (lib/stats.js), so it counts what Today's
// report and Reports count. Emailed through the cafe's Google Apps Script
// (google-script/Code.gs, "report"), the one the reservations use, so it
// needs reservationsKey; without it Manage -> Numbers -> Emailed report
// still shows and prints it.
//
// When and to whom is set in Manage (kept in data\report-mail.json);
// config.json's reportTime and reportTo are only where that starts. A
// report that couldn't go (the PC was off at 2:10, Google didn't answer) is
// tried again every RETRY_MINUTES, and the next day still: up to
// CATCH_UP_DAYS for a day's report, a week for the week's. Never for a day
// before the board first had this, so an update doesn't send a backlog.
// Test mode and development copies never email by themselves.
const fs = require("fs");
const path = require("path");
const { DIR, DATA, MOCK, DEV, cfg } = require("./config");
const { localDate } = require("./util");
const stats = require("./stats");
const reservations = require("./reservations");
const lead = require("./lead");
const { central } = require("./auto-off");

const FILE = path.join(DATA, MOCK ? "report-mail-mock.json" : "report-mail.json");
const RETRY_MINUTES = 10;
const CATCH_UP_DAYS = 3;
const MAX_TO = 5;
const EMAIL = /^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$/;

// ---------------------------------------------------------------- settings and what's been sent

let saved = { started: null, settings: null, sent: {}, lastError: null, lastTry: 0 };
function load() {
  try {
    const s = JSON.parse(fs.readFileSync(FILE, "utf8"));
    saved = { ...saved, ...s, sent: s.sent || {} };
  } catch {}
}
function save() {
  try {
    fs.mkdirSync(DATA, { recursive: true });
    fs.writeFileSync(FILE + ".tmp", JSON.stringify(saved, null, 2));
    fs.renameSync(FILE + ".tmp", FILE);
  } catch (err) {
    console.error(`Emailed report: ${err.message}`);
  }
}
load();

const TIME = /^([01]?\d|2[0-3]):([0-5]\d)$/;
function settings() {
  const base = { daily: true, weekly: true, time: TIME.test(cfg.reportTime || "") ? cfg.reportTime : "", to: (cfg.reportTo || []).filter((a) => EMAIL.test(a)) };
  return { ...base, ...(saved.settings || {}) };
}
function saveSettings(input) {
  const to = String(Array.isArray(input.to) ? input.to.join("\n") : input.to || "")
    .split(/[\s,;]+/).map((a) => a.trim()).filter(Boolean);
  const bad = to.filter((a) => !EMAIL.test(a));
  if (bad.length) throw Object.assign(new Error(`That doesn't look like an email address: ${bad.join(", ")}`), { plain: true });
  if (to.length > MAX_TO) throw Object.assign(new Error(`Up to ${MAX_TO} addresses besides the cafe's.`), { plain: true });
  const time = String(input.time || "").trim();
  if (time && !TIME.test(time)) throw Object.assign(new Error("Pick a time, like 2:10 PM."), { plain: true });
  saved.settings = { daily: !!input.daily, weekly: !!input.weekly, time, to: [...new Set(to.map((a) => a.toLowerCase()))] };
  save();
  return settings();
}

// The cafe's own address, which Code.gs always sends to (CAFE.email there).
function cafeEmail() {
  try { return JSON.parse(fs.readFileSync(path.join(DIR, "..", "src", "_data", "site.json"), "utf8")).email || ""; } catch { return ""; }
}

// ---------------------------------------------------------------- the numbers

const days = () => stats.historyDays();
const shift = stats.shiftDate;
const mondayOf = (date) => shift(date, -((new Date(`${date}T12:00:00`).getDay() + 6) % 7));
const round2 = (n) => Math.round(n * 100) / 100;
const netOf = (r) => (r.net != null ? r.net : r.sales != null ? r.sales : 0);
const channelOf = (r) => (r.doordash ? "doordash" : r.online ? "online" : "counter");
const CHANNELS = [["counter", "Counter"], ["online", "Online pickup"], ["doordash", "DoorDash"]];

function channels(records) {
  const total = records.reduce((a, r) => a + netOf(r), 0);
  return CHANNELS.map(([key, name]) => {
    const list = records.filter((r) => channelOf(r) === key);
    const net = round2(list.reduce((a, r) => a + netOf(r), 0));
    return { key, name, orders: list.length, net, avgTicket: list.length ? round2(net / list.length) : null, share: total ? Math.round((net / total) * 100) : 0 };
  });
}

function meals(records) {
  return ["breakfast", "lunch"].map((meal) => {
    const list = records.filter((r) => stats.mealOf(r.at) === meal);
    return { meal, orders: list.length, net: round2(list.reduce((a, r) => a + netOf(r), 0)) };
  });
}

function hours(records, dayCount = 1) {
  const by = new Map();
  for (const r of records) {
    const h = new Date(r.at).getHours();
    const e = by.get(h) || { hour: h, orders: 0, net: 0 };
    e.orders++;
    e.net += netOf(r);
    by.set(h, e);
  }
  return [...by.values()].sort((a, b) => a.hour - b.hour).map((e) => ({ ...e, net: round2(e.net), perDay: dayCount > 1 ? Math.round((e.orders / dayCount) * 10) / 10 : null }));
}

// Each DoorDash order, for the list under the DoorDash numbers.
const doordashOrders = (records) => records.filter((r) => r.doordash).sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  .map((r) => ({ at: r.at, items: lead.itemsOf(r), net: netOf(r), kitchenMinutes: r.kitchenMinutes, waitMinutes: r.waitMinutes }));

const brief = (s) => (s ? { orders: s.orders, sales: s.sales, avgTicket: s.avgTicket, tips: s.tips } : null);

function tablesOn(dates) {
  const set = new Set(dates);
  const list = reservations.book.list.filter((r) => set.has(r.date) && (r.status === "booked" || r.status === "seated"));
  return { tables: list.length, people: list.reduce((a, r) => a + (Number(r.party) || 0), 0) };
}

const feePercent = () => Math.max(0, Math.min(50, Number(cfg.doordashFeePercent) || 0));

// One day's report: null when the history has no orders that day.
function dayReport(date, all = days()) {
  const day = all[date];
  if (!day || !day.orders.length) return null;
  const records = day.orders;
  const s = stats.summarize(records);
  const lastWeek = all[shift(date, -7)] ? stats.summarize(all[shift(date, -7)].orders) : null;
  // A usual day: the same weekday over up to four weeks before, from two up.
  const before = [1, 2, 3, 4].map((w) => all[shift(date, -7 * w)]).filter((d) => d && d.orders.length).map((d) => stats.summarize(d.orders));
  const usual = before.length >= 2 ? { weeks: before.length, orders: Math.round(before.reduce((a, b) => a + b.orders, 0) / before.length), sales: round2(before.reduce((a, b) => a + b.sales, 0) / before.length) } : null;
  return {
    kind: "day", date, from: date, to: date, madeAt: new Date().toISOString(),
    totals: { ...brief(s), collected: s.collected, tipped: s.tipped },
    lastWeek: lastWeek ? { date: shift(date, -7), ...brief(lastWeek) } : null, usual,
    channels: channels(records), meals: meals(records), hours: hours(records),
    doordash: { ...s.handoff?.doordash, list: doordashOrders(records), fee: feePercent() }, online: s.handoff?.online || null,
    kitchen: { avgMinutes: s.avgMinutes, longestMinutes: s.longestMinutes, done: s.kitchenDone, bySize: s.bySize.filter((b) => b.orders), slowest: s.slowest },
    toGo: s.toGo, forHere: s.forHere,
    specials: stats.specialsSold([{ date, orders: records }]),
    items: s.items, reservations: tablesOn([date]),
  };
}

// The week (Monday to Sunday) a date is in: null when the history has none of it.
function weekReport(date, all = days()) {
  const from = mondayOf(date);
  const to = shift(from, 6);
  const dates = Object.keys(all).filter((d) => d >= from && d <= to && all[d].orders.length).sort();
  if (!dates.length) return null;
  const r = stats.historyReport(from, to, false, all);
  const records = dates.flatMap((d) => all[d].orders);
  const s = r.total;
  const perDay = dates.map((d) => {
    const list = all[d].orders;
    const ds = stats.summarize(list);
    const ch = channels(list);
    return { date: d, orders: ds.orders, sales: ds.sales, avgTicket: ds.avgTicket, tips: ds.tips, breakfast: ds.breakfast, lunch: ds.lunch,
      online: ch[1].orders, doordash: ch[2].orders, doordashNet: ch[2].net, avgMinutes: ds.avgMinutes };
  });
  return {
    kind: "week", date, from, to, last: dates[dates.length - 1], madeAt: new Date().toISOString(),
    totals: { ...brief(s), collected: s.collected, tipped: s.tipped, days: dates.length },
    before: r.before || null,
    perDay, channels: channels(records), meals: meals(records), hours: hours(records, dates.length),
    doordash: { ...s.handoff?.doordash, fee: feePercent() }, online: s.handoff?.online || null,
    kitchen: { avgMinutes: s.avgMinutes, longestMinutes: s.longestMinutes, done: s.kitchenDone, bySize: s.bySize.filter((b) => b.orders), slowest: s.slowest },
    toGo: s.toGo, forHere: s.forHere,
    specials: r.specials, items: s.items, reservations: tablesOn(dates),
  };
}

// ---------------------------------------------------------------- the page

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n) => (n == null ? "–" : `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const mins = (n) => (n == null ? "–" : `${n} min`);
const longDate = (d) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
const shortDate = (d) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const dayOnly = (d) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const clock = (iso) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const hourName = (h) => `${h % 12 || 12}${h < 12 ? "am" : "pm"}`;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const breakfastEnds = () => { const m = stats.BREAKFAST_ENDS; const h = Math.floor(m / 60); return `${h % 12 || 12}:${String(m % 60).padStart(2, "0")}${h < 12 ? "am" : "pm"}`; };

// Up or down against before, in words and an arrow, never colour alone.
function vs(now, then, words, isMoney) {
  if (then == null || now == null) return "";
  const diff = round2(now - then);
  if (Math.abs(diff) < (isMoney ? 0.5 : 1)) return `same as ${words}`;
  const pct = then ? ` (${Math.abs(Math.round((diff / then) * 100))}%)` : "";
  return `${diff > 0 ? "▲" : "▼"} ${isMoney ? money(Math.abs(diff)) : Math.abs(diff)}${pct} ${diff > 0 ? "over" : "under"} ${words}`;
}

// Email-safe: tables and inline styles only (Gmail drops most of a <style>,
// and the PDF is made from the same page by Google).
const C = { ink: "#22323A", muted: "#5B6B72", line: "#E3DDD3", head: "#1F4552", soft: "#F6F2EB", red: "#A02F26", green: "#2E7D4F" };
const FONT = "Lato, 'Segoe UI', Arial, sans-serif";
const SERIF = "'Playfair Display', Georgia, 'Times New Roman', serif";
const th = (t, right) => `<th style="padding:6px 8px;border-bottom:2px solid ${C.head};font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:${C.muted};text-align:${right ? "right" : "left"};font-weight:700">${t}</th>`;
const td = (t, right, bold) => `<td style="padding:5px 8px;border-bottom:1px solid ${C.line};text-align:${right ? "right" : "left"};${bold ? "font-weight:700;" : ""}vertical-align:top">${t}</td>`;
function table(head, rows, rightFrom = 1) {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;margin:0 0 6px">
    <tr>${head.map((h, i) => th(h, i >= rightFrom)).join("")}</tr>
    ${rows.map((r) => `<tr>${r.cells.map((c, i) => td(c, i >= rightFrom, r.bold)).join("")}</tr>`).join("")}</table>`;
}
const h2 = (t) => `<h2 style="margin:22px 0 8px;padding:0;font-family:${SERIF};font-weight:700;font-size:17px;line-height:1.2;color:${C.head}">${t}</h2>`;
const p = (t, small) => `<p style="margin:0 0 8px;${small ? `font-size:12px;color:${C.muted};` : ""}">${t}</p>`;
// The four big numbers, two by two: fits a phone's mail app as well as a page.
function headline(cells) {
  const cell = ([big, label, sub]) => `<td width="50%" style="padding:10px 12px;background:${C.soft};border-radius:6px;vertical-align:top">
      <div style="font-family:${FONT};font-weight:900;font-size:22px;line-height:1.15;color:${C.ink}">${big}</div>
      <div style="font-size:12px;color:${C.muted};margin-top:2px">${label}</div>
      ${sub ? `<div style="font-size:12px;font-weight:700;color:${/^▲/.test(sub) ? C.green : /^▼/.test(sub) ? C.red : C.muted};margin-top:4px">${sub}</div>` : ""}</td>`;
  const rows = [];
  for (let i = 0; i < cells.length; i += 2) rows.push(`<tr>${cell(cells[i])}${cells[i + 1] ? cell(cells[i + 1]) : "<td></td>"}</tr>`);
  return `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:6px;margin:8px -6px 0">${rows.join("")}</table>`;
}
// A bar in a table cell, for the hours: printable, no pictures.
const bar = (n, max) => `<div style="height:9px;width:${Math.max(2, Math.round((n / Math.max(1, max)) * 100))}%;background:${C.head};border-radius:0 3px 3px 0"></div>`;

function itemsTable(items) {
  if (!items.length) return p("Nothing sold.");
  const half = Math.ceil(items.length / 2);
  const cell = (it) => (it ? `<td style="padding:2px 6px;border-bottom:1px solid ${C.line};width:34px;text-align:right;font-weight:700">${it.qty}</td><td style="padding:2px 6px;border-bottom:1px solid ${C.line}">${esc(it.name)}</td>` : `<td></td><td></td>`);
  const rows = [];
  for (let i = 0; i < half; i++) rows.push(`<tr>${cell(items[i])}<td style="width:14px"></td>${cell(items[i + half])}</tr>`);
  return `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:12.5px">${rows.join("")}</table>`;
}

function channelSection(r) {
  const total = r.channels.reduce((a, c) => ({ orders: a.orders + c.orders, net: a.net + c.net }), { orders: 0, net: 0 });
  return h2("Where the orders came from") + table(["", "Orders", "Net sales", "Avg ticket", "Share"], [
    ...r.channels.map((c) => ({ cells: [c.name, c.orders, money(c.net), money(c.avgTicket), `${c.share}%`] })),
    { bold: true, cells: ["All", total.orders, money(total.net), money(r.totals.avgTicket), "100%"] },
  ]) + table(["", "Orders", "Net sales"], r.meals.map((m) => ({ cells: [m.meal === "breakfast" ? `Breakfast (before ${breakfastEnds()})` : `Lunch (${breakfastEnds()} on)`, m.orders, money(m.net)] })))
    + p(`${r.toGo} to go · ${r.forHere} for here.`, true);
}

function doordashSection(r) {
  const dd = r.channels.find((c) => c.key === "doordash");
  const d = r.doordash || {};
  if (!dd.orders) return h2("DoorDash") + p(`No DoorDash orders ${r.kind === "day" ? "that day" : "that week"}.`);
  const lines = [`<b>${plural(dd.orders, "order")}</b>, ${money(dd.net)} in net sales (${dd.share}% of the ${r.kind === "day" ? "day" : "week"}), ${money(dd.avgTicket)} average.`];
  if (d.kitchenMinutes != null) lines.push(`The kitchen took ${d.kitchenMinutes} min (median) from the board to Done.`);
  if (d.waitMinutes != null) lines.push(`Dashers waited ${d.waitMinutes} min at the counter after Done (median of the ${plural(d.waited, "one")} handed off by hand).`);
  if (d.fee) {
    const fee = round2((dd.net * d.fee) / 100);
    lines.push(`At DoorDash's ${d.fee}% commission that's about ${money(fee)} to DoorDash and ${money(dd.net - fee)} to the cafe, before any other DoorDash fees.`);
  }
  let out = h2("DoorDash") + p(lines.join(" "));
  if (r.kind === "day" && d.list && d.list.length) {
    out += table(["Time", "Items", "Net sales", "Kitchen", "Dasher wait"], d.list.map((o) => ({ cells: [clock(o.at), o.items, money(o.net), mins(o.kitchenMinutes != null ? Math.round(o.kitchenMinutes) : null), mins(o.waitMinutes != null ? Math.round(o.waitMinutes) : null)] })));
  }
  return out;
}

function onlineLine(r) {
  const on = r.channels.find((c) => c.key === "online");
  if (!on.orders) return "";
  const o = r.online || {};
  return p(`<b>Online pickups:</b> ${plural(on.orders, "order")}, ${money(on.net)}${o.kitchenMinutes != null ? `; the kitchen took ${o.kitchenMinutes} min (median)` : ""}${o.waitMinutes != null ? `, then they waited ${o.waitMinutes} min on the counter for the customer (median)` : ""}.`);
}

function kitchenSection(r) {
  const k = r.kitchen;
  let out = h2("The kitchen") + p(k.avgMinutes != null
    ? `On average ${k.avgMinutes} min from the board to Done; the longest was ${k.longestMinutes} min. ${plural(k.done, "order")} through the kitchen.`
    : "No kitchen times saved.");
  if (k.bySize.length) out += table(["Order size", "Orders", "Median", "Average"], k.bySize.map((b) => ({ cells: [b.label, b.orders, mins(b.medianMinutes), mins(b.avgMinutes)] })));
  if (k.slowest && k.slowest.length) {
    out += p(`Slowest: ${k.slowest.map((o) => `${r.kind === "week" ? `${shortDate(localDate(new Date(o.at)))} ` : ""}${clock(o.at)}, ${Math.round(o.kitchenMinutes)} min (${esc(o.items.slice(0, 3).join(", "))}${o.items.length > 3 ? ", …" : ""})`).join("; ")}.`, true);
  }
  return out;
}

function hoursSection(r) {
  if (!r.hours.length) return "";
  const max = Math.max(...r.hours.map((h) => h.orders));
  const week = r.kind === "week";
  const barCell = (h) => `<td style="padding:5px 8px;border-bottom:1px solid ${C.line};width:40%;vertical-align:middle">${bar(h.orders, max)}</td>`;
  const rows = r.hours.map((h) => `<tr>${[hourName(h.hour), h.orders, ...(week ? [h.perDay] : []), money(h.net)].map((c, i) => td(c, i > 0)).join("")}${barCell(h)}</tr>`);
  return h2("By the hour") + `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;margin:0 0 6px">
    <tr>${["Hour", "Orders", ...(week ? ["A day"] : []), "Net sales"].map((x, i) => th(x, i > 0)).join("")}${th("")}</tr>${rows.join("")}</table>`;
}

function specialsSection(r) {
  const sp = r.specials;
  if (!sp.plates.length && !sp.soups.length) return "";
  const soupWords = (s) => [s.cups && plural(s.cups, "cup"), s.bowls && plural(s.bowls, "bowl")].filter(Boolean).join(", ");
  if (r.kind === "day") {
    return h2("Specials") + [
      ...sp.plates.map((x) => p(`<b>Lunch Special, ${esc(x.name)}:</b> ${x.qty} sold.`)),
      ...sp.soups.map((x) => p(`<b>Soup, ${esc(x.name)}:</b> ${soupWords(x)} (${x.qty} in all).`)),
    ].join("");
  }
  const rows = sp.days.map((d) => ({ cells: [shortDate(d.date),
    Object.entries(d.plates).map(([n, q]) => `${esc(n)} (${q})`).join(", ") || "–",
    Object.entries(d.soups).map(([n, c]) => `${esc(n)} (${[c.cups && `${c.cups} cup${c.cups === 1 ? "" : "s"}`, c.bowls && `${c.bowls} bowl${c.bowls === 1 ? "" : "s"}`].filter(Boolean).join(", ")})`).join(", ") || "–"] }));
  return h2("Specials") + table(["Day", "Lunch Special (sold)", "Soup (sold)"], rows, 9);
}

function weekDays(r) {
  const t = r.totals;
  return h2("Day by day") + table(["Day", "Orders", "Net sales", "Avg", "Tips", "Bkfst / lunch", "Online", "DoorDash", "Kitchen"], [
    ...r.perDay.map((d) => ({ cells: [shortDate(d.date), d.orders, money(d.sales), money(d.avgTicket), money(d.tips), `${d.breakfast} / ${d.lunch}`, d.online, d.doordash, mins(d.avgMinutes)] })),
    { bold: true, cells: ["Week", t.orders, money(t.sales), money(t.avgTicket), money(t.tips), `${r.meals[0].orders} / ${r.meals[1].orders}`, r.channels[1].orders, r.channels[2].orders, mins(r.kitchen.avgMinutes)] },
  ]);
}

function renderHtml(r, { page = false } = {}) {
  const t = r.totals;
  const title = r.kind === "day" ? "Daily report" : "Weekly report";
  const when = r.kind === "day" ? longDate(r.date) : `${shortDate(r.from)} to ${shortDate(r.last)}, ${r.from.slice(0, 4)}`;
  let compare = [];
  if (r.kind === "day") {
    const ref = r.lastWeek ? [r.lastWeek, `last ${new Date(`${r.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" })}`] : null;
    compare = ref ? [vs(t.sales, ref[0].sales, ref[1], true), vs(t.orders, ref[0].orders, ref[1]), vs(t.avgTicket, ref[0].avgTicket, ref[1], true), vs(t.tips, ref[0].tips, ref[1], true)] : [];
  } else if (r.before) {
    compare = [vs(t.sales, r.before.sales, r.before.label, true), vs(t.orders, r.before.orders, r.before.label), vs(t.avgTicket, r.before.avgTicket, r.before.label, true), vs(t.tips, r.before.tips, r.before.label, true)];
  }
  const body = [
    `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-bottom:3px solid ${C.head}"><tr>
      <td style="padding:0 0 8px;vertical-align:bottom"><div style="font-family:${SERIF};font-weight:700;font-size:28px;line-height:1;white-space:nowrap;color:${C.head}">The Café</div>
        <div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:${C.red};font-weight:700;margin-top:6px">${title}</div></td>
      <td style="padding:0 0 8px 12px;text-align:right;vertical-align:bottom"><div style="font-family:${SERIF};font-weight:700;font-size:16px;line-height:1.25;color:${C.ink}">${esc(when)}</div>
        <div style="font-size:11px;color:${C.muted};margin-top:3px">Made by the kitchen board ${esc(new Date(r.madeAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }))}</div></td>
    </tr></table>`,
    headline([
      [money(t.sales), "net sales", compare[0]],
      [t.orders, "orders", compare[1]],
      [money(t.avgTicket), "average ticket", compare[2]],
      [money(t.tips), `in tips${t.tipped ? ` (${plural(t.tipped, "order")})` : ""}`, compare[3]],
    ]),
    r.kind === "day" && r.usual ? p(`A usual ${new Date(`${r.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" })} (the last ${r.usual.weeks} weeks): ${r.usual.orders} orders, ${money(r.usual.sales)}.`, true) : "",
    r.kind === "week" && r.before ? p(`Against ${esc(r.before.label)}: ${r.before.orders} orders, ${money(r.before.sales)} (${plural(r.before.days, "day")} in the history).`, true) : "",
    r.kind === "week" ? weekDays(r) : "",
    channelSection(r),
    onlineLine(r),
    doordashSection(r),
    specialsSection(r),
    kitchenSection(r),
    hoursSection(r),
    r.reservations.tables ? h2("Reservations") + p(`${plural(r.reservations.tables, "table")}, ${plural(r.reservations.people, "person", "people")}.`) : "",
    h2(r.kind === "day" ? "Everything sold" : "Everything sold this week"),
    itemsTable(r.items),
    `<p style="margin:22px 0 0;padding-top:8px;border-top:1px solid ${C.line};font-size:11px;color:${C.muted}">
      Collected in all, tax and tips in: ${money(t.collected)}. From the kitchen board's own count of Square's orders: net sales are after discounts and before tax and tips, counted on the day an order is made (Square counts the day it's paid). Refunds aren't taken off; canceled, test and demo orders aren't counted. Times are from the kitchen board: on the board to Done. Square's Dashboard has the official sales.</p>`,
  ].join("\n");
  const doc = `<div style="max-width:700px;margin:0 auto;padding:16px;font-family:${FONT};font-size:13.5px;line-height:1.45;color:${C.ink};background:#fff">${body}</div>`;
  if (!page) return doc;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(subjectOf(r))}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Lato:wght@400;700;900&family=Playfair+Display:wght@700&display=swap">
<style>@page { size: letter; margin: 0.5in; } body { margin: 0; background: #fff; font-variant-numeric: lining-nums; } @media print { body > div { padding: 0 !important; } }
@media (max-width: 520px) { body > div { padding: 10px !important; font-size: 12.5px !important; } th, td { padding: 4px 4px !important; } }</style>
</head><body>${doc}</body></html>`;
}

function subjectOf(r) {
  const t = r.totals;
  return r.kind === "day"
    ? `The Café, ${shortDate(r.date)}: ${money(t.sales)}, ${plural(t.orders, "order")}`
    : `The Café, week of ${dayOnly(r.from)}: ${money(t.sales)}, ${plural(t.orders, "order")}`;
}

// The email's plain-text part, for a mail app that shows no HTML.
function renderText(r) {
  const t = r.totals;
  const lines = [`The Café · ${r.kind === "day" ? `Daily report, ${longDate(r.date)}` : `Weekly report, ${shortDate(r.from)} to ${shortDate(r.last)}`}`, "",
    `Net sales ${money(t.sales)} · ${t.orders} orders · average ${money(t.avgTicket)} · tips ${money(t.tips)}`];
  if (r.kind === "day" && r.lastWeek) lines.push(`Last week: ${money(r.lastWeek.sales)}, ${r.lastWeek.orders} orders`);
  if (r.kind === "week" && r.before) lines.push(`${r.before.label}: ${money(r.before.sales)}, ${r.before.orders} orders`);
  lines.push("", ...r.channels.map((c) => `${c.name}: ${c.orders} orders, ${money(c.net)} (${c.share}%)`));
  lines.push(...r.meals.map((m) => `${m.meal === "breakfast" ? "Breakfast" : "Lunch"}: ${m.orders} orders, ${money(m.net)}`));
  if (r.kitchen.avgMinutes != null) lines.push("", `Kitchen: ${r.kitchen.avgMinutes} min average, longest ${r.kitchen.longestMinutes} min`);
  lines.push("", "The whole report is in this email and in the PDF attached, for printing.");
  return lines.join("\n");
}

// ---------------------------------------------------------------- sending

const reportFor = (kind, date) => (kind === "week" ? weekReport(date) : dayReport(date));
const sentKey = (kind, date) => (kind === "week" ? `week:${mondayOf(date)}` : `day:${date}`);

async function email(kind, date, why) {
  if (!reservations.google()) {
    throw Object.assign(new Error(MOCK ? "Test mode: nothing is emailed." : "Not set up: emailing goes through the reservations Google script, and this PC has no reservationsKey in config.json."), { plain: true });
  }
  stats.recordHistoryNow();
  const r = reportFor(kind, date);
  if (!r) throw Object.assign(new Error(kind === "week" ? "No orders saved that week." : "No orders saved that day."), { plain: true });
  const s = settings();
  const op = `report-${sentKey(kind, date)}-${why === "schedule" ? "auto" : Date.now()}`;
  const answer = await reservations.callScript({ action: "report", op, to: s.to, subject: subjectOf(r), html: renderHtml(r), text: renderText(r),
    pdf: `The Cafe ${kind === "week" ? "week of" : "report"} ${kind === "week" ? r.from : r.date}.pdf` });
  saved.sent[sentKey(kind, date)] = new Date().toISOString();
  saved.lastError = null;
  save();
  console.log(`${new Date().toLocaleTimeString()}  Emailed report: ${kind === "week" ? `the week of ${r.from}` : date} sent (${why}) to ${answer.to || "the cafe"}.`);
  return { to: answer.to || [cafeEmail(), ...s.to].filter(Boolean).join(", "), subject: subjectOf(r) };
}

const timeMinutes = (t) => { const m = TIME.exec(t || ""); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const openOn = (date) => (cfg.openDays || []).includes(new Date(`${date}T12:00:00`).getDay());
// The week's last open day: when its report goes.
function lastOpenDay(monday) {
  for (let i = 6; i >= 0; i--) if (openOn(shift(monday, i))) return shift(monday, i);
  return shift(monday, 4);
}

// What's due now and not sent: the oldest first.
function due(now = new Date(), all = days()) {
  const s = settings();
  const at = timeMinutes(s.time);
  if (at === null) return [];
  const c = central(now);
  const passed = (date) => date < c.date || (date === c.date && c.minutes >= at);
  const out = [];
  if (s.daily) {
    for (let i = CATCH_UP_DAYS - 1; i >= 0; i--) {
      const d = shift(c.date, -i);
      if (d < saved.started || !passed(d) || saved.sent[sentKey("day", d)]) continue;
      if (all[d] && all[d].orders.length) out.push({ kind: "day", date: d });
    }
  }
  if (s.weekly) {
    for (const monday of [shift(mondayOf(c.date), -7), mondayOf(c.date)]) {
      const last = lastOpenDay(monday);
      if (last < saved.started || !passed(last) || saved.sent[sentKey("week", monday)]) continue;
      if (c.date > shift(last, 7)) continue;
      if (Object.keys(all).some((d) => d >= monday && d <= shift(monday, 6) && all[d].orders.length)) out.push({ kind: "week", date: last });
    }
  }
  return out;
}

let sending = false;
async function tick(now = new Date()) {
  if (sending || MOCK || DEV || !reservations.google()) return;
  if (Date.now() - saved.lastTry < RETRY_MINUTES * 6e4 && saved.lastError) return;
  const list = due(now);
  if (!list.length) return;
  sending = true;
  try {
    for (const job of list) {
      saved.lastTry = Date.now();
      try {
        await email(job.kind, job.date, "schedule");
      } catch (err) {
        saved.lastError = `${job.kind === "week" ? "The week's" : `${job.date}'s`} report: ${err.message}`;
        save();
        console.error(`Emailed report: ${saved.lastError} (trying again in ${RETRY_MINUTES} min)`);
        break;
      }
    }
  } finally {
    sending = false;
  }
}

function start() {
  // The first run: nothing from before today is owed.
  if (!saved.started) { saved.started = localDate(); save(); }
  setTimeout(() => tick(), 60000).unref();
  setInterval(() => tick(), 60000).unref();
}

// ---------------------------------------------------------------- Manage and /check

function timeWords(t) {
  const m = timeMinutes(t);
  if (m === null) return "";
  const h = Math.floor(m / 60);
  return `${h % 12 || 12}:${String(m % 60).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
function status() {
  const s = settings();
  const today = localDate();
  const lastDay = Object.keys(saved.sent).filter((k) => k.startsWith("day:")).sort().pop();
  const lastWeek = Object.keys(saved.sent).filter((k) => k.startsWith("week:")).sort().pop();
  return {
    settings: s, cafeEmail: cafeEmail(), google: reservations.google(), mock: MOCK, dev: DEV,
    timeWords: timeWords(s.time), weekDay: new Date(`${lastOpenDay(mondayOf(today))}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" }),
    lastDay: lastDay ? { date: lastDay.slice(4), at: saved.sent[lastDay] } : null,
    lastWeek: lastWeek ? { from: lastWeek.slice(5), at: saved.sent[lastWeek] } : null,
    error: saved.lastError, today,
  };
}
function line() {
  const s = settings();
  if (MOCK) return "test mode: never emailed.";
  if (!reservations.google()) return "not emailed: needs the reservations Google script (reservationsKey in config.json). Manage can still print it.";
  if (!timeWords(s.time) || (!s.daily && !s.weekly)) return "switched off in Manage.";
  const st = status();
  return `${[s.daily && "the day's", s.weekly && `the week's (${st.weekDay})`].filter(Boolean).join(" and ")} at ${st.timeWords}${DEV ? " (not from a development copy)" : ""}` +
    `${st.lastDay ? `; last sent ${st.lastDay.date}` : ""}${st.error ? `; failed: ${st.error}` : ""}.`;
}

module.exports = { start, tick, due, dayReport, weekReport, renderHtml, renderText, subjectOf, reportFor, email, settings, saveSettings, status, line, lastOpenDay,
  _set: (s) => { saved = { started: null, settings: null, sent: {}, lastError: null, lastTry: 0, ...s }; } };
