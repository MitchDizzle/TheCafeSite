// The closed post's caption, built from the day's entry in site.json's
// closedDays so it can never disagree with the image. /studio/downloads/
// renders `caption` (one string per paragraph) with a Copy button.

const day = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
  timeZone: "UTC", weekday: "long", month: "long", day: "numeric",
});

module.exports = {
  eleventyComputed: {
    caption: (data) => {
      const { site } = data;
      const c = site.closedDays.find((d) => d.date === data.closedDate);
      const o = site.opening;
      const opens = `${o.opens.time.replace(":00", "")}${o.opens.meridiem}`;
      const closes = `${o.closes.time.replace(":00", "")}${o.closes.meridiem}`;

      return [
        // The holiday first, as on the picture, and the town up front:
        // Facebook shows the post well beyond Leavenworth.
        `Closed for ${c.name}: The Café in ${site.address.locality}, ${site.address.region} will be closed ${day(c.date)}.`,
        `Just that one day. We'll be back ${day(c.back)} at ${opens}.`,
        c.thanks,
        // No order link: the post is telling people not to come that day.
        `${site.address.street}, ${site.address.locality}, ${site.address.region} · Open ${o.hoursDays}, ${opens} – ${closes}`,
      ].filter(Boolean);
    },
  },
};
