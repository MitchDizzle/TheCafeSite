// Manage -> Desserts: for each item in cfg.dessertItems, its photo and the
// options in its modifier lists (cheesecake flavors). The front can:
//   - turn an option off or on. Off is Square's hidden_online: gone from
//     online ordering, kept in Square, one tap to bring back. Square lets
//     only the iPad itself mark an option sold out at the till.
//   - add an option (no price: the flavors cost the same).
//   - replace the item's photo (what online ordering shows).
// Each save reads the list fresh and writes it back with Square's version,
// like Specials.
const { MOCK, cfg } = require("./config");
const { API, SQUARE_VERSION } = require("./square");
const { catalog, loadCatalog, readObject, writeObject } = require("./catalog");
const { mockImages } = require("./mock");

async function dessertItems() {
  await loadCatalog();
  const out = [];
  for (const name of cfg.dessertItems) {
    const id = catalog.itemIds.get(name.trim().toLowerCase());
    if (!id) { out.push({ name, missing: true }); continue; }
    const item = await readObject(id);
    let photo = null;
    const imageId = (item.item_data.image_ids || [])[0];
    if (MOCK) photo = mockImages.get(id) || null;
    else if (imageId) {
      try { photo = (await readObject(imageId)).image_data.url || null; } catch { photo = null; }
    }
    const lists = [];
    for (const info of item.item_data.modifier_list_info || []) {
      if (info.enabled === false) continue;
      const list = await readObject(info.modifier_list_id);
      const d = list.modifier_list_data;
      lists.push({
        id: list.id,
        name: d.name,
        options: [...(d.modifiers || [])]
          .sort((a, b) => (a.modifier_data.ordinal ?? 0) - (b.modifier_data.ordinal ?? 0))
          .map((m) => ({ id: m.id, name: m.modifier_data.name, off: !!m.modifier_data.hidden_online })),
      });
    }
    out.push({ id, name: item.item_data.name, photo, lists });
  }
  return out;
}

// The lists the dessert items use: the only lists this may write.
async function dessertListIds() {
  const ids = new Set();
  for (const name of cfg.dessertItems) {
    const id = catalog.itemIds.get(name.trim().toLowerCase());
    if (!id) continue;
    for (const info of (await readObject(id)).item_data.modifier_list_info || []) ids.add(info.modifier_list_id);
  }
  return ids;
}

// changes: [{ id: listId, options: [{ id, off }], add: ["Turtle"] }]
async function saveDesserts(changes) {
  const allowed = await dessertListIds();
  const done = [];
  for (const ch of changes || []) {
    if (!allowed.has(ch.id)) throw Object.assign(new Error("That list isn't on a dessert item."), { plain: true });
    const list = await readObject(ch.id);
    const d = list.modifier_list_data;
    const mods = (d.modifiers ||= []);
    let changed = false;
    for (const oc of ch.options || []) {
      const m = mods.find((x) => x.id === oc.id);
      if (!m) throw Object.assign(new Error(`${d.name} changed in Square; open Desserts again.`), { plain: true });
      if (!!m.modifier_data.hidden_online !== !!oc.off) { m.modifier_data.hidden_online = !!oc.off; changed = true; }
    }
    const names = new Set(mods.map((m) => m.modifier_data.name.trim().toLowerCase()));
    let next = Math.max(-1, ...mods.map((m) => m.modifier_data.ordinal ?? 0)) + 1;
    for (const raw of ch.add || []) {
      const name = String(raw).replace(/\s+/g, " ").trim().slice(0, 60);
      if (!name || names.has(name.toLowerCase())) continue;
      names.add(name.toLowerCase());
      const where = { present_at_all_locations: list.present_at_all_locations, present_at_location_ids: list.present_at_location_ids };
      mods.push({ type: "MODIFIER", id: `#new-${next}`, ...where, modifier_data: { name, ordinal: next++, modifier_list_id: list.id } });
      changed = true;
    }
    if (changed) {
      await writeObject(list);
      done.push(d.name);
    }
  }
  if (done.length) console.log(`Desserts changed from the front page (${new Date().toLocaleTimeString()}): ${done.join(", ")}.`);
  return done;
}

// A new photo for a dessert item, as the online menu's picture. The phone
// has already shrunk it and re-drawn it, which also drops its GPS data.
async function saveDessertPhoto(itemId, dataUrl) {
  const allowed = cfg.dessertItems.map((n) => catalog.itemIds.get(n.trim().toLowerCase()));
  if (!allowed.includes(itemId)) throw Object.assign(new Error("That item isn't on the Desserts list."), { plain: true });
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ""));
  if (!m) throw Object.assign(new Error("That photo didn't come through. Try again."), { plain: true });
  const bytes = Buffer.from(m[1], "base64");
  if (bytes.length > 5 * 1024 * 1024) throw Object.assign(new Error("That photo is too big."), { plain: true });
  if (MOCK) { mockImages.set(itemId, dataUrl); return; }
  const item = await readObject(itemId);
  const form = new FormData();
  form.append("request", new Blob([JSON.stringify({
    idempotency_key: `kitchen-photo-${itemId}-${Date.now()}`,
    object_id: itemId,
    is_primary: true,
    image: { type: "IMAGE", id: "#photo", image_data: { name: `${item.item_data.name} ${new Date().toISOString().slice(0, 10)}` } },
  })], { type: "application/json" }), "request.json");
  form.append("image_file", new Blob([bytes], { type: "image/jpeg" }), "photo.jpg");
  const res = await fetch(`${API}/catalog/images`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.accessToken}`, "Square-Version": SQUARE_VERSION },
    body: form,
    signal: AbortSignal.timeout(30000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Square ${res.status}: ${(json.errors || []).map((e) => e.detail || e.code).join("; ") || res.statusText}`);
  console.log(`Dessert photo changed from the front page (${new Date().toLocaleTimeString()}): ${item.item_data.name}.`);
}

module.exports = { dessertItems, saveDesserts, saveDessertPhoto };
