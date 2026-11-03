// The Macho Nachos post's day, dessert and caption, built from its own front
// matter, specials.json and desserts.json so the picture and the words can
// never disagree. /studio/downloads/ renders `caption` (one string per
// paragraph) with a Copy button.

const money = (n) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

// "Taco Meat, Nacho Cheese, Sour Cream" -> "Taco meat, nacho cheese and sour
// cream": the leaveOff list is what comes on the plate.
const toppingWords = (list) => {
  const words = list.map((w, i) => (i ? w.toLowerCase() : w[0] + w.slice(1).toLowerCase()));
  return words.length > 1 ? `${words.slice(0, -1).join(", ")} and ${words.at(-1)}` : words.join("");
};

module.exports = {
  eleventyComputed: {
    day: (data) => data.specials.days.find((d) => d.date === data.postDate) || {},

    plate: (data) => {
      const day = data.specials.days.find((d) => d.date === data.postDate) || {};
      return {
        price: money(day.price ?? data.specials.price),
        toppings: day.leaveOff ? toppingWords(day.leaveOff) : null,
      };
    },

    // The kinds Square still counts, as words: "plain or chocolate". Every
    // kind at 0 means desserts.json wasn't refreshed after counting, so all
    // of them are named rather than none.
    puffs: (data) => {
      const item = data.desserts.items.find((i) => i.name === data.dessert);
      if (!item) return { price: "", kinds: "", names: [] };
      const inStock = item.kinds.filter((k) => !k.out);
      const kinds = inStock.length ? inStock : item.kinds;
      const word = (k) => (k.name === item.name ? "plain" : k.name.replace(/\s*Cream Puffs?$/i, "").toLowerCase());
      const words = kinds.map(word);
      return {
        price: money(item.price),
        kinds: words.length > 1 ? `${words.slice(0, -1).join(", ")} or ${words.at(-1)}` : words.join(""),
        names: kinds.map((k) => k.name),
      };
    },

    caption: (data) => {
      const { site, specials } = data;
      const o = site.opening;
      const day = specials.days.find((d) => d.date === data.postDate);
      if (!day) return [`No day ${data.postDate} in specials.json.`];
      const item = data.desserts.items.find((i) => i.name === data.dessert);
      const inStock = item ? item.kinds.filter((k) => !k.out) : [];
      const puffs = item ? (inStock.length ? inStock : item.kinds).map((k) => k.name) : [];
      const weekday = new Date(`${data.postDate}T00:00:00Z`).toLocaleDateString("en-US", {
        timeZone: "UTC", weekday: "long",
      });
      const hours = `${o.opens.time.replace(":00", "")}${o.opens.meridiem} – ${o.closes.time.replace(":00", "")}${o.closes.meridiem}`;
      const price = money(day.price ?? specials.price);

      return [
        // Mitch's opening line (client 2026-11-03), with the town added:
        // Facebook shows the post well beyond Leavenworth.
        `Don't let the rain prevent you from having a Macho day. Come to The Café in ${site.address.locality}, ${site.address.region} for some ${day.special}.`,
        [
          `They're today's lunch special, from 11am, ${price}${specials.includesDrink ? " with a drink" : ""}.`,
          day.leaveOff ? `They come with ${toppingWords(day.leaveOff).toLowerCase()}. Don't want one? Just tell us.` : null,
          // "and", not "&", in a sentence (STYLE.md, Voice).
          day.note ? day.note.replace(/ & /g, " and ") : null,
        ].filter(Boolean).join(" "),
        item ? `For dessert: ${puffs.join(" and ")}, ${money(item.price)} each, while they last.` : null,
        [
          `${site.address.street}, ${site.address.locality}, ${site.address.region}`,
          `Open ${weekday} ${hours}`,
          site.ordering.url ? `Order online at ${site.social.website}/order` : null,
        ].filter(Boolean).join(" · "),
      ].filter(Boolean);
    },
  },
};
