// The day's-special post's day, dessert and caption, built from its own
// front matter, specials.json and desserts.json so the picture and the words
// can never disagree. /studio/downloads/ renders `caption` (one string per
// paragraph) with a Copy button. Made from the archived Macho Nachos post.

const money = (n) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

const findDay = (data) => data.specials.days.find((d) => d.date === data.postDate);

// ["Mashed Potatoes & Brown Gravy", "Veggies"] -> "mashed potatoes and brown
// gravy and veggies". "and", not "&", in a sentence (STYLE.md, Voice).
const sideWords = (data, day) => {
  if (data.sidesWords) return data.sidesWords;
  const list = (day && day.sides) || [];
  const words = list.map((w) => w.toLowerCase().replace(/ & /g, " and "));
  return words.length > 1 ? `${words.slice(0, -1).join(", ")} and ${words.at(-1)}` : words.join("");
};

// The dessert's price and the kinds Square still counts. When it counts none,
// desserts.json wasn't refreshed after counting, so no kind is named.
const sweetOf = (data) => {
  const item = data.desserts.items.find((i) => i.name === data.dessert);
  if (!item) return { price: "", kinds: "", names: [] };
  const inStock = item.kinds.filter((k) => !k.out);
  const word = (k) => (k.name === item.name ? "plain" : k.name.replace(new RegExp(`\\s*${item.name}$`, "i"), "").toLowerCase());
  const words = inStock.length > 1 ? inStock.map(word) : [];
  return {
    price: money(item.price),
    kinds: words.length ? `${words.slice(0, -1).join(", ")} or ${words.at(-1)}` : "",
    names: inStock.length > 1 ? inStock.map((k) => k.name) : [item.name],
  };
};

module.exports = {
  eleventyComputed: {
    day: (data) => findDay(data) || {},

    plate: (data) => {
      const day = findDay(data) || {};
      return { price: money(day.price ?? data.specials.price), sides: sideWords(data, day) };
    },

    sweet: (data) => sweetOf(data),

    caption: (data) => {
      const { site, specials } = data;
      const o = site.opening;
      const day = findDay(data);
      if (!day) return [`No day ${data.postDate} in specials.json.`];
      const sweet = sweetOf(data);
      const weekday = new Date(`${data.postDate}T00:00:00Z`).toLocaleDateString("en-US", {
        timeZone: "UTC", weekday: "long",
      });
      const hours = `${o.opens.time.replace(":00", "")}${o.opens.meridiem} – ${o.closes.time.replace(":00", "")}${o.closes.meridiem}`;
      const price = money(day.price ?? specials.price);
      const sides = sideWords(data, day);

      return [
        // The town is named: Facebook shows the post well beyond Leavenworth.
        `${weekday}'s lunch special at The Café in ${site.address.locality}, ${site.address.region}: ${day.special}${sides ? ` with ${sides}` : ""}. From 11am, ${price}${specials.includesDrink ? " with a drink" : ""}.`,
        day.soup ? `Soup of the day: ${day.soup}.` : null,
        sweet.price ? `For dessert: ${sweet.names.join(" and ")}, ${sweet.price} each, while they last.` : null,
        data.captionExtra || null,
        [
          `${site.address.street}, ${site.address.locality}, ${site.address.region}`,
          `Open ${weekday} ${hours}`,
          site.ordering.url ? `Order online at ${site.social.website}/order` : null,
        ].filter(Boolean).join(" · "),
      ].filter(Boolean);
    },
  },
};
