// Each side the plate comes with is a modifier list on cfg.sideItem (Lunch
// Special): Side 1, Side 2, Side 3. Each morning, with the specials, the board
// rewrites them from the plan, so the counter, online ordering and DoorDash
// all offer the same thing:
//   - a set side ("Corn"): its list has Corn, pre-picked, then the swap
//     sides. Left alone, the plate comes as planned; tapping a swap side
//     swaps that one side.
//   - a side written "Tossed Salad or Cooked Broccoli": both, nothing
//     picked, then the swap sides, so the customer or the counter picks
//     one (client 2026-10-29: no Chef's Choice; it was pre-picked first).
//   - choice of side (anySide): one list, Chef's Choice pre-picked, then the
//     swap sides.
// The swap sides are the day's own extra sides (the website's extraSides),
// then the website's swapSides (menu.json's Deli Salads), then a cup of the
// day's soup when the website sets soupSide (client 2026-10-13). Every
// option is $0, and each list is pick exactly one with the day's side
// picked already, so nobody has to tap anything for the plate to come as
// planned (an "or" side has none picked: that one is asked). It was
// optional (pick at most one) until 2026-10-13, which Square Online showed as checkboxes with the one allowed already ticked: nothing
// else could be picked. Required, it shows them as choices to switch between. A list the day doesn't need is switched off
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
const { plan, savePlan, RETRY_MINUTES, listsFor } = require("./plan");

const CHEFS_CHOICE = "Chef's Choice";
// The item's own word for its options in a list (Square's 2025-05-21, which
// the catalog calls use): the one picked already (on_by_default before), and
// any sold at the counter only that day (`hidden`, lower case: the website's
// counterOnly, client 2026-10-29), which online ordering leaves out while the
// till still has it.
function overridesFor(list, pickId, hidden = new Set()) {
  return (list.modifier_list_data.modifiers || [])
    .filter((m) => m.id === pickId || hidden.has(m.modifier_data.name.toLowerCase()))
    .map((m) => ({ modifier_id: m.id,
      ...(m.id === pickId ? { on_by_default_override: "YES" } : {}),
      ...(hidden.has(m.modifier_data.name.toLowerCase()) ? { hidden_online_override: "YES" } : {}) }));
}

// What's sold at the counter only on `date`, lower case.
const counterOnlyOn = (date) => new Set((plan.counterOnly[date] || []).map((w) => w.toLowerCase()));

function sideSlots(day) {
  if (!day) return [];
  if (day.anySide) return [{ pick: CHEFS_CHOICE, also: [] }];
  return (day.sides || []).map((s) => {
    const parts = String(s).split(/\s+or\s+/i).map(cleanText).filter(Boolean);
    return parts.length > 1 ? { pick: null, also: parts } : { pick: cleanText(s), also: [] };
  }).filter((slot) => slot.pick || slot.also.length);
}

// What any side can be swapped for on `date`: the day's extra sides, the
// deli salads, and "Soup of the Day" when there's a soup today (client
// 2026-10-13: just that, the kitchen knows which soup it is).
function swapsFor(date, day) {
  const soupItem = Object.keys((day && day.items) || {}).find((n) => /soup/i.test(n));
  const soup = plan.soupSide && soupItem && cleanText(day.items[soupItem].today);
  return [...(plan.extraSides[date] || []), ...plan.swapSides, ...(soup ? ["Soup of the Day"] : [])];
}

// One pick-one list's options, $0 each, in this order: made the first time
// it's needed (list null), written only when they changed. `pick`, the option
// picked already, is marked so on the option itself as well as on the item
// (overridesFor): Side 1 kept coming up with nothing picked on the till while
// the item said otherwise (client 2026-10-19), and Square has since deprecated
// the item's old on_by_default (see square.js). Returns Square's copy, with real ids.
async function writeOptions(list, name, key, words, where, selection = "SINGLE", pick = null) {
  const zero = { amount: 0, currency: "USD" };
  const optionsOf = (d) => JSON.stringify([d.selection_type, (d.modifiers || []).map((m) => [m.id, m.modifier_data.name, m.modifier_data.ordinal, m.modifier_data.price_money, !!m.modifier_data.on_by_default])]);
  const picked = (w) => !!pick && w.toLowerCase() === pick.toLowerCase();
  const wanted = [];
  for (const w of words) {
    if (w && !wanted.some((x) => x.toLowerCase() === w.toLowerCase())) wanted.push(w);
  }
  if (!list) list = { type: "MODIFIER_LIST", id: `#${key}`, ...where, modifier_list_data: { name, modifiers: [] } };
  const d = list.modifier_list_data;
  const before = optionsOf(d);
  const have = new Map((d.modifiers || []).map((m) => [String(m.modifier_data.name).trim().toLowerCase(), m]));
  const removed = (d.modifiers || [])
    .filter((m) => !wanted.some((w) => w.toLowerCase() === String(m.modifier_data.name).trim().toLowerCase()))
    .map((m) => m.id);
  d.selection_type = selection;
  d.modifiers = wanted.map((w, ordinal) => {
    const m = have.get(w.toLowerCase());
    if (m) {
      m.modifier_data = { ...m.modifier_data, name: w, ordinal, price_money: zero, on_by_default: picked(w) };
      return m;
    }
    return { type: "MODIFIER", id: `#${key}-${ordinal}`, ...where,
      modifier_data: { name: w, ordinal, price_money: zero, on_by_default: picked(w), ...(list.id.startsWith("#") ? {} : { modifier_list_id: list.id }) } };
  });
  if (optionsOf(d) === before) return list;
  list = await upsertObject(list);
  // An option left out of the list may still be kept by Square: delete
  // it outright, so yesterday's side doesn't stay on the till.
  const left = (list.modifier_list_data.modifiers || []).filter((m) => removed.includes(m.id)).map((m) => m.id);
  if (left.length && !MOCK) await square("POST", "/catalog/batch-delete", { object_ids: left });
  return list;
}

// slots: from sideSlots. swaps: the swap sides. hidden: counterOnlyOn.
// Returns words for the log.
async function saveSides(slots, swaps, hidden) {
  await loadCatalog();
  const itemId = catalog.itemIds.get(cfg.sideItem.trim().toLowerCase());
  if (!itemId) throw Object.assign(new Error(`${cfg.sideItem} isn't in Square.`), { plain: true });
  const lists = await modifierListsByName();
  const item = await readObject(itemId);
  const where = { present_at_all_locations: item.present_at_all_locations, present_at_location_ids: item.present_at_location_ids };
  const set = []; // per side list: { list, on, pickId }; list is null when there's none and none is needed
  for (const [i, name] of cfg.sideLists.entries()) {
    const slot = slots[i];
    let list = lists.get(name.trim().toLowerCase()) || null;
    if (!slot) { set.push({ list, on: false, pickId: null }); continue; }
    // A side typed on the front page in its own case ("tossed salad") takes
    // the swap list's spelling, so it doesn't rename that option.
    const canon = (w) => swaps.find((x) => x.toLowerCase() === w.toLowerCase()) || w;
    const pickWord = slot.pick && canon(slot.pick);
    list = await writeOptions(list, name, `side-${i + 1}`, [slot.pick, ...slot.also, ...swaps].filter(Boolean).map(canon), where, "SINGLE", pickWord);
    const pick = pickWord && (list.modifier_list_data.modifiers || []).find((m) => m.modifier_data.name.toLowerCase() === pickWord.toLowerCase());
    set.push({ list, on: true, pickId: pick ? pick.id : null });
  }
  // Then the item: each list on it, on or off, exactly one pick, with the
  // day's side pre-picked (none on an "or" side). Read fresh: saveDaily may
  // have just written it.
  const fresh = await readObject(itemId);
  const infos = (fresh.item_data.modifier_list_info ||= []);
  const before = JSON.stringify(infos);
  for (const { list, on, pickId } of set) {
    if (!list) continue;
    let info = infos.find((x) => x.modifier_list_id === list.id);
    if (!info) { info = { modifier_list_id: list.id }; infos.push(info); }
    info.enabled = on;
    info.min_selected_modifiers = on ? 1 : 0;
    info.max_selected_modifiers = 1;
    info.modifier_overrides = on ? overridesFor(list, pickId, hidden) : [];
  }
  // The side lists first, in order, then the item's other lists (Dressing),
  // so the dressing is asked after the sides (client 2026-10-13).
  const sideIds = set.filter((x) => x.list).map((x) => x.list.id);
  const rank = (info) => (sideIds.includes(info.modifier_list_id) ? sideIds.indexOf(info.modifier_list_id) : sideIds.length);
  infos.sort((a, b) => rank(a) - rank(b));
  infos.forEach((info, ordinal) => { info.ordinal = ordinal; });
  if (JSON.stringify(infos) !== before) await upsertObject(fresh);
  if (slots.length > cfg.sideLists.length) {
    console.log(`${slots.length} sides today but ${cfg.sideLists.length} side lists: ${slots.slice(cfg.sideLists.length).map((x) => x.pick || x.also.join(" or ")).join(", ")} can't be swapped.`);
  }
  return slots.slice(0, cfg.sideLists.length)
    .map((slot, i) => `${cfg.sideLists[i]}: ${slot.pick || "customer picks"}${slot.also.length ? ` (${slot.also.join(" or ")})` : ""}`);
}

// The Special Side (cfg.specialSideItem), the $2 side sold on its own, offers
// the sides the day's plate comes with, each "A or B" as both, in one pick-one
// list (cfg.specialSideList) so the ticket says which (client 2026-10-15).
// None on a choice-of-side day or a day without sides: the list is off then.
function specialSideOptions(day) {
  if (!day || day.anySide) return [];
  return sideSlots(day).flatMap((slot) => (slot.also.length ? slot.also : [slot.pick]));
}

// options: from specialSideOptions. One option is picked already, so the side
// is one tap; with more, it asks which. A side sold at the counter only
// (hidden) is left out online here too. Returns words for the log, or null
// when the item isn't in Square.
async function saveSpecialSide(options, hidden) {
  await loadCatalog();
  const itemId = catalog.itemIds.get(cfg.specialSideItem.trim().toLowerCase());
  if (!itemId) return null;
  const name = cfg.specialSideList;
  let list = (await modifierListsByName()).get(name.trim().toLowerCase()) || null;
  if (!list && !options.length) return null;
  const item = await readObject(itemId);
  if (options.length) {
    const where = { present_at_all_locations: item.present_at_all_locations, present_at_location_ids: item.present_at_location_ids };
    list = await writeOptions(list, name, "special-side", options, where, "SINGLE", options.length === 1 ? options[0] : null);
  }
  const fresh = await readObject(itemId);
  const infos = (fresh.item_data.modifier_list_info ||= []);
  const before = JSON.stringify(infos);
  let info = infos.find((x) => x.modifier_list_id === list.id);
  if (!info) {
    if (!options.length) return null;
    info = { modifier_list_id: list.id };
    infos.unshift(info);
  }
  const mods = list.modifier_list_data.modifiers || [];
  info.enabled = options.length > 0;
  info.min_selected_modifiers = options.length ? 1 : 0;
  info.max_selected_modifiers = 1;
  info.modifier_overrides = options.length ? overridesFor(list, mods.length === 1 ? mods[0].id : null, hidden) : [];
  infos.forEach((x, ordinal) => { x.ordinal = ordinal; });
  if (JSON.stringify(infos) !== before) await upsertObject(fresh);
  return options.length ? `${cfg.specialSideItem}: ${options.join(", ")}` : `${cfg.specialSideItem}: off`;
}

// What can be left off today's plate, as Square's options: "Bacon" is
// "No Bacon" (one already written "No ..." stays as it is).
function leaveOffOptions(date) {
  return (plan.leaveOff[date] || []).map((w) => (/^no\s/i.test(w) ? w : `No ${w}`));
}

// options: from leaveOffOptions. One list on cfg.sideItem (cfg.leaveOffList),
// pick any, optional, $0, after the side lists and the dressing; off on a day
// with nothing to leave off. Returns words for the log, or null when there's
// nothing to do.
async function saveLeaveOff(options) {
  const name = cfg.leaveOffList;
  let list = (await modifierListsByName()).get(name.trim().toLowerCase()) || null;
  if (!list && !options.length) return null;
  await loadCatalog();
  const itemId = catalog.itemIds.get(cfg.sideItem.trim().toLowerCase());
  if (!itemId) return null;
  const item = await readObject(itemId);
  if (options.length) {
    const where = { present_at_all_locations: item.present_at_all_locations, present_at_location_ids: item.present_at_location_ids };
    list = await writeOptions(list, name, "leave-off", options, where, "MULTIPLE");
  }
  const fresh = await readObject(itemId);
  const infos = (fresh.item_data.modifier_list_info ||= []);
  const before = JSON.stringify(infos);
  let info = infos.find((x) => x.modifier_list_id === list.id);
  if (!info) {
    if (!options.length) return null;
    info = { modifier_list_id: list.id };
    infos.push(info);
  }
  info.enabled = options.length > 0;
  info.min_selected_modifiers = 0;
  delete info.max_selected_modifiers;
  info.modifier_overrides = [];
  infos.forEach((x, ordinal) => { x.ordinal = ordinal; });
  if (JSON.stringify(infos) !== before) await upsertObject(fresh);
  return options.length ? `${name}: ${options.join(", ")}` : `${name}: off`;
}

// Square's own lists (Add, Toppings) on cfg.sideItem today, picked in
// Specials (client 2026-10-27: a sandwich special wants them, and online
// ordering only shows what's on the item). Each list stays as it was made in
// Square (its options, prices, how many can be picked); the board only
// switches it on or off on the item, after the sides. A list never picked in
// Specials (plan.listsUsed) and not a sandwich's (cfg.sandwichLists) is left
// alone. Returns words for the log, or null.
async function saveExtraLists(names) {
  const managed = [...new Set([...plan.listsUsed, ...cfg.sandwichLists, ...names])];
  if (!managed.length) return null;
  await loadCatalog();
  const itemId = catalog.itemIds.get(cfg.sideItem.trim().toLowerCase());
  if (!itemId) return null;
  const lists = await modifierListsByName();
  const want = new Set(names.map((n) => n.trim().toLowerCase()));
  const fresh = await readObject(itemId);
  const infos = (fresh.item_data.modifier_list_info ||= []);
  const before = JSON.stringify(infos);
  const missing = [];
  for (const name of managed) {
    const key = name.trim().toLowerCase();
    const list = lists.get(key);
    if (!list) { if (want.has(key)) missing.push(name); continue; }
    let info = infos.find((x) => x.modifier_list_id === list.id);
    if (!info) {
      if (!want.has(key)) continue;
      info = { modifier_list_id: list.id };
      infos.push(info);
    }
    info.enabled = want.has(key);
  }
  infos.forEach((x, ordinal) => { x.ordinal = ordinal; });
  if (JSON.stringify(infos) !== before) await upsertObject(fresh);
  if (missing.length) console.log(`Not in Square, so not on ${cfg.sideItem}: ${missing.join(", ")}.`);
  return `${names.length ? names.join(", ") : "no extra lists"} on ${cfg.sideItem}`;
}

// Put today's sides into Square, the way applySpecials does the names:
// once, retried after a failure, redone when the day's sides or the swap
// sides change. A board that has never set sides leaves Square alone on a
// day without any.
async function applySides(today, day) {
  if (!cfg.sideItem || !cfg.sideLists.length) return null;
  const slots = sideSlots(day);
  const swaps = swapsFor(today, day);
  const special = cfg.specialSideItem ? specialSideOptions(day) : [];
  const offs = cfg.leaveOffList ? leaveOffOptions(today) : [];
  const extra = listsFor(today, day).lists;
  const hidden = counterOnlyOn(today);
  // `v`: bumped when the way the lists are written changes, so today's are
  // rewritten after an update (2: required, 2026-10-13; 3: the Special Side
  // too, 2026-10-15; 4: Leave Off, 2026-10-18; 5: the pick marked on the
  // option too, 2026-10-19; 6: Square's own lists, 2026-10-27; 7: a
  // sandwich's lists on by themselves, off on any other day, 2026-10-28; 8:
  // an "or" side without Chef's Choice, 2026-10-29; 9: counter-only sides
  // hidden online, 2026-10-29).
  const sig = JSON.stringify({ v: 9, slots, swaps, special, offs, extra, hidden: [...hidden] });
  const last = plan.sidesApplied[today];
  if (last && last.sig === sig && (last.at || Date.now() - Date.parse(last.failedAt) < RETRY_MINUTES * 6e4)) return last;
  if (!slots.length && !offs.length && !extra.length && !Object.values(plan.sidesApplied).some((a) => a.at)) return null;
  try {
    const done = await saveSides(slots, swaps, hidden);
    const side = [cfg.specialSideItem ? await saveSpecialSide(special, hidden) : null,
      cfg.leaveOffList ? await saveLeaveOff(offs) : null, await saveExtraLists(extra)].filter(Boolean).join("; ");
    plan.sidesApplied[today] = { sig, at: new Date().toISOString() };
    console.log(done.length
      ? `Today's sides put on ${cfg.sideItem} in Square (${new Date().toLocaleTimeString()}): ${done.join("; ")}${side ? `; ${side}` : ""}${hidden.size ? `; not online: ${plan.counterOnly[today].join(", ")}` : ""}.`
      : `No sides today: ${cfg.sideItem}'s side lists are off${side ? `, ${side}` : ""} (${new Date().toLocaleTimeString()}).`);
  } catch (err) {
    if (!last || last.error !== err.message) console.error(`Today's sides: ${err.message}`);
    plan.sidesApplied[today] = { sig, failedAt: new Date().toISOString(), error: err.message };
  }
  savePlan();
  return plan.sidesApplied[today];
}

module.exports = { sideSlots, swapsFor, specialSideOptions, leaveOffOptions, counterOnlyOn, overridesFor, applySides };
