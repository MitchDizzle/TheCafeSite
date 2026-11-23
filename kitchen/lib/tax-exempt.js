// Manage -> Tax exempt: the counter sales rung up with the tax taken off
// (a veteran's exemption; Mitch 2026-11-23: Square has no tax-exempt
// customers, so the tax is removed by hand at checkout and the number was
// written on paper). The board finds those sales by itself, from the daily
// history (stats.js keeps each order's tax), and asks for the exemption
// number against each one; a sale Square doesn't have (or one rung before
// the board kept the tax) can be added by hand. The list for a month, with
// each number's total, is what goes with the sales tax return.
//
// The numbers are customers' own, so they're kept only in
// data\tax-exempt.json on the kitchen PC: the nightly backup copies it
// (this PC and backupDir), the GitHub backup never does, and nothing here
// goes to the website or Square.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { DATA, MOCK } = require("./config");
const { localDate } = require("./util");

const FILE = path.join(DATA, MOCK ? "tax-exempt-mock.json" : "tax-exempt.json");

// sales: order id -> { number, name, savedAt } or { notExempt: true, savedAt }
// added: sales typed in by hand: { id, date, time, amount, receipt, number, name, savedAt }
let store = { sales: {}, added: [] };
try {
  store = { sales: {}, added: [], ...JSON.parse(fs.readFileSync(FILE, "utf8")) };
} catch {}
function save() {
  fs.writeFileSync(FILE + ".tmp", JSON.stringify(store, null, 1));
  fs.renameSync(FILE + ".tmp", FILE);
}

const round2 = (n) => Math.round(n * 100) / 100;
const clean = (s, max) => String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, max);

// A sale rung at the counter, paid, for something, with no tax on it. An
// order saved before the board kept the tax (tax undefined) is never
// flagged: those are added by hand. Online and DoorDash orders always carry
// their tax, and an exemption is shown at the counter.
const amountOf = (r) => (r.net != null && r.net > 0 ? r.net : r.sales || 0);
const isTaxFree = (r) => !r.online && r.paid && r.tax === 0 && amountOf(r) > 0;

// Every tax-free sale in [from, to] (dates, YYYY-MM-DD), oldest first, each
// with its number if it has one, and each number's total.
function taxExemptReport(from, to, days) {
  const rows = [];
  for (const date of Object.keys(days).filter((d) => d >= from && d <= to)) {
    for (const r of days[date].orders || []) {
      if (!isTaxFree(r)) continue;
      const e = store.sales[r.id] || {};
      rows.push({ id: r.id, date, at: r.at, receipt: r.receipt || null, amount: round2(amountOf(r)),
        items: (r.items || []).map((i) => `${i.qty > 1 ? `${i.qty} ` : ""}${i.name}${i.variation ? ` (${i.variation})` : ""}`),
        number: e.number || "", name: e.name || "", notExempt: !!e.notExempt, byHand: false });
    }
  }
  for (const a of store.added) {
    if (a.date < from || a.date > to) continue;
    rows.push({ id: a.id, date: a.date, at: a.time ? new Date(`${a.date}T${a.time}:00`).toISOString() : null, receipt: a.receipt || null,
      amount: a.amount, items: [], number: a.number, name: a.name || "", notExempt: false, byHand: true });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date) || (a.at || "").localeCompare(b.at || ""));
  const exempt = rows.filter((r) => r.number && !r.notExempt);
  const byNumber = new Map();
  for (const r of exempt) {
    const key = r.number.toUpperCase();
    const n = byNumber.get(key) || { number: r.number, name: "", sales: 0, amount: 0 };
    n.sales++;
    n.amount = round2(n.amount + r.amount);
    if (r.name) n.name = r.name;
    byNumber.set(key, n);
  }
  return {
    from, to, rows,
    toDo: rows.filter((r) => !r.number && !r.notExempt).length,
    total: round2(exempt.reduce((a, r) => a + r.amount, 0)),
    sales: exempt.length,
    byNumber: [...byNumber.values()].sort((a, b) => b.amount - a.amount || a.number.localeCompare(b.number)),
  };
}

// Today's tax-free sales still waiting for a number: for the front page's
// reminder line. A count and the times, nothing private.
function toDoToday(days) {
  const today = localDate();
  const day = days[today];
  if (!day) return [];
  return (day.orders || []).filter((r) => isTaxFree(r) && !(store.sales[r.id] && (store.sales[r.id].number || store.sales[r.id].notExempt)))
    .map((r) => ({ at: r.at, amount: round2(amountOf(r)) }));
}

// The number (and a name, if given) for a flagged sale or one added by
// hand. An empty number takes it off again.
function setNumber(id, { number, name } = {}) {
  number = clean(number, 40);
  name = clean(name, 60);
  const added = store.added.find((a) => a.id === id);
  if (added) {
    if (!number) return { ok: false, message: "A sale added by hand needs its number. Take it out instead." };
    Object.assign(added, { number, name, savedAt: new Date().toISOString() });
  } else if (number) {
    store.sales[id] = { number, name, savedAt: new Date().toISOString() };
  } else {
    delete store.sales[id];
  }
  save();
  return { ok: true };
}

// A flagged sale that wasn't an exemption (the tax was taken off for some
// other reason): left off the list and the totals. `on: false` brings it back.
function setNotExempt(id, on) {
  if (on) store.sales[id] = { notExempt: true, savedAt: new Date().toISOString() };
  else delete store.sales[id];
  save();
  return { ok: true };
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;
function addSale({ date, time, amount, receipt, number, name } = {}) {
  number = clean(number, 40);
  amount = Number(String(amount == null ? "" : amount).replace(/[$,\s]/g, ""));
  if (!DAY.test(date || "")) return { ok: false, message: "Pick the day of the sale." };
  if (date > localDate()) return { ok: false, message: "That day hasn't happened yet." };
  if (!(amount > 0) || amount > 10000) return { ok: false, message: "Type the sale's amount before tax, like 12.50." };
  if (!number) return { ok: false, message: "Type the exemption number." };
  store.added.push({ id: `byhand-${crypto.randomBytes(5).toString("hex")}`, date, time: TIME.test(time || "") ? time : "",
    amount: round2(amount), receipt: clean(receipt, 12).toUpperCase(), number, name: clean(name, 60), savedAt: new Date().toISOString() });
  save();
  return { ok: true };
}

function removeAdded(id) {
  const before = store.added.length;
  store.added = store.added.filter((a) => a.id !== id);
  if (store.added.length !== before) save();
  return { ok: before !== store.added.length };
}

module.exports = { taxExemptReport, toDoToday, setNumber, setNotExempt, addSale, removeAdded, isTaxFree };
