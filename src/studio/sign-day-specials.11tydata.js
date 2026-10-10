// The proof frame and the PNG are as tall as the week: one 8.5in page
// (816px) per day, with the 0.25in (24px) gap the stack has on screen.
const { latestWeek } = require("../_includes/specials-caption.js");

module.exports = {
  eleventyComputed: {
    studioH: (data) => {
      const n = latestWeek(data.specials && data.specials.days).length || 1;
      return n * 816 + (n - 1) * 24;
    },
  },
};
