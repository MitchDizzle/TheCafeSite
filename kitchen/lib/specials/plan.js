// Manage -> Specials: what each daily item is, and its price if that
// changes, for the days to come. Each morning the board puts that day's into
// Square by itself, through saveDaily (the same narrow write as Today's
// specials), as soon as it starts or the date turns over. Nobody has to open
// anything on the day.
//
// Two things fill the plan:
//   - the website's published week (cfg.specialsUrl, built from the site's
//     src/_data/specials.json: the same days as the /menu box and the
//     Facebook post), read every SITE_MINUTES. It adds the days it lists and
//     keeps them in step with the site, but it NEVER changes today once it's
//     in Square, an earlier day, or a day set on the front page;
//   - the front page. A day changed there is the front's from then on: the
//     website's copy no longer touches it.
// Kept in specials-plan.json beside state.json (gitignored).
const fs = require("fs");
const path = require("path");
const { DATA, MOCK, cfg } = require("../config");
const { localDate, cleanText, PRICE } = require("../util");
const { dailyItems } = require("./daily");

const PLAN_FILE = path.join(DATA, MOCK ? "specials-plan-mock.json" : "specials-plan.json");
const SITE_MINUTES = 30;
const RETRY_MINUTES = 5; // after Square refuses the morning's write
const PLAN_DAYS = 14; // how far ahead Specials reaches

// days:    { "YYYY-MM-DD": { from: "site" | "front", items: { "<dailyItems name>": { today, prices: { "<size>" | "": "10.50" } } },
//            sides?: [...], anySide?: true } }  (anySide: the plate comes with a choice of side)
// notes:   { "YYYY-MM-DD": { description } }, the words Photo post puts under the photo. Kept
//            apart from `days`, so writing them doesn't make a website day the front's.
// applied: { "YYYY-MM-DD": { sig, at } after a good write, { sig, failedAt, error } after a bad one }
// sidesApplied: the same, for the day's side lists on cfg.sideItem (applySides)
// descApplied: the same, for the daily items' descriptions (applyDescriptions)
// photoApplied: the same, for their pictures (applyPhotos)
// squareImages: { "<photo path>#<content hash>": "<Square image id>" }, each picture uploaded once
// photoTurn: { "<dish>": { date, n } }, which of a dish's photos is next
// swapSides: the sides any side can be swapped for, as the website last listed them
// includesDrink: every lunch special includes a drink, as the website last said
// site:    the last read of the website, for the front to show
const plan = { days: {}, notes: {}, applied: {}, sidesApplied: {}, descApplied: {}, photoApplied: {}, squareImages: {}, photoTurn: {}, swapSides: [], includesDrink: false, site: { checkedAt: null, error: null } };
try {
  Object.assign(plan, JSON.parse(fs.readFileSync(PLAN_FILE, "utf8")));
} catch {}

function savePlan() {
  // Two weeks back is plenty; a past day is never written again.
  const old = localDate(new Date(Date.now() - 14 * 864e5));
  for (const map of [plan.days, plan.notes, plan.applied, plan.sidesApplied, plan.descApplied, plan.photoApplied]) for (const d of Object.keys(map)) if (d < old) delete map[d];
  fs.writeFileSync(PLAN_FILE, JSON.stringify(plan, null, 2));
}

// A price from the website as the plan keeps it ("10.00"), or "" when it
// isn't one.
const sitePrice = (n) => (typeof n === "number" && n > 0 && n < 1000 ? n.toFixed(2) : "");

// Which of the website's fields goes into which daily item, by the item's
// name: "Soup of the Day" takes the soup, "Lunch Special" the plate. One that
// matches none of them is left for the front to fill.
function siteFieldFor(name) {
  if (/soup/i.test(name)) return "soup";
  if (/salad/i.test(name)) return "salad";
  if (/special/i.test(name)) return "special";
  return null;
}

async function pullSite() {
  if (!cfg.specialsUrl) return;
  const today = localDate();
  try {
    const res = await fetch(cfg.specialsUrl, { cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`the website answered ${res.status}`);
    const json = await res.json();
    // `days` is the shape; `week` is the older one, read so a board updated
    // before the website still works.
    const listed = (Array.isArray(json.days) ? json.days : Array.isArray(json.week) ? json.week : [])
      .filter((d) => d && /^\d{4}-\d{2}-\d{2}$/.test(d.date));
    const changed = [];
    for (const d of listed) {
      if (d.date < today) continue;
      const have = plan.days[d.date];
      if (have && have.from !== "site") continue; // set on the front page: theirs
      // Today is never changed once it's in Square: from then on only the
      // front page changes it. Until then the website's latest wins, so a day
      // read on Friday and changed on the website over the weekend goes in
      // as changed when the board starts on Monday (2026-10-12, when Friday's
      // copy went in instead).
      const inSquare = plan.applied[today] && plan.applied[today].at && plan.applied[today].sig !== "clear";
      if (d.date === today && inSquare) continue;
      const items = {};
      // The plate's price: the day's own, or the website's price for every
      // special (client 2026-10-12: $10 unless a day says otherwise). Only a
      // one-size item takes it; one in sizes keeps Square's prices.
      const price = sitePrice(d.price ?? json.price);
      for (const name of cfg.dailyItems) {
        const field = siteFieldFor(name);
        const text = field ? cleanText(d[field]) : "";
        if (text) items[name] = { today: text, prices: field === "special" && price ? { "": price } : {} };
      }
      if (!Object.keys(items).length) continue;
      // The sides go nowhere in Square; Photo post words the special with
      // them. anySide: the plate comes with the customer's choice of side.
      const sides = Array.isArray(d.sides) ? d.sides.map(cleanText).filter(Boolean) : [];
      const anySide = d.anySide === true;
      if (have && JSON.stringify(have.items) === JSON.stringify(items) && JSON.stringify(have.sides || []) === JSON.stringify(sides)
        && !!have.anySide === anySide) continue;
      plan.days[d.date] = { from: "site", items, sides, ...(anySide ? { anySide: true } : {}) };
      changed.push(d.date);
    }
    // The sides any side can be swapped for (menu.json's Deli Salads).
    // Kept from the last read that had them, so a website without the field
    // never empties the lists in Square.
    if (Array.isArray(json.swapSides)) {
      const swaps = [...new Set(json.swapSides.map(cleanText).filter(Boolean))].slice(0, 12);
      if (swaps.length && JSON.stringify(swaps) !== JSON.stringify(plan.swapSides)) {
        plan.swapSides = swaps;
        console.log(`Sides to swap from the website: ${swaps.join(", ")}.`);
      }
    }
    if (typeof json.includesDrink === "boolean" && json.includesDrink !== plan.includesDrink) {
      plan.includesDrink = json.includesDrink;
      console.log(`Lunch specials ${json.includesDrink ? "include" : "no longer include"} a drink, says the website.`);
    }
    // A day still to come that the website has since taken off.
    const onSite = new Set(listed.map((d) => d.date));
    for (const [date, day] of Object.entries(plan.days)) {
      if (date > today && day.from === "site" && !onSite.has(date)) {
        delete plan.days[date];
        changed.push(date);
      }
    }
    if (changed.length) console.log(`Specials from the website (${new Date().toLocaleTimeString()}): ${changed.sort().join(", ")}.`);
    if (plan.site.error) console.log("Website specials readable again.");
    plan.site = { checkedAt: new Date().toISOString(), error: null };
  } catch (err) {
    const message = err.name === "TimeoutError" ? "the website didn't answer"
      : err.cause ? `can't reach the website (${err.cause.code || err.cause.message})` : err.message;
    if (plan.site.error !== message) console.error(`Website specials: ${message}`);
    plan.site = { checkedAt: new Date().toISOString(), error: message };
  }
  savePlan();
}

// What Specials shows: today and the next PLAN_DAYS days the cafe is open
// (plus any other day something is planned for), with Square's own sizes and
// prices for the price boxes, and today's names as Square has them now
// (`live`), so the front shows what's really on the till.
async function planView() {
  const items = await dailyItems();
  const dates = [];
  for (let i = 0; i < PLAN_DAYS; i++) {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + i);
    const date = localDate(d);
    if (cfg.openDays.includes(d.getDay()) || plan.days[date]) dates.push(date);
  }
  return {
    today: localDate(),
    items: items.filter((it) => !it.missing).map(({ key, name, variations }) => ({ key, name, sizes: variations.map((v) => ({ size: v.size, price: v.price })) })),
    live: Object.fromEntries(items.filter((it) => !it.missing).map((it) => [it.key, it.today])),
    missing: items.filter((it) => it.missing).map((it) => it.name),
    days: dates.map((date) => ({ date, plan: plan.days[date] || null, note: plan.notes[date] || null, applied: plan.applied[date] || null })),
    site: { url: cfg.specialsUrl, ...plan.site },
  };
}

const checkDate = (date, today) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today) {
    throw Object.assign(new Error("That day has already gone. Open Specials again."), { plain: true });
  }
};

// changes: { "YYYY-MM-DD": { items: { "<dailyItems name>": { today, prices: { "<size>": "10.50" } } }, sides, anySide } }
// notes:   { "YYYY-MM-DD": { description } }
// Only the days the front changed. A day left with nothing in it is taken off
// the plan (if the website lists it, its copy comes back on the next read).
// Everything is checked before anything is kept. Returns the dates of each.
function savePlanDays(changes, notes) {
  const today = localDate();
  const next = {};
  for (const [date, change] of Object.entries(changes || {})) {
    checkDate(date, today);
    const items = {};
    for (const [name, it] of Object.entries((change && change.items) || {})) {
      if (!cfg.dailyItems.includes(name)) throw Object.assign(new Error(`"${name}" isn't on the specials list.`), { plain: true });
      const prices = {};
      for (const [size, raw] of Object.entries((it && it.prices) || {})) {
        const text = String(raw ?? "").replace(/[$\s]/g, "");
        if (!text) continue;
        if (!PRICE.test(text)) throw Object.assign(new Error(`"${raw}" isn't a price. Use numbers like 10 or 10.50. Nothing was saved.`), { plain: true });
        prices[String(size)] = Number(text).toFixed(2);
      }
      const text = cleanText(it && it.today);
      if (text || Object.keys(prices).length) items[name] = { today: text, prices };
    }
    // What comes with the plate: a choice of side, or these sides. Not sent
    // to Square (the ticket says the plate); Photo post words the special
    // with it.
    const anySide = !!(change && change.anySide === true);
    const sides = anySide ? [] : (Array.isArray(change && change.sides) ? change.sides : []).map(cleanText).filter(Boolean).slice(0, 6);
    next[date] = Object.keys(items).length || sides.length || anySide
      ? { from: "front", items, ...(sides.length ? { sides } : {}), ...(anySide ? { anySide: true } : {}) } : null;
  }
  // The words Photo post puts under the photo. They don't touch the day
  // itself, so a day from the website stays the website's.
  const words = {};
  for (const [date, note] of Object.entries(notes || {})) {
    checkDate(date, today);
    words[date] = String((note && note.description) ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
  }
  for (const [date, day] of Object.entries(next)) {
    if (day) plan.days[date] = day;
    else delete plan.days[date];
  }
  for (const [date, description] of Object.entries(words)) {
    if (description) plan.notes[date] = { description };
    else delete plan.notes[date];
  }
  savePlan();
  const days = Object.keys(next).sort();
  const noted = Object.keys(words).sort();
  if (days.length || noted.length) console.log(`Specials changed from the front page (${new Date().toLocaleTimeString()}): ${[...new Set([...days, ...noted])].sort().join(", ")}.`);
  return { days, notes: noted };
}

module.exports = { SITE_MINUTES, RETRY_MINUTES, plan, savePlan, siteFieldFor, pullSite, planView, savePlanDays };
