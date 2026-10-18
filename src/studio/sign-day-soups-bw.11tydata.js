// The proof frame and the PNG are as tall as the week's soups: one 8.5in
// page (816px) per soup, with the 0.25in (24px) gap the stack has on screen.
const { latestWeek, distinctBy } = require("../_lib/specials-caption.js");

module.exports = {
  eleventyComputed: {
    studioH: (data) => {
      const n = distinctBy(latestWeek(data.specials && data.specials.days), "soup").length || 1;
      return n * 816 + (n - 1) * 24;
    },
  },
};
