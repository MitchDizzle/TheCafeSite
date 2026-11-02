#!/usr/bin/env node
// Reads the kitchen board's order history in this backup repo: this month's
// days (history/<date>.json) and finished months (history/<month>.json.gz).
// Node only, no packages. Kept in TheCafeSite (kitchen/backup-tools/) and
// copied here by the kitchen PC with every backup: edit it there.
//
//   node tools/read-history.js                    every day, summed up
//   node tools/read-history.js 2026-10            one month
//   node tools/read-history.js 2026-10-26 2026-11-01   a range of days
//   ... --csv orders.csv      one row per order, for Excel
//   ... --items items.csv     one row per item
//   ... --restore stats-history.json   the days joined back into the file the
//                                      board keeps (kitchen/data/), to put back
//
// HOW-TO-READ.md says what each field means.
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const HISTORY = path.join(__dirname, "..", "history");
const TZ = "America/Chicago"; // the cafe's clock: times in the files are UTC

function loadDays() {
  const days = {};
  if (!fs.existsSync(HISTORY)) return days;
  for (const name of fs.readdirSync(HISTORY).sort()) {
    const file = path.join(HISTORY, name);
    if (/^\d{4}-\d{2}\.json\.gz$/.test(name)) Object.assign(days, JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString("utf8")).days);
    else if (/^\d{4}-\d{2}-\d{2}\.json$/.test(name)) days[name.slice(0, 10)] = JSON.parse(fs.readFileSync(file, "utf8"));
  }
  return days;
}

// The arguments: up to two dates (a month "2026-10" means all of it), and
// --csv / --items / --restore with a file name each.
function parseArgs(argv) {
  const out = { dates: [], csv: null, items: null, restore: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--csv" || a === "--items" || a === "--restore") out[a.slice(2)] = argv[++i] || (a === "--restore" ? "stats-history.json" : `${a.slice(2)}.csv`);
    else if (/^\d{4}-\d{2}(-\d{2})?$/.test(a)) out.dates.push(a);
    else if (a === "-h" || a === "--help") out.help = true;
    else { console.error(`Not understood: ${a}`); out.help = true; }
  }
  return out;
}

const time = (iso) => new Date(iso).toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
const hourOf = (iso) => Number(new Date(iso).toLocaleString("en-US", { timeZone: TZ, hour: "numeric", hour12: false })) % 24;
const net = (o) => (o.net != null ? o.net : o.sales != null ? o.sales : 0);
const money = (n) => `$${n.toFixed(2)}`;
const where = (o) => (o.doordash ? "doordash" : o.online ? "online" : "counter");
const itemText = (i) => `${i.qty > 1 ? `${i.qty} ` : ""}${i.name}${i.variation ? ` (${i.variation})` : ""}`;
const pad = (s, n) => String(s).padEnd(n);
const median = (list) => { const s = [...list].sort((a, b) => a - b); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };

function sum(orders) {
  const times = orders.map((o) => o.kitchenMinutes).filter((m) => m != null);
  return {
    orders: orders.length,
    sales: orders.reduce((a, o) => a + net(o), 0),
    tips: orders.reduce((a, o) => a + (o.tip || 0), 0),
    breakfast: orders.filter((o) => o.meal === "breakfast").length,
    lunch: orders.filter((o) => o.meal === "lunch").length,
    online: orders.filter((o) => o.online).length,
    avg: times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null,
    middle: times.length ? Math.round(median(times)) : null,
    longest: times.length ? Math.round(Math.max(...times)) : null,
  };
}

function csvFile(file, rows) {
  const cell = (v) => (v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  fs.writeFileSync(file, rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n");
  console.log(`Wrote ${file} (${rows.length - 1} rows).`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(fs.readFileSync(__filename, "utf8").split("\n").slice(5, 14).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
    return;
  }
  const all = loadDays();
  const [a, b] = args.dates;
  const from = a ? (a.length === 7 ? `${a}-01` : a) : "0000";
  const to = b ? (b.length === 7 ? `${b}-31` : b) : a ? (a.length === 7 ? `${a}-31` : a) : "9999";
  const dates = Object.keys(all).filter((d) => d >= from && d <= to).sort();
  if (!dates.length) { console.log(`No days saved${a ? " in that range" : ""}. The history has ${Object.keys(all).length} day(s).`); return; }

  if (args.restore) {
    const days = Object.fromEntries(dates.map((d) => [d, all[d]]));
    fs.writeFileSync(args.restore, JSON.stringify({ days }));
    console.log(`Wrote ${args.restore}: ${dates.length} day(s), ${dates[0]} to ${dates.at(-1)}. Close the board, then copy it to kitchen\\data\\stats-history.json.`);
    return;
  }
  const orders = dates.flatMap((d) => all[d].orders.map((o) => ({ date: d, ...o })));
  if (args.csv) csvFile(args.csv, [
    ["date", "time", "receipt", "meal", "where", "to_go", "paid", "net_sales", "tip", "collected", "kitchen_items", "kitchen_min", "wait_min", "items"],
    ...orders.map((o) => [o.date, time(o.at), o.receipt, o.meal, where(o), o.toGo ? "yes" : "no", o.paid ? "yes" : "no",
      o.net != null ? o.net.toFixed(2) : "", o.tip != null ? o.tip.toFixed(2) : "", o.sales != null ? o.sales.toFixed(2) : "",
      o.kitchenItems, o.kitchenMinutes, o.waitMinutes, o.items.map(itemText).join("; ")]),
  ]);
  if (args.items) csvFile(args.items, [
    ["date", "time", "receipt", "meal", "where", "item", "variation", "qty", "order_kitchen_min"],
    ...orders.flatMap((o) => o.items.map((i) => [o.date, time(o.at), o.receipt, o.meal, where(o), i.name, i.variation, i.qty, o.kitchenMinutes])),
  ]);
  if (args.csv || args.items) return;

  // The summary, as Manage -> Reports shows it.
  console.log(`${pad("Day", 12)}${pad("Orders", 8)}${pad("Sales", 11)}${pad("Bkfst", 7)}${pad("Lunch", 7)}${pad("Online", 8)}${pad("Avg", 6)}Longest`);
  for (const d of dates) {
    const s = sum(all[d].orders);
    const day = new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    console.log(`${pad(day, 12)}${pad(s.orders, 8)}${pad(money(s.sales), 11)}${pad(s.breakfast, 7)}${pad(s.lunch, 7)}${pad(s.online, 8)}${pad(s.avg != null ? `${s.avg}m` : "-", 6)}${s.longest != null ? `${s.longest}m` : "-"}`);
  }
  const t = sum(orders);
  console.log(`\n${dates.length} day(s): ${t.orders} orders (${Math.round(t.orders / dates.length)} a day), ${money(t.sales)} net sales, ${money(t.tips)} tips.`);
  console.log(`Kitchen time: ${t.avg ?? "-"} min on average, ${t.middle ?? "-"} middle, ${t.longest ?? "-"} longest.`);
  const slow = orders.filter((o) => o.kitchenMinutes != null).sort((x, y) => y.kitchenMinutes - x.kitchenMinutes).slice(0, 3);
  if (slow.length) {
    console.log("\nSlowest orders:");
    for (const o of slow) console.log(`  ${Math.round(o.kitchenMinutes)} min  ${o.date} ${time(o.at)}  ${where(o)}${o.receipt ? ` #${o.receipt}` : ""}  ${o.items.map(itemText).join(", ")}`);
  }
  const byHour = {};
  for (const o of orders) byHour[hourOf(o.at)] = (byHour[hourOf(o.at)] || 0) + 1;
  console.log(`\nBy hour: ${Object.keys(byHour).map(Number).sort((x, y) => x - y).map((h) => `${h % 12 || 12}${h < 12 ? "am" : "pm"} ${byHour[h]}`).join(" · ")}`);
  const qty = new Map();
  for (const o of orders) for (const i of o.items) qty.set(i.name, (qty.get(i.name) || 0) + i.qty);
  console.log(`\nTop items: ${[...qty].sort((x, y) => y[1] - x[1]).slice(0, 10).map(([n, q]) => `${n} x${q}`).join(", ")}`);
  const plates = new Map();
  for (const o of orders) for (const i of o.items) if (/^lunch special$/i.test(i.name) && i.variation) plates.set(i.variation, (plates.get(i.variation) || 0) + i.qty);
  if (plates.size) console.log(`\nLunch Specials: ${[...plates].sort((x, y) => y[1] - x[1]).map(([n, q]) => `${n} x${q}`).join(", ")}`);
}

main();
