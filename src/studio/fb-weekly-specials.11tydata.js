// The weekly specials post's caption, built from src/_data/specials.json so
// it can never disagree with the image. /studio/downloads/ renders `caption`
// (one string per paragraph) with a Copy button, the same as the opening-day
// post's hand-written one.
//
// Plain words and no emoji: the audience skews older, and a caption is read
// by screen readers too. Edit the wording here; edit the food in the JSON.

// Same rule as the `dayDate` filter in .eleventy.js: a YYYY-MM-DD string is a
// calendar date, read in UTC so the build machine's zone can't shift it.
const words = (iso, opts) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", ...opts });

module.exports = {
  eleventyComputed: {
    caption: (data) => {
      const week = (data.specials && data.specials.week) || [];
      if (!week.length) return [];

      const first = words(week[0].date, { month: "long", day: "numeric" });
      const last = words(week[week.length - 1].date, { month: "long", day: "numeric" });
      const range =
        first.split(" ")[0] === last.split(" ")[0]
          ? `${first}–${last.split(" ")[1]}`
          : `${first} – ${last}`;

      // The plate and the soup are sold separately, so they are two
      // sentences, never "X with Y and Z soup" run together.
      const days = week.map((d) => {
        let line = `${words(d.date, { weekday: "long" })}: ${d.special}`;
        if (d.sides && d.sides.length) line += ` with ${d.sides.join(" and ")}`;
        line += ".";
        if (d.soup) line += ` Soup of the day: ${d.soup}.`;
        return line;
      });

      const { site } = data;
      const hours = `${site.opening.opens.time}${site.opening.opens.meridiem}–${site.opening.closes.time}${site.opening.closes.meridiem}`;

      return [
        `This week's lunch specials at The Café, ${range}:`,
        ...days,
        `Lunch specials and soup are served from 11am. We're open ${site.opening.hoursDays}, ${hours}. Call ${site.phone} and we'll have yours ready.`,
        `Full menu: ${site.social.website}/menu`,
      ];
    },
  },
};
