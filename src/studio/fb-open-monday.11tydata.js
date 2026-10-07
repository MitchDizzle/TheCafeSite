// The "we open Monday" post's caption. It goes out with the weekly specials
// image in one multi-image post, and most people never expand a caption, so
// it carries everything on its own: the opening, the hours, the whole week of
// specials (from src/_data/specials.json, shared wording with
// fb-weekly-specials), and where to see the menu.
//
// One string per paragraph; /studio/downloads/ shows it with a Copy button.

const { weekRange, dayLines, latestWeek } = require("../_includes/specials-caption.js");

module.exports = {
  eleventyComputed: {
    caption: (data) => {
      const { site } = data;
      const o = site.opening;
      const week = latestWeek(data.specials && data.specials.days);
      const hours = `${o.opens.time.replace(":00", "")}${o.opens.meridiem} – ${o.closes.time.replace(":00", "")}${o.closes.meridiem}`;

      const lines = [
        `We open ${o.dayName}, ${o.monthDay}${o.ordinal}! The Cafe is back open to the public as an order-and-go deli, ${o.hoursDays}, ${hours} at ${site.address.street}. Seating is available.`,
      ];
      if (week.length) {
        lines.push(
          `Breakfast starts at ${o.opens.time.replace(":00", "")}${o.opens.meridiem}, and lunch specials and soup start at 11am. Our first week of specials, ${weekRange(week)}:`,
          ...dayLines(week)
        );
      }
      lines.push(
        site.ordering.url
          ? `Order online for pickup at ${site.ordering.url.replace(/^https?:\/\//, "")}, or order at the counter. Full menu: ${site.url}/menu`
          : site.phoneOrders
          ? `We're working on online ordering for the website. Until then, see the full menu at ${site.url}/menu and call ${site.phone} to order ahead.`
          : `Online ordering is on its way. Until then, order at the counter, and see the full menu at ${site.url}/menu.`,
        "See you Monday!"
      );
      return lines;
    },
  },
};
