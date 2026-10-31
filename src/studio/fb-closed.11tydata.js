// The closed post's caption, built from the piece's own front matter and
// site.json so it can never disagree with the image. /studio/downloads/
// renders `caption` (one string per paragraph) with a Copy button.

const day = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
  timeZone: "UTC", weekday: "long", month: "long", day: "numeric",
});

module.exports = {
  eleventyComputed: {
    caption: (data) => {
      const { site } = data;
      const o = site.opening;
      const opens = `${o.opens.time.replace(":00", "")}${o.opens.meridiem}`;
      const closes = `${o.closes.time.replace(":00", "")}${o.closes.meridiem}`;

      return [
        // The town up front: Facebook shows the post well beyond Leavenworth.
        `The Café in ${site.address.locality}, ${site.address.region} will be closed ${day(data.closedDate)} for ${data.holiday}.`,
        data.thanks,
        `We'll be back ${day(data.backDate)} at ${opens}.`,
        // No order link: the post is telling people not to come that day.
        `${site.address.street}, ${site.address.locality}, ${site.address.region} · Open ${o.hoursDays}, ${opens} – ${closes}`,
      ].filter(Boolean);
    },
  },
};
