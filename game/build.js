// Puts Order Up together from its parts in game/ (owner 2026-11-15: the
// pieces apart, so the art can be redrawn and the code changed a part at a
// time). It writes the four files the site uses:
//
//   game/js/*.js       -> src/assets/js/play.js        (joined in file-name order)
//   game/css/*.css     -> src/assets/css/play.css      (joined in file-name order)
//   game/art/**/*.svg  -> src/_includes/partials/game/sprites.njk   (one <symbol> each)
//   game/art/scene/storefront.svg -> src/_includes/partials/game/storefront.njk
//
// Those four are made, not written: they are gitignored and rewritten by
// every build. Eleventy runs this before each build and again when anything
// in game/js, game/css or game/art changes under `npm start`
// (.eleventy.js), so there is nothing to run by hand. To run it on its own:
//   node game/build.js
//
// The drawings are plain SVG files a drawing program can open (game/art/README.md
// says how to draw one). What the build does to each:
//   - the file's name is the sprite's name: art/cooking/egg.svg is s-egg
//     (the folders are only for finding things; names must be unique)
//   - drawing-program leftovers go (metadata, Inkscape and Sodipodi tags)
//   - every id inside gets the sprite's name in front, so two drawings
//     can't clash on the page
//   - a part with class="food", "food2", "blade" or "blade2" takes that
//     colour from the game's CSS (var(--food, the colour drawn)), so one
//     drawing serves raw, done and burnt; class="marks" is the grill marks,
//     shown only once a food is done
// The storefront is a whole scene, not a sprite: its ids are kept as drawn
// (they all start "sf-"), and the path marked data-wordmark gets the café's
// real wordmark from src/assets/thecafe.svg.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = { js: 'game/js', css: 'game/css', art: 'game/art', storefront: 'game/art/scene/storefront.svg' };
const OUT = {
  js: 'src/assets/js/play.js',
  css: 'src/assets/css/play.css',
  sprites: 'src/_includes/partials/game/sprites.njk',
  storefront: 'src/_includes/partials/game/storefront.njk',
};
// Colours a drawing can hand to the game's CSS (play.css sets them by state).
const PAINTS = ['food', 'food2', 'blade', 'blade2'];

const abs = (p) => path.join(ROOT, p);
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

function filesIn(dir, ext) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir).sort()) {
    const file = path.join(dir, name);
    if (fs.statSync(file).isDirectory()) out.push(...filesIn(file, ext));
    else if (name.endsWith(ext)) out.push(file);
  }
  return out;
}

// ---------- code and look: the parts, joined ----------
function joined(dir, ext, banner) {
  const parts = filesIn(abs(dir), ext);
  if (!parts.length) throw new Error(`[game] no ${ext} files in ${dir}`);
  return banner + parts.map((f) => fs.readFileSync(f, 'utf8')).join('');
}

// ---------- drawings ----------
function cleanSvg(text) {
  return text
    .replace(/^﻿/, '')
    .replace(/<\?xml[\s\S]*?\?>/g, '')
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<metadata[\s\S]*?<\/metadata>/g, '')
    .replace(/<sodipodi:namedview[\s\S]*?(\/>|<\/sodipodi:namedview>)/g, '')
    .replace(/\s(?:inkscape|sodipodi):[\w-]+="[^"]*"/g, '')
    .replace(/\sxmlns:[\w-]+="[^"]*"/g, '');
}

function rootOf(text, file) {
  const open = text.match(/<svg\b[^>]*>/);
  const close = text.lastIndexOf('</svg>');
  if (!open || close < 0) throw new Error(`[game] ${rel(file)} is not an SVG`);
  const tag = open[0];
  let viewBox = (tag.match(/\sviewBox="([^"]+)"/) || [])[1];
  if (!viewBox) {
    const w = parseFloat((tag.match(/\swidth="([\d.]+)/) || [])[1]);
    const h = parseFloat((tag.match(/\sheight="([\d.]+)/) || [])[1]);
    if (!w || !h) throw new Error(`[game] ${rel(file)} has no viewBox`);
    viewBox = `0 0 ${w} ${h}`;
  }
  const inner = text.slice(open.index + tag.length, close).replace(/^\s*\n/, '').replace(/\s+$/, '');
  return { viewBox, inner };
}

// class="food" and the rest: the part's colour (its fill, or its stroke
// when it has no fill) becomes var(--food, that colour); class="marks" makes
// its opacity hang on --marks.
function paint(inner) {
  return inner.replace(/<([\w:-]+)(\s[^>]*?)?(\/?)>/g, (all, tag, attrs, slash) => {
    if (!attrs || !/\sclass="/.test(attrs)) return all;
    const classes = attrs.match(/\sclass="([^"]*)"/)[1].split(/\s+/).filter(Boolean);
    const mine = classes.filter((c) => PAINTS.includes(c) || c === 'marks');
    if (!mine.length) return all;
    const rest = classes.filter((c) => !mine.includes(c));
    let a = attrs.replace(/\sclass="[^"]*"/, rest.length ? ` class="${rest.join(' ')}"` : '');
    for (const c of mine) {
      if (c === 'marks') {
        const op = (a.match(/\sopacity="([^"]*)"/) || [])[1];
        const v = !op || op === '1' ? 'var(--marks,1)' : `calc(var(--marks,1) * ${op})`;
        a = op != null ? a.replace(/\sopacity="[^"]*"/, ` opacity="${v}"`) : `${a} opacity="${v}"`;
        continue;
      }
      const fill = (a.match(/\sfill="([^"]*)"/) || [])[1];
      const styleFill = (a.match(/\sstyle="[^"]*\bfill:\s*([^;"]+)/) || [])[1];
      const stroke = (a.match(/\sstroke="([^"]*)"/) || [])[1];
      const styleStroke = (a.match(/\sstyle="[^"]*\bstroke:\s*([^;"]+)/) || [])[1];
      if (fill && fill !== 'none') a = a.replace(/\sfill="[^"]*"/, ` fill="var(--${c},${fill})"`);
      else if (styleFill && styleFill.trim() !== 'none') a = a.replace(/(\sstyle="[^"]*\bfill:\s*)([^;"]+)/, `$1var(--${c},${styleFill.trim()})`);
      else if (stroke && stroke !== 'none') a = a.replace(/\sstroke="[^"]*"/, ` stroke="var(--${c},${stroke})"`);
      else if (styleStroke) a = a.replace(/(\sstyle="[^"]*\bstroke:\s*)([^;"]+)/, `$1var(--${c},${styleStroke.trim()})`);
      else a += ` fill="var(--${c},#888)"`;
    }
    return `<${tag}${a}${slash}>`;
  });
}

// Every id in one drawing gets its sprite's name in front, and so does
// everything that points at one (url(#x), href="#x").
function ownIds(inner, name) {
  const ids = [...inner.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  if (!ids.length) return inner;
  const map = new Map(ids.map((id) => [id, `${name}-${id}`]));
  return inner
    .replace(/(\sid=")([^"]+)"/g, (a, pre, id) => `${pre}${map.get(id)}"`)
    .replace(/url\(#([^)]+)\)/g, (a, id) => (map.has(id) ? `url(#${map.get(id)})` : a))
    .replace(/((?:xlink:)?href=")#([^"]+)"/g, (a, pre, id) => (map.has(id) ? `${pre}#${map.get(id)}"` : a));
}

function spriteFiles() {
  return filesIn(abs(SRC.art), '.svg').filter((f) => path.resolve(f) !== path.resolve(abs(SRC.storefront)));
}

// The sprite sheet as plain SVG (the game page, the style sheet and the
// link picture all use it).
function spriteSheet() {
  const seen = new Map();
  const symbols = spriteFiles().map((file) => {
    const name = path.basename(file, '.svg');
    if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`[game] ${rel(file)}: a drawing's name is small letters, numbers and dashes`);
    if (seen.has(name)) throw new Error(`[game] two drawings are called ${name}: ${seen.get(name)} and ${rel(file)}`);
    seen.set(name, rel(file));
    const { viewBox, inner } = rootOf(cleanSvg(fs.readFileSync(file, 'utf8')), file);
    return `  <symbol id="s-${name}" viewBox="${viewBox}">\n${ownIds(paint(inner), name)}\n  </symbol>`;
  });
  return '<svg class="ou-sprites" width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">\n' +
    symbols.join('\n') + '\n</svg>\n';
}

function storefront() {
  const file = abs(SRC.storefront);
  let { inner } = rootOf(cleanSvg(fs.readFileSync(file, 'utf8')), file);
  const mark = fs.readFileSync(abs('src/assets/thecafe.svg'), 'utf8').match(/<path[\s\S]*?\sd="([^"]+)"/);
  inner = inner.replace(/(<path\b[^>]*?\sdata-wordmark="")([^>]*?)\sd="[^"]*"/, (a, pre, post) => `${pre}${post} d="${mark ? mark[1] : ''}"`)
    .replace(/\sdata-wordmark=""/, '');
  return inner.replace(/\n\s*\n/g, '\n') + '\n';
}

const made = (from) => `Made by game/build.js from ${from}. Don't edit it here: every build rewrites it.`;

function outputs() {
  return {
    [OUT.js]: joined(SRC.js, '.js', `/* ${made('game/js/')} */\n`),
    [OUT.css]: joined(SRC.css, '.css', `/* ${made('game/css/')} */\n`),
    [OUT.sprites]: `{# ${made('game/art/')} Order Up's drawings, one <symbol> each, used by <use href="#s-name">. #}\n` + spriteSheet(),
    [OUT.storefront]: `{# ${made('game/art/scene/storefront.svg')} #}\n` + storefront(),
  };
}

// Writes only what changed, so the dev server isn't set off for nothing.
function build({ log = false } = {}) {
  const changed = [];
  for (const [file, text] of Object.entries(outputs())) {
    const at = abs(file);
    if (fs.existsSync(at) && fs.readFileSync(at, 'utf8') === text) continue;
    fs.mkdirSync(path.dirname(at), { recursive: true });
    fs.writeFileSync(at, text);
    changed.push(file);
  }
  if (log) console.log(changed.length ? `[game] wrote ${changed.join(', ')}` : '[game] nothing changed');
  return changed;
}

// What each made file is made from, for the studio's dating
// (src/_lib/studio-archive.js): a piece that includes the storefront is as
// new as the storefront's drawing.
function sourcesOf(made) {
  const f = made.split(path.sep).join('/');
  if (f.endsWith(OUT.sprites)) return spriteFiles().map(rel);
  if (f.endsWith(OUT.storefront)) return [SRC.storefront];
  if (f.endsWith(OUT.js)) return filesIn(abs(SRC.js), '.js').map(rel);
  if (f.endsWith(OUT.css)) return filesIn(abs(SRC.css), '.css').map(rel);
  return null;
}

module.exports = { build, spriteSheet, sourcesOf, OUT, SRC };

if (require.main === module) build({ log: true });
