// Reservations: tables booked ahead, kept in data\reservations.json.
//
// Two ways in:
//   - Manage -> Reservations on the front page (a phone call, a walk-in
//     booking, the paper book copied over): saved here straight away;
//   - the website's /reserve form, through the cafe's Google Apps Script
//     (google-script/Code.gs). The PC asks it for new requests every
//     SYNC_MINUTES ("pull", then "ack" once they're saved here), so the PC
//     only ever calls out and stays closed to the internet. A request waits
//     in Manage for Accept or Decline.
//
// Every change goes back to the script ("save"), which keeps the Google
// Sheet as a copy of the book, emails the customer when asked (confirm,
// change, decline, cancel) and sends the day-before reminders and the
// cafe's 5am list itself. A save that can't get through waits in the
// reservation (`sync`) and is tried again every SYNC_MINUTES.
//
// Without reservationsKey in config.json there is no Google: the book is
// this PC's alone and nothing is emailed.
//
// The screens get screenView(): today's tables and the next two weeks', with
// no phone numbers or emails (the front page answers anyone on the wifi).
// Those are in manageView(), behind the PIN.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { DIR, DATA, MOCK, DEV, cfg } = require("./config");
const { localDate } = require("./util");

const FILE = path.join(DATA, MOCK ? "reservations-mock.json" : "reservations.json");
const SYNC_MINUTES = 2;
const UPCOMING_DAYS = 14;
const KEEP_DAYS = 400; // older days are dropped from the file (the sheet keeps them)
const STATUSES = new Set(["request", "booked", "seated", "declined", "canceled", "removed"]);

// The website's settings (src/_data/site.json, reservations): the script's
// address and how long a table is held. config.json can override the address.
function siteSettings() {
  try {
    const s = JSON.parse(fs.readFileSync(path.join(DIR, "..", "src", "_data", "site.json"), "utf8"));
    return { ...(s.reservations || {}), phone: s.phone || "" };
  } catch {
    return {};
  }
}
const scriptUrl = () => cfg.reservationsUrl || siteSettings().formUrl || "";
const holdMinutes = () => Number(siteSettings().holdMinutes) || 20;
const google = () => !MOCK && !!cfg.reservationsKey && !!scriptUrl();

// For /check and Manage: the last call to Google, good or not.
const syncStatus = { at: null, error: null };

const book = { list: [] };
function load() {
  try {
    const saved = JSON.parse(fs.readFileSync(FILE, "utf8"));
    if (Array.isArray(saved.list)) book.list = saved.list;
  } catch {
    if (MOCK) book.list = mockList();
  }
}
function save() {
  const oldest = localDate(new Date(Date.now() - KEEP_DAYS * 864e5));
  book.list = book.list.filter((r) => r.date >= oldest && !(r.status === "removed" && !r.sync));
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify({ list: book.list }, null, 2));
}

const at = (r) => new Date(`${r.date}T${r.time}:00`).getTime();
const byWhen = (a, b) => (a.date + a.time < b.date + b.time ? -1 : a.date + a.time > b.date + b.time ? 1 : 0);
const plain = (err) => Object.assign(new Error(err), { plain: true });

// What a reservation may say. Throws a plain message for the front page.
function clean(input) {
  const text = (s, max) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  const r = {
    name: text(input.name, 60),
    phone: text(input.phone, 30),
    email: text(input.email, 100).toLowerCase(),
    date: text(input.date, 10),
    time: text(input.time, 5),
    party: Math.floor(Number(input.party)),
    notes: text(input.notes, 400),
  };
  if (!r.name) throw plain("Add a name.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date)) throw plain("Pick a date.");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(r.time)) throw plain("Pick a time.");
  if (!(r.party >= 1 && r.party <= 200)) throw plain("Say how many people.");
  if (r.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)) throw plain("That email address doesn't look right.");
  return r;
}

// ---------------------------------------------------------------- Google

// One call to the script. Google runs it on the POST and answers with a
// redirect to a second address that hands over the reply; that second step
// loses the reply about one time in three (2026-10-19), after the script
// has run. So the redirect is followed here by hand, and a lost reply is
// tried again: up to TRIES times, a few seconds apart. That's safe because
// pull and ack can be repeated, and a save carries its `op`, which the
// script answers from memory the second time instead of doing (and
// emailing) it again.
const TRIES = 4;
async function callScript(body) {
  let last;
  for (let i = 0; i < TRIES; i++) {
    if (i) await new Promise((r) => setTimeout(r, 2000 * i));
    try {
      const post = await fetch(scriptUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: cfg.reservationsKey, ...body }),
        redirect: "manual",
        signal: AbortSignal.timeout(30000),
      });
      let res = post;
      if (post.status >= 300 && post.status < 400 && post.headers.get("location")) {
        res = await fetch(post.headers.get("location"), { redirect: "manual", signal: AbortSignal.timeout(30000) });
      }
      if (res.status === 401 || res.status === 403) throw Object.assign(new Error("Google wants a sign-in: deploy the script to Anyone, executed as Me"), { final: true });
      const json = await res.json().catch(() => null);
      if (!json) throw new Error(`Google's answer got lost on the way (${res.status})`);
      if (!json.ok) throw Object.assign(new Error(json.message || "Google refused it"), { final: true });
      return json;
    } catch (err) {
      last = err;
      if (err.final) break;
    }
  }
  throw last;
}

function syncFailed(err) {
  if (syncStatus.error !== err.message) console.error(`Reservations: Google: ${err.message}`);
  syncStatus.error = err.message;
  syncStatus.at = new Date().toISOString();
}

// The website's new requests, into the book.
async function pullRequests() {
  if (!google()) return;
  try {
    const { requests = [] } = await callScript({ action: "pull" });
    const known = new Set(book.list.map((r) => r.id));
    const added = [];
    for (const q of requests) {
      if (!q.id || known.has(q.id)) continue;
      let r;
      try { r = clean(q); } catch { continue; }
      book.list.push({ id: q.id, status: "request", source: "web", ...r, received: q.received || new Date().toISOString(), updated: new Date().toISOString() });
      added.push(r);
    }
    if (added.length) {
      save();
      console.log(`Reservations: ${added.length} new table request(s) from the website: ${added.map((r) => `${r.name} (${r.party})`).join(", ")}.`);
    }
    if (requests.length) await callScript({ action: "ack", ids: requests.map((q) => q.id) });
    syncStatus.error = null;
    syncStatus.at = new Date().toISOString();
  } catch (err) {
    syncFailed(err);
  }
}

// One reservation to the sheet, with its email. True once Google has it.
async function pushOne(r) {
  if (!google() || !r.sync) return false;
  try {
    const { emailed } = await callScript({
      action: "save",
      op: r.sync.op,
      email: r.sync.email || "",
      reservation: { id: r.id, status: r.status, date: r.date, time: r.time, party: r.party, name: r.name, phone: r.phone, email: r.email, notes: r.notes, source: r.source },
    });
    if (emailed) (r.emailed ||= {})[r.sync.email] = new Date().toISOString();
    delete r.sync;
    save();
    syncStatus.error = null;
    syncStatus.at = new Date().toISOString();
    return { emailed: !!emailed };
  } catch (err) {
    syncFailed(err);
    return false;
  }
}

async function pushPending() {
  for (const r of book.list.filter((x) => x.sync)) if (!(await pushOne(r))) break;
}

let syncing = null;
function syncNow() {
  if (!syncing) syncing = (async () => { await pushPending(); await pullRequests(); })().finally(() => { syncing = null; });
  return syncing;
}

function startReservations() {
  if (!google()) {
    if (!MOCK && cfg.reservationsKey) console.log("Reservations: reservationsKey is set but there's no script address (reservations.formUrl in the website's site.json).");
    return;
  }
  if (DEV) console.log("Reservations: a development copy talks to the real Google sheet. Careful: Accept emails real customers.");
  syncNow();
  setInterval(syncNow, SYNC_MINUTES * 6e4);
}

// ---------------------------------------------------------------- changes

// email: true to email the customer about it (when they gave an address).
function queue(r, kind, email) {
  if (!google()) return;
  // op names this change for the script, so sending it again never
  // emails twice (see callScript).
  r.sync = { email: email && r.email ? kind : "", since: new Date().toISOString(), op: `${r.id}-${crypto.randomBytes(6).toString("hex")}` };
}

// What the front page says after a change.
async function outcome(r, said) {
  if (!r.sync) return `${said}${google() ? "" : " (Google isn't set up, so nothing was emailed.)"}`;
  const kind = r.sync.email;
  const done = await pushOne(r);
  if (!done) return `${said} Google couldn't be reached (${syncStatus.error}); the kitchen PC keeps trying${kind ? ", and emails them then" : ""}.`;
  if (kind) return done.emailed ? `${said} Emailed ${r.email}.` : `${said} The email to ${r.email} didn't go; call or text them.`;
  return said;
}

// A new reservation from the front page (booked straight away), or changes
// to one already in the book. email: tell the customer.
async function saveReservation(input, email) {
  const fields = clean(input);
  const now = new Date().toISOString();
  let r = input.id && book.list.find((x) => x.id === input.id);
  // A new table is confirmed; a booked one that moved is a change. Other
  // edits (a note, a spelling, a request not answered yet) email nobody.
  let kind = "confirm";
  if (r) {
    const moved = r.date !== fields.date || r.time !== fields.time || r.party !== fields.party;
    kind = r.status === "booked" && moved ? "change" : "";
    Object.assign(r, fields, { updated: now });
  } else {
    r = { id: `f${crypto.randomBytes(5).toString("hex")}`, status: "booked", source: "front", ...fields, received: now, updated: now };
    book.list.push(r);
  }
  queue(r, kind, email && !!kind);
  save();
  return { id: r.id, message: await outcome(r, `Saved: ${r.name}, party of ${r.party}, ${dayWords(r.date)} at ${timeWords(r.time)}.`) };
}

const ACTS = {
  accept: { status: "booked", email: "confirm", said: "Booked" },
  decline: { status: "declined", email: "decline", said: "Declined" },
  cancel: { status: "canceled", email: "cancel", said: "Canceled" },
  seated: { status: "seated", said: "Seated" },
  unseat: { status: "booked", said: "Back to booked" },
  restore: { status: "booked", email: "confirm", said: "Booked again" },
  remove: { status: "removed", said: "Removed" },
};

async function actOn(id, act, email) {
  const r = book.list.find((x) => x.id === id);
  const a = ACTS[act];
  if (!r || !a) throw plain("That reservation isn't in the book any more. Open Reservations again.");
  r.status = a.status;
  r.updated = new Date().toISOString();
  if (act === "seated") r.seatedAt = r.updated;
  queue(r, a.email || "", email && !!a.email);
  save();
  return outcome(r, `${a.said}: ${r.name}, party of ${r.party}, ${dayWords(r.date)} at ${timeWords(r.time)}.`);
}

// Seated from the front page's band: no PIN, like Handed off.
function markSeated(id) {
  const r = book.list.find((x) => x.id === id);
  if (!r || r.status !== "booked") return false;
  r.status = "seated";
  r.seatedAt = r.updated = new Date().toISOString();
  queue(r, "", false);
  save();
  pushOne(r);
  return true;
}

// ---------------------------------------------------------------- views

const dayWords = (date) => new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
function timeWords(t) {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
}

// later: today, more than aheadMinutes off. soon: within aheadMinutes.
// now: 15 minutes before to its time. held: past its time, within the hold.
// gone: past the hold and not seated. seated.
function phase(r, now) {
  if (r.status === "seated") return "seated";
  const until = (at(r) - now) / 6e4;
  if (until > cfg.reservationAheadMinutes) return "later";
  if (until > 15) return "soon";
  if (until > 0) return "now";
  if (until > -holdMinutes()) return "held";
  return "gone";
}

// For the screens: no phone numbers or emails.
function screenView(now = Date.now()) {
  const today = localDate(new Date(now));
  const last = localDate(new Date(now + UPCOMING_DAYS * 864e5));
  const pub = (r) => ({ id: r.id, date: r.date, time: r.time, at: new Date(at(r)).toISOString(), party: r.party, name: r.name, notes: r.notes });
  const todays = book.list.filter((r) => r.date === today && (r.status === "booked" || r.status === "seated")).sort(byWhen)
    .map((r) => ({ ...pub(r), phase: phase(r, now), heldUntil: new Date(at(r) + holdMinutes() * 6e4).toISOString() }));
  return {
    today: todays,
    upcoming: book.list.filter((r) => r.status === "booked" && r.date > today && r.date <= last).sort(byWhen).map(pub),
    requests: book.list.filter((r) => r.status === "request" && r.date >= today).length,
    holdMinutes: holdMinutes(),
  };
}

// Manage -> Reservations, behind the PIN: everything from a week ago on,
// with the phone numbers, and whether Google is set up and reachable.
function manageView() {
  const from = localDate(new Date(Date.now() - 7 * 864e5));
  return {
    list: book.list.filter((r) => r.date >= from && r.status !== "removed").sort(byWhen)
      .map(({ sync, ...r }) => ({ ...r, waiting: !!sync })),
    today: localDate(),
    google: google(),
    googleError: google() ? syncStatus.error : null,
    holdMinutes: holdMinutes(),
    cafePhone: siteSettings().phone,
    openDays: cfg.openDays,
  };
}

// For /check.
function reservationsLine() {
  if (MOCK) return "test mode: made-up reservations, never sent to Google.";
  if (!cfg.reservationsKey) return "on this PC only (no reservationsKey in config.json, so no website requests or emails).";
  if (!scriptUrl()) return "reservationsKey is set, but the website has no reservations.formUrl yet.";
  const when = syncStatus.at ? new Date(syncStatus.at).toLocaleTimeString() : "not yet";
  const waiting = book.list.filter((r) => r.sync).length;
  return syncStatus.error ? `Google: failed at ${when}: ${syncStatus.error.replace(/\.$/, "")}${waiting ? ` (${waiting} change(s) waiting)` : ""}.`
    : `Google: last checked ${when}${waiting ? `, ${waiting} change(s) waiting` : ""}.`;
}

// ---------------------------------------------------------------- test mode

// A few made-up tables around now, so the screens have something to show.
function mockList() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const soon = new Date(Math.ceil((now.getTime() + 40 * 6e4) / (15 * 6e4)) * 15 * 6e4);
  const plusDays = (n) => localDate(new Date(now.getTime() + n * 864e5));
  const stamp = now.toISOString();
  return [
    { id: "mock-1", status: "booked", source: "front", name: "Johnson", phone: "(913) 555-0101", email: "", date: localDate(soon), time: `${pad(soon.getHours())}:${pad(soon.getMinutes())}`, party: 12, notes: "Birthday, one high chair", received: stamp, updated: stamp },
    { id: "mock-2", status: "booked", source: "web", name: "Pat Lee", phone: "(913) 555-0102", email: "pat@example.com", date: plusDays(1), time: "11:30", party: 6, notes: "", received: stamp, updated: stamp },
    { id: "mock-3", status: "request", source: "web", name: "Sam Martinez", phone: "(913) 555-0103", email: "sam@example.com", date: plusDays(3), time: "12:00", party: 15, notes: "Office lunch, separate checks", received: stamp, updated: stamp },
  ];
}

load();

module.exports = { book, load, startReservations, syncNow, saveReservation, actOn, markSeated, screenView, manageView, reservationsLine, phase, clean };
