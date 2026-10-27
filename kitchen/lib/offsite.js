// The daily backup, pushed to a private GitHub repo (backupRepo in
// config.json), so the history, the plan and Photo post's photos are off
// this PC and can be read from anywhere.
//
// The PC never signs in to GitHub. It makes its own key (data\backup-key,
// with ssh-keygen from Git for Windows) and /check shows the public half;
// added to that one repo as a deploy key with write access, it can push
// there and nowhere else. Not even the website's repo, which this PC only
// ever reads.
//
// The repo is a clone in data\offsite\, laid out to be read:
//   history\<date>.json   one day of stats-history.json each, so a day's
//                         commit only changes that day
//   specials-plan.json, state.json, reservations.json (names and phone
//                         numbers: keep the repo private)
//   start-log.txt         each start and update, step by step with times
//                         (lib/startlog.js), to see why one was slow
//   photos\               Photo post's photos, as Saved photos has them,
//                         plus the ones moved off this PC
// git keeps every earlier version, so the files are simply overwritten.
// Pushed by backup.js with the local copies (on start, at 2pm and from
// Manage -> Back up now), and tried again every 10 minutes after a
// failure. Never in test mode or on a development copy. git runs as its
// own process, so the board and the orders carry on while it pushes.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const { DATA, MOCK, DEV, cfg } = require("./config");

const REPO = path.join(DATA, "offsite");
const KEY = path.join(DATA, "backup-key");
const KNOWN_HOSTS = path.join(DATA, "backup-known-hosts");

// For /check: the last push (at) or why it failed (error), and the key.
const offsiteStatus = { at: null, error: null, publicKey: null };

function run(cmd, args, env) {
  return new Promise((resolve, reject) =>
    execFile(cmd, args, { windowsHide: true, timeout: 120000, env: env || process.env }, (err, out, errOut) =>
      err ? reject(new Error(String(errOut || err.message).split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(-3).join(" "))) : resolve(String(out).trim())
    )
  );
}

// "https://github.com/owner/repo" pasted from the browser works too: the
// key only works over ssh.
function repoUrl() {
  const s = String(cfg.backupRepo).trim();
  const m = /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(\.git)?\/?$/.exec(s);
  return m ? `git@github.com:${m[1]}/${m[2]}.git` : s;
}

// Git for Windows' own ssh-keygen (beside the git on the PATH), else
// Windows' OpenSSH, else whatever the PATH has.
async function sshKeygen() {
  const found = [];
  try {
    const git = (await run("where", ["git"])).split(/\r?\n/)[0];
    found.push(path.join(path.dirname(path.dirname(git)), "usr", "bin", "ssh-keygen.exe"));
  } catch {}
  found.push(path.join(process.env.SystemRoot || "C:\\Windows", "System32", "OpenSSH", "ssh-keygen.exe"));
  return found.find((f) => fs.existsSync(f)) || "ssh-keygen";
}

async function ensureKey() {
  if (!fs.existsSync(KEY) || !fs.existsSync(`${KEY}.pub`)) {
    for (const f of [KEY, `${KEY}.pub`]) fs.rmSync(f, { force: true });
    await run(await sshKeygen(), ["-q", "-t", "ed25519", "-N", "", "-C", `kitchen-board@${os.hostname().toLowerCase()}`, "-f", KEY]);
    const pub = fs.readFileSync(`${KEY}.pub`, "utf8").trim();
    console.log(`Backup to GitHub: made this PC's key. Add it to the backup repo (Settings -> Deploy keys, Allow write access):\n  ${pub}`);
  }
  offsiteStatus.publicKey = fs.readFileSync(`${KEY}.pub`, "utf8").trim();
}

const fwd = (p) => p.replace(/\\/g, "/");
const gitEnv = () => ({
  ...process.env,
  GIT_TERMINAL_PROMPT: "0",
  GIT_SSH_COMMAND: `ssh -i "${fwd(KEY)}" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile="${fwd(KNOWN_HOSTS)}"`,
});
const git = (args) => run("git", ["-C", REPO, "-c", "user.name=Kitchen PC", "-c", "user.email=kitchen-pc@localhost", ...args], gitEnv());

// Write a file only if it changed.
function put(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try { if (fs.readFileSync(file, "utf8") === text) return; } catch {}
  fs.writeFileSync(file, text);
}

const README = `# Kitchen board backups

Pushed by the kitchen PC's board program (TheCafeSite, kitchen/lib/offsite.js)
when it starts (and again once its first orders are in), at 2pm and from
Manage -> Back up now. Nothing here is edited by hand.

- history/<date>.json: that day's orders, as in Manage -> Reports (no customer names)
- specials-plan.json, state.json: the board's specials plan and cleared tickets
- reservations.json: the reservations book (names and phone numbers)
- start-log.txt: each start and update, step by step with the time, to see
  which step made one slow
- photos/: Photo post's photos, kept for the website, with the ones moved
  off the kitchen PC (Saved photos -> Move to GitHub)

To put the history back on the kitchen PC, the days are joined into
kitchen/data/stats-history.json as { "days": { "<date>": <file> } }.
`;

function copyIn() {
  try {
    const history = JSON.parse(fs.readFileSync(path.join(DATA, "stats-history.json"), "utf8"));
    for (const [date, day] of Object.entries(history.days || {})) put(path.join(REPO, "history", `${date}.json`), JSON.stringify(day, null, 1) + "\n");
  } catch {}
  for (const name of ["specials-plan.json", "state.json", "reservations.json", "start-log.txt"]) {
    try { put(path.join(REPO, name), fs.readFileSync(path.join(DATA, name), "utf8")); } catch {}
  }
  const photos = path.join(DATA, "photos");
  if (fs.existsSync(photos)) {
    fs.mkdirSync(path.join(REPO, "photos"), { recursive: true });
    const here = new Set(fs.readdirSync(photos));
    let index = { photos: [] };
    try { index = JSON.parse(fs.readFileSync(path.join(photos, "photos.json"), "utf8")); } catch {}
    // Photos moved off this PC (Saved photos -> Move to GitHub) stay here,
    // listed first in the repo's photos.json as if they were still kept.
    const cleared = index.cleared || [];
    const keep = new Set(here);
    for (const p of [...cleared, ...(index.photos || [])]) for (const f of [p.saved, p.post]) if (f) keep.add(path.basename(f));
    for (const name of here) {
      const dst = path.join(REPO, "photos", name);
      if (name !== "photos.json" && !fs.existsSync(dst)) fs.copyFileSync(path.join(photos, name), dst);
    }
    const { cleared: _, ...rest } = index;
    put(path.join(REPO, "photos", "photos.json"), JSON.stringify({ ...rest, photos: [...cleared, ...(index.photos || [])] }, null, 2));
    // One deleted in Saved photos goes from the repo too (git still has it).
    for (const name of fs.readdirSync(path.join(REPO, "photos"))) if (!keep.has(name)) fs.rmSync(path.join(REPO, "photos", name), { force: true });
  }
  if (!fs.existsSync(path.join(REPO, "README.md"))) put(path.join(REPO, "README.md"), README);
}

// One push at a time. Asked for while one is going (Back up now during the
// 2pm one), it runs once more after it, so what changed since is in too.
let current = null;
let again = null;
function pushOffsite() {
  if (!cfg.backupRepo || MOCK || DEV) return Promise.resolve();
  if (!current) return (current = push().finally(() => { current = null; }));
  return again || (again = current.then(() => { again = null; return pushOffsite(); }));
}

async function push() {
  try {
    await ensureKey();
    if (!fs.existsSync(path.join(REPO, ".git"))) {
      fs.rmSync(REPO, { recursive: true, force: true });
      await run("git", ["clone", "-q", repoUrl(), REPO], gitEnv());
    }
    // A repo made on GitHub with nothing in it has no branch yet: start main.
    try { await git(["rev-parse", "--verify", "-q", "HEAD"]); } catch { await git(["symbolic-ref", "HEAD", "refs/heads/main"]); }
    copyIn();
    await git(["add", "-A"]);
    if (await git(["status", "--porcelain"])) {
      const now = new Date();
      await git(["commit", "-q", "-m", `Backup ${now.toLocaleDateString("en-CA")} ${now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`]);
    }
    // Anything changed on GitHub (a README edited there) goes underneath.
    try { await git(["pull", "-q", "--rebase", "origin", "main"]); } catch {}
    await git(["push", "-q", "origin", "HEAD:main"]);
    if (offsiteStatus.error || !offsiteStatus.at) console.log(`Backed up to GitHub (${new Date().toLocaleTimeString()}).`);
    offsiteStatus.at = new Date().toISOString();
    offsiteStatus.error = null;
  } catch (err) {
    const msg = /publickey|denied|not found|access rights|could not read/i.test(err.message)
      ? `GitHub didn't let this PC in. Add the key shown on /check to the repo's Deploy keys with Allow write access, and check backupRepo's name. (${err.message})`
      : err.message;
    if (offsiteStatus.error !== msg) console.error(`Backup to GitHub: ${msg}`);
    offsiteStatus.error = msg;
  }
}

module.exports = { REPO, offsiteStatus, pushOffsite, repoUrl };
