// The weekly specials post's caption, built from src/_data/specials.json so
// it can never disagree with the image. /studio/downloads/ renders `caption`
// (one string per paragraph) with a Copy button, the same as the opening-day
// post's hand-written one.
//
// Edit the wording here; edit the food in the JSON. The day lines are shared
// with fb-open-monday via _includes/specials-caption.js.

const { weekRange, dayLines, soupLine, latestWeek } = require("../_includes/specials-caption.js");

module.exports = {
  eleventyComputed: {
    caption: (data) => {
      const week = latestWeek(data.specials && data.specials.days);
      if (!week.length) return [];

      const { site } = data;
      const hours = `${site.opening.opens.time}${site.opening.opens.meridiem}–${site.opening.closes.time}${site.opening.closes.meridiem}`;

      // Kept short on purpose (client 2026-10-08): Facebook text is read on a
      // phone, and the details (which drinks, which sides) are explained at
      // the counter.
      return [
        `Lunch specials at The Café, ${weekRange(week)}. Served from 11am${data.specials.includesDrink ? ", and each one comes with a drink" : ""}.`,
        ...dayLines(week),
        ...[soupLine(week)].filter(Boolean),
        `Open ${site.opening.hoursDays}, ${hours}.${site.phoneOrders ? ` Call ${site.phone} to order ahead.` : ""}`,
        ...(site.ordering.url ? [`Order online: ${site.ordering.url.replace(/^https?:\/\//, "")}`] : []),
        `Menu: ${site.social.website}/menu`,
      ];
    },
  },
};
