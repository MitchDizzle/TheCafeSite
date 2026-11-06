// Auto off (client 2026-11-06): the kitchen PC shuts itself down at
// autoOffTime (9pm Central) so it isn't left on all night. It's ON every time
// the PC starts; turning it off in the board menu ("Turn off at 9pm") keeps
// the PC on for the rest of that start, through the board program restarting
// for an update, until the PC itself is restarted or turned off.
//
// At the time, the board shows a countdown of AUTO_OFF_WARN_SECONDS with a
// big "Keep it on" (which turns auto off off), then the PC shuts down the
// same way as Shut down on the power menu. Only from the time until
// AUTO_OFF_WINDOW_MINUTES after it, and once a day: a PC switched on at 10pm
// to work on something is left alone. Test mode and development copies never
// power off (system.js says what it would have done).
const fs = require("fs");
const os = require("os");
const path = require("path");
const { DATA, MOCK, cfg } = require("./config");
const { power } = require("./system");

const FILE = path.join(DATA, MOCK ? "auto-off-mock.json" : "auto-off.json");
const AUTO_OFF_WARN_SECONDS = 60;
const AUTO_OFF_WINDOW_MINUTES = 30;
const ZONE = "America/Chicago";

// When Windows last started, to the minute: the setting lasts one start.
const bootedAt = () => Math.round((Date.now() - os.uptime() * 1000) / 6e4) * 6e4;

let on = true;
let firedOn = null; // the date (Central) it last went off, or was kept on
let pending = null; // ms when the countdown ends

function load() {
  try {
    const s = JSON.parse(fs.readFileSync(FILE, "utf8"));
    if (Math.abs(s.bootedAt - bootedAt()) <= 2 * 6e4) {
      on = s.on !== false;
      firedOn = s.firedOn || null;
    }
  } catch {}
}
function save() {
  try { fs.writeFileSync(FILE, JSON.stringify({ bootedAt: bootedAt(), on, firedOn })); } catch {}
}

// Central date and minutes after midnight, whatever the PC's clock zone.
function central(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
    .formatToParts(now).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: (Number(p.hour) % 24) * 60 + Number(p.minute) };
}
function offMinutes() {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(cfg.autoOffTime || ""));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
// "9pm", "9:30pm"
function timeWords() {
  const t = offMinutes();
  if (t === null) return "";
  const h = Math.floor(t / 60), m = t % 60;
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
}

function tick(now = new Date()) {
  const at = offMinutes();
  if (at === null) return;
  const c = central(now);
  if (pending) {
    if (!on) { pending = null; return; }
    if (now.getTime() >= pending) {
      pending = null;
      firedOn = c.date;
      save();
      const r = power("shutdown", `auto off at ${timeWords()}`);
      if (!r.ok) console.log(`Auto off: ${r.message}`);
    }
    return;
  }
  if (!on || firedOn === c.date) return;
  if (c.minutes >= at && c.minutes < at + AUTO_OFF_WINDOW_MINUTES) {
    pending = now.getTime() + AUTO_OFF_WARN_SECONDS * 1000;
    console.log(`${now.toLocaleTimeString()}  Auto off: shutting down in ${AUTO_OFF_WARN_SECONDS} s unless someone presses Keep it on.`);
  }
}

// The board menu's switch, and the countdown's Keep it on (on = false).
function setOn(value) {
  on = !!value;
  if (!on) pending = null;
  save();
  console.log(`${new Date().toLocaleTimeString()}  Auto off at ${timeWords()} turned ${on ? "on" : "off"} (until the PC restarts).`);
  return view();
}

// What the board shows: the switch, and the countdown when there is one.
function view() {
  if (offMinutes() === null) return null;
  return { on, time: timeWords(), endsAt: pending ? new Date(pending).toISOString() : null };
}

load();
const start = () => setInterval(() => tick(), 5000).unref();

module.exports = { start, tick, setOn, view, central, _reset: () => { on = true; firedOn = null; pending = null; } };
