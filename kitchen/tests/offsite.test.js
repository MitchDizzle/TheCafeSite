// The backup repo's layout (lib/offsite.js): this month's days one order a
// line, a finished month zipped, and tools/read-history.js reading both back
// to exactly what the board saved. Run: node --test kitchen/tests/
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
require("./board.js");
const { DATA } = require("../lib/config");
const { localDate } = require("../lib/util");
const { REPO, copyIn } = require("../lib/offsite");

const order = (id, at, extra = {}) => ({ id, receipt: "AB12", at, meal: "lunch", online: false, doordash: false, toGo: true, paid: true,
  sales: 10.5, net: 9.75, tip: 0, items: [{ name: "Lunch Special", variation: "Meatloaf", qty: 1 }], done: true, kitchenItems: 1, kitchenMinutes: 6.2, waitMinutes: null, ...extra });

test("backup: this month by day, earlier months zipped, and the reader gets every day back", () => {
  const today = localDate();
  const history = { days: {
    "2026-01-14": { savedAt: "2026-01-14T20:00:00.000Z", orders: [order("a", "2026-01-14T17:00:00.000Z"), order("b", "2026-01-14T17:30:00.000Z", { items: [] })] },
    "2026-01-15": { savedAt: "2026-01-15T20:00:00.000Z", orders: [order("c", "2026-01-15T18:00:00.000Z", { note: "a \"quoted\"\nline" })] },
    [today]: { savedAt: `${today}T20:00:00.000Z`, orders: [order("d", `${today}T17:00:00.000Z`), order("e", `${today}T17:10:00.000Z`)] },
  } };
  fs.writeFileSync(path.join(DATA, "stats-history.json"), JSON.stringify(history));
  // A day file from before the month was finished, to be replaced by the zip.
  fs.mkdirSync(path.join(REPO, "history"), { recursive: true });
  fs.writeFileSync(path.join(REPO, "history", "2026-01-14.json"), "{}");
  copyIn();

  const files = fs.readdirSync(path.join(REPO, "history")).sort();
  assert.deepEqual(files, ["2026-01.json.gz", `${today}.json`]);
  const dayFile = fs.readFileSync(path.join(REPO, "history", `${today}.json`), "utf8");
  assert.equal(dayFile.split("\n").length, 5, "head line, one line per order, closing line, end");
  assert.deepEqual(JSON.parse(dayFile), history.days[today]);
  // The same month zips to the same bytes, so a backup with nothing new commits nothing.
  const gz = fs.readFileSync(path.join(REPO, "history", "2026-01.json.gz"));
  copyIn();
  assert.ok(gz.equals(fs.readFileSync(path.join(REPO, "history", "2026-01.json.gz"))));

  assert.ok(fs.existsSync(path.join(REPO, "tools", "read-history.js")));
  assert.ok(fs.existsSync(path.join(REPO, "HOW-TO-READ.md")));
  const out = path.join(DATA, "restored.json");
  execFileSync(process.execPath, [path.join(REPO, "tools", "read-history.js"), "--restore", out]);
  assert.deepEqual(JSON.parse(fs.readFileSync(out, "utf8")), history);
  const summary = execFileSync(process.execPath, [path.join(REPO, "tools", "read-history.js"), "2026-01"]).toString();
  assert.match(summary, /2 day\(s\): 3 orders/);
  assert.match(summary, /Lunch Specials: Meatloaf x2/);
});
