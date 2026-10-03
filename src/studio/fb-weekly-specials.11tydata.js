// The weekly specials post's caption, built from src/_data/specials.json so
// it can never disagree with the image. /studio/downloads/ renders `caption`
// (one string per paragraph) with a Copy button, the same as the opening-day
// post's hand-written one.
//
// Edit the wording here; edit the food in the JSON. The day lines are shared
// with fb-open-monday via _includes/specials-caption.js.

const { weekRange, dayLines } = require("../_includes/specials-caption.js");

module.exports = {
  eleventyComputed: {
    caption: (data) => {
      const week = (data.specials && data.specials.week) || [];
      if (!week.length) return [];

      const { site } = data;
      const hours = `${site.opening.opens.time}${site.opening.opens.meridiem}–${site.opening.closes.time}${site.opening.closes.meridiem}`;

      return [
        `This week's lunch specials at The Café, ${weekRange(week)}:`,
        ...dayLines(week),
        `Lunch specials and soup are served from 11am. We're open ${site.opening.hoursDays}, ${hours}.${site.phoneOrders ? ` Call ${site.phone} and we'll have yours ready.` : ""}`,
        ...(site.ordering.url ? [`Order online for pickup: ${site.ordering.url.replace(/^https?:\/\//, "")}`] : []),
        `Full menu: ${site.social.website}/menu`,
      ];
    },
  },
};
