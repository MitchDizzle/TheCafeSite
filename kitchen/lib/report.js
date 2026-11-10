// The printed report (Mitch 2026-11-08: Terry prints a summary of the day,
// and of a week or any stretch of days). Manage -> Numbers -> Print a report
// on the front page makes it for a day, a week or any two dates, and prints
// it on one letter page, always: it shrinks to fit when there's a lot.
//
// Square sends a sales summary of its own; this one has what Square's
// doesn't put together: counter, online and DoorDash side by side,
// breakfast and lunch, the kitchen's times, Dasher waits, the specials sold
// and everything else sold, against the same day (or stretch) before.
//
// Made from the daily history (lib/stats.js), so it counts what Today's
// report and Reports count. lib/report-mail.js emails the same page as a PDF
// every day (Mitch 2026-11-10), with a short summary as the email itself
// (emailHtml below).
const stats = require("./stats");
const reservations = require("./reservations");
const lead = require("./lead");
const { cfg } = require("./config");
const { localDate } = require("./util");

const days = () => stats.historyDays();
const shift = stats.shiftDate;
const mondayOf = (date) => shift(date, -((new Date(`${date}T12:00:00`).getDay() + 6) % 7));
const round2 = (n) => Math.round(n * 100) / 100;
const netOf = (r) => (r.net != null ? r.net : r.sales != null ? r.sales : 0);
const channelOf = (r) => (r.doordash ? "doordash" : r.online ? "online" : "counter");
const CHANNELS = [["counter", "Counter"], ["online", "Online pickup"], ["doordash", "DoorDash"]];
// More days than this and the day-by-day table goes by week instead.
const MAX_DAY_ROWS = 23;
// More different items than this and the rest are one line.
const MAX_ITEMS = 72;

// ---------------------------------------------------------------- the numbers

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

function hours(records, dayCount) {
  const by = new Map();
  for (const r of records) {
    const h = new Date(r.at).getHours();
    const e = by.get(h) || { hour: h, orders: 0, net: 0 };
    e.orders++;
    e.net += netOf(r);
    by.set(h, e);
  }
  return [...by.values()].sort((a, b) => a.hour - b.hour)
    .map((e) => ({ ...e, net: round2(e.net), perDay: dayCount > 1 ? Math.round((e.orders / dayCount) * 10) / 10 : null }));
}

const brief = (s) => ({ orders: s.orders, sales: s.sales, avgTicket: s.avgTicket, tips: s.tips });

// A row of the day-by-day table: a day, or a week of a long stretch.
function row(label, date, list) {
  const s = stats.summarize(list);
  const ch = channels(list);
  return { label, date, orders: s.orders, sales: s.sales, avgTicket: s.avgTicket, tips: s.tips, breakfast: s.breakfast, lunch: s.lunch,
    counter: ch[0].orders, online: ch[1].orders, doordash: ch[2].orders, avgMinutes: s.avgMinutes };
}

function tablesOn(dates) {
  const set = new Set(dates);
  const list = reservations.book.list.filter((r) => set.has(r.date) && (r.status === "booked" || r.status === "seated"));
  return { tables: list.length, people: list.reduce((a, r) => a + (Number(r.party) || 0), 0) };
}

// The sales tax Square added to DoorDash orders: what's left of the order
// after the net and the tip. DoorDash collects and pays that tax itself
// (Kansas's marketplace law; its payout export says "tax remitted by
// DoorDash", "passed to merchant" $0.00; checked 2026-11-09), so it's in
// Square's tax total but isn't the cafe's to send in.
const doordashTax = (records) => round2(records.filter((r) => r.doordash)
  .reduce((a, r) => a + Math.max(0, (r.sales || 0) - netOf(r) - (r.tip || 0)), 0));

const feePercent = () => Math.max(0, Math.min(50, Number(cfg.doordashFeePercent) || 0));

// The report for the days from..to (one day when they're the same): null
// when the history has no orders in them.
function buildReport(from, to, all = days()) {
  if (to < from) [from, to] = [to, from];
  const dates = Object.keys(all).filter((d) => d >= from && d <= to && all[d].orders.length).sort();
  if (!dates.length) return null;
  const records = dates.flatMap((d) => all[d].orders);
  const s = stats.summarize(records);
  const single = from === to;
  const ddTax = doordashTax(records);
  const r = {
    from, to, single, dates, madeAt: new Date().toISOString(),
    week: !single && from === mondayOf(from) && (to === shift(from, 6) || to === shift(from, 4)),
    totals: { ...brief(s), collected: round2(s.collected - ddTax), tipped: s.tipped },
    channels: channels(records), meals: meals(records), hours: hours(records, dates.length),
    doordash: { ...(s.handoff ? s.handoff.doordash : {}), fee: feePercent(), tax: ddTax }, online: s.handoff ? s.handoff.online : null,
    kitchen: { avgMinutes: s.avgMinutes, longestMinutes: s.longestMinutes, done: s.kitchenDone, bySize: s.bySize.filter((b) => b.orders), slowest: s.slowest },
    toGo: s.toGo, forHere: s.forHere,
    specials: stats.specialsSold(dates.map((date) => ({ date, orders: all[date].orders }))),
    items: s.items, reservations: tablesOn(dates),
  };
  if (single) {
    // The same weekday last week, and a usual one: up to four weeks before, from two up.
    const lw = all[shift(from, -7)];
    r.before = lw && lw.orders.length ? { label: `last ${weekday(from)}`, ...brief(stats.summarize(lw.orders)) } : null;
    const weeks = [1, 2, 3, 4].map((w) => all[shift(from, -7 * w)]).filter((d) => d && d.orders.length).map((d) => stats.summarize(d.orders));
    r.usual = weeks.length >= 2 ? { weeks: weeks.length, orders: Math.round(weeks.reduce((a, b) => a + b.orders, 0) / weeks.length), sales: round2(weeks.reduce((a, b) => a + b.sales, 0) / weeks.length) } : null;
    r.doordash.list = records.filter((x) => x.doordash).sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
      .map((x) => ({ at: x.at, items: lead.itemsOf(x), net: netOf(x), kitchenMinutes: x.kitchenMinutes, waitMinutes: x.waitMinutes }));
  } else {
    // The same stretch before (lib/stats.js previousRange: the same weekdays a
    // week or whole weeks back, or the month before for a range from the 1st).
    const prev = stats.previousRange(from, to);
    const before = Object.keys(all).filter((d) => d >= prev.from && d <= prev.to && all[d].orders.length);
    r.before = before.length ? { label: prev.label, days: before.length, ...brief(stats.summarize(before.flatMap((d) => all[d].orders))) } : null;
    r.byWeek = dates.length > MAX_DAY_ROWS;
    r.rows = !r.byWeek
      ? dates.map((d) => row(shortDate(d), d, all[d].orders))
      : [...new Set(dates.map(mondayOf))].map((m) => row(`Week of ${dayOnly(m)}`, m, dates.filter((d) => mondayOf(d) === m).flatMap((d) => all[d].orders)));
  }
  return r;
}

// ---------------------------------------------------------------- the page

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n) => (n == null ? "–" : `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const mins = (n) => (n == null ? "–" : `${Math.round(n)} min`);
const at12 = (d) => new Date(`${d}T12:00:00`);
const weekday = (d) => at12(d).toLocaleDateString("en-US", { weekday: "long" });
const longDate = (d) => at12(d).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
const shortDate = (d) => at12(d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const tinyDate = (d) => `${at12(d).toLocaleDateString("en-US", { weekday: "short" })} ${Number(d.slice(5, 7))}/${Number(d.slice(8))}`;
const dayOnly = (d) => at12(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const clock = (iso) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const hourName = (h) => `${h % 12 || 12}${h < 12 ? "am" : "pm"}`;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// Up or down against before, in words and an arrow, never colour alone.
function vs(now, then, words, isMoney) {
  if (then == null || now == null) return "";
  const diff = round2(now - then);
  if (Math.abs(diff) < (isMoney ? 0.5 : 1)) return `<em>= same as ${esc(words)}</em>`;
  const pct = then ? ` (${Math.abs(Math.round((diff / then) * 100))}%)` : "";
  return `<em class="${diff > 0 ? "up" : "down"}">${diff > 0 ? "▲" : "▼"} ${isMoney ? money(Math.abs(diff)) : Math.abs(diff)}${pct} ${diff > 0 ? "over" : "under"} ${esc(words)}</em>`;
}

function table(head, rows, opts = {}) {
  return `<table${opts.cls ? ` class="${opts.cls}"` : ""}><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
    <tbody>${rows.map((r) => `<tr${r.total ? ' class="total"' : ""}>${r.cells.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

function titleOf(r) {
  if (r.single) return { kind: "Daily report", when: longDate(r.from) };
  const year = r.from.slice(0, 4) === r.to.slice(0, 4) ? `, ${r.to.slice(0, 4)}` : "";
  return { kind: r.week ? "Weekly report" : "Report", when: `${shortDate(r.from)} to ${shortDate(r.to)}${year}` };
}

function channelHtml(r) {
  const all = r.channels.reduce((a, c) => ({ orders: a.orders + c.orders, net: a.net + c.net }), { orders: 0, net: 0 });
  return `<h2>Where the orders came from</h2>` + table(["", "Orders", "Net sales", "Avg", "Share"], [
    ...r.channels.map((c) => ({ cells: [c.name, c.orders, money(c.net), money(c.avgTicket), `${c.share}%`] })),
    { total: true, cells: ["All", all.orders, money(all.net), money(r.totals.avgTicket), "100%"] },
    // Breakfast and lunch under the same heads (the hours never change, so
    // no "before 10:30am": Mitch 2026-11-09, no excess text).
    ...r.meals.map((m) => ({ cells: [m.meal === "breakfast" ? "Breakfast" : "Lunch", m.orders, money(m.net),
      m.orders ? money(m.net / m.orders) : "–", all.net ? `${Math.round((m.net / all.net) * 100)}%` : "–"] })),
  ]) + `<p class="small">${r.toGo} to go · ${r.forHere} for here.</p>`;
}

function doordashHtml(r) {
  const dd = r.channels.find((c) => c.key === "doordash");
  const on = r.channels.find((c) => c.key === "online");
  const d = r.doordash;
  let out = `<h2>DoorDash</h2>`;
  if (!dd.orders) out += `<p>No DoorDash orders.</p>`;
  else {
    const lines = [`<b>${plural(dd.orders, "order")}</b>, ${money(dd.net)} (${dd.share}% of sales), ${money(dd.avgTicket)} average.`];
    if (d.kitchenMinutes != null) lines.push(`Kitchen ${d.kitchenMinutes} min (median).`);
    if (d.waitMinutes != null) lines.push(`Dashers waited ${d.waitMinutes} min at the counter.`);
    if (d.fee) {
      const fee = round2((dd.net * d.fee) / 100);
      lines.push(`At ${d.fee}% commission: about ${money(fee)} to DoorDash, ${money(dd.net - fee)} to the cafe.`);
    }
    out += `<p>${lines.join(" ")}</p>`;
    if (d.tax) out += `<p><b>Sales tax:</b> DoorDash pays it on its orders. ${money(d.tax)} of Square's tax is on these orders and isn't the cafe's to send in.</p>`;
    if (d.list && d.list.length) {
      out += table(["Time", "Items", "Net", "Kitchen", "Dasher wait"], d.list.map((o) => ({ cells: [clock(o.at), o.items, money(o.net), mins(o.kitchenMinutes), mins(o.waitMinutes)] })));
    }
  }
  if (on.orders) {
    const o = r.online || {};
    out += `<p><b>Online pickups:</b> ${plural(on.orders, "order")}, ${money(on.net)}${o.kitchenMinutes != null ? `; kitchen ${o.kitchenMinutes} min` : ""}${o.waitMinutes != null ? `, then ${o.waitMinutes} min on the counter for the customer` : ""}${o.kitchenMinutes != null || o.waitMinutes != null ? " (medians)" : ""}.</p>`;
  }
  return out;
}

function kitchenHtml(r) {
  const k = r.kitchen;
  let out = `<h2>The kitchen</h2><p>${k.avgMinutes != null
    ? `${k.avgMinutes} min on average from the board to Done; longest ${k.longestMinutes} min.`
    : "No kitchen times saved."}</p>`;
  // By order size on one line (room for bigger type, Mitch 2026-11-09).
  if (k.bySize.length) out += `<p>By order size (median): ${k.bySize.map((b) => `${esc(b.label)} ${mins(b.medianMinutes)} (${b.orders})`).join(" · ")}.</p>`;
  if (r.single && k.slowest && k.slowest.length) {
    out += `<p class="small">Slowest: ${k.slowest.map((o) => `${r.single ? "" : `${shortDate(localDate(new Date(o.at)))} `}${clock(o.at)}, ${mins(o.kitchenMinutes)} (${esc(o.items.slice(0, 2).join(", "))}${o.items.length > 2 ? ", …" : ""})`).join("; ")}.</p>`;
  }
  return out;
}

function hoursHtml(r) {
  if (!r.hours.length) return "";
  const max = Math.max(...r.hours.map((h) => h.orders));
  const barCell = (h) => `<span class="bar" style="width:${Math.max(3, Math.round((h.orders / max) * 100))}%"></span>`;
  return `<h2>By the hour</h2>` + table(r.single ? ["Hour", "Orders", "Net sales", ""] : ["Hour", "Orders", "A day", "Net sales", ""],
    r.hours.map((h) => ({ cells: [hourName(h.hour), h.orders, ...(r.single ? [] : [h.perDay]), money(h.net), barCell(h)] })), { cls: "hours" });
}

function specialsHtml(r) {
  const sp = r.specials;
  if (!sp.plates.length && !sp.soups.length && !sp.soupSides) return "";
  // Cups and bowls sold on their own, then the cups picked as the special's
  // side (Mitch 2026-11-09: count them, but not as a sale of the soup).
  const soup = (c) => [c.cups && `${c.cups} cup${c.cups === 1 ? "" : "s"}`, c.bowls && `${c.bowls} bowl${c.bowls === 1 ? "" : "s"}`,
    c.sides && `${c.sides} as a side`].filter(Boolean).join(", ");
  // A day's sides not put with a soup (no soup sold on its own that day, or two).
  const loose = (d) => (d.soupSides && !Object.values(d.soups).some((c) => c.sides) ? d.soupSides : 0);
  const sidesNote = sp.soupSides ? `<p class="small">"As a side": cups picked as the Lunch Special's side, not sold on their own.</p>` : "";
  if (r.single) {
    const d = sp.days[0] || { soupSides: 0, soups: {} };
    return `<h2>Specials</h2>` + [...sp.plates.map((x) => `<p><b>Lunch Special, ${esc(x.name)}:</b> ${x.qty} sold</p>`),
      ...sp.soups.map((x) => `<p><b>Soup, ${esc(x.name)}:</b> ${soup(x)}</p>`),
      loose(d) ? `<p><b>Soup, as a side:</b> ${loose(d)}</p>` : ""].join("") + sidesNote;
  }
  if (sp.days.length <= 10) {
    return `<h2>Specials</h2>` + table(["Day", "Lunch Special", "Soup"], sp.days.map((d) => ({ cells: [tinyDate(d.date),
      Object.entries(d.plates).map(([n, q]) => `${esc(n)} (${q})`).join(", ") || "–",
      [...Object.entries(d.soups).map(([n, c]) => `${esc(n)} (${soup(c)})`), loose(d) ? `Soup (${loose(d)} as a side)` : ""].filter(Boolean).join(", ") || "–"] })), { cls: "left" })
      + sidesNote;
  }
  // A long stretch: each plate and soup once, best sellers a day first.
  return `<h2>Specials, best sellers a day first</h2>` + table(["", "Days on", "Sold", "A day"], [
    ...sp.plates.slice(0, 8).map((x) => ({ cells: [`Lunch Special, ${esc(x.name)}`, x.days, x.qty, x.perDay] })),
    ...sp.soups.slice(0, 6).map((x) => ({ cells: [`Soup, ${esc(x.name)}${x.sides ? ` (+${x.sides} as a side)` : ""}`, x.days, x.qty, x.perDay] })),
  ]) + (sp.soupSides ? `<p class="small">Soup as the Lunch Special's side: ${sp.soupSides} cups in all, not counted as sold.</p>` : "");
}

function rowsHtml(r) {
  const t = r.totals;
  return `<h2>${r.byWeek ? "Week by week" : "Day by day"}</h2>` + table(["", "Orders", "Net sales", "Avg", "Tips", "Bkfst / lunch", "Counter", "Online", "DoorDash", "Kitchen"], [
    ...r.rows.map((d) => ({ cells: [d.label, d.orders, money(d.sales), money(d.avgTicket), money(d.tips), `${d.breakfast} / ${d.lunch}`, d.counter, d.online, d.doordash, mins(d.avgMinutes)] })),
    { total: true, cells: [r.byWeek ? "All" : plural(r.dates.length, "day"), t.orders, money(t.sales), money(t.avgTicket), money(t.tips), `${r.meals[0].orders} / ${r.meals[1].orders}`,
      r.channels[0].orders, r.channels[1].orders, r.channels[2].orders, mins(r.kitchen.avgMinutes)] },
  ], { cls: "rows" });
}

function itemsHtml(r) {
  if (!r.items.length) return "";
  const shown = r.items.slice(0, MAX_ITEMS);
  const rest = r.items.slice(MAX_ITEMS);
  return `<h2>Everything sold</h2><div class="items">${shown.map((it) => `<div><b>${it.qty}</b><span>${esc(it.name)}</span></div>`).join("")}
    ${rest.length ? `<div><b>${rest.reduce((a, it) => a + it.qty, 0)}</b><span>${plural(rest.length, "other item")}</span></div>` : ""}</div>`;
}

// The page Manage shows and prints. Letter, portrait: before printing (and
// for the preview) it measures itself and zooms out until it fits one page.
const PAGE_CSS = `
@page { size: letter portrait; margin: 0.4in; }
html, body { margin: 0; }
body { background: #E9E4DA; color: #22323A; font-family: Lato, "Segoe UI", Arial, sans-serif; font-size: 11px; line-height: 1.35; font-variant-numeric: lining-nums tabular-nums; }
.sheet { width: 8.5in; min-height: 11in; margin: 12px auto; padding: 0.4in; box-sizing: border-box; background: #fff; box-shadow: 0 2px 10px rgba(0,0,0,.18); zoom: var(--screen-zoom, 1); }
.rp { width: var(--w, 7.7in); zoom: var(--fit, 1); }
@media print {
  body { background: #fff; }
  .sheet { width: auto; min-height: 0; margin: 0; padding: 0; box-shadow: none; zoom: 1; }
}
h1, h2 { font-family: "Playfair Display", Georgia, serif; font-weight: 700; color: #1F4552; }
.hd { display: flex; justify-content: space-between; align-items: flex-end; gap: 1em; padding-bottom: 6px; border-bottom: 2.5px solid #1F4552; }
.hd h1 { margin: 0; font-size: 26px; line-height: 1; white-space: nowrap; }
.hd .kind { margin-top: 5px; font-size: 10px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: #A02F26; }
.hd .when { text-align: right; font-family: "Playfair Display", Georgia, serif; font-weight: 700; font-size: 15px; }
.hd .made { text-align: right; font-size: 9px; color: #5B6B72; margin-top: 3px; }
.big { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin: 8px 0 4px; }
.big > div { background: #F4EFE6; border-radius: 5px; padding: 6px 8px; }
.big b { display: block; font-size: 19px; font-weight: 900; line-height: 1.15; }
.big span { font-size: 10px; color: #5B6B72; }
.big em { display: block; font-style: normal; font-size: 9.5px; font-weight: 700; color: #5B6B72; margin-top: 2px; }
em.up { color: #2E7D4F; } em.down { color: #A02F26; }
.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 0 20px; }
h2 { margin: 10px 0 3px; font-size: 13px; line-height: 1.2; }
p { margin: 0 0 4px; }
.small, .usual { font-size: 10px; color: #5B6B72; }
table { width: 100%; border-collapse: collapse; margin: 0 0 4px; }
th { padding: 2px 4px; border-bottom: 1.5px solid #1F4552; font-size: 9px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: #5B6B72; text-align: right; }
td { padding: 2px 4px; border-bottom: 1px solid #E8E2D8; text-align: right; vertical-align: top; }
th:first-child, td:first-child, table.left td, table.left th { text-align: left; }
table.left td:first-child { white-space: nowrap; }
tr.total td { font-weight: 700; border-top: 1px solid #1F4552; }
table.hours td:last-child { width: 38%; vertical-align: middle; }
.bar { display: block; height: 7px; background: #2C5E70; border-radius: 0 2px 2px 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.big > div { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.items { columns: 4; column-gap: 16px; }
.items div { display: flex; gap: 6px; padding: 0; line-height: 1.3; border-bottom: 1px solid #EEE9E0; break-inside: avoid; }
.items b { min-width: 2.2em; text-align: right; }
.foot { margin-top: 8px; padding-top: 4px; border-top: 1px solid #E3DDD3; font-size: 9px; color: #5B6B72; }
/* Black & white (Print a report's switch, html.bw; Mitch 2026-11-09: save
   the colour ink): black type, neutral greys for the rules and bars (a warm
   grey is mixed from colour ink), no shaded boxes. */
html.bw body, html.bw h1, html.bw h2, html.bw .hd .kind, html.bw .hd .made, html.bw .big span, html.bw .big em,
html.bw em.up, html.bw em.down, html.bw .small, html.bw .usual, html.bw th, html.bw .foot { color: #000; }
html.bw .hd, html.bw th, html.bw tr.total td { border-color: #000; }
html.bw td, html.bw .items div, html.bw .foot { border-color: #BBB; }
html.bw .big > div { background: none; border: 1px solid #000; }
html.bw .bar { background: #777; }
`;
// Size the page to FILL one letter page (10.2in of height inside the
// margins, a little spare kept for the printer): bigger type when there's
// room, up to MAX (Mitch 2026-11-09: a week's came out small with a third of
// the page empty), smaller when there's a lot, never below MIN. Zooming by f
// also widens, so the content is laid out at 7.7in / f and zoomed back to
// 7.7in; the f that fits is found by halving, measured at zoom 1.
const FIT_JS = `
(() => {
  const root = document.documentElement, rp = document.querySelector(".rp");
  const PAGE = 10.2 * 96 * 0.985, WIDTH = 7.7 * 96, MIN = 0.5, MAX = 1.6;
  const tall = (f) => { root.style.setProperty("--w", (WIDTH / f).toFixed(1) + "px"); return rp.getBoundingClientRect().height * f; };
  function fit() {
    root.style.setProperty("--fit", 1);
    root.style.setProperty("--screen-zoom", 1);
    let lo = MIN, hi = MAX;
    if (tall(hi) <= PAGE) lo = hi;
    else for (let i = 0; i < 14; i++) { const f = (lo + hi) / 2; if (tall(f) <= PAGE) lo = f; else hi = f; }
    tall(lo);
    root.style.setProperty("--fit", lo.toFixed(3));
    root.style.setProperty("--screen-zoom", Math.min(1, (root.clientWidth - 16) / (8.5 * 96)).toFixed(3));
  }
  fit();
  if (document.fonts) document.fonts.ready.then(fit);
  addEventListener("resize", fit);
  addEventListener("beforeprint", fit);
})();`;

function renderHtml(r, { bw = false } = {}) {
  const t = r.totals;
  const { kind, when } = titleOf(r);
  const b = r.before;
  const cmp = b ? [vs(t.sales, b.sales, b.label, true), vs(t.orders, b.orders, b.label), vs(t.avgTicket, b.avgTicket, b.label, true), vs(t.tips, b.tips, b.label, true)] : [];
  const notes = [
    r.single && r.usual ? `A usual ${weekday(r.from)} (last ${r.usual.weeks} weeks): ${r.usual.orders} orders, ${money(r.usual.sales)}.` : "",
    !r.single && b ? `${esc(b.label[0].toUpperCase() + b.label.slice(1))}: ${b.orders} orders, ${money(b.sales)}.` : "",
    r.reservations.tables ? `Reservations: ${plural(r.reservations.tables, "table")}, ${plural(r.reservations.people, "person", "people")}.` : "",
  ].filter(Boolean).join(" ");
  const big = [[money(t.sales), "net sales", cmp[0]], [t.orders, "orders", cmp[1]], [money(t.avgTicket), "average ticket", cmp[2]],
    [money(t.tips), `tips${t.tipped ? `, on ${plural(t.tipped, "order")}` : ""}`, cmp[3]]];
  const body = `
<header class="hd">
  <div><h1>The Café</h1><div class="kind">${kind}</div></div>
  <div><div class="when">${esc(when)}</div><div class="made">Printed ${esc(new Date(r.madeAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }))}</div></div>
</header>
<div class="big">${big.map(([v, label, sub]) => `<div><b>${v}</b><span>${label}</span>${sub || ""}</div>`).join("")}</div>
${notes ? `<p class="usual">${notes}</p>` : ""}
${r.single ? "" : rowsHtml(r)}
<div class="cols">
  <div>${channelHtml(r)}${doordashHtml(r)}${r.single ? "" : kitchenHtml(r)}</div>
  <div>${hoursHtml(r)}${specialsHtml(r)}${r.single ? kitchenHtml(r) : ""}</div>
</div>
${itemsHtml(r)}
<p class="foot">Collected, tax and tips in: ${money(t.collected)}${r.doordash.tax ? " (less DoorDash's sales tax)" : ""}. Net sales are after discounts, before tax and tips, by the day ordered; refunds aren't taken off. The kitchen board's own count; Square's Dashboard has the official sales.</p>`;
  return `<!DOCTYPE html><html lang="en"${bw ? ' class="bw"' : ""}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(`The Café ${kind.toLowerCase()}, ${when}`)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Lato:wght@400;700;900&family=Playfair+Display:wght@700&display=swap">
<style>${PAGE_CSS}</style></head>
<body><div class="sheet"><div class="rp">${body}</div></div><script>${FIT_JS}</script></body></html>`;
}

// The last day before `date` with orders saved: Manage's "Last day open".
function lastDayBefore(date, all = days()) {
  return Object.keys(all).filter((d) => d < date && all[d].orders.length).sort().pop() || null;
}

// ---------------------------------------------------------------- the email

// The emailed report (lib/report-mail.js): the email itself is a short
// summary to read on a phone, with the page above attached as a PDF to
// print. Inline styles and tables only: mail apps drop most of a page's CSS.
function subjectOf(r) {
  const t = r.totals;
  const when = r.single ? shortDate(r.from) : r.week ? `week of ${dayOnly(r.from)}` : `${dayOnly(r.from)} to ${dayOnly(r.to)}`;
  return `The Café, ${when}: ${money(t.sales)}, ${plural(t.orders, "order")}`;
}

function emailVs(now, then, words, isMoney) {
  if (then == null || now == null) return "";
  const diff = round2(now - then);
  if (Math.abs(diff) < (isMoney ? 0.5 : 1)) return `same as ${words}`;
  return `${diff > 0 ? "▲" : "▼"} ${isMoney ? money(Math.abs(diff)) : Math.abs(diff)} ${diff > 0 ? "over" : "under"} ${words}`;
}

function emailHtml(r, { pdf = true } = {}) {
  const t = r.totals, b = r.before;
  const { kind, when } = titleOf(r);
  const ink = "#22323A", muted = "#5B6B72", head = "#1F4552", line = "#E3DDD3";
  const cell = (v, right, bold) => `<td style="padding:4px 8px;border-bottom:1px solid ${line};text-align:${right ? "right" : "left"};${bold ? "font-weight:700;" : ""}">${v}</td>`;
  const big = [[money(t.sales), "net sales", b && emailVs(t.sales, b.sales, b.label, true)], [t.orders, "orders", b && emailVs(t.orders, b.orders, b.label)],
    [money(t.avgTicket), "average ticket", b && emailVs(t.avgTicket, b.avgTicket, b.label, true)], [money(t.tips), "tips", b && emailVs(t.tips, b.tips, b.label, true)]];
  const rows = [
    ...r.channels.map((c) => [c.name, c.orders, money(c.net), `${c.share}%`]),
    ...r.meals.map((m) => [m.meal === "breakfast" ? "Breakfast" : "Lunch", m.orders, money(m.net), t.sales ? `${Math.round((m.net / t.sales) * 100)}%` : "–"]),
  ];
  const k = r.kitchen;
  const extra = [
    k.avgMinutes != null ? `Kitchen: ${mins(k.avgMinutes)} average, longest ${mins(k.longestMinutes)}.` : "",
    r.doordash.waitMinutes != null ? `Dashers waited ${mins(r.doordash.waitMinutes)} at the counter (median).` : "",
    r.reservations.tables ? `Reservations: ${plural(r.reservations.tables, "table")}.` : "",
  ].filter(Boolean).join(" ");
  return `<div style="max-width:560px;margin:0 auto;font-family:Lato,'Segoe UI',Arial,sans-serif;font-size:14px;line-height:1.4;color:${ink}">
<p style="margin:0;font-family:Georgia,serif;font-size:22px;font-weight:700;color:${head}">The Café</p>
<p style="margin:2px 0 12px;font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#A02F26">${esc(kind)} · ${esc(when)}</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:0 0 12px">
${big.map(([v, label, sub]) => `<tr><td style="padding:3px 0;width:42%;font-size:20px;font-weight:900">${v}</td><td style="padding:3px 0;color:${muted}">${label}${sub ? `<br><span style="font-size:12px">${esc(sub)}</span>` : ""}</td></tr>`).join("")}
</table>
<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:0 0 10px;font-size:13px">
<tr>${["", "Orders", "Net sales", "Share"].map((h, i) => `<th style="padding:4px 8px;border-bottom:2px solid ${head};font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:${muted};text-align:${i ? "right" : "left"}">${h}</th>`).join("")}</tr>
${rows.map((row) => `<tr>${row.map((v, i) => cell(esc(v), i > 0, i === 0)).join("")}</tr>`).join("")}
</table>
${extra ? `<p style="margin:0 0 10px">${esc(extra)}</p>` : ""}
<p style="margin:14px 0 0;padding-top:8px;border-top:1px solid ${line};font-size:12px;color:${muted}">${pdf
    ? "The whole report is attached as a PDF: open it and print, it fits one letter page."
    : "The whole report is attached as a page: open it in Chrome and print, it fits one letter page."} The kitchen board's own count; Square's Dashboard has the official sales.</p>
</div>`;
}

// The email's plain-text part, for a mail app that shows no HTML.
function emailText(r) {
  const t = r.totals, b = r.before;
  const { kind, when } = titleOf(r);
  return [`The Café · ${kind}, ${when}`, "",
    `Net sales ${money(t.sales)} · ${plural(t.orders, "order")} · average ${money(t.avgTicket)} · tips ${money(t.tips)}`,
    b ? `${b.label[0].toUpperCase() + b.label.slice(1)}: ${money(b.sales)}, ${plural(b.orders, "order")}` : "", "",
    ...r.channels.map((c) => `${c.name}: ${c.orders} orders, ${money(c.net)} (${c.share}%)`),
    ...r.meals.map((m) => `${m.meal === "breakfast" ? "Breakfast" : "Lunch"}: ${m.orders} orders, ${money(m.net)}`), "",
    "The whole report is attached, to print."].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n");
}

module.exports = { buildReport, renderHtml, titleOf, lastDayBefore, subjectOf, emailHtml, emailText, MAX_DAY_ROWS };
