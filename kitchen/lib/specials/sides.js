// Each side the plate comes with is a modifier list on cfg.sideItem (Lunch
// Special): Side 1, Side 2, Side 3. Each morning, with the specials, the board
// rewrites them from the plan, so the counter, online ordering and DoorDash
// all offer the same thing:
//   - a set side ("Corn"): its list has Corn, pre-picked, then the swap
//     sides. Left alone, the plate comes as planned; tapping a swap side
//     swaps that one side.
//   - a side written "Tossed Salad or Cooked Broccoli": Chef's Choice,
//     pre-picked, then both, then the swap sides.
//   - choice of side (anySide): one list, Chef's Choice pre-picked, then the
//     swap sides.
// The swap sides are the day's own extra sides (the website's extraSides),
// then the website's swapSides (menu.json's Deli Salads), then a cup of the
// day's soup when the website sets soupSide (client 2026-10-13). Every
// option is $0, and a list is never required: nobody has to tap anything for
// the plate to come as planned. A list the day doesn't need is switched off
// on the item, not deleted, and a list is only made the first time a day
// needs it. A side past the last list can't be swapped, and the log says so.
// Written "or", the same words become a choice on the website, the posts and
// the signs too ("with Tossed Salad or Cooked Broccoli"). The words on the front
// page, the website and the posts stay as the plan has them; this is only
// what Square offers.
const { MOCK, cfg } = require("../config");
const { cleanText } = require("../util");
const { square } = require("../square");
const { catalog, loadCatalog, readObject, modifierListsByName, upsertObject } = require("../catalog");
const { plan, savePlan, RETRY_MINUTES } = require("./plan");

const CHEFS_CHOICE = "Chef's Choice";

function sideSlots(day) {
  if (!day) return [];
  if (day.anySide) return [{ pick: CHEFS_CHOICE, also: [] }];
  return (day.sides || []).map((s) => {
    const parts = String(s).split(/\s+or\s+/i).map(cleanText).filter(Boolean);
    return parts.length > 1 ? { pick: CHEFS_CHOICE, also: parts } : { pick: cleanText(s), also: [] };
  }).filter((slot) => slot.pick);
}

// What any side can be swapped for on `date`: the day's extra sides, the
// deli salads, and "Soup of the Day" when there's a soup today (client
// 2026-10-13: just that, the kitchen knows which soup it is).
function swapsFor(date, day) {
  const soupItem = Object.keys((day && day.items) || {}).find((n) => /soup/i.test(n));
  const soup = plan.soupSide && soupItem && cleanText(day.items[soupItem].today);
  return [...(plan.extraSides[date] || []), ...plan.swapSides, ...(soup ? ["Soup of the Day"] : [])];
}

// slots: from sideSlots. swaps: the swap sides. Returns words for the log.
async function saveSides(slots, swaps) {
  await loadCatalog();
  const itemId = catalog.itemIds.get(cfg.sideItem.trim().toLowerCase());
  if (!itemId) throw Object.assign(new Error(`${cfg.sideItem} isn't in Square.`), { plain: true });
  const lists = await modifierListsByName();
  const item = await readObject(itemId);
  const where = { present_at_all_locations: item.present_at_all_locations, present_at_location_ids: item.present_at_location_ids };
  const zero = { amount: 0, currency: "USD" };
  const optionsOf = (d) => JSON.stringify([d.selection_type, (d.modifiers || []).map((m) => [m.id, m.modifier_data.name, m.modifier_data.ordinal, m.modifier_data.price_money])]);
  const set = []; // per side list: { list, pickId }; list is null when there's none and none is needed
  for (const [i, name] of cfg.sideLists.entries()) {
    const slot = slots[i];
    let list = lists.get(name.trim().toLowerCase()) || null;
    if (!slot) { set.push({ list, pickId: null }); continue; }
    // A side typed on the front page in its own case ("tossed salad") takes
    // the swap list's spelling, so it doesn't rename that option.
    const canon = (w) => swaps.find((x) => x.toLowerCase() === w.toLowerCase()) || w;
    const wanted = [];
    for (const w of [slot.pick, ...slot.also, ...swaps].map(canon)) {
      if (w && !wanted.some((x) => x.toLowerCase() === w.toLowerCase())) wanted.push(w);
    }
    if (!list) list = { type: "MODIFIER_LIST", id: `#side-${i + 1}`, ...where, modifier_list_data: { name, modifiers: [] } };
    const d = list.modifier_list_data;
    const before = optionsOf(d);
    const have = new Map((d.modifiers || []).map((m) => [String(m.modifier_data.name).trim().toLowerCase(), m]));
    const removed = (d.modifiers || [])
      .filter((m) => !wanted.some((w) => w.toLowerCase() === String(m.modifier_data.name).trim().toLowerCase()))
      .map((m) => m.id);
    d.selection_type = "SINGLE";
    d.modifiers = wanted.map((w, ordinal) => {
      const m = have.get(w.toLowerCase());
      if (m) {
        m.modifier_data = { ...m.modifier_data, name: w, ordinal, price_money: zero };
        return m;
      }
      return { type: "MODIFIER", id: `#side-${i + 1}-${ordinal}`, ...where,
        modifier_data: { name: w, ordinal, price_money: zero, ...(list.id.startsWith("#") ? {} : { modifier_list_id: list.id }) } };
    });
    if (optionsOf(d) !== before) {
      list = await upsertObject(list);
      // An option left out of the list may still be kept by Square: delete
      // it outright, so yesterday's side doesn't stay on the till.
      const left = (list.modifier_list_data.modifiers || []).filter((m) => removed.includes(m.id)).map((m) => m.id);
      if (left.length && !MOCK) await square("POST", "/catalog/batch-delete", { object_ids: left });
    }
    const pick = (list.modifier_list_data.modifiers || []).find((m) => m.modifier_data.name.toLowerCase() === slot.pick.toLowerCase());
    set.push({ list, pickId: pick ? pick.id : null });
  }
  // Then the item: each list on it, on or off, never required, one pick at
  // most, with the day's side pre-picked. Read fresh: saveDaily may have
  // just written it.
  const fresh = await readObject(itemId);
  const infos = (fresh.item_data.modifier_list_info ||= []);
  const before = JSON.stringify(infos);
  for (const { list, pickId } of set) {
    if (!list) continue;
    let info = infos.find((x) => x.modifier_list_id === list.id);
    if (!info) { info = { modifier_list_id: list.id }; infos.push(info); }
    info.enabled = !!pickId;
    info.min_selected_modifiers = 0;
    info.max_selected_modifiers = 1;
    info.modifier_overrides = pickId ? [{ modifier_id: pickId, on_by_default: true }] : [];
  }
  // The side lists first, in order, then the item's other lists (Dressing),
  // so the dressing is asked after the sides (client 2026-10-13).
  const sideIds = set.filter((x) => x.list).map((x) => x.list.id);
  const rank = (info) => (sideIds.includes(info.modifier_list_id) ? sideIds.indexOf(info.modifier_list_id) : sideIds.length);
  infos.sort((a, b) => rank(a) - rank(b));
  infos.forEach((info, ordinal) => { info.ordinal = ordinal; });
  if (JSON.stringify(infos) !== before) await upsertObject(fresh);
  if (slots.length > cfg.sideLists.length) {
    console.log(`${slots.length} sides today but ${cfg.sideLists.length} side lists: ${slots.slice(cfg.sideLists.length).map((x) => x.pick).join(", ")} can't be swapped.`);
  }
  return slots.slice(0, cfg.sideLists.length)
    .map((slot, i) => `${cfg.sideLists[i]}: ${slot.pick}${slot.also.length ? ` (${slot.also.join(" or ")})` : ""}`);
}

// Put today's sides into Square, the way applySpecials does the names:
// once, retried after a failure, redone when the day's sides or the swap
// sides change. A board that has never set sides leaves Square alone on a
// day without any.
async function applySides(today, day) {
  if (!cfg.sideItem || !cfg.sideLists.length) return null;
  const slots = sideSlots(day);
  const swaps = swapsFor(today, day);
  const sig = JSON.stringify({ slots, swaps });
  const last = plan.sidesApplied[today];
  if (last && last.sig === sig && (last.at || Date.now() - Date.parse(last.failedAt) < RETRY_MINUTES * 6e4)) return last;
  if (!slots.length && !Object.values(plan.sidesApplied).some((a) => a.at)) return null;
  try {
    const done = await saveSides(slots, swaps);
    plan.sidesApplied[today] = { sig, at: new Date().toISOString() };
    console.log(done.length
      ? `Today's sides put on ${cfg.sideItem} in Square (${new Date().toLocaleTimeString()}): ${done.join("; ")}.`
      : `No sides today: ${cfg.sideItem}'s side lists are off (${new Date().toLocaleTimeString()}).`);
  } catch (err) {
    if (!last || last.error !== err.message) console.error(`Today's sides: ${err.message}`);
    plan.sidesApplied[today] = { sig, failedAt: new Date().toISOString(), error: err.message };
  }
  savePlan();
  return plan.sidesApplied[today];
}

module.exports = { sideSlots, swapsFor, applySides };
