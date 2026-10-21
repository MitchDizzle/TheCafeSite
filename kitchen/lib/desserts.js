// Manage -> Desserts: for each item in cfg.dessertItems, its photo, its
// kinds and the options in its modifier lists (the cheesecake's sauce).
// Each kind is a variation of the item (Cheesecake: Plain, Pumpkin), so the
// iPad asks which and the ticket says it. The front can:
//   - set how many of a kind are left. Square then counts it down as it
//     sells, at the till and online, and online ordering shows it sold out
//     at 0. Blank stops counting it (always available).
//   - add a kind (at the item's price) or remove one that's gone for good.
//   - turn a list's option off or on. Off is Square's hidden_online: gone
//     from online ordering, kept in Square, one tap to bring back.
//   - add an option (no price: the sauces cost the same).
//   - replace the item's photo (what online ordering shows).
//   - make a new dessert at its own price, in the dessert category, set up
//     like the dessert already there that's on the most sales channels.
// Each save reads the item and list fresh and writes them back with
// Square's version, like Specials.
const { MOCK, cfg } = require("./config");
const { API, SQUARE_VERSION } = require("./square");
const { catalog, loadCatalog, readObject, writeObject, upsertObject, deleteObjects } = require("./catalog");
const { readCounts, setCounts } = require("./inventory");
const { mockImages } = require("./mock");

const plain = (msg) => Object.assign(new Error(msg), { plain: true });
const cleanName = (raw) => String(raw || "").replace(/\s+/g, " ").trim().slice(0, 60);
const byOrdinal = (key) => (a, b) => (a[key].ordinal ?? 0) - (b[key].ordinal ?? 0);
// cfg.dessertItems, then the rest of cfg.dessertCategory, by name.
function dessertNames() {
  const cat = catalog.categories.find((c) => c.name.trim().toLowerCase() === String(cfg.dessertCategory || "").trim().toLowerCase());
  const names = [...cfg.dessertItems];
  for (const n of cat ? cat.items : []) if (!names.some((x) => x.trim().toLowerCase() === n.trim().toLowerCase())) names.push(n);
  return names;
}
const dessertIds = () => dessertNames().map((n) => catalog.itemIds.get(n.trim().toLowerCase())).filter(Boolean);

// Counted in stock: Square's own flag, or the location's override of it.
function tracked(v) {
  const d = v.item_variation_data;
  const o = (d.location_overrides || []).find((x) => x.track_inventory != null);
  return o ? !!o.track_inventory : !!d.track_inventory;
}
function setTracked(v, on) {
  const d = v.item_variation_data;
  d.track_inventory = on;
  for (const o of d.location_overrides || []) if (o.track_inventory != null) o.track_inventory = on;
}

async function dessertItems() {
  await loadCatalog();
  const out = [];
  for (const name of dessertNames()) {
    const id = catalog.itemIds.get(name.trim().toLowerCase());
    if (!id) { out.push({ name, missing: true }); continue; }
    const item = await readObject(id);
    if (item.item_data.is_archived) continue;
    let photo = null;
    const imageId = (item.item_data.image_ids || [])[0];
    if (MOCK) photo = mockImages.get(id) || null;
    else if (imageId) {
      try { photo = (await readObject(imageId)).image_data.url || null; } catch { photo = null; }
    }
    const variations = [...(item.item_data.variations || [])].sort(byOrdinal("item_variation_data"));
    const counts = await readCounts(variations.filter(tracked).map((v) => v.id));
    const kinds = variations.map((v) => ({ id: v.id, name: v.item_variation_data.name, count: tracked(v) ? counts.get(v.id) : null }));
    const price = variations.map((v) => (v.item_variation_data.price_money || {}).amount).find((a) => a != null);
    const lists = [];
    for (const info of item.item_data.modifier_list_info || []) {
      if (info.enabled === false) continue;
      const list = await readObject(info.modifier_list_id);
      const d = list.modifier_list_data;
      lists.push({
        id: list.id,
        name: d.name,
        options: [...(d.modifiers || [])]
          .sort(byOrdinal("modifier_data"))
          .map((m) => ({ id: m.id, name: m.modifier_data.name, off: !!m.modifier_data.hidden_online })),
      });
    }
    out.push({ id, name: item.item_data.name, photo, price: price == null ? null : price / 100, kinds, lists });
  }
  return out;
}

// The lists the dessert items use: the only lists this may write.
async function dessertListIds() {
  const ids = new Set();
  for (const id of dessertIds()) {
    for (const info of (await readObject(id)).item_data.modifier_list_info || []) ids.add(info.modifier_list_id);
  }
  return ids;
}

// A count from the page: a whole number 0-999, or null (not counted).
function countOf(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 999) throw plain("A count is a whole number from 0 to 999, or blank.");
  return n;
}

// kinds: [{ item, counts: [{ id, count }], remove: [id], add: [{ name, count }] }]
// Only what was changed on the page comes in, so a count Square has
// lowered since the page opened (a sale) is never put back up.
async function saveKinds(changes) {
  const allowed = new Set(dessertIds());
  const done = [];
  for (const ch of changes || []) {
    if (!allowed.has(ch.item)) throw plain("That isn't a dessert item.");
    let item = await readObject(ch.item);
    const name = item.item_data.name;
    const has = (id) => (item.item_data.variations || []).some((v) => v.id === id);
    const remove = (ch.remove || []).map(String).filter(has);
    const counts = (ch.counts || []).map((c) => ({ id: String(c.id), count: countOf(c.count) })).filter((c) => !remove.includes(c.id));
    const adds = (ch.add || []).map((a) => ({ name: cleanName(a.name), count: countOf(a.count) })).filter((a) => a.name);
    for (const c of counts) if (!has(c.id)) throw plain(`${name} changed in Square; open Desserts again.`);
    if ((item.item_data.variations || []).length - remove.length + adds.length < 1) throw plain(`${name} needs at least one kind: add the new one before removing the last.`);
    const said = [];
    if (remove.length) {
      await deleteObjects(remove);
      item = await readObject(ch.item);
      said.push(`removed ${remove.length}`);
    }
    // Counting on or off, and the new kinds, are changes to the item.
    const vars = (item.item_data.variations ||= []);
    let changed = false;
    for (const c of counts) {
      const v = vars.find((x) => x.id === c.id);
      if (tracked(v) !== (c.count !== null)) { setTracked(v, c.count !== null); changed = true; }
    }
    const names = new Set(vars.map((v) => v.item_variation_data.name.trim().toLowerCase()));
    const fresh = [];
    for (const a of adds) if (!names.has(a.name.toLowerCase())) { names.add(a.name.toLowerCase()); fresh.push(a); }
    const model = vars[0];
    let next = Math.max(-1, ...vars.map((v) => v.item_variation_data.ordinal ?? 0)) + 1;
    for (const a of fresh) {
      const md = model.item_variation_data;
      vars.push({
        type: "ITEM_VARIATION", id: `#new-${next}`,
        present_at_all_locations: model.present_at_all_locations, present_at_location_ids: model.present_at_location_ids,
        item_variation_data: { item_id: item.id, name: a.name, ordinal: next++, pricing_type: md.pricing_type || "FIXED_PRICING",
          ...(md.price_money ? { price_money: md.price_money } : {}), track_inventory: a.count !== null },
      });
      changed = true;
    }
    if (changed) item = await upsertObject(item);
    // Then the counts, now that every kind has its real id.
    const stock = counts.filter((c) => c.count !== null);
    for (const a of fresh) {
      const v = item.item_data.variations.find((x) => x.item_variation_data.name.trim().toLowerCase() === a.name.toLowerCase());
      if (v && a.count !== null) stock.push({ id: v.id, count: a.count });
    }
    await setCounts(stock);
    if (fresh.length) said.push(`added ${fresh.map((a) => a.name).join(", ")}`);
    if (said.length || stock.length || changed) done.push(said.length ? `${name} (${said.join("; ")})` : name);
  }
  return done;
}

// lists: [{ id: listId, options: [{ id, off }], add: ["Strawberry"] }]
async function saveLists(changes) {
  const allowed = await dessertListIds();
  const done = [];
  for (const ch of changes || []) {
    if (!allowed.has(ch.id)) throw plain("That list isn't on a dessert item.");
    const list = await readObject(ch.id);
    const d = list.modifier_list_data;
    const mods = (d.modifiers ||= []);
    let changed = false;
    for (const oc of ch.options || []) {
      const m = mods.find((x) => x.id === oc.id);
      if (!m) throw plain(`${d.name} changed in Square; open Desserts again.`);
      if (!!m.modifier_data.hidden_online !== !!oc.off) { m.modifier_data.hidden_online = !!oc.off; changed = true; }
    }
    const names = new Set(mods.map((m) => m.modifier_data.name.trim().toLowerCase()));
    let next = Math.max(-1, ...mods.map((m) => m.modifier_data.ordinal ?? 0)) + 1;
    for (const raw of ch.add || []) {
      const name = cleanName(raw);
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
  return done;
}

async function saveDesserts({ kinds, lists } = {}) {
  await loadCatalog();
  const done = [...(await saveKinds(kinds)), ...(await saveLists(lists))];
  if (done.length) console.log(`Desserts changed from the front page (${new Date().toLocaleTimeString()}): ${done.join(", ")}.`);
  return done;
}

// A new dessert: its own item in Square at its own price, one kind
// ("Regular", which the ticket leaves off), counted if a count is given.
// It copies the categories (so it's on the same iPad screens), tax, sales
// channels and online settings of the dessert on the most channels.
async function newDessert({ name, price, count } = {}) {
  await loadCatalog();
  const clean = cleanName(name);
  if (!clean) throw plain("Give the new dessert a name.");
  if (catalog.itemIds.has(clean.toLowerCase())) throw plain(`There's already an item called ${clean} in Square.`);
  const cents = Math.round(Number(String(price).replace(/^\$/, "")) * 100);
  if (!Number.isFinite(cents) || cents < 1 || cents > 9999) throw plain("Give it a price, like 3.00.");
  const left = countOf(count);
  const models = [];
  for (const id of dessertIds()) {
    const o = await readObject(id);
    if (!o.item_data.is_archived) models.push(o);
  }
  if (!models.length) throw plain("There's no dessert in Square to set a new one up like.");
  const model = models.sort((a, b) => (b.item_data.channels || []).length - (a.item_data.channels || []).length)[0];
  const md = model.item_data;
  const where = { present_at_all_locations: model.present_at_all_locations, present_at_location_ids: model.present_at_location_ids };
  const keep = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
  const item = await upsertObject({
    type: "ITEM", id: "#dessert", ...where,
    item_data: {
      ...keep(md, ["product_type", "is_taxable", "tax_ids", "channels", "ecom_visibility", "use_location_fulfillment_methods"]),
      name: clean,
      categories: (md.categories || []).map((c) => ({ id: c.id })),
      ...(md.reporting_category ? { reporting_category: { id: md.reporting_category.id } } : {}),
      skip_modifier_screen: true,
      variations: [{
        type: "ITEM_VARIATION", id: "#dessert-regular", ...where,
        item_variation_data: { item_id: "#dessert", name: "Regular", ordinal: 0, pricing_type: "FIXED_PRICING",
          price_money: { amount: cents, currency: "USD" }, track_inventory: left !== null },
      }],
    },
  });
  if (left !== null) await setCounts([{ id: item.item_data.variations[0].id, count: left }]);
  await loadCatalog();
  console.log(`New dessert from the front page (${new Date().toLocaleTimeString()}): ${clean}, $${(cents / 100).toFixed(2)}.`);
  return clean;
}

// A new photo for a dessert item, as the online menu's picture. The phone
// has already shrunk it and re-drawn it, which also drops its GPS data.
async function saveDessertPhoto(itemId, dataUrl) {
  if (!dessertIds().includes(itemId)) throw plain("That item isn't on the Desserts list.");
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ""));
  if (!m) throw plain("That photo didn't come through. Try again.");
  const bytes = Buffer.from(m[1], "base64");
  if (bytes.length > 5 * 1024 * 1024) throw plain("That photo is too big.");
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

module.exports = { dessertItems, saveDesserts, saveDessertPhoto, newDessert };
