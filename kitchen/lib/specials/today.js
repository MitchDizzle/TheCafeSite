// Put today's planned specials into Square, once. Runs at startup, every
// minute after (which is what catches the date turning over), and right
// after the front saves today. A day with nothing planned puts the plain
// size names back, so yesterday's plate never prints on today's tickets;
// that happens only once the plan is in use, so a board that has never had
// one leaves Square alone.
const { localDate } = require("../util");
const { plan, savePlan, RETRY_MINUTES } = require("./plan");
const { dailyItems, saveDaily } = require("./daily");
const { applySides } = require("./sides");
const { applyDescriptions } = require("./descriptions");
const { applyPhotos } = require("./photos");

let applying = null;
function applyToday() {
  if (!applying) applying = applyTodayOnce().finally(() => { applying = null; });
  return applying;
}

async function applyTodayOnce() {
  const today = localDate();
  const day = plan.days[today];
  const result = await applySpecials(today, day);
  const sides = await applySides(today, day);
  const words = await applyDescriptions(today, day);
  const photos = await applyPhotos(today, day);
  // What the front is told after saving today: the specials, or else the
  // sides, the descriptions, the photos.
  return [result, sides, words, photos].find((r) => r && r.error) || result;
}

async function applySpecials(today, day) {
  const sig = day ? JSON.stringify(day.items) : "clear";
  const last = plan.applied[today];
  if (last && last.sig === sig && (last.at || Date.now() - Date.parse(last.failedAt) < RETRY_MINUTES * 6e4)) return last;
  if (!day && !Object.values(plan.applied).some((a) => a.at && a.sig !== "clear")) return null;
  try {
    const current = await dailyItems();
    const changes = [];
    for (const it of current) {
      if (it.missing) continue;
      const want = day ? day.items[it.key] : { today: "", prices: {} };
      if (!want) continue; // not planned today: left as it is
      changes.push({
        id: it.id,
        // Only a price planned and no name: the name in Square stays.
        today: day ? want.today || undefined : "",
        // A planned price, or the price Square has now ("" is priced at the till).
        variations: it.variations.map((v) => ({ id: v.id, price: (want.prices || {})[v.size] || v.price })),
      });
    }
    const saved = await saveDaily(changes, "the week's plan");
    plan.applied[today] = { sig, at: new Date().toISOString() };
    console.log(day
      ? `Today's specials put in Square from the plan (${new Date().toLocaleTimeString()}): ${saved.join(", ") || "already there"}.`
      : `Nothing planned for today: the specials' names are back to plain (${new Date().toLocaleTimeString()}).`);
  } catch (err) {
    if (!last || last.error !== err.message) console.error(`Today's specials from the plan: ${err.message}`);
    plan.applied[today] = { sig, failedAt: new Date().toISOString(), error: err.message };
  }
  savePlan();
  return plan.applied[today];
}

module.exports = { applyToday };
