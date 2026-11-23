// The week's specials and their photos in ONE picture, for a short week
// (Mitch 2026-11-22: three days open over Thanksgiving). Each open day of the
// newest week in specials.json gets the newest photo in photos.json with the
// same name, or one that starts with it ("Pork Tenderloin" finds "Pork
// Tenderloin Sandwich"); a day with no photo gets a plain teal tile with the
// wordmark. `treat` in the piece's front matter adds a dessert band, priced
// from desserts.json (Square). The caption is the weekly post's, with the
// treat's line added.

const { latestWeek, withClosed } = require("../_lib/specials-caption.js");
const weekly = require("./fb-weekly-specials.11tydata.js");

const key = (s) => String(s || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();
const dollars = (n) => `$${Number(n).toFixed(2).replace(/\.00$/, "")}`;

module.exports = {
  eleventyComputed: {
    days: (data) => {
      const photos = [...data.photos.photos].sort((a, b) => (a.date < b.date ? 1 : -1));
      return withClosed(latestWeek(data.specials.days), data.site.closedDays).map((d) => {
        if (d.closed) return d;
        const want = key(d.special);
        const match = (p) => [p.title, p.item].some((n) => key(n) === want);
        const starts = (p) => [p.title, p.item].some((n) => key(n).startsWith(want + " "));
        const photo = photos.find(match) || photos.find(starts);
        return { ...d, photo: photo ? { file: photo.file, alt: photo.alt } : null };
      });
    },

    treatInfo: (data) => {
      const t = data.treat;
      if (!t) return null;
      const want = key(t.item || t.name);
      const photo = [...data.photos.photos]
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .find((p) => key(p.item) === want || key(p.title) === want);
      const sq = ((data.desserts && data.desserts.items) || []).find((x) => key(x.name) === want);
      const chosen = (t.photo && data.photos.photos.find((p) => p.file === t.photo)) || photo;
      return {
        name: t.name,
        note: t.note || "",
        price: t.price || (sq && sq.price ? dollars(sq.price) : ""),
        photo: chosen ? { file: chosen.file, alt: chosen.alt } : null,
      };
    },

    caption: (data) => {
      const base = weekly.eleventyComputed.caption(data);
      const t = data.treat;
      if (!base.length || !t) return base;
      const sq = ((data.desserts && data.desserts.items) || []).find((x) => key(x.name) === key(t.item || t.name));
      const price = t.price || (sq && sq.price ? dollars(sq.price) : "");
      const line = `${t.name} this week too${t.note ? `, ${t.note.charAt(0).toLowerCase()}${t.note.slice(1)}` : ""}${price ? `, ${price}` : ""}.`;
      // After the sides, before the address line.
      return [...base.slice(0, -1), line, base[base.length - 1]];
    },
  },
};
