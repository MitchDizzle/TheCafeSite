// What Manage -> Signs reads from Square (the day's plate and soup prices,
// the desserts and their counts, the fridge's drinks), kept until it's asked
// for again (Mitch 2026-11-23: most of the time making signs was spent
// reading Square again for what it had just read, and the words and prices
// only change when the special or the POS is changed). It's read again:
//   - when Refresh from Square is pressed on Signs (`fresh`),
//   - the next day,
//   - and whenever the board itself writes to Square (Specials, Desserts,
//     the morning's sides and words, a stock count): catalog.js and
//     inventory.js call forget().
// A change made on the POS or Square's dashboard isn't seen until Refresh.
const { localDate } = require("./util");

const kept = new Map(); // key -> { day, at, value: a promise }

// fn()'s answer for `key`, read once a day unless `fresh`. A read that fails
// isn't kept, so the next one tries again.
function cached(key, fn, fresh = false) {
  const day = localDate();
  const hit = kept.get(key);
  if (!fresh && hit && hit.day === day) return hit.value;
  const entry = { day, at: Date.now(), value: Promise.resolve().then(fn) };
  kept.set(key, entry);
  entry.value.catch(() => { if (kept.get(key) === entry) kept.delete(key); });
  return entry.value;
}

// When the oldest of `keys` still kept was read (ms), or null.
function readAt(keys) {
  const ats = keys.map((k) => kept.get(k)).filter((e) => e && e.day === localDate()).map((e) => e.at);
  return ats.length ? Math.min(...ats) : null;
}

function forget() { kept.clear(); }

module.exports = { cached, readAt, forget };
