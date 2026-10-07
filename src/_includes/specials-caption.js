// The week's specials as caption text, shared by every post that lists them
// (fb-weekly-specials, fb-open-monday) so the wording can't drift between
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

// One paragraph per day. The plate and the soup are sold separately, so they
// are two sentences, never "X with Y and Z soup" run together.
function dayLines(week) {
  return week.map((d) => {
    let line = `${words(d.date, { weekday: "long" })}: ${d.special}`;
    if (d.sides && d.sides.length) line += ` with ${d.sides.join(" and ")}`;
    line += ".";
    if (d.soup) line += ` Soup of the day: ${d.soup}.`;
    return line;
  });
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

module.exports = { weekRange, dayLines, latestWeek };
