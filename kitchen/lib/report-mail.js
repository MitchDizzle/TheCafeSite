// The emailed report (Mitch 2026-11-10: Terry prints the day's when he
// needs it). Every day with orders, at 2:10pm (after closing), the day's
// report (lib/report.js) goes to the cafe's email: a short summary as the
// email, and the page Print a report shows attached as a PDF, so printing
// it from a phone or any PC gives the same one letter page. The week's can
// go too, on the week's last open day (off unless ticked in Manage).
//
// The PDF is made here, by the PC's Chrome (or Edge) printing the page
// headless, so it is exactly what Print a report prints. Without Chrome the
// page goes as an .html file instead, to open in a browser and print.
//
// Sent through the cafe's Google Apps Script (google-script/Code.gs,
// "report"), the one the reservations use, so it needs reservationsKey.
// When and to whom is set in Manage -> Numbers -> Print a report, "Emailed
// every day" (kept in data\report-mail.json); config.json's reportTime and
// reportTo are only where that starts. A report that couldn't go (the PC was
// off at 2:10, Google didn't answer) is tried again every RETRY_MINUTES, and
// the next days still: up to CATCH_UP_DAYS for a day's, a week for the
// week's. Never for a day before the board first had this, so an update
// doesn't send a backlog. Test mode and development copies never email by
// themselves (Manage's Email it now still works from a development copy).
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const { DIR, DATA, MOCK, DEV, cfg } = require("./config");
const { localDate } = require("./util");
const stats = require("./stats");
const report = require("./report");
const reservations = require("./reservations");
const { central } = require("./auto-off");

const FILE = path.join(DATA, MOCK ? "report-mail-mock.json" : "report-mail.json");
const RETRY_MINUTES = 10;
const CATCH_UP_DAYS = 3;
const MAX_TO = 5;
const EMAIL = /^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$/;
const TIME = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const shift = stats.shiftDate;
const mondayOf = (date) => shift(date, -((new Date(`${date}T12:00:00`).getDay() + 6) % 7));
const plain = (message) => Object.assign(new Error(message), { plain: true });

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

function settings() {
  const base = { daily: true, weekly: false, bw: true, time: TIME.test(cfg.reportTime || "") ? cfg.reportTime : "",
    to: (Array.isArray(cfg.reportTo) ? cfg.reportTo : []).filter((a) => EMAIL.test(a)) };
  return { ...base, ...(saved.settings || {}) };
}
function saveSettings(input) {
  const to = String(Array.isArray(input.to) ? input.to.join("\n") : input.to || "")
    .split(/[\s,;]+/).map((a) => a.trim()).filter(Boolean);
  const bad = to.filter((a) => !EMAIL.test(a));
  if (bad.length) throw plain(`That doesn't look like an email address: ${bad.join(", ")}`);
  if (to.length > MAX_TO) throw plain(`Up to ${MAX_TO} addresses besides the cafe's.`);
  const time = String(input.time || "").trim();
  if (time && !TIME.test(time)) throw plain("Pick a time, like 2:10 PM.");
  saved.settings = { daily: !!input.daily, weekly: !!input.weekly, bw: !!input.bw, time, to: [...new Set(to.map((a) => a.toLowerCase()))] };
  save();
  return settings();
}

// The cafe's own address, which Code.gs always sends to (CAFE.email there).
function cafeEmail() {
  try { return JSON.parse(fs.readFileSync(path.join(DIR, "..", "src", "_data", "site.json"), "utf8")).email || ""; } catch { return ""; }
}

// ---------------------------------------------------------------- the PDF

// Chrome or Edge, where start-kitchen.bat looks for them; CHROME_PATH first.
function chromePath() {
  const env = process.env;
  const list = [env.CHROME_PATH,
    env.ProgramFiles && path.join(env.ProgramFiles, "Google", "Chrome", "Application", "chrome.exe"),
    env["ProgramFiles(x86)"] && path.join(env["ProgramFiles(x86)"], "Google", "Chrome", "Application", "chrome.exe"),
    env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"),
    env["ProgramFiles(x86)"] && path.join(env["ProgramFiles(x86)"], "Microsoft", "Edge", "Application", "msedge.exe"),
    env.ProgramFiles && path.join(env.ProgramFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
    "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
  return list.find((p) => p && fs.existsSync(p)) || null;
}

// The page printed to PDF by a headless Chrome with a profile of its own (so
// the board's kiosk window is never touched). The page fits itself to one
// letter page as it loads (FIT_JS in lib/report.js), the fonts given a few
// seconds to come from Google. Null when there's no Chrome or it failed.
function makePdf(html) {
  const chrome = chromePath();
  if (!chrome) return Promise.resolve(null);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cafe-report-"));
  const page = path.join(dir, "report.html"), pdf = path.join(dir, "report.pdf");
  fs.writeFileSync(page, html);
  const args = ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", `--user-data-dir=${path.join(dir, "profile")}`,
    "--no-pdf-header-footer", "--virtual-time-budget=6000", `--print-to-pdf=${pdf}`, "file:///" + page.replace(/\\/g, "/")];
  return new Promise((resolve) => {
    execFile(chrome, args, { timeout: 60000, windowsHide: true }, (err) => {
      let out = null;
      try { if (fs.statSync(pdf).size > 1000) out = fs.readFileSync(pdf); } catch {}
      if (!out) console.error(`Emailed report: no PDF from Chrome${err ? ` (${err.message.split("\n")[0]})` : ""}; the page goes instead.`);
      fs.rm(dir, { recursive: true, force: true }, () => {});
      resolve(out);
    });
  });
}

// ---------------------------------------------------------------- sending

const sentKey = (kind, date) => (kind === "week" ? `week:${mondayOf(date)}` : `day:${date}`);
const fileDate = (r) => (r.single ? r.from : `${r.from} to ${r.to}`);

// Emails the report for from..to (a day when they're the same). `kind` is
// only for remembering what the schedule has sent.
async function email(from, to, why, kind = from === to ? "day" : "week") {
  if (MOCK) throw plain("Test mode: nothing is emailed.");
  if (!reservations.google()) throw plain("Not set up: emailing goes through the reservations Google script, and this PC has no reservationsKey in config.json.");
  stats.recordHistoryNow();
  const r = report.buildReport(from, to);
  if (!r) throw plain(from === to ? "No orders saved that day." : "No orders saved in those days.");
  const s = settings();
  const page = report.renderHtml(r, { bw: s.bw });
  const pdf = await makePdf(page);
  const name = `The Cafe report ${fileDate(r)}`;
  const op = `report-${why === "schedule" ? `${sentKey(kind, from)}-auto` : Date.now()}`;
  const answer = await reservations.callScript({
    action: "report", op, to: s.to, subject: report.subjectOf(r), html: report.emailHtml(r, { pdf: !!pdf }), text: report.emailText(r),
    ...(pdf ? { pdfBase64: pdf.toString("base64"), pdf: `${name}.pdf` } : { page, pageName: `${name}.html` }),
  });
  if (why === "schedule") saved.sent[sentKey(kind, from)] = new Date().toISOString();
  saved.lastError = null;
  save();
  const sentTo = answer.to || [cafeEmail(), ...s.to].filter(Boolean).join(", ");
  console.log(`${new Date().toLocaleTimeString()}  Emailed report: ${fileDate(r)} sent (${why}) to ${sentTo}${pdf ? "" : ", as a page (no PDF)"}.`);
  return { to: sentTo, subject: report.subjectOf(r), pdf: !!pdf };
}

const timeMinutes = (t) => { const m = TIME.exec(t || ""); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const openOn = (date) => (cfg.openDays || []).includes(new Date(`${date}T12:00:00`).getDay());
// The week's last open day: when its report goes.
function lastOpenDay(monday) {
  for (let i = 6; i >= 0; i--) if (openOn(shift(monday, i))) return shift(monday, i);
  return shift(monday, 4);
}

// What's due now and not sent, the oldest first.
function due(now = new Date(), all = stats.historyDays()) {
  const s = settings();
  const at = timeMinutes(s.time);
  if (at === null || !saved.started) return [];
  const c = central(now);
  const passed = (date) => date < c.date || (date === c.date && c.minutes >= at);
  const out = [];
  if (s.daily) {
    for (let i = CATCH_UP_DAYS - 1; i >= 0; i--) {
      const d = shift(c.date, -i);
      if (d < saved.started || !passed(d) || saved.sent[sentKey("day", d)]) continue;
      if (all[d] && all[d].orders.length) out.push({ kind: "day", from: d, to: d });
    }
  }
  if (s.weekly) {
    for (const monday of [shift(mondayOf(c.date), -7), mondayOf(c.date)]) {
      const last = lastOpenDay(monday);
      if (last < saved.started || !passed(last) || saved.sent[sentKey("week", monday)]) continue;
      if (c.date > shift(last, 7)) continue;
      if (Object.keys(all).some((d) => d >= monday && d <= shift(monday, 6) && all[d].orders.length)) out.push({ kind: "week", from: monday, to: shift(monday, 6) });
    }
  }
  return out;
}

let sending = false;
async function tick(now = new Date()) {
  if (sending || MOCK || DEV || !reservations.google()) return;
  if (saved.lastError && Date.now() - saved.lastTry < RETRY_MINUTES * 6e4) return;
  const list = due(now);
  if (!list.length) return;
  sending = true;
  try {
    for (const job of list) {
      saved.lastTry = Date.now();
      try {
        await email(job.from, job.to, "schedule", job.kind);
      } catch (err) {
        saved.lastError = `${job.kind === "week" ? `The week of ${job.from}` : `${job.from}'s report`}: ${err.message}`;
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
  const lastDay = Object.keys(saved.sent).filter((k) => k.startsWith("day:")).sort().pop();
  const lastWeek = Object.keys(saved.sent).filter((k) => k.startsWith("week:")).sort().pop();
  return {
    settings: s, cafeEmail: cafeEmail(), google: reservations.google(), mock: MOCK, dev: DEV, chrome: !!chromePath(),
    timeWords: timeWords(s.time), weekDay: new Date(`${lastOpenDay(mondayOf(localDate()))}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" }),
    lastDay: lastDay ? { date: lastDay.slice(4), at: saved.sent[lastDay] } : null,
    lastWeek: lastWeek ? { from: lastWeek.slice(5), at: saved.sent[lastWeek] } : null,
    error: saved.lastError,
  };
}
function line() {
  const s = settings();
  if (MOCK) return "test mode: never emailed.";
  if (!reservations.google()) return "not emailed: needs the reservations Google script (reservationsKey in config.json). Manage can still print it.";
  if (!timeWords(s.time) || (!s.daily && !s.weekly)) return "switched off in Manage.";
  const st = status();
  return `${[s.daily && "the day's", s.weekly && `the week's (${st.weekDay})`].filter(Boolean).join(" and ")} at ${st.timeWords}${DEV ? " (not by itself from a development copy)" : ""}` +
    `${st.chrome ? "" : ", as a page: no Chrome found for the PDF"}${st.lastDay ? `; last sent ${st.lastDay.date}` : ""}${st.error ? `; failed: ${st.error}` : ""}.`;
}

module.exports = { start, tick, due, email, settings, saveSettings, status, line, lastOpenDay, makePdf, chromePath,
  _set: (s) => { saved = { started: null, settings: null, sent: {}, lastError: null, lastTry: 0, ...s }; } };
