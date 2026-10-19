/**
 * The Café: table requests from the website, and a copy of every
 * reservation, kept in a Google Sheet on the cafe's Google account.
 *
 * Not part of the board program or the website. It runs on Google, as a
 * script inside the "Reservations" sheet (Extensions -> Apps Script), deployed
 * as a web app: kitchen/README.md, "Reservations", says how to set it up.
 * Edit it here, in git, then paste it over the script in the sheet and
 * deploy a new version (Deploy -> Manage deployments -> Edit -> New version).
 *
 * Who talks to it:
 *   - the website's /reserve form (anyone): a new row, status "request",
 *     and an email to the cafe;
 *   - the kitchen PC (with the key in its config.json): "pull" the new
 *     requests, "ack" them once saved, "save" a reservation as Manage ->
 *     Reservations has it now (and email the customer when asked). The PC
 *     only ever calls out, so it stays closed to the internet.
 *   - two daily timers made by setup(): the cafe's morning list (5am) and the
 *     customers' reminder the day before (3pm).
 *
 * The kitchen PC is where reservations are changed. Changes typed into the
 * sheet by hand are not read back by the PC.
 */

const CAFE = {
  name: "The Café",
  email: "theabcafe@gmail.com",
  phone: "(913) 547-9994",
  address: "417 South 6th St, Leavenworth",
  site: "https://lvcafetogo.com",
};
const TZ = "America/Chicago";
const OPEN_DAYS = [1, 2, 3, 4, 5]; // Monday to Friday (0 = Sunday)
const FIRST_TIME = "06:00"; // earliest table
const LAST_TIME = "13:30"; // latest table (closing is 2pm)
const HOLD_MINUTES = 20; // the table is held this long after its time
const MAX_AHEAD_DAYS = 90;
const MAX_PARTY = 80;
const MAX_REQUESTS_PER_HOUR = 30; // the whole form; a flood stops here
const SHEET = "Reservations";
const COLS = ["id", "status", "date", "time", "party", "name", "phone", "email", "notes", "source",
  "received", "updated", "pulled", "confirmEmailed", "reminderEmailed"];

// ---------------------------------------------------------------- set up

// Run once from the editor (pick setup, press Run, allow access). Makes the
// sheet's columns, the kitchen PC's key and the two daily timers. Running
// it again is safe: it keeps the key and remakes the timers.
function setup() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  const props = PropertiesService.getScriptProperties();
  props.setProperty("SHEET_ID", book.getId());
  let sh = book.getSheetByName(SHEET);
  if (!sh) sh = book.insertSheet(SHEET);
  sh.getRange(1, 1, 1, COLS.length).setValues([COLS]).setFontWeight("bold");
  sh.setFrozenRows(1);
  // Dates, times, phone numbers and stamps as typed, never turned into
  // Sheets dates or numbers.
  for (const cols of ["C:D", "G:G", "K:O"]) sh.getRange(cols).setNumberFormat("@");
  let key = props.getProperty("KEY");
  if (!key) {
    key = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
    props.setProperty("KEY", key);
  }
  for (const t of ScriptApp.getProjectTriggers()) {
    if (["morningList", "sendReminders"].includes(t.getHandlerFunction())) ScriptApp.deleteTrigger(t);
  }
  ScriptApp.newTrigger("morningList").timeBased().everyDays(1).atHour(5).inTimezone(TZ).create();
  ScriptApp.newTrigger("sendReminders").timeBased().everyDays(1).atHour(15).inTimezone(TZ).create();
  Logger.log("Set up. The kitchen PC's key (reservationsKey in config.json):\n" + key);
}

// ---------------------------------------------------------------- web app

function doPost(e) {
  let body = {};
  try {
    body = e.postData && /json/i.test(e.postData.type || "") ? JSON.parse(e.postData.contents) : (e.parameter || {});
  } catch (err) {
    return json_({ ok: false, message: "Unreadable request." });
  }
  if (body.action) return json_(pcAction_(body));
  const r = formRequest_(body);
  return body._js ? json_(r) : thanksPage_(r);
}

// Opening the address in a browser: say what it is, nothing more.
function doGet() {
  return HtmlService.createHtmlOutput(`<p>${CAFE.name}: table requests. Use the form at <a href="${CAFE.site}/reserve">${CAFE.site}/reserve</a>.</p>`);
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// Without JavaScript the browser lands here after sending the form.
function thanksPage_(r) {
  const msg = r.ok
    ? "Thank you! We got your request. We'll call or email to confirm your table."
    : `Sorry, that didn't go through: ${esc_(r.message)}`;
  return HtmlService.createHtmlOutput(
    `<div style="font:18px/1.5 system-ui,sans-serif;max-width:32rem;margin:2rem auto;padding:0 1rem">
      <p>${msg}</p><p>Questions? Call ${CAFE.phone}.</p>
      <p><a href="${CAFE.site}/reserve" target="_top">Back to ${CAFE.name}</a></p></div>`
  ).setTitle(CAFE.name);
}

// ---------------------------------------------------------------- the form

function formRequest_(p) {
  // The hidden field only a bot fills in: told it worked, nothing kept.
  if (p.website) return { ok: true };
  let r;
  try {
    r = clean_(p);
  } catch (err) {
    return { ok: false, message: err.message };
  }
  const cache = CacheService.getScriptCache();
  const hour = "count-" + Utilities.formatDate(new Date(), TZ, "yyyyMMddHH");
  const count = Number(cache.get(hour) || 0);
  if (count >= MAX_REQUESTS_PER_HOUR) return { ok: false, message: `Too many requests right now. Please call us at ${CAFE.phone}.` };
  cache.put(hour, String(count + 1), 3700);

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const now = stamp_();
    r.id = "w" + Utilities.getUuid().replace(/-/g, "").slice(0, 10);
    r.status = "request";
    r.source = "web";
    r.received = now;
    r.updated = now;
    sheet_().appendRow(COLS.map((c) => r[c] || ""));
  } finally {
    lock.releaseLock();
  }
  const lines = [
    `${r.name} asks for a table for ${r.party} on ${dayWords_(r.date)} at ${timeWords_(r.time)}.`,
    "",
    `Phone: ${r.phone}`,
    r.email ? `Email: ${r.email}` : "No email given: call or text to confirm.",
    r.notes ? `Notes: ${r.notes}` : "",
    "",
    "Answer it on the front page: Manage -> Reservations (Accept or Decline).",
  ];
  MailApp.sendEmail({
    to: CAFE.email,
    subject: `Table request: ${r.name}, ${r.party} ${r.party === 1 ? "person" : "people"}, ${dayWords_(r.date)} at ${timeWords_(r.time)}`,
    body: lines.filter((l, i) => l || lines[i - 1]).join("\n"),
    replyTo: r.email || undefined,
    name: `${CAFE.name} website`,
  });
  return { ok: true };
}

// The form's fields, checked as the website checks them. Throws a message
// for the customer.
function clean_(p) {
  const text = (s, max) => String(s || "").replace(/\s+/g, " ").trim().slice(0, max);
  const name = text(p.name, 60);
  const phone = text(p.phone, 30);
  const email = text(p.email, 100).toLowerCase();
  const date = text(p.date, 10);
  const time = text(p.time, 5);
  const party = Math.floor(Number(p.party));
  const notes = text(p.notes, 400);
  if (!name) throw new Error("Please add your name.");
  if (phone.replace(/\D/g, "").length < 10) throw new Error("Please add a phone number we can reach you on.");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("That email address doesn't look right.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Please pick a date.");
  const today = Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd");
  const last = Utilities.formatDate(new Date(Date.now() + MAX_AHEAD_DAYS * 864e5), TZ, "yyyy-MM-dd");
  if (date < today) throw new Error("That date has passed.");
  if (date > last) throw new Error(`We take reservations up to ${MAX_AHEAD_DAYS} days ahead. Please call us for later dates.`);
  if (!OPEN_DAYS.includes(new Date(date + "T12:00:00Z").getUTCDay())) throw new Error("We're open Monday to Friday. Please pick a weekday.");
  if (!/^\d{2}:\d{2}$/.test(time) || time < FIRST_TIME || time > LAST_TIME) {
    throw new Error(`Please pick a time between ${timeWords_(FIRST_TIME)} and ${timeWords_(LAST_TIME)}.`);
  }
  if (!(party >= 1 && party <= MAX_PARTY)) throw new Error("Please say how many people.");
  return { name, phone, email, date, time, party, notes };
}

// ---------------------------------------------------------------- the kitchen PC

function pcAction_(b) {
  const key = PropertiesService.getScriptProperties().getProperty("KEY");
  if (!key || String(b.key || "") !== key) return { ok: false, message: "Wrong key." };
  if (b.action === "ping") return { ok: true };
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = sheet_();
    const rows = rows_(sh);
    // The website's requests the PC hasn't saved yet. Sent again until
    // the PC acks them, so one lost on the way comes next time.
    if (b.action === "pull") {
      return { ok: true, requests: rows.filter((r) => r.source === "web" && !r.pulled).map((r) => pick_(r)) };
    }
    if (b.action === "ack") {
      const ids = new Set(b.ids || []);
      const now = stamp_();
      for (const r of rows) if (ids.has(r.id)) sh.getRange(r.row, COLS.indexOf("pulled") + 1).setValue(now);
      return { ok: true };
    }
    // A reservation as the PC has it now, with an email to the customer
    // when asked: confirm, decline, cancel or change.
    if (b.action === "save") {
      const want = b.reservation || {};
      if (!want.id) return { ok: false, message: "No id." };
      const now = stamp_();
      let r = rows.find((x) => x.id === want.id);
      if (!r) r = { id: want.id, source: want.source || "front", received: now, row: sh.getLastRow() + 1 };
      const was = { date: r.date, time: r.time };
      for (const c of ["status", "date", "time", "party", "name", "phone", "email", "notes"]) {
        if (want[c] !== undefined) r[c] = String(want[c]);
      }
      r.updated = now;
      // A new date or time is a new day before: remind again.
      if (was.date !== r.date || was.time !== r.time) r.reminderEmailed = "";
      let emailed = false;
      if (b.email && r.email) {
        emailed = emailCustomer_(r, b.email);
        if (emailed && b.email !== "decline" && b.email !== "cancel") r.confirmEmailed = now;
      }
      sh.getRange(r.row, 1, 1, COLS.length).setValues([COLS.map((c) => (r[c] === undefined ? "" : r[c]))]);
      return { ok: true, emailed };
    }
    return { ok: false, message: "Unknown action." };
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------- emails

function emailCustomer_(r, kind) {
  const first = String(r.name).split(" ")[0];
  const when = `${dayWords_(r.date, true)} at ${timeWords_(r.time)}`;
  const people = `${r.party} ${Number(r.party) === 1 ? "person" : "people"}`;
  const visit = [
    `We'll hold your table for ${HOLD_MINUTES} minutes after that. When you get here, check in at the counter.`,
    "Everyone orders and pays at the counter, so each person can pay on their own.",
  ];
  const sign = ["", `Need to change it? Call us at ${CAFE.phone} or reply to this email.`, "", CAFE.name, CAFE.address, CAFE.site];
  const mails = {
    confirm: { subject: `Your table at ${CAFE.name}: ${when}`, lines: [`Hi ${first},`, "", `You're all set: a table for ${people} on ${when}.`, "", ...visit, ...sign] },
    change: { subject: `Your table at ${CAFE.name} has changed: ${when}`, lines: [`Hi ${first},`, "", `Your reservation is now a table for ${people} on ${when}.`, "", ...visit, ...sign] },
    decline: { subject: `Your table request at ${CAFE.name}`, lines: [`Hi ${first},`, "",
      `We're sorry, we can't take a table for ${people} on ${when}.`,
      `Please call us at ${CAFE.phone} and we'll help you find another time.`, "", CAFE.name, CAFE.site] },
    cancel: { subject: `Your table at ${CAFE.name} is canceled`, lines: [`Hi ${first},`, "",
      `Your reservation for ${people} on ${when} is canceled.`,
      `If that's a mistake, or you'd like another time, call us at ${CAFE.phone}.`, "", CAFE.name, CAFE.site] },
    reminder: { subject: `See you tomorrow at ${CAFE.name}`, lines: [`Hi ${first},`, "", `Just a reminder: your table for ${people} is tomorrow, ${when}.`, "", ...visit, ...sign] },
  };
  const m = mails[kind];
  if (!m) return false;
  try {
    MailApp.sendEmail({ to: r.email, subject: m.subject, body: m.lines.join("\n"), name: CAFE.name, replyTo: CAFE.email });
    return true;
  } catch (err) {
    console.error(`Email to ${r.email}: ${err.message}`);
    return false;
  }
}

// 3pm daily: tomorrow's tables with an email get a reminder, once. Not one
// confirmed in the last 12 hours: that email was the reminder.
function sendReminders() {
  const sh = sheet_();
  const tomorrow = Utilities.formatDate(new Date(Date.now() + 864e5), TZ, "yyyy-MM-dd");
  for (const r of rows_(sh)) {
    if (r.status !== "booked" || r.date !== tomorrow || !r.email || r.reminderEmailed) continue;
    if (r.confirmEmailed && Date.now() - Date.parse(r.confirmEmailed) < 12 * 36e5) continue;
    if (emailCustomer_(r, "reminder")) sh.getRange(r.row, COLS.indexOf("reminderEmailed") + 1).setValue(stamp_());
  }
}

// 5am daily: the day's tables, to the cafe's inbox. Nothing on a day with
// no tables and no requests waiting.
function morningList() {
  const today = Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd");
  const rows = rows_(sheet_());
  const booked = rows.filter((r) => r.status === "booked" && r.date === today).sort((a, b) => (a.time < b.time ? -1 : 1));
  const waiting = rows.filter((r) => r.status === "request" && r.date >= today);
  if (!booked.length && !waiting.length) return;
  const lines = booked.length
    ? booked.map((r) => `${timeWords_(r.time)}  ${r.name}, ${r.party} ${Number(r.party) === 1 ? "person" : "people"}${r.notes ? ` (${r.notes})` : ""}`)
    : ["No tables booked today."];
  if (waiting.length) lines.push("", `${waiting.length} table request${waiting.length === 1 ? "" : "s"} still to answer: Manage -> Reservations on the front page.`);
  MailApp.sendEmail({
    to: CAFE.email,
    subject: booked.length ? `Today's reservations: ${booked.length}` : "Table requests waiting",
    body: lines.join("\n"),
    name: `${CAFE.name} reservations`,
  });
}

// ---------------------------------------------------------------- sheet

function sheet_() {
  const id = PropertiesService.getScriptProperties().getProperty("SHEET_ID");
  if (!id) throw new Error("Run setup() first.");
  return SpreadsheetApp.openById(id).getSheetByName(SHEET);
}

function rows_(sh) {
  const n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, COLS.length).getDisplayValues().map((v, i) => {
    const r = { row: i + 2 };
    COLS.forEach((c, j) => (r[c] = v[j]));
    return r;
  });
}

const pick_ = (r) => ({ id: r.id, date: r.date, time: r.time, party: Number(r.party), name: r.name, phone: r.phone, email: r.email, notes: r.notes, received: r.received });
const stamp_ = () => new Date().toISOString();
const esc_ = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// "Fri, Oct 23", or "Friday, October 23" in full.
function dayWords_(date, full) {
  return Utilities.formatDate(new Date(date + "T12:00:00Z"), "UTC", full ? "EEEE, MMMM d" : "EEE, MMM d");
}

// "11:30" -> "11:30am", "13:00" -> "1pm"
function timeWords_(t) {
  const [h, m] = String(t).split(":").map(Number);
  return `${h % 12 || 12}${m ? ":" + String(m).padStart(2, "0") : ""}${h < 12 ? "am" : "pm"}`;
}
