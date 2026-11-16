/* ============================================================
   Order Up — the game at /play.

   A short-order cook's week at The Café: tickets on the rail, food on the
   flat-top, a plate, Send. One week is a run, one day is a shift, and after
   close you pick up gear and tricks for the rest of the week. Three levels
   (Easy, Regular, Rush) set how much is asked: whether food needs flipping
   and how (a tap or a swipe), how long tickets wait, whether family drops by.

   No libraries, no images, no server. The page (src/play.njk) carries the
   kitchen's fixed parts and the sprite sheet (drawn in game/art); everything that can be tuned
   without touching code is data in src/_data/game.json, read here as D.
   The plan and the rules of the look are in game/README.md.

   The code is kept in parts in game/js, one subject each, and joined in
   file-name order into src/assets/js/play.js by game/build.js (owner
   2026-11-15). They share one scope (this function, opened here and closed
   in 99-end.js), so any part can call any other. Edit the parts, never
   play.js. Open only the part you need:
     01-setup            this header, the shared helpers
     02-save             1. the save, migrate, the test shortcuts
     03-results          where results go, if anywhere
     04-sound            the sounds, made here
     05-music-jazz       the slow jazz
     06-music-electronic the second style of music
     07-run              2. the run (G) and the day (T), trouble
     08-kitchen          3. the kitchen: tickets, flat-top, plate, send
     09-shift            the shift frame by frame (4. what items do), catering
     10-family           5. family at the counter
     11-draw             6. drawing the kitchen
     12-screens          7. the paper screens: dawn, achievements
     13-shop             after close: the free pick and the shop
     14-week-words       a week's ranks and words
     15-share-picture    the week as a picture to share
     16-week-over        Past weeks, the week-over screen
     17-menus            Recipe Box, how to play, settings, save code, home screen
     18-taps             8. taps, the loop
     19-start            fitting the phone, the first run, starting up
     90-dev-only         the /play?debug handle (cut out of every build)
     99-end              closes the function

   If site.json gives it somewhere to send them, the game also reports how
   each week went (no name; see "results" below and /privacy), and after a
   finished week offers to send a first name in with the score.

   Saved on the phone only (localStorage, always in try/catch): the best week
   on each level, weeks played, what's been served, the level, the sound and
   music settings, and a week left half way (kept at each morning, so it can
   be picked up from the start of that day). Nothing is sent anywhere.
   ============================================================ */
(function () {
  'use strict';

  var dataEl = document.getElementById('ou-data');
  var stage = document.getElementById('ou-stage');
  if (!dataEl || !stage) return;

  var D = JSON.parse(dataEl.textContent);
  var TU = D.tuning;
  var W = 360;                         // the stage's width; fit() scales it to the phone

  var $ = function (sel) { return stage.querySelector(sel); };
  var rand = Math.random;
  var pick = function (a) { return a[Math.floor(rand() * a.length)]; };
  var shuffle = function (a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rand() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var money = function (n) { return '$' + Math.round(n).toLocaleString('en-US'); };
  var plural = function (n, one, many) { return n + ' ' + (n === 1 ? one : many); };

  /* One sprite from the sheet. `style` carries a cooking food's colours. */
  function spr(name, cls, style) {
    return '<svg class="ou-i' + (cls ? ' ' + cls : '') + '" viewBox="0 0 64 64" aria-hidden="true" focusable="false"' +
      (style ? ' style="' + style + '"' : '') + '><use href="#s-' + name + '"/></svg>';
  }
  function partSprite(id, cls, raw) {
    var p = D.parts[id];
    var style = raw && p.raw ? '--food:' + p.raw + ';' + (p.raw2 ? '--food2:' + p.raw2 + ';' : '') + '--marks:0' : '';
    return spr(p.sprite, cls, style);
  }

