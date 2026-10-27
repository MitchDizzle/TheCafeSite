// data\start-log.txt: one line per step of each start and update, with the
// time, so a slow update can be pinned to its step (client 2026-10-27: Check
// for updates "said pulling for at least a minute"). start-kitchen.bat
// writes its steps (fetch, merge, closing the old program, Chrome); this
// program adds its own (up, the Square item list, the first orders) and the
// update checks. Nothing about customers or orders, so it goes to the GitHub
// backup too (lib/offsite.js), where it can be read without the kitchen PC.
// Kept to the last KEEP lines.
const fs = require("fs");
const path = require("path");
const { DIR, DATA, MOCK } = require("./config");

const FILE = path.join(DATA, MOCK ? "start-log-mock.txt" : "start-log.txt");
const KEEP = 400;

// The same shape as the batch file's lines: local date and time, then what.
function stamp(d = new Date()) {
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(Math.floor(d.getMilliseconds() / 10))}`;
}

function note(text) {
  try {
    fs.mkdirSync(DATA, { recursive: true });
    fs.appendFileSync(FILE, `${stamp()}  program  ${text}\r\n`);
  } catch {}
}

// At start: trim to the last KEEP lines, so the file never grows for good.
function trim() {
  try {
    const lines = fs.readFileSync(FILE, "utf8").split(/\r?\n/).filter(Boolean);
    if (lines.length > KEEP) fs.writeFileSync(FILE, lines.slice(-KEEP).join("\r\n") + "\r\n");
  } catch {}
}

// Which commit this copy runs, as git shows it (f604b7b), read straight from
// the repo's files so starting up doesn't wait on git. "?" if it can't tell.
function version() {
  try {
    const git = path.join(DIR, "..", ".git");
    const head = fs.readFileSync(path.join(git, "HEAD"), "utf8").trim();
    if (!head.startsWith("ref: ")) return head.slice(0, 7);
    const ref = head.slice(5);
    try { return fs.readFileSync(path.join(git, ref), "utf8").trim().slice(0, 7); } catch {}
    const line = fs.readFileSync(path.join(git, "packed-refs"), "utf8").split(/\r?\n/).find((l) => l.endsWith(` ${ref}`));
    return line ? line.slice(0, 7) : "?";
  } catch {
    return "?";
  }
}

module.exports = { FILE, note, trim, version };
