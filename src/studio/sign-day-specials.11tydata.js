// The proof frame and the PNG are as tall as the week: one 17in page
// (1632px) per day, with the 0.25in (24px) gap the stack has on screen.
const { latestWeek } = require("../_includes/specials-caption.js");

module.exports = {
  eleventyComputed: {
    studioH: (data) => {
      const n = latestWeek(data.specials && data.specials.days).length || 1;
      return n * 1632 + (n - 1) * 24;
    },
  },
};
