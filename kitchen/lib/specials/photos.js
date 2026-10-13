// The picture online ordering and DoorDash show for Lunch Special and Soup of
// the Day: a photo of the day's dish, found by its name (client 2026-10-12).
// The photos are the plain ones, never the finished posts with words on:
//   - the website's, src/_data/photos.json in the repo beside the board
//     (Daily specials, `special: true`), files under src/;
//   - Photo post's, photos/photos.json on this PC (`saved`), for a dish
//     not moved to the website yet. One already on the website is the same
//     photo (the same `file`), so it counts once.
// A dish photographed more than once rotates: each day it's served shows the
// next (photoTurn). A dish with no photo yet, or a day with nothing planned,
// shows the item's placeholder (photoPlaceholders: "Today's Lunch Special"
// over a covered plate). A picture put on the item in the Dashboard is never
// removed; it sits behind ours. Each picture is uploaded to Square once and
// its image id kept (squareImages), by its contents, so a changed
// placeholder goes up again.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { DIR, MOCK, cfg } = require("../config");
const { API, SQUARE_VERSION } = require("../square");
const { catalog, loadCatalog, readItem, writeItem } = require("../catalog");
const { nextMockId } = require("../mock");
const { PHOTO_DIR } = require("../photo-post");
const { plan, savePlan, RETRY_MINUTES } = require("./plan");

const dishKey = (s) => String(s || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();

function dishPhotos() {
  const byFile = new Map();
  const read = (file) => { try { return JSON.parse(fs.readFileSync(file, "utf8")).photos || []; } catch { return []; } };
  for (const p of read(path.join(DIR, "..", "src", "_data", "photos.json"))) {
    const where = p.file && path.join(DIR, "..", "src", ...String(p.file).split("/").filter(Boolean));
    if (p.special && p.title && where && fs.existsSync(where)) byFile.set(p.file, { title: p.title, date: p.date || "", path: where });
  }
  for (const p of read(path.join(PHOTO_DIR, "photos.json"))) {
    const where = p.saved && path.join(PHOTO_DIR, p.saved);
    const key = p.file || p.saved;
    if (p.special && p.title && where && !byFile.has(key) && fs.existsSync(where)) byFile.set(key, { title: p.title, date: p.date || "", path: where });
  }
  return [...byFile.values()].sort((a, b) => a.date.localeCompare(b.date) || a.path.localeCompare(b.path));
}

// Today's photo for each daily item: { "<item name>": path | null }. Moves a
// dish's turn on the first time it's asked on a new day.
function dayPhotos(today, day) {
  const all = dishPhotos();
  const out = {};
  for (const name of cfg.dailyItems) {
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

module.exports = { applyPhotos };
