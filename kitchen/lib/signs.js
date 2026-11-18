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
// skipItems: whole desserts left off unless ticked (gone before a taped-up
//   sign comes down: client 2026-10-29, 11-04). Cheesecake was here too
//   until 2026-11-16, when the pumpkin one went in the fridge.
// treats: desserts listed under Treats at the bottom (client 2026-11-06).
// names: a shorter name for the sign, by the kind's name in Square.
// caution / cautionSub: the warning panel at the foot (Mitch 2026-11-16:
//   the fridge is at the front counter, not self serve). "" for none.
// show / hide: the kinds ticked on though Square counts 0, and ticked off
//   though Square has some, on `day`. A tick that agrees with Square is in
//   neither, and they last only the day they were made (Mitch 2026-11-16:
//   ticks kept for good outlived the desserts, so a dessert set to 0 in
//   Desserts stayed on the sign and a new one never came on). Each morning
//   the sign follows Square again.
const OLD_SKIP = ["Cheesecake", "Cinnamon Roll", "Pecan Sticky Bun"];
const FRIDGE_DEFAULTS = {
  skipItems: ["Cinnamon Roll", "Pecan Sticky Bun"],
  treats: ["Cookies", "Dessert Bar"],
  names: {
    "M&M Brown Butter Chocolate Chip (2)": "M&M Cookies (2)",
    "Triple Chocolate Chip (2)": "Triple Chocolate Cookies (2)",
  },
  caution: "Not self serve",
  cautionSub: "Please do not open. Ask at the counter.",
  show: [],
  hide: [],
};
// A file saved before 2026-11-16 wrote the defaults out as if chosen; those
// mean "the default", so a default changed here still reaches that PC.
function keptChoices() {
  let kept = {};
  try { kept = JSON.parse(fs.readFileSync(SIGNS_FILE, "utf8")); } catch {}
  if (Array.isArray(kept.skipItems) && kept.skipItems.join("|") === OLD_SKIP.join("|")) delete kept.skipItems;
  if (JSON.stringify(kept.treats) === JSON.stringify(FRIDGE_DEFAULTS.treats)) delete kept.treats;
  if (JSON.stringify(kept.names) === JSON.stringify(FRIDGE_DEFAULTS.names)) delete kept.names;
  return kept;
}
function fridgeSettings(today = localDate()) {
  const kept = keptChoices();
  const list = (v, d) => (Array.isArray(v) ? v.map(String) : d);
  const text = (v, d) => (typeof v === "string" ? v : d);
  const fresh = kept.day === today;
  return {
    skipItems: list(kept.skipItems, FRIDGE_DEFAULTS.skipItems),
    treats: list(kept.treats, FRIDGE_DEFAULTS.treats),
    names: kept.names && typeof kept.names === "object" ? kept.names : FRIDGE_DEFAULTS.names,
    caution: text(kept.caution, FRIDGE_DEFAULTS.caution),
    cautionSub: text(kept.cautionSub, FRIDGE_DEFAULTS.cautionSub),
    show: fresh ? list(kept.show, []) : [],
    hide: fresh ? list(kept.hide, []) : [],
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
  // A dessert taken off the POS isn't being sold: not on the sign either.
  const sorted = (items || []).filter((i) => !i.missing && i.pos !== false).map((i, n) => ({ i, n }))
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
// tick that differs from the usual is kept, and only for today. The other
// keys are written back only as the file chose them (keptChoices).
function saveFridge(on, rows, today = localDate()) {
  const ticked = new Set((Array.isArray(on) ? on : []).map(String));
  const o = keptChoices();
  o.day = today;
  o.show = rows.filter((r) => ticked.has(r.key) && !r.usual).map((r) => r.key);
  o.hide = rows.filter((r) => !ticked.has(r.key) && r.usual).map((r) => r.key);
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(SIGNS_FILE, JSON.stringify(o, null, 2));
}

// ---- The day ----

// The day as the signs read it, shaped like a day of the website's
// specials.json so the website's own words work on it (specials-caption.js).
// daily: dailyItems()'s, for the soup's Cup / Bowl prices, the plate's price
// when the plan has none (Square's, on its one size) and, for today
// with nothing planned, the names Square has now.
function signDay(date, daily = [], today = localDate()) {
  const day = plan.days[date] || null;
  const d = { date, special: "", soup: "", soupSizes: [], price: "" };
  const items = daily.length ? daily : cfg.dailyItems.map((n) => ({ key: n, variations: [] }));
  for (const it of items) {
    if (it.missing) continue;
    const field = siteFieldFor(it.key);
    if (field !== "special" && field !== "soup") continue;
    const planned = day && day.items && day.items[it.key];
    const name = cleanText(planned && planned.today) || (date === today ? cleanText(it.today) : "");
    if (!name || d[field]) continue;
    d[field] = name;
    if (field === "special") {
      const vars = (it.variations || []).filter((v) => v.price);
      d.price = ((planned && planned.prices) || {})[""] || (vars.length === 1 ? vars[0].price : "");
    }
    if (field === "soup") {
      d.soupSizes = (it.variations || [])
        .map((v) => ({ size: v.size, price: ((planned && planned.prices) || {})[v.size] || v.price }))
        .filter((v) => v.size && v.price);
    }
  }
  if (day && day.closed) d.closed = day.closed;
  if (day && day.message) d.message = day.message;
  if (day && day.anySide) { d.anySide = true; if (day.defaultSide) d.defaultSide = cleanText(day.defaultSide); }
  else if (day && Array.isArray(day.sides) && day.sides.length) d.sides = day.sides.map(cleanText).filter(Boolean);
  d.extraSides = extrasOn(date);
  d.modifiers = modsFor(date, day).words;
  d.soupNote = (plan.siteSoupNotes || {})[date] || "";
  return d;
}

// ---- The pages ----

// Today's special sides: sign-todays-sides-bw.njk. A choice of side with a
// default (Mitch 2026-11-17: Tossed Salad) boxes the default like a set
// side, and the swap box lists the rest. What's on it sits in the middle of
// the sheet under the heading, not split to top and bottom (Mitch
// 2026-11-17: too much white space), and a choice of side, with little on
// it, is set a size up (.ts--any). The plate's price goes under its name
// (Mitch 2026-11-17: $10 on the sign).
function sidesPage(d, { swapSides = [], soupSide = false } = {}) {
  const both = !!(d.sides && d.sides.length > 1);
  const def = d.anySide ? cleanText(d.defaultSide) : "";
  const plain = d.anySide && !def;
  const versions = caption.versionsOf(d);
  const breads = caption.breadsOf(d);
  const ownBread = versions.length ? caption.plateRest(d) : "";
  const price = d.price ? `<p class="ts-price">${money(d.price)}</p>` : "";
  let top;
  if (versions.length) {
    top = `<p class="ts-one">Pick <strong>one</strong>:</p>
      <div class="ts-picks">${versions.map((v, i) => `${i ? '<p class="ts-or">or</p>' : ""}<p class="p-display ts-pick">${esc(v)}</p>`).join("")}</div>
      ${breads.length
        ? `<p class="ts-more">${ownBread ? `On a ${esc(ownBread.toLowerCase())}, or any bread:` : "On any bread:"}</p><p class="ts-breads">${breads.map(esc).join(" · ")}</p>`
        : ownBread ? `<p class="ts-more">On a ${esc(ownBread.toLowerCase())}</p>` : ""}
      ${price}`;
  } else if (plain || (!d.sides && !def)) {
    top = `<p class="p-display ts-plate">${esc(d.special)}</p>${price}`;
  } else {
    const picks = def ? [def] : both ? d.sides : d.sides[0].split(/\s+or\s+/i);
    const intro = both ? "comes with <strong>both</strong> sides:" : picks.length > 1 ? "comes with <strong>one</strong> side. Pick from:" : "comes with";
    top = `<p class="p-display ts-plate">${esc(d.special)}</p>${price}
      <p class="ts-one">${intro}</p>
      <div class="ts-picks">${picks.map((s, i) => `${i ? `<p class="ts-or">${both ? "and" : "or"}</p>` : ""}<p class="p-display ts-pick${s.length > 22 ? " ts-pick--long" : ""}">${esc(s)}</p>`).join("")}</div>
      ${both ? '<p class="ts-more">Like one better? Double up on it.</p><p class="ts-more">Each side is also sold separately.</p>' : ""}`;
  }
  const own = new Set([...(d.sides || []), def].filter(Boolean).map((s) => s.toLowerCase()));
  const swaps = [
    ...(d.extraSides || []).filter((c) => !own.has(c.toLowerCase())).map((c) => `<li>${esc(c)} <small class="ts-today">today only</small></li>`),
    ...swapSides.filter((c) => !own.has(c.toLowerCase())).map((c) => `<li>${esc(c)}</li>`),
    ...(soupSide && d.soup ? ["<li>Cup of the day&rsquo;s soup</li>"] : []),
  ];
  const title = plain ? "Comes with one side. Pick from:" : def ? "Or swap it for any of these" : both ? "Or swap a side for any of these" : "Or any of our regular sides";
  return `<div class="canvas sign sign--bw ts${both ? " ts--both" : ""}${versions.length ? " ts--versions" : ""}${d.anySide ? " ts--any" : ""}" data-page="sides"><div class="fit">
    <div class="sign-heading"><h2 class="p-display sign-heading-title">Today&rsquo;s Special${versions.length ? "" : " Sides"}</h2></div>
    <div class="ts-fill"></div>
    ${top}
    <div class="sign-spacer"></div>
    ${swaps.length ? `<section class="sw-choice ts-regular"><p class="p-display sw-choice-title">${title}</p><ul class="sw-choices">${swaps.join("")}</ul></section>` : ""}
    <div class="ts-fill"></div>
  </div></div>`;
}

// Today's special & soup: sign-day-letter.njk's one page, without the
// desserts (client 2026-11-11: the fridge sign has them). The plate's price
// under its sides, as the soup's Cup / Bowl are under it (Mitch 2026-11-17).
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
      ${d.price ? `<p class="dl1-detail">${money(d.price)}</p>` : ""}
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

// ---- The week's specials, two to a page (sign-specials-half-bw.njk) ----

// The logo, black, as the website's black & white signs have it (the
// inlineSvg shortcode in .eleventy.js, simply).
function wordmark() {
  try {
    const svg = fs.readFileSync(path.join(DIR, "..", "src", "assets", "thecafe.svg"), "utf8")
      .replace(/<\?xml[\s\S]*?\?>/gi, "").replace(/<!DOCTYPE[\s\S]*?>/gi, "").replace(/<!--[\s\S]*?-->/g, "")
      .replace(/\sstyle="[^"]*"/gi, "").trim();
    return svg.replace(/<svg\b/, '<svg role="img" aria-label="The Café"');
  } catch { return '<p class="p-display">The Café</p>'; }
}

// The QR code to the menu (assets/qr-menu.svg: lvcafetogo.com/menu).
function menuQr() {
  try { return fs.readFileSync(path.join(DIR, "..", "src", "assets", "qr-menu.svg"), "utf8").trim(); } catch { return ""; }
}

// Monday to Sunday of a YYYY-MM-DD date's week.
function weekOf(date) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => new Date(d.getTime() + i * 864e5).toISOString().slice(0, 10));
}
const dayWords = (date, opts) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", ...opts });

// The week's days as the website's specials.json has them (signDay's shape):
// the days with something planned, closed or a message.
function weekDays(monday, daily) {
  return weekOf(monday).map((date) => {
    const d = signDay(date, daily, "");
    const it = (plan.days[date] && plan.days[date].items) || {};
    const plate = Object.entries(it).find(([name]) => siteFieldFor(name) === "special");
    const price = plate && plate[1].prices && plate[1].prices[""];
    if (price) d.price = Number(price);
    return d;
  }).filter((d) => d.special || d.soup || d.closed || d.message);
}

// The handout: the black & white specials sign at half size, twice on a
// letter page to cut in half (Mitch 2026-11-18: next week's, from Signs).
// The same markup as partials/studio/sign-specials.njk with half: true.
function weekPage(days, { price, includesDrink, soupSide, swapSides = [], soupSizes = [] } = {}) {
  if (!days.length) return "";
  // The usual price, at the head of the column; a day's own shows beside
  // it only when it's different (Mitch 2026-11-18: $10 was on every day,
  // as a board not yet told the website's usual price had none to compare).
  // Not known yet: the price most days have.
  if (!price) {
    const counts = {};
    for (const d of days) if (d.price) counts[d.price] = (counts[d.price] || 0) + 1;
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (top) price = Number(top[0]);
  }
  const first = dayWords(days[0].date, { month: "long", day: "numeric" });
  const last = dayWords(days[days.length - 1].date, { month: "long", day: "numeric" });
  const range = first.split(" ")[0] === last.split(" ")[0] ? `${first} – ${last.split(" ")[1]}` : `${first} – ${last}`;
  const dollars = (n) => money(n).replace(".00", "");
  const dayCell = (d) => `<p class="p-display sw-day ink-accent">${esc(dayWords(d.date, { weekday: "short" }))}<span class="p-body sw-date">${esc(dayWords(d.date, { month: "short", day: "numeric" }))}</span></p>`;
  const message = (d) => (d.message ? `<p class="sw-sides sw-message">${esc(d.message)}</p>` : "");
  const rows = days.map((d) => {
    if (d.closed) {
      const why = d.closed === true ? "Closed" : `Closed for ${d.closed}`;
      return `<li class="sw-row sw-row--closed">${dayCell(d)}<div><p class="p-display sw-special sw-closed ink-accent">${esc(why)}</p>${message(d)}</div></li>`;
    }
    const sides = caption.specialSides(d, true);
    return `<li class="sw-row">${dayCell(d)}
      <div><p class="p-display sw-special ink-teal">${esc(d.special || "")}${d.price && Number(d.price) !== Number(price) ? ` <span class="sw-day-price ink-accent">${dollars(d.price)}</span>` : ""}</p>
        ${sides ? `<p class="sw-sides">${esc(sides)}</p>` : ""}${message(d)}</div>
      <div class="sw-soup"><p class="sw-soup-name ink-teal">${d.soup ? esc(d.soup) : "&mdash;"}</p></div></li>`;
  }).join("");
  const priceLine = price ? `${dollars(price)}${includesDrink ? ", drink included" : ""}` : includesDrink ? "Drink included" : "";
  const qr = menuQr();
  const choices = [...swapSides.map(esc), ...(soupSide ? ["Cup of the day&rsquo;s soup"] : [])];
  const half = `<div class="sign sign--bw sign--half">
    <header class="sign-title-ink"><div class="wordmark wordmark--ink">${wordmark()}</div></header>
    <div class="sign-heading">
      <h2 class="p-display sign-heading-title ink-teal">${esc(range)}</h2>
      <p class="p-label sign-heading-sub ink-accent">This week&rsquo;s specials &middot; from 11am</p>
    </div>
    <div class="sw-grid">
      <div class="sw-cols"><span></span>
        <div><p class="p-label sw-col-label ink-teal">Lunch Special</p>${priceLine ? `<p class="sw-col-price ink-accent">${priceLine}</p>` : ""}</div>
        <div class="sw-col--soup"><p class="p-label sw-col-label ink-teal">Soup</p>${soupSizes.length ? `<p class="sw-col-price ink-teal">${soupSizes.map((s) => `${esc(s.size)} ${dollars(s.price)}`).join(" &middot; ")}</p>` : ""}</div>
      </div>
      <ul class="sw-days">${rows}</ul>
    </div>
    <div class="sign-spacer"></div>
    <div class="sw-foot">
    ${choices.length ? `<section class="sw-choice"><p class="p-display sw-choice-title ink-teal">Sides</p>
      <p class="sw-choice-note">${days.some((d) => d.anySide) ? "Pick one with &ldquo;choice of side,&rdquo; or swap one in for a side on any special" : "Swap one in for the sides on any special"}</p>
      <ul class="sw-choices">${choices.map((c) => `<li>${c}</li>`).join("")}</ul></section>` : ""}
    ${qr ? `<div class="sw-qr"><div class="qr" aria-hidden="true">${qr}</div><p class="p-label sw-qr-label ink-teal">Full menu</p></div>` : ""}
    </div>
  </div>`;
  return `<div class="canvas sign-halves" data-page="week">${half}<div class="sign-cut" aria-hidden="true"></div>${half}</div>`;
}

// The warning triangle, as layouts/quick-sign.njk draws it.
const TRIANGLE = '<svg class="dc-icon" viewBox="0 0 100 88" aria-hidden="true"><path d="M50 5 L95 83 H5 Z" fill="#fff" stroke="#000" stroke-width="8" stroke-linejoin="round"/><rect x="45" y="30" width="10" height="30" rx="4" fill="#000"/><circle cx="50" cy="71" r="6" fill="#000"/></svg>';

// The dessert fridge: sign-desserts-bw.njk, with its small caution panel.
function fridgePage(rows, o = fridgeSettings()) {
  const caution = o.caution ? `<section class="dc-caution dc-caution--small"><div class="dc-caution-inner">${TRIANGLE}<div class="dc-words">
      <p class="p-display dc-title">${esc(o.caution)}</p>${o.cautionSub ? `<p class="dc-sub">${esc(o.cautionSub)}</p>` : ""}</div>${TRIANGLE}</div></section>` : "";
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
    ${caution}
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
html.no-sides [data-page="sides"], html.no-day [data-page="day"], html.no-fridge [data-page="fridge"], html.no-week [data-page="week"] { display: none; }
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
// made and why, and the fridge's rows to tick. `want` is which pages to make
// ("sides", "day", "fridge"; all three when not given): only what those need
// is read from Square, so an empty list just answers which days there are
// (Mitch 2026-11-18: pick the signs before waiting for them).
// "week" is the week's specials, two to a page, for the week `week` says:
// "this" or "next" (Mitch 2026-11-18); it isn't made unless asked for.
const ALL_PAGES = ["sides", "day", "fridge"];
const PAGE_NAMES = [...ALL_PAGES, "week"];
async function buildSigns(date, fridgeOn, want = ALL_PAGES, week = "next") {
  const today = localDate();
  const notes = [];
  const wants = new Set((Array.isArray(want) ? want : ALL_PAGES).filter((p) => PAGE_NAMES.includes(p)));
  let daily = [];
  if (wants.has("sides") || wants.has("day") || wants.has("week")) {
    try { daily = await require("./specials/daily").dailyItems(); } catch (err) {
      notes.push(`Square couldn't be read (${err.message}), so the special and soup have no prices.`);
    }
  }
  let rows = null;
  if (wants.has("fridge")) {
    try {
      const items = await require("./desserts").dessertItems();
      rows = fridgeRows(items);
      if (fridgeOn) { saveFridge(fridgeOn, rows); rows = fridgeRows(items); }
    } catch (err) {
      notes.push(`The desserts couldn't be read from Square (${err.message}), so there's no fridge sign.`);
    }
  }
  const d = signDay(date, daily, today);
  const pages = [];
  const has = { sides: false, day: false, fridge: false, week: false };
  const when = date === today ? "today" : "that day";
  if ((wants.has("sides") || wants.has("day")) && d.closed) {
    notes.push(`${d.closed === true ? "Closed" : `Closed for ${d.closed}`} ${when}, so there's no special or soup sign.`);
    d.special = ""; d.soup = "";
  } else if ((wants.has("sides") || wants.has("day")) && !d.special && !d.soup) notes.push(`No special or soup is set for ${when}. Set it in Specials, then open Signs again.`);
  if (wants.has("sides")) {
    if (d.special && (d.sides || d.anySide)) { pages.push(sidesPage(d, { swapSides: plan.swapSides, soupSide: plan.soupSide })); has.sides = true; }
    else if (d.special) notes.push(`${d.special} has no sides in Specials, so there's no sides sign.`);
  }
  if (wants.has("day") && (d.special || d.soup)) { pages.push(dayPage(d, { includesDrink: plan.includesDrink })); has.day = true; }
  if (wants.has("week")) {
    const monday = weekOf(today)[0];
    const start = week === "this" ? monday : new Date(Date.parse(`${monday}T12:00:00Z`) + 7 * 864e5).toISOString().slice(0, 10);
    const days = weekDays(start, daily);
    const soupItem = daily.find((it) => !it.missing && siteFieldFor(it.key) === "soup");
    const soupSizes = soupItem ? (soupItem.variations || []).filter((v) => v.size && v.price).map((v) => ({ size: v.size, price: v.price })) : [];
    const page = weekPage(days, { price: plan.price, includesDrink: plan.includesDrink, soupSide: plan.soupSide, swapSides: plan.swapSides, soupSizes });
    if (page) { pages.push(page); has.week = true; }
    else notes.push(`Nothing is set for ${week === "this" ? "this" : "next"} week yet. Set it in Specials, then make the signs again.`);
  }
  if (rows && rows.some((r) => r.on)) { pages.push(fridgePage(rows)); has.fridge = true; }
  else if (rows) notes.push("No dessert is ticked, so there's no fridge sign.");
  // The days to pick from: today and the next two with something planned.
  const days = [today, ...Object.keys(plan.days).filter((x) => x > today).sort().slice(0, 2)];
  return {
    date, today, days, has, notes, made: [...wants], week,
    special: d.special, soup: d.soup,
    fridge: (rows || []).map(({ key, name, price, out, on, treat }) => ({ key, name, price, out, on, treat })),
    html: pages.length ? renderHtml(pages) : "",
  };
}

module.exports = { buildSigns, signDay, sidesPage, dayPage, weekPage, fridgePage, fridgeRows, saveFridge, fridgeSettings, renderHtml, label };
