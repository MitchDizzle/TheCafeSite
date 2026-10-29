// The costume cookie post's caption, built from the piece's own front matter
// and site.json so it can never disagree with the image. /studio/downloads/
// renders `caption` (one string per paragraph) with a Copy button.

module.exports = {
  eleventyComputed: {
    caption: (data) => {
      const { site } = data;
      const o = site.opening;
      const day = new Date(`${data.promoDate}T00:00:00Z`).toLocaleDateString("en-US", {
        timeZone: "UTC", weekday: "long", month: "long", day: "numeric",
      });
      const weekday = day.split(",")[0];
      const hours = `${o.opens.time.replace(":00", "")}${o.opens.meridiem} – ${o.closes.time.replace(":00", "")}${o.closes.meridiem}`;

      return [
        // The town up front: Facebook shows the post well beyond Leavenworth.
        // The tagline first, as on the picture.
        `Wear a costume for a free cookie: ${day} at The Café in ${site.address.locality}, ${site.address.region}.`,
        `It's our ${data.cookie.replace(/Cookie$/, "cookie")}, ${data.cookieMade} right here in our kitchen and ${data.cookieSub.toLowerCase()}.`,
        // Said in full here: the picture only has room for the short version.
        "One per person, while they last. There's no wheat in them, and they're mixed and baked apart from our regular cooking, but our kitchen does use wheat the rest of the day. They contain milk, egg and soy, and the M&M's may contain peanuts.",
        [
          `${site.address.street}, ${site.address.locality}, ${site.address.region}`,
          `Open ${weekday} ${hours}`,
          site.ordering.url ? `Order online at ${site.social.website}/order` : null,
        ].filter(Boolean).join(" · "),
      ];
    },
  },
};
