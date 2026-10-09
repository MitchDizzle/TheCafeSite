// The week's specials as caption text, for the weekly post
// (fb-weekly-specials), and the specialSides / latestWeek filters every
// piece that lists the specials uses, so the wording can't drift between
// them. Built from src/_data/specials.json, the same file as the images.
//
// Plain words and no emoji: the audience skews older, and a caption is read
// by screen readers too.

// Same rule as the `dayDate` filter in .eleventy.js: a YYYY-MM-DD string is a
// calendar date, read in UTC so the build machine's zone can't shift it.
const words = (iso, opts) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", ...opts });

// "October 5–9", or "September 28 – October 2" across a month end.
function weekRange(week) {
  const first = words(week[0].date, { month: "long", day: "numeric" });
  const last = words(week[week.length - 1].date, { month: "long", day: "numeric" });
  return first.split(" ")[0] === last.split(" ")[0]
    ? `${first}–${last.split(" ")[1]}`
    : `${first} – ${last}`;
}

// What comes with a day's plate, as words: "with choice of side" when
// the day sets anySide, "with A and B" / "with A, B and C" for set sides,
// "" for none. The ONE place this is worded: every piece that lists the
// specials uses it (registered as the specialSides filter), so a day can't
// say "choice of side" on the sign and name sides in the caption. A plain
// " and " join turned "Mashed Potatoes & Gravy" plus a second side into a
// chain of ampersands, which is why this never joins with "&".
function specialSides(d) {
  if (!d) return "";
  if (d.anySide) return "with choice of side";
  const s = d.sides || [];
  if (!s.length) return "";
  if (s.length === 1) return `with ${s[0]}`;
  return `with ${s.slice(0, -1).join(", ")} and ${s[s.length - 1]}`;
}

// One line per day: the plate only, read as a list (no full stops). The soup
// is a separate item, so it gets its own line (soupLine), never "X with Y
// and Z soup" run together.
function dayLines(week) {
  return week.map((d) => {
    const sides = specialSides(d);
    return `${words(d.date, { weekday: "long" })}: ${d.special}${sides ? ` ${sides}` : ""}`;
  });
}

// The week's soups on one line, apart from the plates, with short day names.
function soupLine(week) {
  const soups = week.filter((d) => d.soup)
    .map((d) => `${words(d.date, { weekday: "short" })} ${d.soup}`);
  return soups.length ? `Soups (sold separately): ${soups.join(", ")}` : "";
}

// The Monday of a YYYY-MM-DD date's week, as YYYY-MM-DD.
function mondayOf(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

// The newest week in specials.json's `days`: the Monday-to-Sunday week of
// the latest date in the file, in date order. The file holds this week and
// next side by side (next week goes in while this one is still on /menu),
// and every printed or posted piece is made for the week ahead, so that is
// the one they show. /menu picks its own days by the visitor's date.
function latestWeek(days) {
  const sorted = [...(days || [])].sort((a, b) => a.date.localeCompare(b.date));
  if (!sorted.length) return [];
  const monday = mondayOf(sorted[sorted.length - 1].date);
  return sorted.filter((d) => mondayOf(d.date) === monday);
}

module.exports = { weekRange, dayLines, soupLine, specialSides, latestWeek };
