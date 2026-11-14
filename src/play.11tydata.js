// Order Up (/play): hands the game its data.
//
// `gameJson` is src/_data/game.json with the `_note` keys taken out and each
// photo given its small gallery copy (thumbs/), as one JSON string the page
// puts in a <script type="application/json"> for assets/js/play.js to read.
//
// `noindex` follows site.json's game.listed, so one switch lists the game or
// hides it. The game's results settings (site.json, game) ride along in the
// same JSON as `stats`.
//
// It also checks the game against the real menu: every recipe names the
// menu.json item it stands for (`menu`), and a name that is no longer on the
// menu is a warning in the build log, so the game can't keep serving
// something the café stopped selling. A warning, not an error: a game must
// never be what stops the site from deploying.
const fs = require("fs");
const path = require("path");

function thumbOf(url) {
  if (!url) return url;
  const thumb = url.replace(/\/([^/]+)$/, "/thumbs/$1");
  return fs.existsSync(path.join(__dirname, thumb.replace(/^\//, ""))) ? thumb : url;
}

function strip(value) {
  if (Array.isArray(value)) return value.map(strip);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) if (!k.startsWith("_")) out[k] = strip(v);
    return out;
  }
  return value;
}

module.exports = {
  eleventyComputed: {
    noindex: (data) => !(data.site && data.site.game && data.site.game.listed),
    gameJson: (data) => {
      const game = strip(data.game || {});
      const cfg = (data.site && data.site.game) || {};
      game.stats = { url: cfg.statsUrl || "", version: String(cfg.version || "1"), askContact: cfg.askContact !== false, listed: !!cfg.listed, home: (data.site && data.site.url) || "", playAt: cfg.playAt || "" };
      const onMenu = new Set();
      for (const c of (data.menu && data.menu.categories) || []) for (const i of c.items || []) onMenu.add(i.name);

      for (const r of game.recipes || []) {
        if (r.menu && onMenu.size && !onMenu.has(r.menu)) {
          console.warn(`[play] game.json recipe "${r.name}" stands for "${r.menu}", which is not in menu.json`);
        }
        for (const p of r.parts) if (!game.parts[p]) console.warn(`[play] game.json recipe "${r.name}" uses unknown part "${p}"`);
        if (r.photo) r.photo = thumbOf(r.photo);
      }
      if (game.rollRecipe && game.rollRecipe.photo) game.rollRecipe.photo = thumbOf(game.rollRecipe.photo);
      for (const s of game.specials || []) if (s.photo) s.photo = thumbOf(s.photo);
      for (const o of game.odds || []) {
        const sum = o.normal + o.rare + o.epic;
        if (sum !== 100) console.warn(`[play] game.json odds add up to ${sum}, not 100`);
      }
      // "</" can't appear inside a <script> block.
      return JSON.stringify(game).replace(/</g, "\\u003c");
    },
  },
};
