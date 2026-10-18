// The proof frame and the PNG are as tall as the week's plates: one 17in
// page (1632px) per plate, with the 0.25in (24px) gap the stack has on screen.
const { latestWeek, distinctBy } = require("../_lib/specials-caption.js");

module.exports = {
  eleventyComputed: {
    studioH: (data) => {
      const n = distinctBy(latestWeek(data.specials && data.specials.days), "special").length || 1;
      return n * 1632 + (n - 1) * 24;
    },
  },
};
