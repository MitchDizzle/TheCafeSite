// Two letter pages (1056px each, 24px gap on screen): the plate, then the
// soup. A day with no soup is the plate alone.
module.exports = {
  eleventyComputed: {
    studioH: (data) => {
      const d = ((data.specials && data.specials.days) || []).find((x) => x.date === data.signDate);
      const n = d && d.soup ? 2 : 1;
      return n * 1056 + (n - 1) * 24;
    },
  },
};
