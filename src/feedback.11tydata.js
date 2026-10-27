// /feedback is built only once there is a survey to show (feedbackStats.json
// from the kitchen PC): before that there is no page, no footer link, and
// nothing for Google to find half-empty. Otherwise the flat-file permalink
// every page gets (src.11tydata.js).
module.exports = {
  eleventyComputed: {
    permalink: (data) => (data.feedbackStats && data.feedbackStats.total ? `${data.page.filePathStem}.html` : false),
  },
};
