// Which /studio/ pieces get built, and when each was last made.
//
// The board builds and uploads only what is current (client 2026-10-09):
// every deploy uploads the exported PNGs and PDFs again, and a long board
// buries the newest piece. So a piece that hasn't changed for ARCHIVE_DAYS
// archives itself. It isn't built, exported or uploaded, and the board and
// the downloads page list it under Archive with a link to its source on
// GitHub. Change it again, or pin it, and it's back on the next build.
//
// "Changed" is the newest git commit touching any of: the piece's .njk, its
// .11tydata.js, its stylesheet (pageCss), the partials it includes, and the
// data files it names in `studioData` (a menu names menu.json, so a menu
// change brings it back to the top of the board). Uncommitted work counts as
// now. This needs the git history, which is why the deploy checks out with
// fetch-depth 0; without git (a copy of the repo with no .git), everything
// counts as new and nothing archives.
//
// `studioPinned: true` in a piece's front matter keeps it built at any age:
// the menus and the weekly specials pieces, which are reprinted or reposted
// from current data.
//
// Pieces retired by hand (moved to archive/site-src/studio/, see
// archive/README.md) are listed under Archive too, but only a move back to
// src/studio/ brings one of those back.
//
// STUDIO_ALL=1 builds every piece in src/studio/, archived or not: the way
// to get an old piece's PNG or PDF on your own computer.

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const matter = require("gray-matter");

const ARCHIVE_DAYS = 14;

// Git's output, or null when there's no git or no repository here.
function git(root, args) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

const relative = (root, file) => path.relative(root, file).split(path.sep).join("/");

// The partials a template includes, and the ones those include, as files.
function partialsOf(root, file, seen = new Set()) {
  const text = fs.readFileSync(file, "utf8");
  for (const m of text.matchAll(/\{%-?\s*(?:include|from|import)\s+["']([^"']+)["']/g)) {
    const partial = path.join(root, "src", "_includes", m[1]);
    if (seen.has(partial) || !fs.existsSync(partial)) continue;
    seen.add(partial);
    partialsOf(root, partial, seen);
  }
  return seen;
}

// The board pieces in a folder: .njk files tagged `studio`.
function piecesIn(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith(".njk"))
    .map((name) => {
      const file = path.join(dir, name);
      return { file, data: matter(fs.readFileSync(file, "utf8")).data };
    })
    .filter(({ data }) => [].concat(data.tags || []).includes("studio"));
}

// A Date as the calendar day it was on where it happened, "2026-10-08".
function localDay(date) {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

module.exports = function studioArchive(root, now = new Date()) {
  const buildAll = process.env.STUDIO_ALL === "1";
  const status = git(root, ["status", "--porcelain", "--untracked-files=all", "--", "src"]);
  const haveGit = status !== null;
  const dirty = new Set(
    (status || "").split("\n").filter(Boolean)
      .map((line) => line.slice(3).split(" -> ").pop().replace(/^"|"$/g, ""))
  );

  // Every file's last commit, from one walk of the history (newest first,
  // so the first time a file is named is its latest change). One git call
  // for the whole board instead of one per piece. %cI keeps the committer's
  // own offset, so its first ten characters are the date they saw.
  const lastCommit = new Map();
  if (haveGit) {
    const log = git(root, ["log", "--format=%x00%cI", "--name-only", "--", "src", "archive"]) || "";
    for (const entry of log.split("\0").filter(Boolean)) {
      const [when, ...files] = entry.split("\n").map((l) => l.trim()).filter(Boolean);
      for (const f of files) if (!lastCommit.has(f)) lastCommit.set(f, when);
    }
  }

  // The newest change to any of these files, as { date, day }. A file with
  // uncommitted changes, or never committed, counts as changed now.
  const lastChanged = (sources) => {
    if (!haveGit || sources.some((s) => dirty.has(s) || !lastCommit.has(s))) return { date: now, day: localDay(now) };
    const when = sources.map((s) => lastCommit.get(s)).reduce((a, b) => (Date.parse(a) >= Date.parse(b) ? a : b));
    return { date: new Date(when), day: when.slice(0, 10) };
  };

  const cutoff = now.getTime() - ARCHIVE_DAYS * 864e5;
  const pieces = {};
  const ignore = [];
  const archive = [];

  for (const { file, data } of piecesIn(path.join(root, "src", "studio"))) {
    const base = file.replace(/\.njk$/, "");
    const sources = [
      file,
      `${base}.11tydata.js`,
      data.pageCss && path.join(root, "src", data.pageCss),
      ...partialsOf(root, file),
      ...[].concat(data.studioData || []).map((name) => path.join(root, "src", "_data", name)),
    ].filter((f) => f && fs.existsSync(f)).map((f) => relative(root, f));
    const { date, day } = lastChanged(sources);
    const slug = path.basename(base);
    const archived = !buildAll && !data.studioPinned && date.getTime() < cutoff;
    pieces[slug] = { date: date.toISOString(), day, pinned: !!data.studioPinned, archived };
    if (archived) {
      ignore.push(relative(root, file));
      archive.push({ slug, title: data.studioTitle || data.title, category: data.studioCategory || "",
        date: date.toISOString(), day, source: relative(root, file), retired: false });
    }
  }

  // Retired by hand: dated by their move into archive/.
  for (const { file, data } of piecesIn(path.join(root, "archive", "site-src", "studio"))) {
    const { date, day } = lastChanged([relative(root, file)]);
    archive.push({ slug: path.basename(file, ".njk"), title: data.studioTitle || data.title,
      category: data.studioCategory || "", date: date.toISOString(), day, source: relative(root, file), retired: true });
  }
  archive.sort((a, b) => b.date.localeCompare(a.date));

  return { days: ARCHIVE_DAYS, pieces, ignore, archive };
};
