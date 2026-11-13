// Puts the specials days set on the kitchen board into src/_data/specials.json
// (Mitch 2026-11-13: the specials are typed on the board on Thursday or
// Friday, and the website should follow by itself).
//
//   node scripts/specials-from-board.js <site-specials.json> [specials.json]
//
// <site-specials.json> is what the board pushes to its private GitHub backup
// (kitchen/lib/specials/plan.js, siteExport): the days typed on its front
// page that the website doesn't have yet, each with `savedAt`, when it was
// saved there. The "Specials from the kitchen board" Action reads it and
// runs this. Prints one line naming the days it changed, or nothing.
//
// The rules:
//   - Today (Central) and later only.
//   - A day is written only if its board save is newer than the one the
//     website already has (`boardSavedAt` on the day), so a fix made in the
//     file afterwards (by hand, or by Claude) is never written over by the
//     same board save again. A newer save on the board does win.
//   - The board has the plate, its sides (or choice of side), the soup and,
//     if typed there, the plate's price. Everything else on a day is kept:
//     `extraSides`, `counterOnly`, and the plate's `note`, `leaveOff` and
//     `modifiers` while the plate is the same dish (they're about that dish,
//     so a new plate drops them), and `soupNote` while the soup is the same.
//   - A blank price on the board keeps the day's price as it is.
//   - Only the days it changes are rewritten; the rest of the file keeps its
//     own layout, so a commit shows just those days.
const fs = require("fs");

const [boardFile, siteFile = "src/_data/specials.json"] = process.argv.slice(2);
if (!boardFile) {
  console.error("Usage: node scripts/specials-from-board.js <site-specials.json> [specials.json]");
  process.exit(2);
}

const board = JSON.parse(fs.readFileSync(boardFile, "utf8"));
const text = fs.readFileSync(siteFile, "utf8");
const site = JSON.parse(text);

// Today in the cafe's time zone, YYYY-MM-DD.
const today = process.env.SPECIALS_TODAY || new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date());

const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const same = (a, b) => clean(a).toLowerCase() === clean(b).toLowerCase();

// The days array's objects in the file's text: [{ start, end, date }], end
// exclusive. Strings are skipped so a brace inside one doesn't count.
function dayRanges(src) {
  const open = src.search(/"days"\s*:\s*\[/);
  if (open < 0) throw new Error(`no "days" list in ${siteFile}`);
  let i = src.indexOf("[", open) + 1;
  const out = [];
  let depth = 0;
  let start = -1;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '"') {
      for (i++; i < src.length && src[i] !== '"'; i++) if (src[i] === "\\") i++;
      continue;
    }
    if (c === "{") { if (depth++ === 0) start = i; }
    else if (c === "}") {
      if (--depth === 0) {
        const obj = JSON.parse(src.slice(start, i + 1));
        out.push({ start, end: i + 1, date: obj.date });
      }
    } else if (c === "]" && depth === 0) return { ranges: out, close: i };
  }
  throw new Error(`the "days" list in ${siteFile} doesn't end`);
}

// A day as the file writes one: two-space JSON, indented under "days".
const dayText = (day) => JSON.stringify(day, null, 2).replace(/\n/g, "\n    ");

const ORDER = ["date", "soup", "special", "sides", "anySide", "price"];
function merged(have, b) {
  const day = { ...(have || {}) };
  const special = clean(b.special);
  const soup = clean(b.soup);
  if (have && !same(have.special, special)) for (const k of ["note", "leaveOff", "modifiers"]) delete day[k];
  if (have && !same(have.soup, soup)) delete day.soupNote;
  day.date = b.date;
  if (soup) day.soup = soup; else delete day.soup;
  if (special) day.special = special; else delete day.special;
  if (b.anySide === true) { day.anySide = true; delete day.sides; }
  else {
    delete day.anySide;
    const sides = (Array.isArray(b.sides) ? b.sides : []).map(clean).filter(Boolean);
    if (sides.length) day.sides = sides; else delete day.sides;
  }
  if (typeof b.price === "number" && b.price > 0) {
    if (b.price === site.price) delete day.price; else day.price = b.price;
  }
  day.boardSavedAt = b.savedAt;
  // date, soup, special, sides first, as the file has them; the rest as they were.
  const out = {};
  for (const k of ORDER) if (k in day) out[k] = day[k];
  for (const [k, v] of Object.entries(day)) if (!(k in out) && k !== "boardSavedAt") out[k] = v;
  out.boardSavedAt = day.boardSavedAt;
  return out;
}

const wanted = [];
for (const b of Array.isArray(board.days) ? board.days : []) {
  if (!b || !/^\d{4}-\d{2}-\d{2}$/.test(b.date) || b.date < today) continue;
  if (!b.savedAt || !(clean(b.special) || clean(b.soup))) continue;
  const have = (site.days || []).find((d) => d.date === b.date);
  if (have && have.boardSavedAt && have.boardSavedAt >= b.savedAt) continue;
  wanted.push(merged(have, b));
}
if (!wanted.length) process.exit(0);

// Rewrite from the last day back, so earlier positions stay right.
let out = text;
const { ranges, close } = dayRanges(text);
const edits = [];
// An empty list takes them all at once.
if (!ranges.length) {
  const all = [...wanted].sort((a, b) => a.date.localeCompare(b.date)).map(dayText).join(",\n    ");
  edits.push({ start: close, end: close, insert: `\n    ${all}\n  ` });
}
for (const day of ranges.length ? wanted : []) {
  const at = ranges.find((r) => r.date === day.date);
  if (at) { edits.push({ start: at.start, end: at.end, insert: dayText(day) }); continue; }
  // A new day: after the last day before it, else before the first after it.
  const before = ranges.filter((r) => r.date < day.date).pop();
  const after = ranges.find((r) => r.date > day.date);
  if (before) edits.push({ start: before.end, end: before.end, insert: `,\n    ${dayText(day)}` });
  else edits.push({ start: after.start, end: after.start, insert: `${dayText(day)},\n    ` });
}
// Two new days in the same gap go in date order: same position, sorted so
// the later one is applied first and ends up after.
edits.sort((a, b) => b.start - a.start || (b.insert > a.insert ? 1 : -1));
for (const e of edits) out = out.slice(0, e.start) + e.insert + out.slice(e.end);

// The result must still read, with every day once and in order.
const check = JSON.parse(out);
const dates = check.days.map((d) => d.date);
if (new Set(dates).size !== dates.length) throw new Error("a day would be in the file twice; nothing written");
if (dates.some((d, i) => i && d < dates[i - 1])) throw new Error("the days would be out of order; nothing written");
fs.writeFileSync(siteFile, out);

// "Mon Nov 16, Tue Nov 17", for the commit message.
const words = (date) => {
  const d = new Date(`${date}T12:00:00Z`);
  const f = (o) => d.toLocaleDateString("en-US", { ...o, timeZone: "UTC" });
  return `${f({ weekday: "short" })} ${f({ month: "short" })} ${f({ day: "numeric" })}`;
};
console.log(wanted.map((d) => d.date).sort().map(words).join(", "));
