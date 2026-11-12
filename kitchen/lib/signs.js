// Manage -> Signs: the day's counter signs as letter pages to print (client
// 2026-11-11: made by hand on the website's /studio/ every morning until
// now). Three pages, each the same sheet as its /studio/ piece, in the same
// styles (the website's own sign.css, read from src/ beside this folder):
//   1. Today's special sides   (sign-todays-sides-bw): the plate's sides in
//      boxes, the sides to swap in under them. Black & white.
//   2. Today's special & soup  (sign-day-letter, one page, without the
//      desserts): the plate with its sides, the soup with Cup / Bowl.
//   3. Dessert fridge          (sign-desserts-bw): what's in, with prices.
// Nothing is typed here. The plate, sides and soup are the day's in Specials
// (the plan, which is what Square has); the desserts and prices are Square's,
// as Manage -> Desserts has them. Which desserts are on the fridge sign can
// be ticked, and the ticks are kept in data\signs.json.
const fs = require("fs");
const path = require("path");
const { DIR, DATA, MOCK, cfg } = require("./config");
const { localDate, cleanText } = require("./util");
const { plan, siteFieldFor, modsFor, extrasOn } = require("./specials/plan");

let caption;
try {
  caption = require(path.join(DIR, "..", "src", "_lib", "specials-caption.js"));
} catch {
  // A board copied without the website beside it: the same words, simply.
  caption = {
    specialSides: (d) => (d.anySide ? "Choice of side" : (d.sides || []).join(", ")),
    versionsOf: () => [], breadsOf: () => [], plateRest: () => "",
  };
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n) => `$${Number(n).toFixed(2)}`;

// ---- The dessert fridge's rows ----

const SIGNS_FILE = path.join(DATA, MOCK ? "signs-mock.json" : "signs.json");
// skipItems: whole desserts left off unless ticked (kept in another fridge,
//   or gone before a taped-up sign comes down: client 2026-10-29, 11-04).
// treats: desserts listed under Treats at the bottom (client 2026-11-06).
// names: a shorter name for the sign, by the kind's name in Square.
// show / hide: the kinds ticked on though Square counts 0, and ticked off
//   though Square has some. A tick that agrees with Square is in neither.
const FRIDGE_DEFAULTS = {
  skipItems: ["Cheesecake", "Cinnamon Roll", "Pecan Sticky Bun"],
  treats: ["Cookies", "Dessert Bar"],
  names: {
    "M&M Brown Butter Chocolate Chip (2)": "M&M Cookies (2)",
    "Triple Chocolate Chip (2)": "Triple Chocolate Cookies (2)",
  },
  show: [],
  hide: [],
};
function fridgeSettings() {
  let kept = {};
  try { kept = JSON.parse(fs.readFileSync(SIGNS_FILE, "utf8")); } catch {}
  const list = (v, d) => (Array.isArray(v) ? v.map(String) : d);
  return {
    skipItems: list(kept.skipItems, FRIDGE_DEFAULTS.skipItems),
    treats: list(kept.treats, FRIDGE_DEFAULTS.treats),
    names: kept.names && typeof kept.names === "object" ? kept.names : FRIDGE_DEFAULTS.names,
    show: list(kept.show, []),
    hide: list(kept.hide, []),
  };
}

// A kind's name on a sign, as scripts/desserts.js words it: "Regular" is the
// dessert itself, one word is a flavour of it ("Pumpkin" -> "Pumpkin
// Cheesecake"), more is a name of its own ("Magic Bar").
function label(item, kind) {
  const k = String(kind || "").trim();
  if (k.toLowerCase() === "regular") return item;
  return /\s/.test(k) ? k : `${k} ${item}`;
}

// Every kind Square has, dearest dessert first (the cookies go to the
// bottom; the same price keeps Square's order), each with whether it's on
// the sign. items: dessertItems()'s.
function fridgeRows(items, o = fridgeSettings()) {
  const has = (list, w) => list.some((x) => x.trim().toLowerCase() === w.trim().toLowerCase());
  const rows = [];
  const sorted = (items || []).filter((i) => !i.missing).map((i, n) => ({ i, n }))
    .sort((a, b) => (b.i.price || 0) - (a.i.price || 0) || a.n - b.n).map((x) => x.i);
  for (const item of sorted) {
    for (const k of item.kinds || []) {
      const key = label(item.name, k.name);
      const out = k.count === 0;
      const usual = !out && !has(o.skipItems, item.name);
      rows.push({
        key, name: o.names[key] || key, item: item.name, price: item.price, out, usual,
        on: has(o.show, key) ? true : has(o.hide, key) ? false : usual,
        treat: has(o.treats, item.name),
        // An item's options ("Cheesecake Sauce: Caramel or Chocolate"), for
        // under its last kind on the sign.
        lists: (item.lists || []).map((l) => ({ name: l.name, options: l.options.filter((x) => !x.off).map((x) => x.name) })).filter((l) => l.options.length),
      });
    }
  }
  // The options go under the last kind of the item that's on the sign.
  const lastOn = new Map();
  for (const r of rows) if (r.on) lastOn.set(r.item, r);
  for (const r of rows) if (lastOn.get(r.item) !== r) r.lists = [];
  return rows;
}

// on: the kinds ticked, by key; rows: fridgeRows() as it was shown. Only a
// tick that differs from the usual is kept, so tomorrow follows Square again
// for everything else.
function saveFridge(on, rows) {
  const ticked = new Set((Array.isArray(on) ? on : []).map(String));
  const o = fridgeSettings();
  o.show = rows.filter((r) => ticked.has(r.key) && !r.usual).map((r) => r.key);
  o.hide = rows.filter((r) => !ticked.has(r.key) && r.usual).map((r) => r.key);
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(SIGNS_FILE, JSON.stringify(o, null, 2));
}

// ---- The day ----

// The day as the signs read it, shaped like a day of the website's
// specials.json so the website's own words work on it (specials-caption.js).
// daily: dailyItems()'s, for the soup's Cup / Bowl prices and, for today
// with nothing planned, the names Square has now.
function signDay(date, daily = [], today = localDate()) {
  const day = plan.days[date] || null;
  const d = { date, special: "", soup: "", soupSizes: [] };
  const items = daily.length ? daily : cfg.dailyItems.map((n) => ({ key: n, variations: [] }));
  for (const it of items) {
    if (it.missing) continue;
    const field = siteFieldFor(it.key);
    if (field !== "special" && field !== "soup") continue;
    const planned = day && day.items && day.items[it.key];
    const name = cleanText(planned && planned.today) || (date === today ? cleanText(it.today) : "");
    if (!name || d[field]) continue;
    d[field] = name;
    if (field === "soup") {
      d.soupSizes = (it.variations || [])
        .map((v) => ({ size: v.size, price: ((planned && planned.prices) || {})[v.size] || v.price }))
        .filter((v) => v.size && v.price);
    }
  }
  if (day && day.anySide) d.anySide = true;
  else if (day && Array.isArray(day.sides) && day.sides.length) d.sides = day.sides.map(cleanText).filter(Boolean);
  d.extraSides = extrasOn(date);
  d.modifiers = modsFor(date, day).words;
  d.soupNote = (plan.siteSoupNotes || {})[date] || "";
  return d;
}

// ---- The pages ----

// Today's special sides: sign-todays-sides-bw.njk.
function sidesPage(d, { swapSides = [], soupSide = false } = {}) {
  const both = !!(d.sides && d.sides.length > 1);
  const versions = caption.versionsOf(d);
  const breads = caption.breadsOf(d);
  const ownBread = versions.length ? caption.plateRest(d) : "";
  let top;
  if (versions.length) {
    top = `<p class="ts-one">Pick <strong>one</strong>:</p>
      <div class="ts-picks">${versions.map((v, i) => `${i ? '<p class="ts-or">or</p>' : ""}<p class="p-display ts-pick">${esc(v)}</p>`).join("")}</div>
      ${breads.length
        ? `<p class="ts-more">${ownBread ? `On a ${esc(ownBread.toLowerCase())}, or any bread:` : "On any bread:"}</p><p class="ts-breads">${breads.map(esc).join(" · ")}</p>`
        : ownBread ? `<p class="ts-more">On a ${esc(ownBread.toLowerCase())}</p>` : ""}`;
  } else if (d.anySide || !d.sides) {
    top = `<p class="p-display ts-plate">${esc(d.special)}</p>`;
  } else {
    const picks = both ? d.sides : d.sides[0].split(/\s+or\s+/i);
    top = `<p class="p-display ts-plate">${esc(d.special)}</p>
      <p class="ts-one">comes with <strong>${both ? "both" : "one"}</strong> ${both ? "sides:" : "side. Pick from:"}</p>
      <div class="ts-picks">${picks.map((s, i) => `${i ? `<p class="ts-or">${both ? "and" : "or"}</p>` : ""}<p class="p-display ts-pick${s.length > 22 ? " ts-pick--long" : ""}">${esc(s)}</p>`).join("")}</div>
      ${both ? '<p class="ts-more">Like one better? Double up on it.</p><p class="ts-more">Each side is also sold separately.</p>' : ""}`;
  }
  const own = new Set((d.sides || []).map((s) => s.toLowerCase()));
  const swaps = [
    ...(d.extraSides || []).filter((c) => !own.has(c.toLowerCase())).map((c) => `<li>${esc(c)} <small class="ts-today">today only</small></li>`),
    ...swapSides.map((c) => `<li>${esc(c)}</li>`),
    ...(soupSide && d.soup ? ["<li>Cup of the day&rsquo;s soup</li>"] : []),
  ];
  const title = d.anySide ? "Comes with one side. Pick from:" : both ? "Or swap a side for any of these" : "Or any of our regular sides";
  return `<div class="canvas sign sign--bw ts${both ? " ts--both" : ""}${versions.length ? " ts--versions" : ""}" data-page="sides"><div class="fit">
    <div class="sign-heading"><h2 class="p-display sign-heading-title">Today&rsquo;s Special${versions.length ? "" : " Sides"}</h2></div>
    ${top}
    <div class="sign-spacer"></div>
    ${swaps.length ? `<section class="sw-choice ts-regular"><p class="p-display sw-choice-title">${title}</p><ul class="sw-choices">${swaps.join("")}</ul></section>` : ""}
  </div></div>`;
}

// Today's special & soup: sign-day-letter.njk's one page, without the
// desserts (client 2026-11-11: the fridge sign has them).
function dayPage(d, { includesDrink = false } = {}) {
  const sides = caption.specialSides(d, true);
  const sizes = d.soupSizes.map((s) => `${esc(s.size)} ${money(s.price)}`).join(" &middot; ");
  return `<div class="canvas sign dl dl--one dl--two" data-page="day"><div class="fit">
    <header class="dl-top">
      <p class="p-display dl-head ink-accent">Today&rsquo;s Special</p>
      <p class="dl-when ink-teal">${d.special && d.soup ? "Lunch special &amp; soup from 11am" : d.special ? "Lunch special from 11am" : "Soup from 11am"}</p>
    </header>
    ${d.special ? `<section class="dl1-block">
      <p class="p-display dl1-name${d.special.length > 24 ? " dl1-name--long" : ""} ink-teal">${esc(d.special)}</p>
      ${sides ? `<p class="dl1-detail">${esc(sides)}</p>` : ""}
      ${includesDrink ? '<p class="dl-drink dl1-drink ink-accent">Includes a drink</p>' : ""}
    </section>` : ""}
    ${d.soup ? `<section class="dl1-block${d.special ? " dl1-block--rule" : ""}">
      <p class="p-label dl-label dl1-label ink-accent">Soup of the Day</p>
      <p class="p-display dl1-name dl1-name--soup${d.soup.length > 20 ? " dl1-name--long" : ""} ink-teal">${esc(d.soup)}</p>
      ${sizes ? `<p class="dl1-detail">${sizes}</p>` : ""}
      ${d.soupNote ? `<p class="dl-note dl1-note">${esc(d.soupNote)}</p>` : ""}
    </section>` : ""}
  </div></div>`;
}

// The dessert fridge: sign-desserts-bw.njk.
function fridgePage(rows) {
  const row = (r) => `<li class="sign-row${r.name.length > 24 ? " fd-row--long" : ""}">
      <div class="sign-row-head"><span class="sign-row-name">${esc(r.name)}</span><span class="sign-row-fill" aria-hidden="true"></span><span class="sign-row-price">${r.price == null ? "" : money(r.price)}</span></div>
      ${r.lists.map((l) => `<p class="sign-row-sub">${esc(l.name)}: ${l.options.map(esc).join(" or ")}</p>`).join("")}</li>`;
  const on = rows.filter((r) => r.on);
  const treats = on.filter((r) => r.treat);
  return `<div class="canvas sign sign--bw fd" data-page="fridge"><div class="fit">
    <div class="sign-heading"><h2 class="p-display sign-heading-title">Desserts</h2></div>
    <ul class="sign-rows fd-rows">
      ${on.filter((r) => !r.treat).map(row).join("")}
      ${treats.length ? `<li class="fd-group"><h3 class="p-display fd-group-title">Treats</h3></li>${treats.map(row).join("")}` : ""}
    </ul>
  </div></div>`;
}

// The website's own styles for the signs, read where an update puts them.
function siteCss() {
  const css = path.join(DIR, "..", "src", "assets", "css");
  return ["tokens.css", path.join("studio", "piece.css"), path.join("studio", "sign.css")]
    .map((f) => fs.readFileSync(path.join(css, f), "utf8")).join("\n");
}

// The pages as one document: letter sheets, one sign each. On screen they
// shrink to the frame's width; in print each is exactly a page. The Manage
// screen hides a page it isn't printing with html.no-<page>, and turns the
// special & soup black & white with html.bw.
function renderHtml(pages) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>The Café — today's signs</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400;1,900&family=Lato:wght@300;400;700;900&display=swap" rel="stylesheet">
<style>
${siteCss()}
@page { size: 8.5in 11in; margin: 0; }
html, body { margin: 0; }
.canvas { width: 8.5in; height: 11in; break-after: page; }
.canvas:last-child { break-after: auto; }
/* Everything on a sheet, so a sheet with too much on it can shrink as one
   (the script below). It stands in for .sign's own column. */
.fit { flex: 1; min-height: 0; display: flex; flex-direction: column; }
html.no-sides [data-page="sides"], html.no-day [data-page="day"], html.no-fridge [data-page="fridge"] { display: none; }
/* Black & white for the colour sheet: .sign--bw's inks. */
html.bw .dl { --teal: #000; --teal-dark: #000; --accent: #000; --accent-dark: #000; --text-dark: #000; color: #000; }
/* The plate and the soup with the page to themselves: a size up. */
.dl--two .dl1-name { font-size: 1.05in; }
.dl--two .dl1-name--soup { font-size: 0.9in; }
.dl--two .dl1-name--long { font-size: 0.74in; }
.dl--two .dl1-detail { font-size: 0.48in; }
.dl--two .dl1-drink { font-size: 0.4in; }
.dl--two .dl1-label { font-size: 0.38in; }
.dl--two .dl1-note { font-size: 0.36in; }
@media screen {
  body { background: #E9E4DA; }
  .stack { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 12px 0; transform-origin: top center; }
}
@media print { .stack { zoom: 1 !important; } }
</style>
</head>
<body class="piece-body piece-body--paper">
<div class="stack">
${pages.join("\n")}
</div>
<script>
(function () {
  var stack = document.querySelector(".stack");
  // On screen, the sheets as wide as the frame.
  function size() { stack.style.zoom = Math.min(1, (document.documentElement.clientWidth - 16) / 816); }
  size();
  window.addEventListener("resize", size);
  // A sheet with more on it than fits (a long plate, a full fridge) shrinks
  // as one until it does, so nothing is cut off at the bottom.
  function fit() {
    document.querySelectorAll(".canvas").forEach(function (canvas) {
      var inner = canvas.querySelector(".fit");
      if (!inner || !canvas.offsetParent) return;
      inner.style.zoom = 1;
      var full = canvas.style.height;
      for (var z = 1; z >= 0.5; z -= 0.03) {
        inner.style.zoom = z;
        canvas.style.height = "auto";
        var h = canvas.getBoundingClientRect().height / (parseFloat(stack.style.zoom) || 1);
        canvas.style.height = full;
        if (h <= 1056.5) break;
      }
    });
  }
  window.fitSigns = fit;
  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(fit);
})();
</script>
</body>
</html>`;
}

// Everything Manage -> Signs shows for `date`: the pages, what couldn't be
// made and why, and the fridge's rows to tick.
async function buildSigns(date, fridgeOn) {
  const today = localDate();
  const notes = [];
  let daily = [];
  try { daily = await require("./specials/daily").dailyItems(); } catch (err) {
    notes.push(`Square couldn't be read (${err.message}), so the soup has no prices.`);
  }
  let rows = null;
  try {
    const items = await require("./desserts").dessertItems();
    rows = fridgeRows(items);
    if (fridgeOn) { saveFridge(fridgeOn, rows); rows = fridgeRows(items); }
  } catch (err) {
    notes.push(`The desserts couldn't be read from Square (${err.message}), so there's no fridge sign.`);
  }
  const d = signDay(date, daily, today);
  const pages = [];
  const has = { sides: false, day: false, fridge: false };
  const when = date === today ? "today" : "that day";
  if (!d.special && !d.soup) notes.push(`No special or soup is set for ${when}. Set it in Specials, then open Signs again.`);
  if (d.special && (d.sides || d.anySide)) { pages.push(sidesPage(d, { swapSides: plan.swapSides, soupSide: plan.soupSide })); has.sides = true; }
  else if (d.special) notes.push(`${d.special} has no sides in Specials, so there's no sides sign.`);
  if (d.special || d.soup) { pages.push(dayPage(d, { includesDrink: plan.includesDrink })); has.day = true; }
  if (rows && rows.some((r) => r.on)) { pages.push(fridgePage(rows)); has.fridge = true; }
  else if (rows) notes.push("No dessert is ticked, so there's no fridge sign.");
  // The days to pick from: today and the next two with something planned.
  const days = [today, ...Object.keys(plan.days).filter((x) => x > today).sort().slice(0, 2)];
  return {
    date, today, days, has, notes,
    special: d.special, soup: d.soup,
    fridge: (rows || []).map(({ key, name, price, out, on, treat }) => ({ key, name, price, out, on, treat })),
    html: pages.length ? renderHtml(pages) : "",
  };
}

module.exports = { buildSigns, signDay, sidesPage, dayPage, fridgePage, fridgeRows, saveFridge, fridgeSettings, renderHtml, label };
