// Everything the dish post says that isn't the photo, looked up from
// menu.json by the photo's `item` (see src/_data/photos.json). Nothing here is
// typed by hand: change the menu and the posts follow on the next build.

const menu = require("../_data/menu.json");

function lookup(name) {
  for (const c of menu.categories) {
    for (const i of c.items || []) if (i.name === name) return { category: c, item: i };
  }
  return null;
}

const money = (n) => `$${Number(n).toFixed(2)}`;

// "on a Kaiser bun", unless the description already names the bread
// ("…on white toast").
function withBread(item) {
  const d = item.description || "";
  if (!item.defaultBread || / on /i.test(d)) return d;
  const bread = item.defaultBread === "Kaiser" ? "a Kaiser bun" : item.defaultBread.toLowerCase();
  return `${d} on ${bread}`;
}

const slug = (photo) => photo.file.replace("/assets/photos/", "").replace(/\.jpg$/, "");

module.exports = {
  eleventyComputed: {
    // The board, the manifest and the downloads page key on this; a
    // paginated template shares one fileSlug across all its pages.
    studioSlug: (data) => `fb-dish-${slug(data.photo)}`,
    studioTitle: (data) => `Dish post: ${data.photo.title}`,

    dish: (data) => {
      const { photo } = data;
      const found = lookup(photo.item);
      if (!found) throw new Error(`photos.json: "${photo.item}" is not an item in menu.json`);
      const { category, item } = found;
      const price = item.price ?? (category.sizing && category.sizing[0] && category.sizing[0].price);

      // The hot sandwiches come both ways; say so on the other one's photo.
      const variantNote =
        photo.variant === "Chicken" ? "Also made as a burger" :
        photo.variant === "Burger" ? "Also made with chicken" : null;

      // Fit the name on one line across the 960px measure. Playfair Black
      // Italic runs about 0.56em a character.
      const titleSize = Math.min(104, Math.floor(960 / (photo.title.length * 0.56)));

      return {
        kicker: category.name,
        description: withBread(item),
        price: price != null ? money(price) : "",
        variantNote,
        titleSize,
      };
    },

    caption: (data) => {
      const { photo, site } = data;
      const found = lookup(photo.item);
      if (!found) return [];
      const { category, item } = found;
      const price = item.price ?? (category.sizing && category.sizing[0] && category.sizing[0].price);
      const o = site.opening;
      const lines = [`${photo.title}: ${withBread(item)}. ${money(price)}.`];
      if (photo.variant === "Chicken") lines.push("Rather have a burger? We make it that way too.");
      if (photo.variant === "Burger") lines.push("Rather have chicken? We make it that way too.");
      lines.push(
        `Order at the counter or call ${site.phone} and we'll have it ready. Open ${o.hoursDays}, ${o.opens.time.replace(":00", "")}${o.opens.meridiem} – ${o.closes.time.replace(":00", "")}${o.closes.meridiem}, ${site.address.street}.`,
        `Full menu: ${site.url}/menu`
      );
      return lines;
    },
  },
};
