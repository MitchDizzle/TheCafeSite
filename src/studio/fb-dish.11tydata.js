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
// ("…on white toast"). An item the menu gives no description (the burrito
// is build-your-own; its options are a note on the category) takes the
// photo's own `description` instead.
function withBread(item, photo) {
  const d = item.description || photo.description || "";
  if (!item.defaultBread || / on /i.test(d)) return d;
  const bread = item.defaultBread === "Kaiser" ? "a Kaiser bun" : item.defaultBread.toLowerCase();
  return `${d} on ${bread}`;
}

// Fit the name on one line across the 960px measure. Playfair Black Italic
// runs about 0.56em a character.
const titleSizeFor = (title) => Math.min(104, Math.floor(960 / (title.length * 0.56)));

const slug = (photo) => photo.file.replace("/assets/photos/", "").replace(/\.jpg$/, "");

module.exports = {
  eleventyComputed: {
    // The board, the manifest and the downloads page key on this; a
    // paginated template shares one fileSlug across all its pages.
    studioSlug: (data) => `fb-dish-${slug(data.photo)}`,
    studioTitle: (data) => `Dish post: ${data.photo.title}`,

    dish: (data) => {
      const { photo } = data;
      // A daily special isn't on the menu: the photo carries its own words,
      // and the post says it's a special rather than naming a category.
      if (photo.special) {
        if (!photo.description) throw new Error(`photos.json: special "${photo.title}" needs a description`);
        return { kicker: "Daily Special", description: photo.description,
          variantNote: photo.includesDrink ? "Drink included" : null, titleSize: titleSizeFor(photo.title) };
      }
      const found = lookup(photo.item);
      if (!found) throw new Error(`photos.json: "${photo.item}" is not an item in menu.json`);
      const { category, item } = found;

      // The hot sandwiches come both ways; say so on the other one's photo.
      // "Available as…", not "Also made with chicken", which read as if
      // the burger already had chicken in it.
      const variantNote =
        photo.variant === "Chicken" ? "Available as a burger" :
        photo.variant === "Burger" ? "Available as a chicken sandwich" : null;

      return {
        kicker: category.name,
        description: withBread(item, photo),
        variantNote,
        titleSize: titleSizeFor(photo.title),
      };
    },

    caption: (data) => {
      const { photo, site } = data;
      const o = site.opening;
      const lines = [];
      if (photo.special) {
        // No price: a special's price lives in Square and changes with the
        // dish. Written for posting on the day it's served.
        lines.push(`Today's special: ${photo.title}, ${photo.description.charAt(0).toLowerCase()}${photo.description.slice(1)}.${photo.includesDrink ? " A drink is included." : ""} While it lasts!`);
      } else {
        const found = lookup(photo.item);
        if (!found) return [];
        const { category, item } = found;
        const price = item.price ?? (category.sizing && category.sizing[0] && category.sizing[0].price);
        lines.push(`${photo.title}: ${withBread(item, photo)}. ${money(price)}.`);
      }
      if (photo.variant === "Chicken") lines.push("Rather have a burger? It's available that way too.");
      if (photo.variant === "Burger") lines.push("Rather have chicken? It's available as a chicken sandwich too.");
      // The first photos were taken while the menu was still being
      // finalized; anything shot from opening day on is the real plate.
      if (photo.date < site.opening.date) lines.push(
        "A first look from our kitchen: these photos were taken while we were still finalizing the menu, so your plate may look a little different."
      );
      lines.push(
        `${site.ordering.url ? `Order online for pickup at ${site.ordering.url.replace(/^https?:\/\//, "")}, or at the counter.` : site.phoneOrders ? `Order at the counter or call ${site.phone} and we'll have it ready.` : "Order at the counter."} Open ${o.hoursDays}, ${o.opens.time.replace(":00", "")}${o.opens.meridiem} – ${o.closes.time.replace(":00", "")}${o.closes.meridiem}, ${site.address.street}.`,
        photo.special ? `Today's special and the full menu: ${site.url}/menu` : `Full menu: ${site.url}/menu`
      );
      return lines;
    },
  },
};
