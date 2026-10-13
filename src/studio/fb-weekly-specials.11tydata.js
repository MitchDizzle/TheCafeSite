// The weekly specials post's caption, built from src/_data/specials.json so
// it can never disagree with the image. /studio/downloads/ renders `caption`
// (one string per paragraph) with a Copy button.
//
// Edit the wording here; edit the food in the JSON. The day lines come from
// _includes/specials-caption.js.

const { weekRange, dayLines, soupLine, latestWeek } = require("../_includes/specials-caption.js");

module.exports = {
  eleventyComputed: {
    caption: (data) => {
      const week = latestWeek(data.specials && data.specials.days);
      if (!week.length) return [];

      const { site } = data;
      // "$10", or "$10.50": the usual price of a special (specials.json).
      const dollars = (n) => `$${Number(n).toFixed(2).replace(/\.00$/, "")}`;
      const price = data.specials.price ? dollars(data.specials.price) : "";
      const o = site.opening;
      const hours = `${o.opens.time.replace(":00", "")}${o.opens.meridiem} – ${o.closes.time.replace(":00", "")}${o.closes.meridiem}`;

      // Kept short on purpose (client 2026-10-08): Facebook text is read on a
      // phone, and the details (which drinks, which sides) are explained at
      // the counter. The order link is our own /order (src/order.njk), which
      // forwards to the ordering page, like the printed QR codes: it reads
      // better than the ordering page's own address and survives a change
      // of it.
      // The sides, every week: what "with choice of side" means, and what
      // can be swapped in on any other special (client 2026-10-09).
      const sides = (data.menu.categories.find((c) => c.id === "sides") || { items: [] })
        .items.find((i) => i.choices);
      const choiceLine = sides
        ? `Sides (pick one on a choice-of-side day, or swap for the sides on any special): ${sides.choices.join(", ")}` : null;

      return [
        // The town up front: Facebook shows the post well beyond Leavenworth.
        `Lunch specials at The Café in ${site.address.locality}, ${site.address.region}, ${weekRange(week)}. From 11am${price ? `, ${price} each` : ""}${data.specials.includesDrink ? ", with a drink" : ""}.`,
        // A day that costs something else says so on its own line.
        ...dayLines(week).map((line, i) => (week[i].price && week[i].price !== data.specials.price ? `${line} (${dollars(week[i].price)})` : line)),
        ...[choiceLine, soupLine(week)].filter(Boolean),
        [
          `${site.address.street}, ${site.address.locality}, ${site.address.region}`,
          `Open ${o.hoursDays}, ${hours}`,
          site.phoneOrders ? `Call ${site.phone} to order ahead` : null,
          site.ordering.url ? `Order online at ${site.social.website}/order` : null,
        ].filter(Boolean).join(" · "),
      ];
    },
  },
};
