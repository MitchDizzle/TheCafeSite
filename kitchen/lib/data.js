// Where the board keeps this PC's own files: kitchen\data\ (gitignored).
// Nothing in it comes from git and an update never touches it:
//   state.json          what's been pressed, the skip list
//   specials-plan.json  Specials: the days ahead, what's in Square
//   stats-history.json  every day's orders, for Reports (the only copy of
//                       the kitchen times)
//   photos\             Photo post's photos, kept for the website
//   backups\            the nightly copies (lib/backup.js)
// Test mode's own copies (state-mock.json and so on) sit beside them.
//
// Before 2026-10-13 these sat loose in the kitchen folder beside the code.
// The first start after the update moves them in here, so the kitchen PC
// needs no hand steps.
const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, ".."); // the kitchen folder
// KITCHEN_DATA puts them elsewhere. Only the tests use it, so a test run
// never reads or changes this PC's files.
const DATA = process.env.KITCHEN_DATA || path.join(DIR, "data");

const OLD = ["state.json", "state-mock.json", "specials-plan.json", "specials-plan-mock.json",
  "stats-history.json", "stats-history-mock.json", "photos", "photos-mock"];

// from: the kitchen folder; to: data\. Parameters only for the tests.
function moveIntoData(from = DIR, to = DATA) {
  fs.mkdirSync(to, { recursive: true });
  for (const name of OLD) {
    const src = path.join(from, name);
    const dst = path.join(to, name);
    if (!fs.existsSync(src)) continue;
    if (fs.existsSync(dst)) {
      console.error(`data folder: ${name} is in both the kitchen folder and data\\. Using the one in data\\; the other is left where it is.`);
      continue;
    }
    try {
      fs.renameSync(src, dst);
      console.log(`data folder: moved ${name} into data\\.`);
    } catch (err) {
      console.error(`data folder: could not move ${name} (${err.message}). Close anything that has it open and restart the board.`);
    }
  }
  // Square's copies of the photos are remembered by the photo's full path
  // (squareImages in the plan). Point those at the new folder, so a photo
  // already in Square isn't uploaded a second time.
  for (const name of ["specials-plan.json", "specials-plan-mock.json"]) {
    const file = path.join(to, name);
    try {
      const plan = JSON.parse(fs.readFileSync(file, "utf8"));
      if (!plan.squareImages) continue;
      let changed = false;
      const next = {};
      for (const [key, id] of Object.entries(plan.squareImages)) {
        let k = key;
        for (const dir of ["photos", "photos-mock"]) {
          const old = path.join(from, dir) + path.sep;
          if (key.startsWith(old)) k = path.join(to, dir) + path.sep + key.slice(old.length);
        }
        if (k !== key) changed = true;
        next[k] = id;
      }
      if (changed) fs.writeFileSync(file, JSON.stringify({ ...plan, squareImages: next }, null, 2));
    } catch {}
  }
}

if (!process.env.KITCHEN_DATA) moveIntoData();

module.exports = { DIR, DATA, moveIntoData };
