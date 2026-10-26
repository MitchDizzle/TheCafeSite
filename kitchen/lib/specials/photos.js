// The picture online ordering and DoorDash show for Lunch Special and Soup of
// the Day: a photo of the day's dish, found by its name (client 2026-10-12).
// The photos are the plain ones, never the finished posts with words on:
//   - the website's, src/_data/photos.json in the repo beside the board
//     (Daily specials, `special: true`), files under src/;
//   - Photo post's, photos/photos.json on this PC (`saved`), for a dish
//     not moved to the website yet. One already on the website is the same
//     photo (the same `file`), so it counts once.
// A dish photographed more than once rotates: each day it's served shows the
// next (photoTurn), unless Specials picked one for that day (photoPick: any
// photo kept, of that dish or not, or none at all). A dish with no photo yet, or a day with nothing planned,
// shows the item's placeholder (photoPlaceholders: "Soup of the Day" over a
// bowl), or none of ours: Lunch Special has none since 2026-10-23, as Square's
// picture goes to DoorDash too. A picture put on the item in the Dashboard is never
// removed; it sits behind ours. Each picture is uploaded to Square once and
// its image id kept (squareImages), by its contents, so a changed
// placeholder goes up again.
//
// The rest of the menu fills up the same way (client 2026-10-16): a photo
// Photo post saved for an item in Square (`item`, not a special) becomes that
// item's picture, the newest one when there are several, once per photo
// (itemPhotoApplied), so a picture changed in the Dashboard or in Desserts
// afterwards stays until the next photo of that dish. `itemPhotos: false`
// in config.json turns it off.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { DIR, MOCK, cfg } = require("../config");
const { API, SQUARE_VERSION } = require("../square");
const { catalog, loadCatalog, readItem, writeItem } = require("../catalog");
const { nextMockId } = require("../mock");
const { PHOTO_DIR } = require("../photo-post");
const { REPO } = require("../offsite");
const { plan, savePlan, RETRY_MINUTES } = require("./plan");

const dishKey = (s) => String(s || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();

// Every photo kept, from the website and from Photo post, as
// { id, from, title, item, special, date, path }, oldest first. `id` is the
// photo's website address (`file`), or for one Photo post kept without one its
// `saved` name, so a photo keeps its id when it moves to the website. `from`
// says where it is: "website" (src/), "pc" (Photo post's folder) or "github"
// (moved to the backup). One already on the
// website is the same photo (the same `file`), so it counts once. One moved
// off this PC (Saved photos -> Move all to GitHub, listed under `cleared`) is
// read from the backup's copy in data\offsite\photos.
function keptPhotos() {
  const byFile = new Map();
  const read = (file) => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return {}; } };
  for (const p of read(path.join(DIR, "..", "src", "_data", "photos.json")).photos || []) {
    const where = p.file && path.join(DIR, "..", "src", ...String(p.file).split("/").filter(Boolean));
    if (p.title && where && fs.existsSync(where)) byFile.set(p.file, { id: p.file, from: "website", title: p.title, item: p.item || null, special: !!p.special, date: p.date || "", path: where });
  }
  const mine = read(path.join(PHOTO_DIR, "photos.json"));
  for (const p of [...(mine.photos || []), ...(mine.cleared || [])]) {
    const key = p.file || p.saved;
    if (!p.title || !p.saved || byFile.has(key)) continue;
    const here = path.join(PHOTO_DIR, path.basename(p.saved));
    const where = [here, path.join(REPO, "photos", path.basename(p.saved))].find((f) => fs.existsSync(f));
    if (where) byFile.set(key, { id: key, from: where === here ? "pc" : "github", title: p.title, item: p.item || null, special: !!p.special, date: p.date || "", path: where });
  }
  return [...byFile.values()].sort((a, b) => a.date.localeCompare(b.date) || a.path.localeCompare(b.path));
}

const dishPhotos = () => keptPhotos().filter((p) => p.special);

// Every photo kept, newest first, for Saved photos and Specials' photo
// picker: no paths, only what the phone shows.
function allPhotos() {
  return keptPhotos().reverse().map(({ id, from, title, item, special, date }) => ({ id, from, title, item, special, date }));
}

// One kept photo's picture, by its id, for the phone's thumbnails: the
// website's small copy when there is one. Only ids in the list are ever read,
// never a path from the phone.
function photoFile(id) {
  const p = keptPhotos().find((x) => x.id === String(id || ""));
  if (!p) return null;
  const small = path.join(path.dirname(p.path), "thumbs", path.basename(p.path));
  const file = p.from === "website" && fs.existsSync(small) ? small : p.path;
  return { bytes: fs.readFileSync(file), type: /\.png$/i.test(file) ? "image/png" : "image/jpeg" };
}

// Today's photo for each daily item: { "<item name>": path | null }. A photo
// picked for the day in Specials comes first (a picked photo that has since
// been deleted falls back to the usual). Otherwise moves a dish's turn on the
// first time it's asked on a new day.
function dayPhotos(today, day) {
  const all = dishPhotos();
  const picks = (plan.photoPick && plan.photoPick[today]) || {};
  const out = {};
  for (const name of cfg.dailyItems) {
    if (picks[name] === "none") { out[name] = null; continue; }
    const picked = picks[name] && keptPhotos().find((p) => p.id === picks[name]);
    if (picked) { out[name] = picked.path; continue; }
    const what = day && day.items[name] && dishKey(day.items[name].today);
    const mine = what ? all.filter((p) => dishKey(p.title) === what) : [];
    if (!mine.length) { out[name] = placeholderFor(name); continue; }
    const turn = plan.photoTurn[what];
    if (!turn) plan.photoTurn[what] = { date: today, n: 0 };
    else if (turn.date !== today) plan.photoTurn[what] = { date: today, n: turn.n + 1 };
    out[name] = mine[plan.photoTurn[what].n % mine.length].path;
  }
  return out;
}

function placeholderFor(name) {
  const rel = cfg.photoPlaceholders && cfg.photoPlaceholders[name];
  const file = rel && path.join(DIR, rel);
  return file && fs.existsSync(file) ? file : null;
}

async function uploadImage(file, title) {
  const bytes = fs.readFileSync(file);
  const key = `${file}#${crypto.createHash("sha1").update(bytes).digest("hex").slice(0, 12)}`;
  if (plan.squareImages[key]) return plan.squareImages[key];
  if (MOCK) { plan.squareImages[key] = `MOCK-IMAGE-${nextMockId()}`; return plan.squareImages[key]; }
  const form = new FormData();
  form.append("request", new Blob([JSON.stringify({
    idempotency_key: `kitchen-image-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    image: { type: "IMAGE", id: "#photo", image_data: { name: title } },
  })], { type: "application/json" }), "request.json");
  form.append("image_file", new Blob([bytes], { type: /\.png$/i.test(file) ? "image/png" : "image/jpeg" }), path.basename(file));
  const res = await fetch(`${API}/catalog/images`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.accessToken}`, "Square-Version": SQUARE_VERSION },
    body: form,
    signal: AbortSignal.timeout(60000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Square ${res.status}: ${(json.errors || []).map((e) => e.detail || e.code).join("; ") || res.statusText}`);
  plan.squareImages[key] = json.image.id;
  savePlan();
  return json.image.id;
}

async function applyPhotos(today, day) {
  if (!cfg.dailyPhotos) return null;
  const want = dayPhotos(today, day);
  const sig = JSON.stringify(want);
  const last = plan.photoApplied[today];
  if (last && last.sig === sig && (last.at || Date.now() - Date.parse(last.failedAt) < RETRY_MINUTES * 6e4)) return last;
  // Nothing to show and never shown one: nothing to take off either.
  if (!Object.values(want).some(Boolean) && !Object.keys(plan.squareImages).length) return null;
  try {
    await loadCatalog();
    const ours = new Set(Object.values(plan.squareImages));
    const done = [];
    for (const name of cfg.dailyItems) {
      const id = catalog.itemIds.get(name.trim().toLowerCase());
      if (!id) continue;
      const file = want[name];
      const imageId = file ? await uploadImage(file, `${name}: ${path.basename(file, path.extname(file))}`) : null;
      const item = await readItem(id);
      const d = item.item_data;
      const own = (d.image_ids || []).filter((x) => !ours.has(x) && x !== imageId);
      const ids = imageId ? [imageId, ...own] : own;
      if (JSON.stringify(ids) === JSON.stringify(d.image_ids || [])) continue;
      d.image_ids = ids;
      await writeItem(item);
      done.push(`${name}: ${file ? path.basename(file) : "no picture"}`);
    }
    plan.photoApplied[today] = { sig, at: new Date().toISOString() };
    if (done.length) console.log(`Photos put in Square (${new Date().toLocaleTimeString()}): ${done.join("; ")}.`);
  } catch (err) {
    if (!last || last.error !== err.message) console.error(`Today's photos: ${err.message}`);
    plan.photoApplied[today] = { sig, failedAt: new Date().toISOString(), error: err.message };
  }
  savePlan();
  return plan.photoApplied[today];
}

// Each menu item's newest photo: { "<item name, lower case>": { name, path } }.
// The daily items are left to applyPhotos.
function itemPhotos() {
  const daily = new Set(cfg.dailyItems.map((n) => n.trim().toLowerCase()));
  const out = {};
  for (const p of keptPhotos()) {
    const key = p.item && !p.special && p.item.trim().toLowerCase();
    if (key && !daily.has(key)) out[key] = { name: p.item.trim(), path: p.path };
  }
  return out;
}

let itemsRunning = null;
let itemsFailedAt = 0;
function applyItemPhotos() {
  if (!itemsRunning) itemsRunning = applyItemPhotosOnce().finally(() => { itemsRunning = null; });
  return itemsRunning;
}

async function applyItemPhotosOnce() {
  if (cfg.itemPhotos === false) return;
  if (Date.now() - itemsFailedAt < RETRY_MINUTES * 6e4) return;
  plan.itemPhotoApplied = plan.itemPhotoApplied || {};
  const want = Object.entries(itemPhotos()).filter(([key, p]) => plan.itemPhotoApplied[key] !== p.path);
  if (!want.length) return;
  const done = [];
  try {
    await loadCatalog();
    for (const [key, p] of want) {
      const id = catalog.itemIds.get(key);
      if (!id) { // not in Square (renamed or deleted): left, and tried again with its next photo
        console.log(`Menu photos: no item called "${p.name}" in Square, so ${path.basename(p.path)} isn't on it.`);
        plan.itemPhotoApplied[key] = p.path;
        savePlan();
        continue;
      }
      const imageId = await uploadImage(p.path, `${p.name}: ${path.basename(p.path, path.extname(p.path))}`);
      const item = await readItem(id);
      const d = item.item_data;
      const ids = [imageId, ...(d.image_ids || []).filter((x) => x !== imageId)];
      if (JSON.stringify(ids) !== JSON.stringify(d.image_ids || [])) {
        d.image_ids = ids;
        await writeItem(item);
        done.push(`${p.name}: ${path.basename(p.path)}`);
      }
      plan.itemPhotoApplied[key] = p.path;
      savePlan();
    }
  } catch (err) {
    itemsFailedAt = Date.now();
    console.error(`Menu photos: ${err.message}`);
  }
  if (done.length) console.log(`Menu photos put in Square (${new Date().toLocaleTimeString()}): ${done.join("; ")}.`);
}

module.exports = { applyPhotos, applyItemPhotos, allPhotos, photoFile, dayPhotos };
