// Letter pages (1056px each, 24px gap on screen): the plate, then the
// soup (a day with no soup has none), then the desserts if dessertPage.
module.exports = {
  eleventyComputed: {
    studioH: (data) => {
      const d = ((data.specials && data.specials.days) || []).find((x) => x.date === data.signDate);
      const n = data.onePage ? 1 : (d && d.soup ? 2 : 1) + (data.dessertPage ? 1 : 0);
      return n * 1056 + (n - 1) * 24;
    },
  },
};
