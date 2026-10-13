// What online ordering and DoorDash show under Lunch Special and Soup of the
// Day: the day's plate with its sides (worded by the website's specialSides,
// so it reads as on /menu and the posts), the drink, and cfg.descriptions'
// words. The counter's ticket still goes by the variation name (saveDaily).
const path = require("path");
const { DIR, cfg } = require("../config");
const { cleanText } = require("../util");
const { catalog, loadCatalog, readItem, writeItem } = require("../catalog");
const { plan, savePlan, siteFieldFor, RETRY_MINUTES } = require("./plan");
const { sideSlots } = require("./sides");

let specialSides;
try {
  ({ specialSides } = require(path.join(DIR, "..", "src", "_lib", "specials-caption.js")));
} catch {
  // A board copied without the website beside it: the same words, simply.
  specialSides = (d) => (d.anySide ? "with choice of side" : (d.sides || []).length ? `with ${d.sides.join(" and ")}` : "");
}

const cleanWords = (s) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, 400);
const htmlOf = (s) => `<p>${s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`;

function dayDescription(name, day) {
  const plain = cleanWords(cfg.descriptions[name]);
  const what = day && day.items[name] && cleanText(day.items[name].today);
  if (!what) return plain;
  const words = [];
  if (siteFieldFor(name) === "special") {
    const sides = specialSides(day);
    words.push(`${what}${sides ? ` ${sides}` : ""}.`);
    if (plan.includesDrink) words.push("Includes a fountain drink or iced tea.");
    if (name === cfg.sideItem && sideSlots(day).length) {
      words.push(day.anySide ? "Pick your side below." : "Swap a side below if you like.");
    }
  } else {
    words.push(`${what}.`);
  }
  if (plain) words.push(plain);
  return words.join(" ");
}

// Once a day, like applySpecials: retried after a failure, redone when the
// words change. Only the description is touched, on a fresh read of the item.
async function applyDescriptions(today, day) {
  const names = cfg.dailyItems.filter((n) => typeof cfg.descriptions[n] === "string");
  if (!names.length) return null;
  const want = Object.fromEntries(names.map((n) => [n, dayDescription(n, day)]));
  const sig = JSON.stringify(want);
  const last = plan.descApplied[today];
  if (last && last.sig === sig && (last.at || Date.now() - Date.parse(last.failedAt) < RETRY_MINUTES * 6e4)) return last;
  try {
    await loadCatalog();
    const done = [];
    for (const name of names) {
      const id = catalog.itemIds.get(name.trim().toLowerCase());
      if (!id) continue;
      const item = await readItem(id);
      const d = item.item_data;
      const have = String(d.description_plaintext || d.description || "").replace(/\s+/g, " ").trim();
      if (have === want[name]) continue;
      d.description = want[name];
      d.description_html = htmlOf(want[name]);
      delete d.description_plaintext;
      await writeItem(item);
      done.push(`${name}: "${want[name]}"`);
    }
    plan.descApplied[today] = { sig, at: new Date().toISOString() };
    if (done.length) console.log(`Descriptions put in Square (${new Date().toLocaleTimeString()}): ${done.join("; ")}.`);
  } catch (err) {
    if (!last || last.error !== err.message) console.error(`Today's descriptions: ${err.message}`);
    plan.descApplied[today] = { sig, failedAt: new Date().toISOString(), error: err.message };
  }
  savePlan();
  return plan.descApplied[today];
}

module.exports = { dayDescription, applyDescriptions };
