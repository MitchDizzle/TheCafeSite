// Manage -> Photo post: the phone draws the post itself (canvas), from a
// photo it just took and words it fills from the plan or Square's menu. The
// kitchen PC only keeps the result, for the website later: the photo (already
// shrunk to 2000px and re-drawn on the phone, which drops its GPS data) and
// the finished post, in photos/, with photos/photos.json in the same shape as
// the site's src/_data/photos.json so they can be moved over as they are.
// Gitignored.
const fs = require("fs");
const path = require("path");
const { DATA, MOCK } = require("./config");
const { localDate, cleanText } = require("./util");
const { catalog, loadCatalog } = require("./catalog");
const { plan, siteFieldFor } = require("./specials/plan");

const PHOTO_DIR = path.join(DATA, MOCK ? "photos-mock" : "photos");

// What the screen starts from: today's planned special and soup (with the
// website's sides), and every item in Square with its words and price.
async function photoSetup() {
  await loadCatalog();
  const date = localDate();
  const day = plan.days[date];
  const today = {};
  if (day) {
    for (const [name, it] of Object.entries(day.items)) {
      const field = siteFieldFor(name);
      if (field && it.today) today[field] = it.today;
    }
    if (day.sides && day.sides.length) today.sides = day.sides;
    if (day.anySide) today.anySide = true;
  }
  // The words for the photo written in Specials, if any.
  const note = plan.notes[date];
  if (note && note.description) today.description = note.description;
  return { date, today, items: catalog.menuItems, catalogError: catalog.error };
}

const slugOf = (s) => String(s).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "photo";

function jpegFrom(dataUrl, what) {
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ""));
  if (!m) throw Object.assign(new Error(`The ${what} didn't come through. Try again.`), { plain: true });
  const bytes = Buffer.from(m[1], "base64");
  if (bytes.length > 8 * 1024 * 1024) throw Object.assign(new Error(`The ${what} is too big.`), { plain: true });
  return bytes;
}

// body: { photo, post: JPEG data URLs, meta: { title, item, special, includesDrink, description, kicker } }
function savePhotoPost(body) {
  const meta = body.meta || {};
  const title = cleanText(meta.title);
  if (!title) throw Object.assign(new Error("The post needs a name."), { plain: true });
  const photo = jpegFrom(body.photo, "photo");
  const post = jpegFrom(body.post, "finished post");
  fs.mkdirSync(PHOTO_DIR, { recursive: true });
  const indexFile = path.join(PHOTO_DIR, "photos.json");
  let index = { photos: [] };
  try { index = JSON.parse(fs.readFileSync(indexFile, "utf8")); } catch {}
  const date = localDate();
  // Same dish twice (a retake): a new name, never over the earlier one.
  let slug = slugOf(title);
  for (let n = 2; fs.existsSync(path.join(PHOTO_DIR, `${date}-${slug}.jpg`)); n++) slug = `${slugOf(title)}-${n}`;
  fs.writeFileSync(path.join(PHOTO_DIR, `${date}-${slug}.jpg`), photo);
  fs.writeFileSync(path.join(PHOTO_DIR, `${date}-${slug}-post.jpg`), post);
  index.photos.push({
    file: `/assets/photos/${slug}.jpg`,
    item: meta.special ? null : String(meta.item || "") || null,
    special: !!meta.special,
    ...(meta.special && meta.includesDrink ? { includesDrink: true } : {}),
    variant: null,
    title,
    description: String(meta.description || "").replace(/\s+/g, " ").trim().slice(0, 200),
    alt: "", // written when it moves to the website: describe the picture
    date,
    saved: `${date}-${slug}.jpg`,
    post: `${date}-${slug}-post.jpg`,
  });
  fs.writeFileSync(indexFile, JSON.stringify(index, null, 2));
  console.log(`Photo post saved from the front page (${new Date().toLocaleTimeString()}): ${title} -> photos/${date}-${slug}.jpg`);
  return `${date}-${slug}.jpg`;
}

module.exports = { PHOTO_DIR, photoSetup, savePhotoPost };
