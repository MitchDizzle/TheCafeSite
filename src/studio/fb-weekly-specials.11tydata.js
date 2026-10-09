// The weekly specials post's caption, built from src/_data/specials.json so
// it can never disagree with the image. /studio/downloads/ renders `caption`
// (one string per paragraph) with a Copy button.
//
// Edit the wording here; edit the food in the JSON. The day lines come from
// _includes/specials-caption.js.

const { weekRange, dayLines, soupLine, latestWeek } = require("../_includes/specials-caption.js");

module.exports = {
  eleventyComputed: {
    caption: (data) => {
      const week = latestWeek(data.specials && data.specials.days);
      if (!week.length) return [];

      const { site } = data;
      const o = site.opening;
      const hours = `${o.opens.time.replace(":00", "")}${o.opens.meridiem} – ${o.closes.time.replace(":00", "")}${o.closes.meridiem}`;

      // Kept short on purpose (client 2026-10-08): Facebook text is read on a
      // phone, and the details (which drinks, which sides) are explained at
      // the counter. The order link is our own /order (src/order.njk), which
      // forwards to the ordering page, like the printed QR codes: it reads
      // better than the ordering page's own address and survives a change
      // of it.
      return [
        `Lunch specials, ${weekRange(week)}. From 11am${data.specials.includesDrink ? ", each with a drink" : ""}.`,
        ...dayLines(week),
        ...[soupLine(week)].filter(Boolean),
        [
          `Open ${o.hoursDays}, ${hours}`,
          site.phoneOrders ? `Call ${site.phone} to order ahead` : null,
          site.ordering.url ? `Order online at ${site.social.website}/order` : null,
        ].filter(Boolean).join(" · "),
      ];
    },
  },
};
