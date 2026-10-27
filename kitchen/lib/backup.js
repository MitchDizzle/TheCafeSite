// The nightly backup of data\: stats-history.json is the only copy of the
// kitchen times, so it is copied, with the plan, state.json and the
// reservations beside it, into a folder per day:
//   - data\backups\<date>\ on this PC, always: a bad write or a deleted
//     file can be put back from yesterday's;
//   - <backupDir>\<date>\ too, when config.json names one off this PC's
//     drive (a USB stick, OneDrive, another PC): the PC itself can be lost.
//     Photo post's photos go there as well (backupDir\photos\, new ones
//     added, none ever deleted); on this PC they'd only be a second copy on
//     the same drive.
//   - the private GitHub repo in backupRepo, when one is set (offsite.js).
// Taken when the program starts (yesterday's day is complete by then) and
// again at closing, at BACKUP_HOUR, so a day is copied the same day
// while the PC is still on. The last KEEP_DAYS days are kept. Test mode's
// files are never backed up.
const fs = require("fs");
const path = require("path");
const { DATA, MOCK, DEV, cfg } = require("./config");
const { localDate } = require("./util");
const { offsiteStatus, pushOffsite } = require("./offsite");

// surveys.json is copied here (this PC, backupDir) but not to the GitHub
// backup (lib/offsite.js): customers' own words stay off GitHub.
const FILES = ["stats-history.json", "specials-plan.json", "state.json", "reservations.json", "surveys.json"];
const BACKUP_HOUR = 14; // 2pm, closing time: the PC may be off by 3
const KEEP_DAYS = 30;
const LOCAL = path.join(DATA, "backups");

// For /check: when each place was last written, or why it wasn't.
const backupStatus = { local: null, away: null };

function copyDay(root) {
  const date = localDate();
  const dir = path.join(root, date);
  fs.mkdirSync(dir, { recursive: true });
  for (const name of FILES) {
    const from = path.join(DATA, name);
    if (fs.existsSync(from)) fs.copyFileSync(from, path.join(dir, name));
  }
  // Older days beyond KEEP_DAYS go; only folders named by a date.
  const days = fs.readdirSync(root).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  for (const d of days.slice(0, Math.max(0, days.length - KEEP_DAYS))) fs.rmSync(path.join(root, d), { recursive: true, force: true });
}

function copyPhotos(root) {
  const from = path.join(DATA, "photos");
  if (!fs.existsSync(from)) return;
  const to = path.join(root, "photos");
  fs.mkdirSync(to, { recursive: true });
  for (const name of fs.readdirSync(from)) {
    const src = path.join(from, name);
    const dst = path.join(to, name);
    // photos.json changes with every new photo; a photo never changes.
    if (name === "photos.json" || !fs.existsSync(dst)) fs.copyFileSync(src, dst);
  }
}

// Also Manage -> Back up now, which waits for it and shows what happened.
async function backupNow() {
  if (MOCK) return { ok: false, message: "Test mode: nothing is backed up." };
  const at = new Date().toISOString();
  try {
    copyDay(LOCAL);
    backupStatus.local = { at };
  } catch (err) {
    backupStatus.local = { at, error: err.message };
    console.error(`Backup in data\\backups: ${err.message}`);
  }
  if (cfg.backupDir) {
    try {
      // A USB stick that isn't plugged in: say so, never make the folder on
      // this PC's drive instead.
      if (!fs.existsSync(path.parse(path.resolve(cfg.backupDir)).root)) throw new Error("that drive isn't there (is the USB stick plugged in?)");
      copyDay(cfg.backupDir);
      copyPhotos(cfg.backupDir);
      backupStatus.away = { at };
      console.log(`Backed up to ${cfg.backupDir} (${new Date().toLocaleTimeString()}).`);
    } catch (err) {
      if (!backupStatus.away || backupStatus.away.error !== err.message) console.error(`Backup to ${cfg.backupDir}: ${err.message}`);
      backupStatus.away = { at, error: err.message };
    }
  }
  await pushOffsite();
  const said = [
    backupStatus.local.error ? `On this PC: failed (${backupStatus.local.error}).` : "On this PC: copied.",
    cfg.backupDir ? (backupStatus.away.error ? `To ${cfg.backupDir}: failed (${backupStatus.away.error}).` : `To ${cfg.backupDir}: copied.`) : "",
    !cfg.backupRepo ? "GitHub: not set up (backupRepo in config.json)."
      : DEV ? "GitHub: not from a development copy."
      : offsiteStatus.error ? `GitHub: failed (${offsiteStatus.error}).` : "GitHub: pushed.",
  ].filter(Boolean);
  const failed = backupStatus.local.error || (cfg.backupDir && backupStatus.away.error) || (cfg.backupRepo && !DEV && offsiteStatus.error);
  return { ok: !failed, message: said.join(" ") };
}

// Once at start, then once a day after BACKUP_HOUR. A push to GitHub that
// failed is tried again at every check, so a key just added works within
// minutes.
let eveningDone = "";
function backupCheck() {
  if (offsiteStatus.error) pushOffsite();
  const today = localDate();
  if (new Date().getHours() < BACKUP_HOUR || eveningDone === today) return;
  eveningDone = today;
  backupNow();
}

function startBackups() {
  if (MOCK) return;
  backupNow();
  if (new Date().getHours() >= BACKUP_HOUR) eveningDone = localDate();
  setInterval(backupCheck, 10 * 6e4);
}

module.exports = { backupStatus, backupNow, startBackups };
