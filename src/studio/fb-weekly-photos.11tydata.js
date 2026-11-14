// The week's plates as photos, for the second picture of the weekly specials
// post. Each day of the newest week in specials.json is matched to the newest
// photo in photos.json with the same name (a daily special's `title`, or a
// menu item's), so the photos follow the week with nothing to set by hand.
// A day with no photo is left out; the post shows up to four.

const { latestWeek } = require("../_lib/specials-caption.js");

// "Sausage & Kraut" and "sausage and kraut" are the same plate.
const key = (s) => String(s || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();

module.exports = {
  eleventyComputed: {
    tiles: (data) => {
      const photos = [...data.photos.photos].sort((a, b) => (a.date < b.date ? 1 : -1));
      const out = [];
      for (const day of latestWeek(data.specials.days)) {
        const want = key(day.special);
        const photo = photos.find((p) => key(p.title) === want || key(p.item) === want);
        if (photo) out.push({ date: day.date, special: day.special, file: photo.file, alt: photo.alt });
      }
      return out.slice(0, 4);
    },
  },
};
