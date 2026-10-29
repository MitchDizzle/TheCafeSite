// The kitchen PC itself: the board menu's power actions, Check for updates,
// and the watchdog that reopens the board window if it goes missing.
const path = require("path");
const { execFile, spawn } = require("child_process");
const { DIR, MOCK, DEV } = require("./config");
const startlog = require("./startlog");

// Runs a step of start-kitchen.bat ("window", "close", or none for the full
// start). Verbatim, because start's empty "" window title must reach cmd
// as-is; Node's own quoting would turn it into \"\". Started through
// `start` so the batch file is not a child of this process: "close" and the
// full start end this program's window, and taskkill /T would take the
// batch file with it. Through `cmd /c`, so its window closes when it's done:
// `start` on a batch file alone runs it in `cmd /k`, which stays open, and
// every update and watchdog reopen left one more window behind (client
// 2026-10-27). cmd /c strips the outer pair of ""..."".
function startBatch(step) {
  spawn("cmd.exe", ["/c", `start "" /min cmd /c ""${path.join(DIR, "start-kitchen.bat")}"${step ? ` ${step}` : ""}"`], {
    cwd: DIR,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    windowsVerbatimArguments: true,
  }).unref();
}

function power(action) {
  const what = { close: "closed the board", restart: "restarted the PC", shutdown: "shut down the PC" }[action];
  if (!what) return { ok: false, message: "Unknown action." };
  // Test mode is how the board gets tried on other computers. Shutting one
  // of those down from a test board would be a nasty surprise.
  if (MOCK || DEV) return { ok: false, message: `${MOCK ? "Test mode" : "Development copy"}: this would have ${what}.` };
  if (process.platform !== "win32") return { ok: false, message: "The power menu only works on the Windows kitchen PC." };
  console.log(`Power menu: ${what} (${new Date().toLocaleTimeString()}).`);
  // Closed on purpose: the watchdog must not reopen it, even if the board
  // checks in once more before its window goes.
  if (action === "close") boardClosed = true;
  // Run after the reply has gone out, so the board hears back first.
  setTimeout(() => {
    const run = (cmd, args) => execFile(cmd, args, { windowsHide: true }, (err) => err && console.error(`Power menu: ${err.message}`));
    // The board window and this program, both: nothing is left running to
    // bring the board back until start-kitchen.bat is run.
    if (action === "close") startBatch("close");
    if (action === "restart") run("shutdown", ["/r", "/t", "0"]);
    if (action === "shutdown") run("shutdown", ["/s", "/t", "0"]);
  }, 300);
  return { ok: true };
}

// "Check for updates": fetch the branch this copy is on and compare. If
// anything is new, it's installed QUIETLY when it can be (client 2026-10-29:
// no closing the board window mid-service for a small update): git puts it
// in place here, and this program ends with RESTART_EXIT, which
// start-kitchen.bat's loop answers by starting it again at once. The board
// window stays open; its page carries on through the few seconds the program
// is away (Done taps are kept and sent when it's back) and reloads itself
// once nobody is using it, if the update changed it (lib/pages.js). The
// fronts do the same.
//
// The loud way, re-running start-kitchen.bat (pull, restart the program AND
// the window, the same as double-clicking it), is still used when the update
// changes the launch files themselves (LAUNCH_FILES: the running loop is that
// batch file), and on a copy that isn't on main (the batch file moves the
// old kitchen-board branch over, and leaves anyone's work branch alone).
const RESTART_EXIT = 75;
const LAUNCH_FILES = ["kitchen/start-kitchen.bat", "kitchen/stop-board.ps1", "kitchen/focus-board.ps1"];
function git(args) {
  return new Promise((resolve, reject) =>
    execFile("git", ["-C", path.join(DIR, ".."), ...args], { windowsHide: true, timeout: 30000 }, (err, out) =>
      err ? reject(err) : resolve(String(out).trim())
    )
  );
}

async function checkUpdates(from) {
  // A development copy is updated with git by hand. Updating it from here
  // would pull over work in progress.
  if (DEV) return { ok: true, message: "Development copy: it doesn't update itself. Use git." };
  let branch, behind;
  const t0 = Date.now();
  const secs = () => `${((Date.now() - t0) / 1000).toFixed(1)} s`;
  startlog.note(`update check from ${from || "the board"}`);
  try {
    branch = await git(["rev-parse", "--abbrev-ref", "HEAD"]);
    await git(["fetch", "origin", branch]);
    behind = Number(await git(["rev-list", "--count", `HEAD..origin/${branch}`]));
  } catch (err) {
    console.error(`Update check: ${err.message}`);
    startlog.note(`update check failed after ${secs()}: ${err.message.split(/\r?\n/)[0]}`);
    return { ok: false, message: "Couldn't check for updates. Is the internet up, and is git installed?" };
  }
  startlog.note(`update check: ${behind} new on ${branch}, asking GitHub took ${secs()}`);
  if (!behind) return { ok: true, message: "The board is up to date." };
  const n = `${behind} update${behind === 1 ? "" : "s"}`;
  if (MOCK) return { ok: true, message: `Test mode: ${n} found. Run start-kitchen.bat to install them.` };
  if (process.platform !== "win32") return { ok: true, message: `${n} found. Run start-kitchen.bat to install them.` };
  let changed = [];
  try {
    changed = (await git(["diff", "--name-only", `HEAD..origin/${branch}`])).split(/\r?\n/).filter(Boolean);
  } catch {
    changed = LAUNCH_FILES; // can't tell: the loud way, which always works
  }
  const launch = changed.filter((f) => LAUNCH_FILES.includes(f));
  if (branch === "main" && !launch.length) {
    try {
      await git(["merge", "--ff-only", `origin/${branch}`]);
    } catch (err) {
      console.error(`Update: ${err.message}`);
      startlog.note(`quiet update failed after ${secs()}: ${err.message.split(/\r?\n/)[0]}`);
      return { ok: false, message: "Couldn't install the update. Nothing changed, and the board carries on as it was." };
    }
    startlog.note(`quiet update: ${n} installed in ${secs()}, restarting the program only (the window stays)`);
    console.log(`Update: ${n} on ${branch} installed. Restarting the program; the board window stays open.`);
    // Today's numbers written first, so the restart loses none of them.
    setTimeout(() => {
      try { require("./stats").recordHistoryNow(); } catch {}
      process.exit(RESTART_EXIT);
    }, 300);
    return { ok: true, restarting: true, quiet: true,
      message: `Installed ${n}. The board program restarts by itself in a few seconds. The screens stay up, catch up when it's back, and reload themselves once nobody's using them.` };
  }
  console.log(`Update check: ${n} on ${branch}${launch.length ? `, including ${launch.join(", ")}` : ""}. Restarting through start-kitchen.bat.`);
  setTimeout(() => startBatch(), 300);
  return { ok: true, restarting: true, message: `Installing ${n}. The board will be back in about 10 seconds.` };
}

// Board watchdog. The board page asks for /api/tickets every second, and
// only the board on this PC can (it isn't open to the wifi). If it goes
// quiet, the board window has been navigated away or closed: a keyboard's
// Home or Back key took Chrome to another page, a tab crashed. So the
// program reopens it, through start-kitchen.bat's "window" step, the same
// launch the batch file does. Not before a board has been seen at all, not
// after Close on the power menu, and never in test mode or on a development
// copy. After a reopen it waits a while before trying again, so a PC that
// can't show the board (Chrome missing) isn't reopened in a loop.
const WATCHDOG_QUIET_MS = 30000;
const WATCHDOG_RETRY_MS = 120000;
let boardSeen = 0;
let boardClosed = false;
let boardReopened = 0;
// The board page asked for its tickets: it's on screen.
function boardCheckedIn() {
  boardSeen = Date.now();
}
const startWatchdog = () => setInterval(() => {
  if (MOCK || DEV || process.platform !== "win32" || !boardSeen || boardClosed) return;
  const now = Date.now();
  if (now - boardSeen < WATCHDOG_QUIET_MS || now - boardReopened < WATCHDOG_RETRY_MS) return;
  boardReopened = now;
  startlog.note("watchdog: the board stopped checking in, reopening it");
  console.log(`Watchdog: the board hasn't checked in for ${Math.round((now - boardSeen) / 1000)} s. Reopening it (${new Date().toLocaleTimeString()}).`);
  startBatch("window");
}, 5000).unref();

module.exports = { power, checkUpdates, startWatchdog, boardCheckedIn };
