// Makes game/style-sheet.html from style-sheet.src.html:
//   <!--WORDMARK-->  the café's wordmark (src/assets/thecafe.svg), inline,
//                    because the mark has no fill of its own and an <img> of
//                    it renders black (CLAUDE.md, the inlineSvg filter)
//   <!--SPRITES-->   the game's own sprite sheet, made from game/art the same
//                    way the build makes it (game/build.js), so the sheet
//                    shows exactly what /play draws
//   node game/make-style-sheet.js
const fs = require('fs');
const path = require('path');
const { spriteSheet } = require('./build.js');

const root = path.join(__dirname, '..');
const svg = fs.readFileSync(path.join(root, 'src/assets/thecafe.svg'), 'utf8');
const viewBox = svg.match(/viewBox="([^"]+)"/)[1];
const d = svg.match(/<path[\s\S]*?\sd="([^"]+)"/)[1];
const mark = `<svg viewBox="${viewBox}" aria-hidden="true"><path d="${d}"/></svg>`;

const src = fs.readFileSync(path.join(__dirname, 'style-sheet.src.html'), 'utf8');
fs.writeFileSync(path.join(__dirname, 'style-sheet.html'), src.split('<!--WORDMARK-->').join(mark).split('<!--SPRITES-->').join(spriteSheet()));
console.log('game/style-sheet.html written');
