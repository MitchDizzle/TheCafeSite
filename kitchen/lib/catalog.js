// Square's catalog: the item list (for the skip list's categories, Specials
// and Photo post), and reading and writing single objects for the few things
// the board changes in Square (Specials, Desserts, the day's sides, words and
// photos). In test mode every read and write goes to mock.js's stand-in.
const { MOCK } = require("./config");
const { square } = require("./square");
const { mockItems, mockCatalog, nextMockId } = require("./mock");

// Square's item list, for skipping whole categories: an order's line item
// names its variation, not its category, so the catalog says which
// categories each item is in. Read at startup, every CATALOG_MINUTES, and
// whenever the skip list is opened on /front, so a category made in Square
// today can be picked without a restart.
const CATALOG_MINUTES = 10;
// The same object for as long as the program runs: loadCatalog fills it in.
const catalog = { byVariation: new Map(), byName: new Map(), firstVariation: new Map(), itemIds: new Map(), categories: [], menuItems: [], loadedAt: null, error: null };

function buildCatalog(objects) {
  // Ordinary categories only. The Restaurants POS also keeps MENU categories
  // (the Breakfast and Lunch screens and their tabs), with some of the same
  // names; skipping "Breakfast" must not mean the whole breakfast screen.
  const catName = new Map(objects
    .filter((o) => o.type === "CATEGORY" && (o.category_data || {}).category_type !== "MENU_CATEGORY")
    .map((o) => [o.id, (o.category_data || {}).name || ""]));
  const byVariation = new Map();
  const byName = new Map();
  // item name (lower case) -> its first variation's name: what the POS rings
  // when nobody picks one (Beef on a burger, Chicken on the Cordon Bleu), so
  // the board can flag the other one.
  const firstVariation = new Map();
  const itemIds = new Map(); // item name (lower case) -> catalog id, for Specials
  const members = new Map(); // category name -> item names
  const menuItems = []; // for Photo post: what each item is called, says and costs in Square
  for (const o of objects) {
    if (o.type !== "ITEM" || o.is_deleted) continue;
    const d = o.item_data || {};
    const ids = new Set([...(d.categories || []).map((c) => c.id), d.category_id, d.reporting_category && d.reporting_category.id].filter(Boolean));
    const cats = [...ids].map((id) => catName.get(id)).filter(Boolean);
    const entry = { name: d.name || "", cats };
    const fixed = (d.variations || [])
      .map((v) => v.item_variation_data || {})
      .filter((v) => v.pricing_type !== "VARIABLE_PRICING" && v.price_money && v.price_money.amount != null)
      .map((v) => v.price_money.amount);
    menuItems.push({
      name: entry.name,
      category: cats[0] || "",
      description: String(d.description_plaintext || d.description || "").replace(/<[^>]+>/g, "").trim(),
      price: fixed.length ? Math.min(...fixed) / 100 : null,
      sizes: fixed.length > 1,
    });
    const first = [...(d.variations || [])]
      .sort((a, b) => ((a.item_variation_data || {}).ordinal ?? 0) - ((b.item_variation_data || {}).ordinal ?? 0))[0];
    entry.firstVariation = first ? (first.item_variation_data || {}).name || null : null;
    for (const v of d.variations || []) byVariation.set(v.id, entry);
    if (entry.firstVariation) firstVariation.set(entry.name.trim().toLowerCase(), entry.firstVariation);
    byName.set(entry.name.trim().toLowerCase(), cats);
    itemIds.set(entry.name.trim().toLowerCase(), o.id);
    for (const c of cats.length ? cats : ["(No category)"]) {
      if (!members.has(c)) members.set(c, new Set());
      members.get(c).add(entry.name);
    }
  }
  const categories = [...members]
    .map(([name, items]) => ({ name, items: [...items].sort((a, b) => a.localeCompare(b)) }))
    .sort((a, b) => (a.name === "(No category)") - (b.name === "(No category)") || a.name.localeCompare(b.name));
  menuItems.sort((a, b) => (a.category || "~").localeCompare(b.category || "~") || a.name.localeCompare(b.name));
  return { byVariation, byName, firstVariation, itemIds, categories, menuItems };
}

async function loadCatalog() {
  try {
    let objects = [];
    if (MOCK) objects = mockCatalog();
    else {
      let cursor;
      do {
        const q = `/catalog/list?types=ITEM,CATEGORY${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
        const json = await square("GET", q);
        objects = objects.concat(json.objects || []);
        cursor = json.cursor;
      } while (cursor);
    }
    Object.assign(catalog, buildCatalog(objects), { loadedAt: new Date().toISOString(), error: null });
  } catch (err) {
    // Keep the last good catalog; skipping by item name works without one.
    if (catalog.error !== err.message) console.error(`Square catalog: ${err.message}`);
    catalog.error = err.message;
  }
  return catalog;
}

// One item (or any object) as Square has it now, with its version.
async function readItem(id) {
  if (MOCK) return structuredClone(mockItems.get(id));
  return (await square("GET", `/catalog/object/${encodeURIComponent(id)}`)).object;
}

async function writeItem(object) {
  if (MOCK) {
    if (object.version !== mockItems.get(object.id).version) throw new Error("Square 409: version mismatch");
    mockItems.set(object.id, { ...object, version: object.version + 1 });
    return;
  }
  await square("POST", "/catalog/object", { idempotency_key: `kitchen-${object.id}-${Date.now()}`, object });
}

async function readObject(id) {
  if (MOCK) return structuredClone(mockItems.get(id));
  return (await square("GET", `/catalog/object/${encodeURIComponent(id)}`)).object;
}

async function writeObject(object) {
  if (MOCK) return writeItem(object);
  await square("POST", "/catalog/object", { idempotency_key: `kitchen-${object.id}-${Date.now()}`, object });
}

// Every modifier list in Square by its name (lower case), read fresh.
async function modifierListsByName() {
  let lists = [];
  if (MOCK) lists = [...mockItems.values()].filter((o) => o.type === "MODIFIER_LIST").map((o) => structuredClone(o));
  else {
    let cursor;
    do {
      const json = await square("GET", `/catalog/list?types=MODIFIER_LIST${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
      lists = lists.concat((json.objects || []).filter((o) => !o.is_deleted));
      cursor = json.cursor;
    } while (cursor);
  }
  return new Map(lists.map((l) => [String(l.modifier_list_data.name || "").trim().toLowerCase(), l]));
}

// Upsert one object and get Square's copy back, with real ids for the "#"
// ones (a new list, a new option).
async function upsertObject(object) {
  if (MOCK) {
    const copy = structuredClone(object);
    const real = (id) => (String(id).startsWith("#") ? `MOCK-${nextMockId()}` : id);
    if (String(copy.id).startsWith("#")) { copy.id = real(copy.id); copy.version = 0; }
    else if (copy.version !== mockItems.get(copy.id).version) throw new Error("Square 409: version mismatch");
    for (const m of (copy.modifier_list_data && copy.modifier_list_data.modifiers) || []) {
      m.id = real(m.id);
      m.modifier_data.modifier_list_id = copy.id;
    }
    for (const v of (copy.item_data && copy.item_data.variations) || []) {
      v.id = real(v.id);
      v.item_variation_data.item_id = copy.id;
    }
    copy.version += 1;
    mockItems.set(copy.id, copy);
    return structuredClone(copy);
  }
  const json = await square("POST", "/catalog/object", { idempotency_key: `kitchen-${String(object.id).replace(/\W/g, "")}-${Date.now()}`, object });
  return json.catalog_object;
}

// Delete objects inside an item or a list (a dessert's variation, a list's
// option). Square keeps past sales under their names.
async function deleteObjects(ids) {
  if (!ids.length) return;
  if (MOCK) {
    for (const o of mockItems.values()) {
      const d = o.item_data || o.modifier_list_data;
      const key = o.item_data ? "variations" : "modifiers";
      if (!d || !d[key]) continue;
      const kept = d[key].filter((x) => !ids.includes(x.id));
      if (kept.length !== d[key].length) { d[key] = kept; o.version += 1; }
    }
    return;
  }
  await square("POST", "/catalog/batch-delete", { object_ids: ids });
}

module.exports = { CATALOG_MINUTES, deleteObjects, catalog, loadCatalog, readItem, writeItem, readObject, writeObject, modifierListsByName, upsertObject };
