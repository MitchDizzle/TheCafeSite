// The first month post's numbers and caption, built from feedbackStats.json,
// site.json and the piece's own front matter, so the picture and the words
// can't disagree. /studio/downloads/ renders `caption` (one string per
// paragraph) with a Copy button.

// Each rating's share of Great or Good, the same sum /feedback shows.
const shares = (stats) => stats.ratings.map((q) => ({
  label: q.label,
  share: Math.round(((q.counts[0][1] + q.counts[1][1]) / q.answered) * 100),
}));

const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);

// "a, b and c" (no "&" joining a list; see STYLE.md).
const listed = (items) => `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

module.exports = {
  eleventyComputed: {
    ratingShares: (data) => shares(data.feedbackStats),
    caption: (data) => {
      const { site, feedbackStats } = data;
      const o = site.opening;
      const hours = `${o.opens.time.replace(":00", "")}${o.opens.meridiem} – ${o.closes.time.replace(":00", "")}${o.closes.meridiem}`;
      const ratings = shares(feedbackStats)
        .map((r) => `${lowerFirst(r.label).replace(" & ", " and ")} ${r.share}%`);

      return [
        // The town up front: Facebook shows the post well beyond Leavenworth.
        `Thank you for our first month at The Café in ${site.address.locality}, ${site.address.region}. You filled out ${feedbackStats.total} survey cards, and we read every one.`,
        `Rated Great or Good: ${ratings.join(", ")}.`,
        "What you asked for, and where it stands:",
        ...data.asked.map((a) => `${a.ask}? ${a.reply}.`),
        `Still working on: ${listed(data.working.map(lowerFirst))}.`,
        // Asks everyone, good or bad, and offers nothing: Google's rules.
        // No web links (client 2026-11-07): Facebook caps posts with links
        // unless the Page pays for Meta Verified; the picture has the address.
        "Every card is counted, good and bad, on the Our feedback page of our website. Keep telling us: survey cards are at the counter, and the survey is on our website too. A Google review, good or bad, helps people find us: look up The Café in Leavenworth on Google.",
        [
          `${site.address.street}, ${site.address.locality}, ${site.address.region}`,
          `Open ${o.hoursDays}, ${hours}`,
          site.ordering.url ? "Order online through our website" : null,
        ].filter(Boolean).join(" · "),
      ];
    },
  },
};
