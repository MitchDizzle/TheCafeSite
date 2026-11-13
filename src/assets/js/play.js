/* ============================================================
   Order Up — the game at /play.

   A short-order cook's week at The Café: tickets on the rail, food on the
   flat-top, a plate, Send. One week is a run, one day is a shift, and after
   close you pick up gear and tricks for the rest of the week. Three levels
   (Easy, Regular, Rush) set how much is asked: whether food needs flipping
   and how (a tap or a swipe), how long tickets wait, whether family drops by.

   No libraries, no images, no server. The page (src/play.njk) carries the
   kitchen's fixed parts and the sprite sheet; everything that can be tuned
   without touching code is data in src/_data/game.json, read here as D.
   The plan and the rules of the look are in game/README.md.

   Shape of this file:
     1. setup, the save, sound, the music
     2. the run (G) and the day (T)
     3. the kitchen: tickets, flat-top, plate, send
     4. what the items do
     5. family at the counter
     6. drawing the kitchen
     7. the paper screens: dawn, after close, week over, Recipe Box, how to
     8. taps, the loop, fitting the phone

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

  /* ---------- 1. the save ---------- */
  /* The save's key and shape. Updates must keep old saves working (owner
     2026-11-13), so: KEY never changes, a new field gets a default in `save`
     below, and anything that changes the meaning of a field gets a step in
     migrate() with SAVE_VER raised. Never rename an item's or an
     achievement's id: saves and weeks left half way are keyed by them. */
  var KEY = 'orderup.v1', SAVE_VER = 2;
  var save = { told: false, noStats: false, best: 0, bests: {}, keeps: {}, weeks: 0, wins: 0, served: {}, sound: false, music: false, seen: false, level: 'normal', run: null, id: '', qa: [], sum: '', ach: {}, ver: 0, bestRuns: {}, past: [] };
  var loadedSum = '';
  try {
    var stored = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (stored && typeof stored === 'object') for (var k in save) if (k in stored) save[k] = stored[k];
    loadedSum = (stored && stored.sum) || '';
    if (!save.served || typeof save.served !== 'object') save.served = {};
  } catch (e) { /* a private window: start fresh, nothing breaks */ }
  var saveWhole = !loadedSum || loadedSum === sumOf();     // looked at once, as it was read, before anything here changes it
  if (!save.bests || typeof save.bests !== 'object') save.bests = {};
  // The score is the tips a week keeps (owner 2026-11-12). The old bests were
  // tips earned, a different number, so they aren't carried over.
  if (!save.keeps || typeof save.keeps !== 'object') save.keeps = {};
  if (!save.id) { save.id = rid(); }
  if (save.best && !save.bests.normal) save.bests.normal = save.best;   // from before there were levels
  if (!D.levels[save.level]) save.level = 'normal';
  if (save.run && (typeof save.run !== 'object' || !D.days[save.run.day] || !D.levels[save.run.level])) save.run = null;
  /* A short check value over the numbers that matter, so a save that was cut
     off half way through being written isn't taken for a whole one. */
  function sumOf() {
    var text = JSON.stringify([save.bests, save.weeks, save.wins, save.id]) + 'flat-top', h = 5381;
    for (var i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }
  function persist() { save.sum = sumOf(); try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* same */ } }
  function rid() {
    try {
      var a = new Uint8Array(9); crypto.getRandomValues(a);
      return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    } catch (e) { return String(Date.now()) + Math.floor(rand() * 1e6); }
  }
  if (!Array.isArray(save.qa)) save.qa = [];
  if (!save.ach || typeof save.ach !== 'object') save.ach = {};
  if (!save.bestRuns || typeof save.bestRuns !== 'object') save.bestRuns = {};
  if (!Array.isArray(save.past)) save.past = [];
  migrate();
  /* One step per change of shape, oldest first. A save from any earlier
     version walks up through all of them. */
  function migrate() {
    if (save.ver < 2) {
      // 2 (game 1.2): achievements began. Nothing to move; just the mark.
      save.ver = 2;
    }
  }

  /* ---------- test shortcuts ----------
     For trying things on a phone, where there's no ?debug. From the console:
       OrderUp.setTips(500)      start the day with $500
       OrderUp.addTips(50)
       OrderUp.skipDay()         close the day now
       OrderUp.unlockAll()       every item in the shop
       OrderUp.godMode = true    tickets never walk out
       OrderUp.submitScore(n)    send a week's score in
     Their settings are kept in localStorage under "orderup.dev".
     TODO: take these out before the post. */
  var qa = save.qa, DEVKEY = 'orderup.dev', DEVSET = '{"cheats":false,"tipMultiplier":1,"startTips":0}';
  var qaState = { godMode: false };
  function used(what) { if (qa.indexOf(what) === -1) { qa.push(what); save.qa = qa; persist(); } }
  function setTipsTo(n) {
    if (!G) return 0;
    n = Math.max(0, Number(n) || 0);
    var add = n - G.tips;
    G.tips = n; if (add > 0) G.earned += add;
    if (T && screen === 'shift') { T.tips = Math.max(0, T.tips + add); dirty.hud = true; }
    if (screen === 'close') drawClose();
    return G.tips;
  }
  var OrderUp = {
    version: (D.stats && D.stats.version) || '1',
    setTips: function (n) { used('setTips'); return { ok: true, tips: setTipsTo(n) }; },
    addTips: function (n) { used('addTips'); return { ok: true, tips: setTipsTo((G ? G.tips : 0) + (Number(n) || 0)) }; },
    skipDay: function () {
      used('skipDay');
      if (T && screen === 'shift' && !T.cat) { T.tickets.length = 0; T.t = T.len; T.closing = true; dirty.rail = true; }
      return { ok: true, day: G ? G.day : 0 };
    },
    unlockAll: function () {
      used('unlockAll');
      if (G) { D.items.forEach(function (it) { G.items[it.id] = it.max || 1; }); dirtyAll(); if (screen === 'close') drawClose(); }
      return { ok: true, items: D.items.length };
    },
    submitScore: function (n) {
      used('submitScore');
      report('score', { run: lastRun ? lastRun.run : (G ? G.run : ''), lvl: G ? G.level : save.level, name: '', contact: '', total: Number(n) || 0, web: 0 });
      return { ok: true, score: Number(n) || 0 };
    }
  };
  try {
    Object.defineProperty(OrderUp, 'godMode', { enumerable: true, get: function () { return qaState.godMode; }, set: function (v) { used('godMode'); qaState.godMode = !!v; } });
    Object.defineProperty(OrderUp, 'tips', { enumerable: true, get: function () { return G ? G.tips : 0; }, set: function (v) { used('tips'); setTipsTo(v); } });
    window.OrderUp = OrderUp;
    if (localStorage.getItem(DEVKEY) == null) localStorage.setItem(DEVKEY, DEVSET);
  } catch (e) { /* no matter */ }
  function qaCheck() {
    try { var dev = localStorage.getItem(DEVKEY); if (dev != null && dev !== DEVSET) used('dev-key'); } catch (e) { /* no matter */ }
    if (!saveWhole) used('save-edited');
  }

  /* ---------- results ----------
     If site.json gives the game somewhere to send them (game.statsUrl), a
     short note goes out when a week starts, when a day ends and when the week
     ends: the level, the day, the tips, how busy the taps were. No name and
     nothing about who is playing: `dev` is a random id made here and kept in
     the save, so two weeks from one phone can be told from two phones. With
     no address nothing is sent and none of this runs. /privacy says the same. */
  var STATS = D.stats || {};
  var lastRun = null;
  // The build fills this in (.eleventy.js, from the deploy's settings).
  var STAMP = '__OU_SIGN_KEY__';
  /* Which build a result came from. */
  function build() {
    var v = String(STATS.version || '1');
    if (!qa.length) return v;
    return v.indexOf('1') !== -1 ? v.replace('1', '\u006c') : v + '\u200b';
  }
  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
  /* Each note goes as { d: the note, s: its HMAC-SHA256 }, so a note that was
     changed on the way can be told from one that wasn't. */
  function seal(body) {
    try {
      var enc = new TextEncoder(), sub = window.crypto && crypto.subtle;
      if (!sub) return Promise.resolve('');
      return sub.importKey('raw', enc.encode(STAMP), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
        .then(function (k) { return sub.sign('HMAC', k, enc.encode(body)); }).then(hex)
        .catch(function () { return ''; });
    } catch (e) { return Promise.resolve(''); }
  }
  var queue = Promise.resolve();
  function report(kind, more) {
    if (!STATS.url || save.noStats) return;
    qaCheck();
    var note = { k: kind, v: build(), run: G ? G.run : '', dev: save.id, lvl: G ? G.level : save.level, wd: navigator.webdriver ? 1 : 0, at: Date.now() }, key;
    for (key in more) note[key] = more[key];
    var body = JSON.stringify(note);
    // One after another, so a week's notes arrive in the order they happened.
    queue = queue.then(function () { return seal(body); }).then(function (s) {
      return fetch(STATS.url, { method: 'POST', mode: 'no-cors', keepalive: true, headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ d: body, s: s }) });
    }).catch(function () { /* results are a nicety: never in the game's way */ });
  }
  /* How busy the taps were in a shift: how many, and the gaps between them. */
  function tapped(e) {
    if (!T || screen !== 'shift') return;
    var now = performance.now();
    T.taps++;
    if (T.lastTap && T.gaps.length < 900) T.gaps.push(Math.round(now - T.lastTap));
    T.lastTap = now;
    if (e && e.isTrusted === false) T.untrusted++;
  }

  /* ---------- sound: made here, no files. Off until it's turned on. ---------- */
  var ac = null;
  function ctx() {
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === 'suspended') ac.resume();
      return ac;
    } catch (e) { return null; }
  }
  function audio() { return save.sound ? ctx() : null; }
  function tone(freq, dur, type, vol, slideTo, delay) {
    var a = audio(); if (!a) return;
    var t0 = a.currentTime + (delay || 0);
    var o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(vol || 0.07, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(a.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function hiss(dur, vol) {
    var a = audio(); if (!a) return;
    var n = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, n, a.sampleRate), ch = buf.getChannelData(0);
    for (var i = 0; i < n; i++) ch[i] = (rand() * 2 - 1) * (1 - i / n);
    var src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    f.type = 'highpass'; f.frequency.value = 3200; g.gain.value = vol || 0.05;
    src.buffer = buf; src.connect(f); f.connect(g); g.connect(a.destination); src.start();
  }
  var sfx = {
    tap: function () { tone(540, 0.05, 'triangle', 0.05); },
    sizzle: function () { hiss(0.35, 0.05); },
    done: function () { tone(880, 0.12, 'sine', 0.05); },
    bell: function () { tone(1320, 0.5, 'sine', 0.08); tone(1980, 0.35, 'sine', 0.04, 0, 0.05); },
    ticket: function () { tone(720, 0.04, 'square', 0.025); tone(720, 0.04, 'square', 0.025, 0, 0.07); },
    bad: function () { tone(170, 0.16, 'square', 0.035); },
    spill: function () { tone(320, 0.45, 'sawtooth', 0.045, 80); },
    buy: function () { tone(660, 0.09, 'triangle', 0.06); tone(990, 0.16, 'triangle', 0.06, 0, 0.08); },
    win: function () { [660, 830, 990, 1320].forEach(function (f, i) { tone(f, 0.22, 'triangle', 0.06, 0, i * 0.12); }); },
    talk: function () { tone(300, 0.07, 'sine', 0.04); tone(360, 0.07, 'sine', 0.04, 0, 0.08); },
    // The day is done (owner 2026-11-12: a little achievement tune): up the
    // chord and a held top note.
    close: function () {
      [523, 659, 784].forEach(function (f, i) { tone(f, 0.14, 'triangle', 0.06, 0, i * 0.11); });
      tone(1047, 0.6, 'triangle', 0.065, 0, 0.33); tone(659, 0.6, 'sine', 0.03, 0, 0.33); tone(784, 0.6, 'sine', 0.03, 0, 0.33);
    },
    // A flawless day: a longer run, two octaves up, and a sparkle on top.
    flawless: function () {
      [523, 659, 784, 1047, 1319, 1568].forEach(function (f, i) { tone(f, 0.16, 'triangle', 0.055, 0, i * 0.08); });
      [1047, 1319, 1568, 2093].forEach(function (f) { tone(f, 1, 'sine', 0.026, 0, 0.5); });
      tone(2637, 0.3, 'sine', 0.025, 0, 0.8); tone(3136, 0.4, 'sine', 0.02, 0, 0.92);
    },
    // An achievement: three quick notes, the last one held.
    achieve: function () { tone(988, 0.09, 'square', 0.028); tone(1319, 0.09, 'square', 0.028, 0, 0.1); tone(1976, 0.4, 'triangle', 0.055, 0, 0.2); },
    lucky: function () { tone(1568, 0.08, 'triangle', 0.05); tone(2093, 0.18, 'triangle', 0.05, 0, 0.07); }
  };
  function buzz(ms) { if (save.sound && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) { /* no matter */ } } }

  /* ---------- music: slow lo-fi jazz, made here as it plays ----------
     No recording and no file, so nothing to license or download: an
     eight-bar loop of jazz chords on a soft electric piano, a bass, brushed
     drums with a little swing, and a few notes on top picked at random, all
     through a low-pass so it sounds like a radio in the next room. It never
     plays the same way twice. Off until it's turned on (its own switch, apart
     from the sound effects), and it stops when the page is hidden. */
  var music = { on: false, timer: 0, next: 0, step: 0, out: null, noise: null };
  var BEAT = 60 / 74;
  // One bar each: the bass note, then the chord (MIDI numbers). ii V I vi, then IV iii ii V, in C.
  var BARS = [
    [38, 53, 57, 60, 64], [43, 53, 57, 59, 64], [36, 52, 55, 59, 62], [45, 55, 59, 60, 64],
    [41, 57, 60, 64, 67], [40, 55, 59, 62, 64], [38, 53, 57, 60, 64], [43, 53, 57, 59, 64]
  ];
  var TOP = [67, 69, 72, 74, 76, 79, 81];     // C major pentatonic: it can't hit a wrong note over these chords
  function hz(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function musicOut(a) {
    if (music.out) return music.out;
    var g = a.createGain(), lp = a.createBiquadFilter();
    g.gain.value = 0.5; lp.type = 'lowpass'; lp.frequency.value = 2400; lp.Q.value = 0.4;
    g.connect(lp); lp.connect(a.destination);
    var len = a.sampleRate, buf = a.createBuffer(1, len, len), ch = buf.getChannelData(0);
    for (var i = 0; i < len; i++) ch[i] = rand() * 2 - 1;
    music.noise = buf; music.out = g;
    return g;
  }
  function note(a, when, midi, dur, vol, type) {
    var o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine'; o.frequency.value = hz(midi); o.detune.value = (rand() - 0.5) * 14;   // a touch out of tune, like tape
    g.gain.setValueAtTime(0.0001, when); g.gain.linearRampToValueAtTime(vol, when + 0.025);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g); g.connect(music.out); o.start(when); o.stop(when + dur + 0.05);
  }
  function drum(a, when, kind, vol) {
    if (kind === 'kick') {
      var o = a.createOscillator(), g = a.createGain();
      o.frequency.setValueAtTime(110, when); o.frequency.exponentialRampToValueAtTime(42, when + 0.16);
      g.gain.setValueAtTime(vol, when); g.gain.exponentialRampToValueAtTime(0.0001, when + 0.26);
      o.connect(g); g.connect(music.out); o.start(when); o.stop(when + 0.3);
      return;
    }
    var src = a.createBufferSource(), flt = a.createBiquadFilter(), g2 = a.createGain(), len = kind === 'hat' ? 0.05 : 0.16;
    src.buffer = music.noise; flt.type = kind === 'hat' ? 'highpass' : 'bandpass'; flt.frequency.value = kind === 'hat' ? 6000 : 1700;
    g2.gain.setValueAtTime(vol, when); g2.gain.exponentialRampToValueAtTime(0.0001, when + len);
    src.connect(flt); flt.connect(g2); g2.connect(music.out); src.start(when, rand() * 0.5, len + 0.02);
  }
  /* One eighth note of it. Eight to a bar. */
  function musicStep(a, step, when) {
    var bar = BARS[Math.floor(step / 8) % BARS.length], at = step % 8, i;
    if (at === 0) {
      for (i = 1; i < bar.length; i++) note(a, when + (i - 1) * 0.018, bar[i], 2.6, 0.05, i % 2 ? 'sine' : 'triangle');   // the chord, rolled a little
      note(a, when, bar[0], 1.3, 0.16, 'sine');
    }
    if (at === 5 && rand() < 0.6) for (i = 2; i < bar.length; i++) note(a, when, bar[i], 1.1, 0.028, 'sine');
    if (at === 4) note(a, when, bar[0] + (rand() < 0.5 ? 7 : 12), 0.9, 0.11, 'sine');
    if (at === 0 || (at === 5 && rand() < 0.7)) drum(a, when, 'kick', 0.22);
    if (at === 2 || at === 6) drum(a, when, 'snare', 0.07);
    drum(a, when, 'hat', at % 2 ? 0.022 : 0.04);
    if (rand() < (at % 2 ? 0.16 : 0.26)) note(a, when, pick(TOP), 0.9 + rand(), 0.045, 'triangle');
  }
  function musicTick() {
    var a = ac; if (!a || !music.on) return;
    if (music.next < a.currentTime) music.next = a.currentTime + 0.06;
    while (music.next < a.currentTime + 0.4) {
      musicStep(a, music.step, music.next + (music.step % 2 ? BEAT * 0.09 : 0));    // the off-beats come late: swing
      music.next += BEAT / 2; music.step++;
    }
  }
  /* Start or stop to match the switch. A browser only lets sound start from
     a tap, so every tap calls this. */
  function musicSync() {
    var want = save.music && !document.hidden;
    if (want && !music.on) {
      var a = ctx(); if (!a) return;
      musicOut(a); music.on = true; music.next = 0;
      music.timer = setInterval(musicTick, 110); musicTick();
    } else if (!want && music.on) { music.on = false; clearInterval(music.timer); }
  }

  /* ---------- 2. the run and the day ---------- */
  var G = null;      // the week: day, tips to spend, what's owned
  var T = null;      // the shift being played
  var screen = 'title';
  var uid = 0;
  var speed = 1;     // debug only

  function has(id) { return (G && G.items[id]) || 0; }
  /* How hard: the level the week was started on (game.json, levels). */
  function level() { return D.levels[(G && G.level) || save.level] || D.levels.normal; }

  function newRun() {
    G = { level: save.level, run: rid(), began: Date.now(), played: 0, away: 0, day: 0, tips: 0, earned: 0, bought: 0, bonus: 0, sale: false, perDay: [], cater: null, items: {}, reroll: D.reroll.first, offers: [], stage: '', pick: [], shop: [], sold: [], fryer: false, trouble: null, troubleDay: -1, lastTrouble: null, troublePart: '', slips: [], fed: 0, newAch: [] };
    report('start', {});
    showDawn();
  }
  /* A week left half way is kept each morning and picked up from that morning. */
  function keepRun() {
    save.run = { level: G.level, run: G.run, began: G.began, played: G.played, away: G.away, day: G.day, tips: G.tips, earned: G.earned, bought: G.bought, bonus: G.bonus, perDay: G.perDay.slice(0, G.day), items: G.items, trouble: G.trouble, troubleDay: G.troubleDay, troublePart: G.troublePart, slips: G.slips.slice(0, G.day), fed: G.fed };
    persist();
  }
  function resumeRun() {
    var r = save.run, items = {};
    for (var id in r.items) if (D.items.some(function (it) { return it.id === id; })) items[id] = r.items[id];
    G = { level: r.level, run: r.run || rid(), began: r.began || Date.now(), played: r.played || 0, away: r.away || 0, day: r.day, tips: r.tips || 0, earned: r.earned || 0, bought: r.bought || 0, bonus: r.bonus || 0, sale: false, perDay: (r.perDay || []).slice(), cater: null, items: items, reroll: D.reroll.first, offers: [], stage: '', pick: [], shop: [], sold: [], fryer: false,
      trouble: troubleOf(r.trouble) ? r.trouble : null, troubleDay: r.troubleDay == null ? -1 : r.troubleDay, lastTrouble: null,
      troublePart: D.parts[r.troublePart] ? r.troublePart : '', slips: Array.isArray(r.slips) ? r.slips.slice() : [], fed: r.fed || 0, newAch: [] };
    showDawn();
  }

  function startDay(special) {
    var day = D.days[G.day];
    T = {
      t: 0, len: TU.dayLength, phase: 'breakfast', bins: 'breakfast', closing: false, ended: false, paused: false,
      tickets: [], grill: [null, null, null, null, null, null], plate: [], spare: [],
      cups: TU.cups, spawnIn: BANNER_S + 0.3, seq: 1, served: 0, walk: 0, tips: 0,
      special: special, dry: 0, lineT: 0, urnDone: false,
      cookies: has('cookie'), pickles: 0, lastLucky: false,
      usualAt: has('regular') ? [3 + Math.floor(rand() * 3), 9 + Math.floor(rand() * 4), 15 + Math.floor(rand() * 4)] : [],
      familyAt: null, fam: null, bubbles: [], cat: null, endIn: null, lastClock: '', lastSky: -1,
      taps: 0, gaps: [], lastTap: 0, untrusted: 0, played: 0, away: 0, banked: 0, awayBanked: 0,
      trouble: troubleOf(G.trouble), coldAt: -1, slips: 0, clean: 0
    };
    if (T.trouble && T.trouble.id === 'cold') T.coldAt = Math.floor(rand() * usable());
    if (T.trouble && T.trouble.id === 'noshow') T.noShow = G.troublePart || 'egg';
    // Power Flicker: when the lights go out, one in breakfast and one at lunch.
    T.outs = []; T.dark = 0;
    if (T.trouble && T.trouble.id === 'outage') {
      var bsx = TU.breakfastShare * T.len;
      T.outs = [8 + rand() * (bsx - 16), bsx + 6 + rand() * (T.len - bsx - 18)].slice(0, T.trouble.times);
    }
    var lv = level(), famChance = day.family * lv.family;
    if (G.day >= 1 && lv.familyFloor) famChance = Math.max(famChance, lv.familyFloor);
    if (rand() * 100 < famChance) {
      var lunchStart = TU.breakfastShare * T.len;
      T.familyAt = lunchStart + 6 + rand() * (T.len - lunchStart - 26);
    }
    dirtyAll();
    show('shift');
    $('#ou-pausebox').hidden = true;
    $('#ou-bubbles').innerHTML = '';
    banner(day.name, T.trouble ? 'Trouble today: ' + T.trouble.name + '.' : 'Open at 6am. Breakfast first.');
  }

  var LINE_S = 14, LINE_AT = 0.5;      // the Line Cook: seconds to be ready again, and how close to walking out a ticket must be
  /* The spots on the flat-top: all of them, and the ones that work today
     (a Broken Stove takes one out, drawn last). */
  function spots() { return Math.min(6, TU.griddle + 2 * has('flattop')); }
  function usable() { return spots() - (trouble('stove') ? 1 : 0); }
  /* Seconds a food takes in spot i: the Grill Press speeds it, a Cold Spot slows it. */
  function cookTime(part, i) {
    var c = D.parts[part].cook / (1 + itemPer('press') / 100 * has('press')), cold = trouble('cold');
    return cold && i === T.coldAt ? c * cold.slow : c;
  }
  function burnSecs() { return D.days[G.day].burn * level().burn + itemPer('shelf') * has('shelf'); }

  /* ---------- trouble ----------
     Some mornings one thing has gone wrong for the day (game.json, trouble;
     how often is the level's). Dealt at 6am, kept with the week, never the
     same two days running, and never on the catering. */
  function troubleOf(id) { return id ? D.trouble.filter(function (x) { return x.id === id; })[0] || null : null; }
  function trouble(id) { return T && !T.cat && T.trouble && T.trouble.id === id ? T.trouble : null; }
  function dealTrouble() {
    var tr = level().trouble;
    if (has('horseshoe')) return null;       // the Horseshoe: no trouble, any day
    if (!tr || G.day < tr.from || rand() * 100 >= tr.chance) return null;
    var list = D.trouble.filter(function (x) { return x.id !== G.lastTrouble; });
    var got = pick(list);
    G.troublePart = got.parts ? pick(got.parts) : '';
    return got.id;
  }
  /* Tips lost to trouble: never more than the day has made. */
  function lose(n, words) {
    var loss = Math.min(n, Math.max(0, T.tips));
    if (loss) { T.tips -= loss; G.tips -= loss; G.earned -= loss; dirty.hud = true; toast(words + ' ' + money(loss)); }
  }
  /* Something burnt: a slip (no flawless day), and with an Accident it costs. */
  function burnt() {
    sfx.bad(); T.slips++;
    var a = trouble('accident'); if (a) lose(a.cost, 'Accident: burnt food costs');
  }
  function troubleText(tr, part) { return tr.text.replace('{part}', part && D.parts[part] ? D.parts[part].name.toLowerCase() : 'egg'); }

  /* The clock runs 6am to 2pm, but breakfast (to 11am) and lunch each get the
     share of the shift game.json gives them, so it ticks at two speeds. */
  function minutesNow() {
    var bs = TU.breakfastShare * T.len;
    if (T.t < bs) return 360 + (T.t / bs) * 300;
    return 660 + Math.min(1, (T.t - bs) / (T.len - bs)) * 180;
  }
  function clockText(min) {
    min = Math.floor(min / 5) * 5;
    var h = Math.floor(min / 60), m = min % 60;
    return ((h + 11) % 12 + 1) + ':' + (m < 10 ? '0' : '') + m + (h < 12 ? 'am' : 'pm');
  }

  /* ---------- 3. the kitchen ---------- */
  function makeTicket(recipe, o) {
    var day = D.days[G.day];
    var t = {
      id: ++uid, n: T.seq++, rid: recipe.id, name: recipe.name, when: recipe.when || 'lunch', parts: recipe.parts.slice(),
      age: 0, togo: false, usual: false, special: false, family: false, catering: false, boarded: false, late: false, auto: null, hurry: false
    };
    for (var key in o) t[key] = o[key];
    t.total = (TU.waitBase + TU.waitPerPart * t.parts.length) * day.patience * level().wait + itemPer('refills') * has('refills');
    // Never less than it takes to make: the longest thing on it has to cook,
    // and every part is a tap or two. Luck can make a day hard, not undoable.
    var longest = 0;
    t.parts.forEach(function (p) { longest = Math.max(longest, D.parts[p].cook || 0); });
    t.total = Math.max(t.total, longest * TU.fair.cookTimes + TU.fair.perPart * t.parts.length + TU.fair.base);
    if (t.togo && has('clamshell')) t.total += 8;
    if (t.family) t.total = D.family.wait;
    if (t.catering) t.total = 1;
    t.left = t.total;
    if (has('counter') && t.parts.length === 1 && !t.family && !t.catering) t.auto = 2.5;
    return t;
  }

  function spawnTicket() {
    var day = D.days[G.day], lunch = T.bins === 'lunch', recipe, o = {};
    // The Facebook Post (up to two): each puts the special on more lunch tickets.
    var review = trouble('review');
    if (lunch && rand() * 100 < (TU.specialShare + TU.postShare * has('fbpost')) * (review ? review.share : 1)) {
      recipe = { id: 'sp-' + T.special.id, name: T.special.name, when: 'lunch', parts: ['special'].concat(T.special.sides.map(function () { return 'side'; })) };
      o.special = true;
    } else if (!lunch && has('rollcase') && rand() < 0.3) {
      recipe = D.rollRecipe;
    } else {
      var gentle = !save.seen && G.day === 0 && T.seq <= 2;
      // Two big tickets already up: the next one is a small one. The rail can
      // be full, but not full of four-part plates.
      var heavy = T.tickets.filter(function (t) { return t.parts.length >= TU.fair.bigParts; }).length >= TU.fair.bigAtOnce;
      if (heavy) gentle = true;
      var pool = D.recipes.filter(function (r) { return r.when === (lunch ? 'lunch' : 'breakfast') && r.tier <= (gentle ? 1 : day.tier) && !(!lunch && T.noShow && trouble('noshow') && r.parts.indexOf(T.noShow) !== -1); });
      var fresh = pool.filter(function (r) { return !T.tickets.some(function (t) { return t.rid === r.id; }); });
      recipe = pick(fresh.length ? fresh : pool);
    }
    if (lunch && rand() * 100 < TU.toGo) o.togo = true;
    if (T.usualAt.indexOf(T.seq) !== -1) o.usual = true;
    var hurry = trouble('impatient');
    if (hurry && !o.usual && rand() * 100 < hurry.chance) o.hurry = true;
    T.tickets.push(makeTicket(recipe, o));
    dirty.rail = true;
    sfx.ticket();
  }

  /* Does the plate fill a ticket? Three ways, best first:
       exact   the plate is the ticket
       pickle  the ticket plus one pickle spear (any plate can take one: $1 more)
       wild    Big Dill: a pickle standing in for one missing part */
  function count(list) { var c = {}; list.forEach(function (p) { c[p] = (c[p] || 0) + 1; }); return c; }
  function compare(plate, parts) {
    var a = count(plate), b = count(parts), extra = [], missing = [], key;
    for (key in a) for (var i = 0; i < a[key] - (b[key] || 0); i++) extra.push(key);
    for (key in b) for (var j = 0; j < b[key] - (a[key] || 0); j++) missing.push(key);
    return { extra: extra, missing: missing };
  }
  function byUrgency(a, b) { return (a.catering ? a.n : a.left) - (b.catering ? b.n : b.left); }
  function findMatch() {
    if (!T.plate.length) return null;
    var list = T.tickets.slice().sort(byUrgency), i, c;
    for (i = 0; i < list.length; i++) { c = compare(T.plate, list[i].parts); if (!c.extra.length && !c.missing.length) return { t: list[i], kind: 'exact' }; }
    for (i = 0; i < list.length; i++) { c = compare(T.plate, list[i].parts); if (!c.missing.length && c.extra.length === 1 && c.extra[0] === 'pickle') return { t: list[i], kind: 'pickle' }; }
    if (has('bigdill')) for (i = 0; i < list.length; i++) { c = compare(T.plate, list[i].parts); if (c.missing.length === 1 && c.extra.length === 1 && c.extra[0] === 'pickle') return { t: list[i], kind: 'wild' }; }
    return null;
  }
  /* The ticket the plate is heading for: the most urgent one it still fits. */
  function aimTicket() {
    if (!T.plate.length) return null;
    var list = T.tickets.slice().sort(byUrgency);
    for (var i = 0; i < list.length; i++) {
      var c = compare(T.plate, list[i].parts);
      var spare = c.extra.filter(function (p) { return p !== 'pickle'; });
      if (!spare.length && c.extra.length <= 1) {
        var left = T.plate.slice(), have = list[i].parts.map(function (p) { var at = left.indexOf(p); if (at === -1) return false; left.splice(at, 1); return true; });
        return { t: list[i], have: have };
      }
    }
    return null;
  }

  function tapBin(part) {
    var info = D.parts[part];
    if (!binOpen(part)) { return; }
    if (info.cook) {
      var n = usable(), at = -1;
      for (var i = 0; i < n; i++) if (!T.grill[i]) { at = i; break; }
      if (at === -1) { toast('The flat-top is full'); sfx.bad(); return; }
      T.grill[at] = { part: part, t: 0, state: 'raw', gone: 0, flipped: false, wait: 0 };
      dirty.grill = dirty.bins = true; sfx.sizzle();
    } else {
      if (T.plate.length >= TU.plateMax) { toast('The plate is full'); sfx.bad(); return; }
      T.plate.push(part); T.plateNew = T.plate.length - 1;
      dirty.plate = dirty.rail = true; sfx.tap();
    }
  }
  function tapSpot(i) {
    var it = T.grill[i]; if (!it) return;
    if (it.state === 'raw') { hintFlash('Not done yet'); return; }
    if (it.state === 'burnt') { T.grill[i] = null; dirty.grill = dirty.bins = true; sfx.tap(); return; }
    if (T.plate.length >= TU.plateMax) { toast('The plate is full'); sfx.bad(); return; }
    T.plate.push(it.part); T.plateNew = T.plate.length - 1; T.grill[i] = null;
    dirty.grill = dirty.plate = dirty.rail = dirty.bins = true; sfx.tap();
  }
  /* Food that flips (game.json, parts) stops at the half until it's turned.
     `how` is tap, swipe or key. On Rush only a swipe turns it; a keyboard
     always can, so the game is never out of reach without a touch screen. */
  function flipIt(it) {
    it.flipped = true; it.state = 'raw'; it.wait = 0; it.flipNow = true;
    dirty.grill = true; sfx.sizzle();
  }
  function spotGesture(i, how) {
    var it = T.grill[i]; if (!it) return;
    if (it.state === 'flip') {
      if (how === 'tap' && level().flip === 'swipe') { hintFlash('Swipe across it to flip'); sfx.bad(); return; }
      flipIt(it); return;
    }
    if (how === 'swipe' && it.state === 'raw') { hintFlash('Not ready yet'); return; }
    tapSpot(i);
  }
  /* The Second Plate: the two plates change places. What's parked waits as
     it is (nothing on a plate goes cold); Send only ever sends the front one. */
  function swapPlates() {
    if (!has('spare') || (!T.plate.length && !T.spare.length)) return;
    var t = T.plate; T.plate = T.spare; T.spare = t; T.plateNew = -1;
    dirty.plate = dirty.rail = true; sfx.tap();
  }
  function tapPlateItem(i) { T.plate.splice(i, 1); dirty.plate = dirty.rail = true; sfx.tap(); }
  function scrap() { if (!T.plate.length) return; T.plate = []; dirty.plate = dirty.rail = true; sfx.tap(); }

  function send() {
    if (!T.plate.length) return;
    var m = findMatch();
    if (!m) {
      toast('Not on a ticket'); sfx.bad();
      var pl = $('#ou-plate'); pl.classList.remove('is-bad'); void pl.offsetWidth; pl.classList.add('is-bad');
      return;
    }
    T.plate = []; dirty.plate = true;
    complete(m.t, m.kind, false);
  }

  /* A ticket goes out: by Send, or by a helper (`by` names who). */
  function complete(t, kind, by) {
    var tip = t.parts.length + (t.special ? 2 : 0);
    var frac = t.left / t.total;
    if (!t.catering) tip += frac > 0.5 ? 2 : frac > 0.25 ? 1 : 0;
    if (t.catering) tip += 2;
    if (t.rid === 'roll') tip = itemPer('rollcase');
    if (kind === 'pickle') tip += 1 + itemPer('picklejar') * has('picklejar');
    else if (t.parts.indexOf('pickle') !== -1 || kind === 'wild') tip += itemPer('picklejar') * has('picklejar');
    tip += itemPer('tipjar') * has('tipjar');
    var mult = 1;
    if (t.special && has('drink')) mult *= 2;
    if (t.n <= itemPer('earlybird') && has('earlybird') && !t.catering) mult *= 2;
    if (t.usual) mult *= 3;
    if (has('fryer')) mult *= 3;
    // The Lucky Penny: a chance a plate is a lucky one (the Big Tipper makes it triple).
    var lucky = !t.family && rand() * 100 < TU.luckyBase + itemPer('penny') * has('penny');
    if (lucky) mult *= has('bigtipper') ? 3 : 2;
    tip *= mult;
    if (t.family) tip = 0;
    // Achievements earned at the pass.
    if (!t.family) { if (lucky && T.lastLucky) award('lucky'); T.lastLucky = lucky; }
    if (kind === 'pickle' && ++T.pickles >= 10) award('pickles');
    if (t.special && T.grill.filter(function (x) { return x && x.state !== 'burnt'; }).length >= 3) award('multitask');

    removeTicket(t);
    T.served++; T.tips += tip; G.tips += tip; G.earned += tip;
    save.served[t.rid] = (save.served[t.rid] || 0) + 1;
    if (has('bell')) T.tickets.forEach(function (o) { if (!o.catering) o.left = Math.min(o.total, o.left + 2); });
    dirty.hud = dirty.rail = true; popTips();
    sfx.bell();

    if (t.family) { familyFed(t); return; }
    var words = by ? by + ' sent #' + t.n + (kind === 'pickle' ? ', with a pickle' : '') : (kind === 'pickle' ? 'Order up, with a pickle' : kind === 'wild' ? 'Order up. Big Dill.' : 'Order up');
    if (t.usual) words = 'The usual';
    if (lucky) { words = 'Lucky plate x' + (has('bigtipper') ? 3 : 2); sfx.lucky(); }
    toast(words + ' · ' + money(tip));

    if (t.catering) {
      T.cat.done++;
      if (T.cat.queue.length) { T.tickets.push(makeTicket(T.cat.queue.shift(), { catering: true })); }
      if (T.cat.done >= T.cat.n) cateringDone();
    }
  }
  function removeTicket(t) {
    var at = T.tickets.indexOf(t);
    if (at !== -1) T.tickets.splice(at, 1);
    dirty.rail = true;
  }

  function walkOut(t) {
    removeTicket(t); T.slips++;
    if (t.family) { familyGone(); toast('They’ll bring it up at dinner.'); return; }
    T.cups--; T.walk++; T.dry = 0; dirty.hud = true;
    // A breath: the tickets still up wait a little longer and the next one
    // holds off, so one walk-out doesn't drag the next two with it.
    T.tickets.forEach(function (o) { if (!o.catering && !o.family) o.left = Math.min(o.total, o.left + TU.fair.breath); });
    T.spawnIn = Math.max(T.spawnIn, TU.fair.breathHold);
    toast(T.cups > 0 ? 'They left. One coffee down.' : 'They left. That was the last coffee.');
    sfx.spill(); buzz(90);
    if (T.cups <= 0) { T.ended = true; setTimeout(function () { weekOver(false, 'coffee'); }, 1100); }
  }

  /* ---------- the shift, one frame at a time ---------- */
  function update(dt) {
    var day = D.days[G.day], i, t;

    if (T.cat) {
      T.cat.left -= dt;
      if (T.cat.left <= 0) { T.ended = true; weekOver(false, 'late'); return; }
    } else {
      // At 11am the clock waits for the last breakfast ticket (owner 2026-11-12),
      // so finishing breakfast never eats into lunch.
      var bs = TU.breakfastShare * T.len;
      if (!(T.phase === 'lunch' && T.bins === 'breakfast')) T.t += dt;
      if (T.phase === 'breakfast' && T.t >= bs) { T.phase = 'lunch'; T.t = bs; }
      // The bins turn over only once the last breakfast ticket is out, so
      // nobody is left holding a ticket they can no longer make.
      if (T.phase === 'lunch' && T.bins === 'breakfast' && !T.tickets.some(function (x) { return x.when === 'breakfast'; })) {
        // The banner covers the rail for a moment: lunch's first ticket waits
        // for it to go (owner 2026-11-12: a short break between the two).
        T.bins = 'lunch'; T.spawnIn = BANNER_S + 0.3; dirty.bins = dirty.pass = true;
        banner('11am', 'Lunch. ' + T.special.name + ' is on.');
        if (has('urn') && T.cups < TU.cups) { T.cups++; dirty.hud = true; setTimeout(function () { toast('Coffee Urn: one coffee poured again'); }, 1900); }
      }
      if (!T.closing && T.t >= T.len) {
        T.closing = true; dirty.pass = true;
        if (T.tickets.length) toast('2pm. Last call: finish the rail.');      // not a banner: it would cover the tickets still up
      }
      if (!T.closing) {
        var open = T.phase === 'breakfast' ? T.bins === 'breakfast' : T.bins === 'lunch';
        T.spawnIn -= dt;
        if (open && T.spawnIn <= 0) {
          if (T.tickets.length < TU.rail) { spawnTicket(); T.spawnIn = day.every * level().every * (0.8 + rand() * 0.4); }
          else T.spawnIn = 0.5;
        }
        if (T.familyAt != null && T.bins === 'lunch' && T.t >= T.familyAt && T.tickets.length < TU.rail) familyArrives();
      }
      if (T.outs.length && T.t >= T.outs[0] && trouble('outage')) { T.outs.shift(); T.dark = trouble('outage').secs; dirty.rail = true; toast('The lights went out'); sfx.bad(); }
      if (T.dark > 0) { T.dark -= dt; if (T.dark <= 0) { T.dark = 0; dirty.rail = true; } }
      if (T.closing && !T.tickets.length && T.endIn == null) T.endIn = 0.9;
      if (T.endIn != null) { T.endIn -= dt; if (T.endIn <= 0) { T.ended = true; endDay(); return; } }
    }

    // tickets
    for (i = T.tickets.length - 1; i >= 0; i--) {
      t = T.tickets[i]; t.age += dt;
      if (t.catering) continue;
      t.left -= t.hurry && trouble('impatient') ? dt * trouble('impatient').speed : dt;
      // Counter Help adds the pickle spear at lunch, as a player would.
      if (t.auto != null) { t.auto -= dt; if (t.auto <= 0) { complete(t, T.bins === 'lunch' && t.parts.indexOf('pickle') === -1 ? 'pickle' : 'exact', 'Counter Help'); continue; } }
      // The Line Cook, when ready, takes the ticket that is about to walk out:
      // never the one being made unless it was lost anyway (owner 2026-11-12).
      if (t.left <= LINE_AT && T.lineT >= LINE_S && has('linecook') && !t.family) { T.lineT = 0; complete(t, 'exact', 'Line Cook'); continue; }
      if (t.left <= 0.4 && !t.boarded && has('board') && !t.family) { t.boarded = true; t.left += 6; toast('Kitchen Board: #' + t.n + ' waits a little longer'); }
      if (t.left <= 0 && qaState.godMode && !t.family) { t.left = t.total; continue; }
      if (t.left <= 0) walkOut(t);
    }
    if (T.ended) return;

    // the flat-top
    var burnAfter = burnSecs(), gold = has('goldspat'), flips = level().flip !== 'none';
    for (i = 0; i < T.grill.length; i++) {
      var it = T.grill[i]; if (!it) continue;
      var cook = cookTime(it.part, i);
      if (it.state === 'burnt') {
        var insp = trouble('inspector');
        if (insp && !it.fined) { it.sat = (it.sat || 0) + dt; if (it.sat >= insp.after) { it.fined = true; lose(insp.fine, 'Health Inspector: burnt food left out costs'); } }
        if (has('scraper')) { it.gone += dt; if (it.gone > 0.9) { T.grill[i] = null; dirty.grill = dirty.bins = true; } }
        continue;
      }
      if (it.state === 'flip') {       // waiting to be turned: this side is still on the heat
        it.wait += dt;
        if (!gold && it.wait >= burnAfter) { it.state = 'burnt'; dirty.grill = true; burnt(); }
        continue;
      }
      it.t += dt;
      if (it.state === 'raw' && flips && D.parts[it.part].flip && !it.flipped && it.t >= cook / 2) {
        it.t = cook / 2;
        if (has('spatula')) flipIt(it); else { it.state = 'flip'; it.wait = 0; dirty.grill = true; sfx.done(); }
      }
      else if (it.state === 'raw' && it.t >= cook) { it.state = 'done'; dirty.grill = true; sfx.done(); }
      else if (it.state === 'done' && !gold && it.t >= cook + burnAfter) { it.state = 'burnt'; dirty.grill = true; burnt(); }
    }

    // helpers
    if (has('linecook')) {
      T.lineT = Math.min(LINE_S, T.lineT + dt);     // ready when the bar under the hat is full
      // The catering is one clock, so nothing is about to walk out: there the
      // Line Cook sends a platter the plate isn't heading for.
      if (T.cat && T.lineT >= LINE_S) {
        var aim = aimTicket();
        var mine = T.tickets.filter(function (x) { return x.catering && !(aim && aim.t === x); }).sort(function (x, y) { return y.n - x.n; })[0];
        if (mine) { T.lineT = 0; complete(mine, 'exact', 'Line Cook'); }
      }
    }
    if (has('bottomless') && T.cups < TU.cups && T.cups > 0) {
      T.dry += dt;
      if (T.dry >= 25) { T.dry = 0; T.cups++; dirty.hud = true; toast('Bottomless Coffee: poured again'); }
    }

    // family
    if (T.fam) {
      T.fam.say -= dt;
      if (T.fam.say <= 0) { T.fam.say = D.family.every; if (T.bubbles.length < D.family.maxBubbles) addBubble(); }
    }
    // Small Talk: each line is answered by itself after a moment.
    for (i = T.bubbles.length - 1; i >= 0; i--) {
      if (T.bubbles[i].auto == null) continue;
      T.bubbles[i].auto -= dt;
      if (T.bubbles[i].auto <= 0) dropBubble(T.bubbles[i].id);
    }
  }

  function endDay() {
    // A flawless day (owner 2026-11-12): no walk-outs, family fed, nothing burnt.
    T.dark = 0;
    if (!T.slips && T.served) {
      var cb = D.clean.bonus[Math.min(G.day, D.clean.bonus.length - 1)];
      T.clean = cb; T.tips += cb; G.tips += cb; G.earned += cb;
      award('flawless', true);
    }
    if (T.clean) sfx.flawless(); else sfx.close();
    G.slips[G.day] = T.slips;
    G.lastTrouble = G.trouble;
    G.perDay[G.day] = T.tips;
    (G.log = G.log || [])[G.day] = [T.tips, T.served, T.walk];
    var gaps = T.gaps.slice().sort(function (a, b) { return a - b; });
    bank();
    report('day', { day: G.day, tips: T.tips, plates: T.served, walk: T.walk, secs: Math.round(T.played), away: Math.round(T.away),
      taps: T.taps, gmin: gaps.length ? gaps[0] : '', gmed: gaps.length ? gaps[Math.floor(gaps.length / 2)] : '', u: T.untrusted,
      slips: T.slips, trouble: T.trouble ? T.trouble.id : '' });
    save.seen = true; persist();
    clearBubbles();
    if (G.day >= D.days.length - 1) { startCatering(); if (T.clean) setTimeout(function () { if (T) toast('Flawless day · ' + money(T.clean)); }, 2100); } else showClose();
  }

  /* How long a week took is the time it was played: the shifts, with pauses
     and the screens between left out (`away` is the paused part, sent beside
     it). Each shift's seconds are added to the week's as it ends. */
  function bank() {
    if (!T || !G) return;
    G.played += T.played - T.banked; G.away += T.away - T.awayBanked;
    T.banked = T.played; T.awayBanked = T.away;
  }

  /* ---------- Friday's catering order ---------- */
  function startCatering() {
    var c = D.catering, queue = shuffle(c.platters).slice(0, 5);
    T.ended = false; T.closing = true; T.endIn = null; T.phase = 'catering'; T.bins = 'lunch';
    T.plate = []; T.spare = []; T.fam = null; T.familyAt = null;
    T.cat = { left: c.seconds + BANNER_S, total: c.seconds + BANNER_S, queue: queue, n: queue.length, done: 0 };
    T.tipsBefore = T.tips;
    for (var i = 0; i < TU.rail && T.cat.queue.length; i++) T.tickets.push(makeTicket(T.cat.queue.shift(), { catering: true }));
    dirtyAll();
    banner('Catering order', plural(T.cat.n, 'platter', 'platters') + ', one clock.');
  }
  function cateringDone() {
    var bonus = D.catering.bonus + Math.floor(T.cat.left / 4);
    T.tips += bonus; G.tips += bonus; G.earned += bonus;
    T.ended = true;
    G.cater = T.tips - T.tipsBefore;
    setTimeout(function () { weekOver(true, 'win'); }, 900);
  }

  /* ---------- 5. family at the counter ----------
     They eat free and they talk. Each line sits on top of the kitchen until
     it's tapped, which is the whole problem. Words only, never a face. */
  function familyArrives() {
    T.familyAt = null;
    var pool = D.recipes.filter(function (r) { return r.when === 'lunch' && r.tier <= 2 && r.parts.length > 1; });
    var who = pick(D.family.who);
    var t = makeTicket(pick(pool), { family: true, who: who });
    T.tickets.push(t);
    T.fam = { who: who, say: 1.2 };
    dirty.rail = true;       // no banner, no warning: they just turn up (owner 2026-11-11)
    sfx.talk();
  }
  function addBubble() {
    var box = $('#ou-bubbles'), h = stage.offsetHeight, bw = 196, x, y, tries = 0, ok;
    do {
      x = 6 + rand() * (W - bw - 12); y = 172 + rand() * Math.max(40, h - 172 - 150); ok = true;
      for (var i = 0; i < T.bubbles.length; i++) if (Math.abs(T.bubbles[i].x - x) < 90 && Math.abs(T.bubbles[i].y - y) < 60) ok = false;
    } while (!ok && ++tries < 8);
    var used = T.bubbles.map(function (b) { return b.line; });
    var lines = D.family.lines.filter(function (l) { return used.indexOf(l) === -1; });
    var b = { id: ++uid, x: x, y: y, line: pick(lines.length ? lines : D.family.lines), auto: has('smalltalk') ? 1.3 : null };
    T.bubbles.push(b);
    var el = document.createElement('button');
    el.className = 'ou-bubble'; el.setAttribute('data-act', 'bubble'); el.setAttribute('data-id', b.id);
    el.style.left = Math.round(x) + 'px'; el.style.top = Math.round(y) + 'px';
    el.innerHTML = '<span class="ou-label">' + esc(T.fam.who) + '</span><b>' + esc(b.line) + '</b><small>' + (b.auto == null ? 'Tap to answer' : esc(pick(D.family.replies))) + '</small>';
    if (b.auto != null) el.className += ' is-answered';
    box.appendChild(el); sfx.talk();
  }
  function dropBubble(id) {
    for (var i = 0; i < T.bubbles.length; i++) if (String(T.bubbles[i].id) === String(id)) T.bubbles.splice(i, 1);
    var el = stage.querySelector('.ou-bubble[data-id="' + id + '"]'); if (el) el.remove();
  }
  function tapBubble(id) { dropBubble(id); toast(pick(D.family.replies)); sfx.tap(); }
  function clearBubbles() { if (T) T.bubbles = []; $('#ou-bubbles').innerHTML = ''; }
  function familyGone() { T.fam = null; clearBubbles(); }
  function familyFed(t) {
    var who = t.who; familyGone();
    if (++G.fed >= 3) award('family');
    var gift = rand() * 100 < D.family.cookieChance;
    if (gift) { T.cookies++; dirty.pass = true; }
    if (T.cups < TU.cups) { T.cups++; dirty.hud = true; toast(who + ' poured you a coffee' + (gift ? ' and left a cookie' : '')); }
    else { T.tips += D.family.leave; G.tips += D.family.leave; G.earned += D.family.leave; dirty.hud = true; popTips(); toast(who + ' left ' + money(D.family.leave) + ' on the counter' + (gift ? ' and a cookie' : '')); }
  }

  function eatCookie() {
    if (!T.cookies || !T.tickets.length) { if (T.cookies) toast('Save it for a full rail'); return; }
    T.cookies--; dirty.pass = true;
    T.tickets.forEach(function (t) { if (!t.catering) { t.left = t.total; t.late = false; } });
    if (T.cat) T.cat.left = Math.min(T.cat.total, T.cat.left + 15);
    dirty.rail = true;
    toast(T.cat ? 'Cookies for the crew: 15 more seconds' : 'Cookies for the line: every clock starts over');
    sfx.buy();
  }

  /* ---------- 6. drawing the kitchen ---------- */
  var dirty = {};
  function dirtyAll() { dirty = { hud: true, rail: true, grill: true, plate: true, bins: true, pass: true }; }

  function binOpen(part) {
    if (part === 'roll') return has('rollcase') && T.bins === 'breakfast';
    if (D.bins.lunchOnly.indexOf(part) !== -1 && T.bins !== 'lunch') return false;
    if (part === 'special' && T.cat) return false;
    if (T.noShow === part && T.bins === 'breakfast' && trouble('noshow')) return false;
    return true;
  }

  function drawHud() {
    $('#ou-day').textContent = T.cat ? 'Catering' : D.days[G.day].name;
    var cups = '';
    for (var i = 0; i < TU.cups; i++) cups += '<span' + (i < T.cups ? '' : ' class="is-spilled"') + '>' + spr(i < T.cups ? 'cup' : 'cup-spilled') + '</span>';
    var el = $('#ou-cups'); el.innerHTML = cups;
    el.setAttribute('aria-label', plural(T.cups, 'coffee', 'coffees') + ' left');
    $('#ou-tips').textContent = money(T.tips);
  }
  function popTips() { var el = $('#ou-tips'); el.classList.remove('is-pop'); void el.offsetWidth; el.classList.add('is-pop'); }

  function drawRail() {
    var rail = $('#ou-rail'), aim = aimTicket();
    stage.classList.toggle('is-dark', !!(T.dark > 0));
    if (!T.tickets.length) {
      rail.innerHTML = '<div class="ou-rail-empty">' + (T.closing ? 'The rail is clear.' : 'No tickets. Get ahead: start something cooking.') + '</div>';
      return;
    }
    rail.innerHTML = T.tickets.map(function (t) {
      var have = aim && aim.t === t ? aim.have : null, cls = 'ou-ticket', flag = '';
      if (t.age < 0.25) cls += ' is-new';
      if (t.togo) cls += ' is-togo';
      if (t.hurry) cls += ' is-hurry';
      if (t.late) cls += ' is-late';
      if (have) cls += ' is-aim';
      if (t.special) { cls += ' is-special'; flag = 'Special'; }
      if (t.usual) { cls += ' is-usual'; flag = 'x3'; }
      if (t.family) { cls += ' is-family'; flag = 'Free'; }
      var label = t.family ? esc(t.who.replace(/^Your /, '')) :t.catering ? 'Catering' : '#' + t.n + (t.late ? ' · Late' : t.hurry ? ' · Impatient' : t.togo ? ' · To go' : t.usual ? ' · The usual' : '');
      var parts = t.parts.map(function (p, i) { return '<span' + (have && have[i] ? ' class="is-have"' : '') + '>' + partSprite(p) + '</span>'; }).join('');
      return '<div class="' + cls + '" data-id="' + t.id + '"' + (flag ? ' data-flag="' + flag + '"' : '') + '>' +
        '<span class="ou-label">' + label + '</span><span class="ou-tname">' + esc(t.name) + '</span>' +
        '<span class="ou-parts" aria-label="' + esc(t.parts.map(function (p) { return D.parts[p].name; }).join(', ')) + '">' + parts + '</span>' +
        '<span class="ou-timer"><i></i></span></div>';
    }).join('');
    T.tickets.forEach(function (t) { t.bar = rail.querySelector('[data-id="' + t.id + '"] .ou-timer i'); });
  }

  function drawGrill() {
    var n = usable(), all = spots(), html = '', swipe = level().flip === 'swipe';
    for (var i = 0; i < all; i++) {
      if (i >= n) { html += '<div class="ou-spot is-broken" data-tag="Out today" aria-label="Broken: out today"></div>'; continue; }
      var it = T.grill[i], cold = trouble('cold') && i === T.coldAt ? ' is-cold' : '';
      if (!it) { html += '<div class="ou-spot' + cold + '"' + (cold ? ' data-tag="Cold spot"' : '') + '></div>'; continue; }
      var name = D.parts[it.part].name;
      var tag = it.state === 'done' ? 'Pull' : it.state === 'burnt' ? 'Burnt' : it.state === 'flip' ? (swipe ? 'Swipe' : 'Flip') : '';
      var says = it.state === 'raw' ? 'cooking' : it.state === 'flip' ? 'ready to flip' : it.state;
      var pale = it.state === 'flip' || (it.state === 'raw' && !it.flipped);      // the side that's up is still raw
      html += '<button class="ou-spot is-' + it.state + cold + (it.flipped ? ' is-turned' : '') + (it.flipNow ? ' is-flipping' : '') + '" data-act="spot" data-i="' + i + '"' +
        (tag ? ' data-tag="' + tag + '"' : '') + ' aria-label="' + name + ', ' + says + '">' +
        '<svg class="ou-ring" viewBox="0 0 64 64" aria-hidden="true"><circle class="ou-ring-bg" cx="32" cy="32" r="29"/><circle class="ou-ring-fg" cx="32" cy="32" r="29"/></svg>' +
        '<span class="ou-food ou-sh">' + partSprite(it.part, '', pale) + '</span>' +
        (it.state === 'burnt' ? '<svg class="ou-smoke" viewBox="0 0 30 16" aria-hidden="true"><path class="ou-steam" d="M5 15c-4-4 4-6 0-11M15 15c-4-4 4-6 0-11M25 15c-4-4 4-6 0-11" stroke="#C5CFD3" stroke-width="2.500" fill="none" stroke-linecap="round"/></svg>' : '') +
        '</button>';
      it.flipNow = false;
    }
    var el = $('#ou-griddle'); el.className = 'ou-griddle is-n' + all; el.innerHTML = html;
    for (var j = 0; j < n; j++) if (T.grill[j]) T.grill[j].fg = el.children[j].querySelector('.ou-ring-fg');
  }

  var LAYOUT = {
    1: [[50, 50]], 2: [[34, 50], [66, 50]], 3: [[50, 33], [32, 64], [68, 64]],
    4: [[33, 34], [67, 34], [33, 67], [67, 67]], 5: [[50, 50], [28, 30], [72, 30], [28, 71], [72, 71]]
  };
  function drawPlate() {
    var lay = LAYOUT[T.plate.length] || [];
    $('#ou-plate').innerHTML = spr('plate', 'ou-sh') + T.plate.map(function (p, i) {
      return '<button class="ou-pi' + (i === T.plateNew ? ' is-new' : '') + '" data-act="pi" data-i="' + i + '" style="left:' + lay[i][0] + '%;top:' + lay[i][1] + '%" aria-label="Take off ' + D.parts[p].name + '">' + partSprite(p) + '</button>';
    }).join('');
    T.plateNew = -1;
    var m = findMatch(), sendEl = $('#ou-send');
    sendEl.className = 'ou-send' + (m ? ' is-ready' : ' is-off');
    $('#ou-scrap').disabled = !T.plate.length;
    drawSpare();
    drawHint();
  }

  function drawSpare() {
    var el = $('#ou-spare'), on = !!has('spare');
    el.hidden = !on; if (!on) return;
    var n = T.spare.length, show = T.spare.slice(0, n > 3 ? 2 : 3);
    var lay = { 1: [[50, 50]], 2: [[34, 50], [66, 50]], 3: [[50, 32], [30, 64], [70, 64]] }[show.length] || [];
    el.innerHTML = spr('plate') + show.map(function (p, i) { return '<span style="left:' + lay[i][0] + '%;top:' + lay[i][1] + '%">' + partSprite(p) + '</span>'; }).join('') +
      (n > 3 ? '<em>+' + (n - 2) + '</em>' : '') + '<b>' + (n ? 'Swap' : T.plate.length ? 'Park' : 'Spare') + '</b>';
    el.className = 'ou-spare' + (n ? ' is-full' : '');
    el.setAttribute('aria-label', n ? 'Second plate: ' + T.spare.map(function (p) { return D.parts[p].name; }).join(', ') + '. Tap to swap the plates' : 'Second plate, empty. Tap to park this plate on it');
  }

  var hintHold = 0;
  function hintFlash(text) { var el = $('#ou-hint'); el.textContent = text; el.className = 'ou-hint is-bad'; hintHold = 1.1; }
  function drawHint() {
    if (hintHold > 0) return;
    var el = $('#ou-hint'), text = '', bad = false, m = T.plate.length ? findMatch() : null;
    var coach = !save.seen && G.day === 0 && !T.cat;
    if (T.plate.length) {
      if (m) text = coach ? 'That’s a ticket. Tap Send.' : 'Ready: ' + m.t.name;
      else { var aim = aimTicket(); if (aim) text = 'For ' + aim.t.name; else { text = 'Not on a ticket. Tap food to take it off.'; bad = true; } }
    } else if (coach) {
      var doneOne = T.grill.some(function (x) { return x && x.state === 'done'; }), rawOne = T.grill.some(function (x) { return x && x.state === 'raw'; });
      var flipOne = T.grill.some(function (x) { return x && x.state === 'flip'; });
      text = flipOne ? (level().flip === 'swipe' ? 'Swipe across it to flip it.' : 'Half way. Tap it to flip it.') : doneOne ? 'Done. Tap it to plate it.' : rawOne ? 'Cooking. Wait for the ring.' : T.tickets.length ? 'Tap the bins a ticket shows.' : 'Tickets land up top.';
    } else if (T.cat) {
      text = plural(T.cat.n - T.cat.done, 'platter', 'platters') + ' to go';
    }
    el.textContent = text; el.className = 'ou-hint' + (bad ? ' is-bad' : '');
  }

  function drawBins() {
    var full = !T.grill.slice(0, usable()).some(function (x) { return !x; });
    $('#ou-bins').innerHTML = D.bins[T.bins].map(function (part) {
      var p = D.parts[part];
      if (part === 'roll' && !binOpen(part)) return '<span></span>';
      var open = binOpen(part), cls = 'ou-bin' + (p.cook ? ' is-cook' : '') + (open ? '' : ' is-off') + (open && p.cook && full ? ' is-full' : '');
      return '<button class="' + cls + '" data-act="bin" data-part="' + part + '"' + (open ? '' : ' aria-disabled="true"') + '>' + partSprite(part, 'ou-sh') + '<span class="ou-label">' + p.name + '</span></button>';
    }).join('');
  }

  function drawPass() {
    $('#ou-phase').textContent = T.cat ? 'Catering' : T.closing ? 'Last call' : T.bins === 'lunch' ? 'Lunch' : T.phase === 'lunch' ? 'Last breakfast' : 'Breakfast';
    var html = '';
    if (has('counter')) html += '<span title="Counter Help">' + spr('apron') + '</span>';
    if (has('linecook')) html += '<span title="Line Cook">' + spr('hat') + '<span class="ou-meter"><i id="ou-line"></i></span></span>';
    if (T.cookies > 0) html += '<button class="ou-cookie" data-act="cookie" aria-label="Cookie: start every ticket’s clock over. ' + T.cookies + ' left">' + spr('cookie') + '<b>' + T.cookies + '</b></button>';
    $('#ou-crew').innerHTML = html;
    T.lineEl = stage.querySelector('#ou-line');
  }

  /* The strip of sky in the window: dawn at 6am, gold by 8, blue by 11. */
  var SKY = [
    [360, '#9C8BC4', '#F4A9B8', '#F8BE8A'], [480, '#F4A9B8', '#F8BE8A', '#F7D88C'],
    [660, '#9FD3E3', '#BFE2EC', '#F7E6B8'], [780, '#7EC4DA', '#A9DCEA', '#D4EEF4'], [840, '#7EC4DA', '#A9DCEA', '#D4EEF4']
  ];
  function mix(a, b, f) {
    var out = '#';
    for (var i = 1; i < 7; i += 2) { var x = parseInt(a.substr(i, 2), 16), y = parseInt(b.substr(i, 2), 16), v = Math.round(x + (y - x) * f).toString(16); out += v.length < 2 ? '0' + v : v; }
    return out;
  }
  function drawSky(min) {
    var pass = $('#ou-pass');
    if (T.cat) { pass.style.setProperty('--sky1', '#6E5E9E'); pass.style.setProperty('--sky2', '#E88FA0'); pass.style.setProperty('--sky3', '#F59E5E'); pass.style.setProperty('--sun-y', '40px'); return; }
    var i = 0; while (i < SKY.length - 2 && min > SKY[i + 1][0]) i++;
    var a = SKY[i], b = SKY[i + 1], f = Math.max(0, Math.min(1, (min - a[0]) / (b[0] - a[0])));
    for (var k = 1; k <= 3; k++) pass.style.setProperty('--sky' + k, mix(a[k], b[k], f));
    var day = (min - 360) / 480;
    pass.style.setProperty('--sun-x', (8 + day * 80) + '%');
    pass.style.setProperty('--sun-y', (22 - Math.sin(Math.min(1, day * 1.15) * Math.PI) * 20) + 'px');
  }

  function draw(dt) {
    if (hintHold > 0) { hintHold -= dt; if (hintHold <= 0) { hintHold = 0; drawHint(); } }
    // late flags flip here so a ticket shakes once, when it turns
    T.tickets.forEach(function (t) {
      if (t.catering) return;
      var late = t.left / t.total < TU.lateAt;
      if (late !== t.late) { t.late = late; dirty.rail = true; }
    });
    if (dirty.hud) drawHud();
    if (dirty.rail) { drawRail(); if (!dirty.plate) drawPlate(); }
    if (dirty.grill) drawGrill();
    if (dirty.plate) drawPlate();
    if (dirty.bins) drawBins();
    if (dirty.pass) drawPass();
    dirty = {};

    // the cheap, every-frame parts
    var i, t;
    for (i = 0; i < T.tickets.length; i++) {
      t = T.tickets[i]; if (!t.bar) continue;
      var f = t.catering ? T.cat.left / T.cat.total : t.left / t.total;
      t.bar.style.transform = 'scaleX(' + Math.max(0, Math.min(1, f)).toFixed(3) + ')';
    }
    var burnAfter = burnSecs(), gold = has('goldspat');
    for (i = 0; i < T.grill.length; i++) {
      var it = T.grill[i]; if (!it || !it.fg || it.state === 'burnt') continue;
      var cook = cookTime(it.part, i);
      var left = it.state === 'raw' ? 1 - it.t / cook : gold ? 0 : it.state === 'flip' ? it.wait / burnAfter : (it.t - cook) / burnAfter;
      it.fg.style.strokeDashoffset = (182.2 * Math.max(0, Math.min(1, left))).toFixed(1);
    }
    if (T.lineEl) T.lineEl.style.transform = 'scaleX(' + Math.min(1, T.lineT / LINE_S).toFixed(3) + ')';

    var clock;
    if (T.cat) { var s = Math.max(0, Math.ceil(T.cat.left)); clock = Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60); }
    else clock = clockText(minutesNow());
    if (clock !== T.lastClock) { T.lastClock = clock; $('#ou-clock').textContent = clock; drawSky(T.cat ? 0 : minutesNow()); }
  }

  var toastTimer = 0, bannerTimer = 0, BANNER_S = 2;     // seconds a banner stays over the rail
  function toast(text) {
    var el = $('#ou-toast'); el.textContent = text; el.classList.add('is-on');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.classList.remove('is-on'); }, 1700);
  }
  function banner(title, sub) {
    var el = $('#ou-banner'); el.innerHTML = '<b>' + esc(title) + '</b><span>' + esc(sub || '') + '</span>';
    el.classList.remove('is-on'); void el.offsetWidth; el.classList.add('is-on');
    clearTimeout(bannerTimer); bannerTimer = setTimeout(function () { el.classList.remove('is-on'); }, BANNER_S * 1000);
  }

  /* ---------- 7. the paper screens ---------- */
  function show(name) {
    screen = name;
    var all = stage.querySelectorAll('.ou-scr');
    for (var i = 0; i < all.length; i++) all[i].hidden = all[i].getAttribute('data-scr') !== name;
    var pad = stage.querySelector('[data-scr="' + name + '"] .ou-body-pad'); if (pad) pad.scrollTop = 0;
  }
  /* A paper screen is a band on top, a middle that scrolls (.ou-body-pad) and,
     where there is a way on or a way back, a foot that stays put (.ou-foot):
     nobody should have to scroll to find the button (owner 2026-11-11). */
  function paper(name, html) { stage.querySelector('[data-scr="' + name + '"]').innerHTML = html; show(name); }

  /* The Recipe Box and How to play are looked at and left. The phone's own
     back button, the browser's, Backspace and Escape all leave them the same
     way the Back button does, instead of leaving the game. */
  var backTo = 'title', pushed = false;
  function openOverlay(from) {
    backTo = from || 'title';
    if (pushed) return;
    try { history.pushState({ ou: 1 }, ''); pushed = true; } catch (e) { /* no history here: the buttons still work */ }
  }
  function leaveOverlay() { show(backTo); drawTitle(); }
  function closeOverlay() { if (pushed) history.back(); else leaveOverlay(); }
  window.addEventListener('popstate', function () {
    pushed = false;
    if (screen === 'box' || screen === 'how' || screen === 'settings' || screen === 'ach' || screen === 'past') leaveOverlay();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' && e.key !== 'Backspace') return;
    if (screen === 'box' || screen === 'how' || screen === 'settings' || screen === 'ach' || screen === 'past') { e.preventDefault(); closeOverlay(); }
    else if (e.key === 'Escape' && screen === 'shift' && T) setPaused(!T.paused);
  });

  /* What's owned, as small buttons: tap one to see its name and what it
     does, for when the player forgets (owner 2026-11-12). */
  function ownedRow() {
    var ids = Object.keys(G.items); if (!ids.length) return '';
    return '<div class="ou-own"><span class="ou-label">On your line · tap one to see what it does</span><div class="ou-own-row">' + D.items.filter(function (it) { return G.items[it.id]; }).map(function (it) {
      return '<button class="is-' + it.rarity + '" data-act="owninfo" data-id="' + it.id + '" data-n="' + G.items[it.id] + '" aria-label="' + esc(it.name) + ': what it does">' + spr(it.icon) + (G.items[it.id] > 1 ? '<em>' + G.items[it.id] + '</em>' : '') + '</button>';
    }).join('') + '</div><p class="ou-own-info" role="status" hidden></p></div>';
  }
  function ownInfo(el) {
    var box = el.closest('.ou-own'), info = box && box.querySelector('.ou-own-info'), id = el.getAttribute('data-id');
    // The count rides on the button: at the end of the week the week (G) is already gone.
    var it = D.items.filter(function (x) { return x.id === id; })[0], n = Number(el.getAttribute('data-n')) || 1; if (!info || !it) return;
    var again = el.classList.contains('is-picked');
    var all = box.querySelectorAll('.is-picked'); for (var i = 0; i < all.length; i++) all[i].classList.remove('is-picked');
    if (again) { info.hidden = true; return; }
    el.classList.add('is-picked');
    info.innerHTML = '<b>' + esc(it.name) + '</b> <span>' + D.rarityNames[it.rarity] + (n > 1 ? ' · you have ' + n : '') + '</span><br>' + itemText(it, n);
    info.hidden = false;
  }

  function troubleCard() {
    var tr = troubleOf(G.trouble); if (!tr) return '';
    return '<div class="ou-trouble" role="note">' + spr(tr.icon) + '<span><span class="ou-label">Trouble today</span><b>' + esc(tr.name) + '</b>' + esc(troubleText(tr, G.troublePart)) + '</span></div>';
  }
  function showDawn() {
    var day = D.days[G.day], friday = G.day === D.days.length - 1;
    if (G.troubleDay !== G.day) { G.trouble = dealTrouble(); G.troubleDay = G.day; }
    keepRun();
    G.offers = shuffle(D.specials).slice(0, 3);
    paper('dawn',
      '<div class="ou-top ou-top--dawn ou-top--back"><button class="ou-topback" data-act="home">Back</button><span class="ou-kicker">Today’s special</span><h2 class="ou-h">' + day.name + ', 6am</h2><span class="ou-label">Pick the plate for lunch</span></div>' +
      '<div class="ou-body-pad">' + troubleCard() + G.offers.map(function (s, i) {
        return '<button class="ou-card ou-card--special" data-act="special" data-i="' + i + '">' +
          '<span class="ou-ci">' + (s.photo ? '<img src="' + esc(s.photo) + '" alt="" loading="lazy">' : spr('special')) + '</span>' +
          '<span><b>' + esc(s.name) + '</b><span class="ou-ct">' + esc(s.sides.join(', ')) + '</span>' +
          '<span class="ou-chip">' + (s.sides.length > 1 ? 'Two sides · tips more' : 'One side · quicker') + '</span></span><span></span></button>';
      }).join('') +
      '<p class="ou-note">It goes on at 11am. ' + (friday ? 'Friday ends with a catering order: five platters on one clock.' : 'Three walk-outs in a day and the week is over.') + '</p>' +
      ownedRow() + '</div>');
  }

  /* Deal `n` different items by rarity. A rarity with nothing left falls back. */
  /* An item no one has earned yet (game.json, achievements: unlocks). */
  function locked(id) { return D.achievements.some(function (a) { return a.unlocks === id && !save.ach[a.id]; }); }
  function achOf(id) { return D.achievements.filter(function (a) { return a.id === id; })[0]; }
  function itemName(id) { var it = D.items.filter(function (x) { return x.id === id; })[0]; return it ? it.name : id; }
  /* Earned once, kept on the phone. `quiet` for the end of a day or week,
     where the screen says it instead of a toast. */
  function award(id, quiet) {
    var a = achOf(id); if (!a || save.ach[id]) return;
    save.ach[id] = Date.now(); persist();
    if (G) G.newAch.push(id);
    if (!quiet) { toast('Achievement: ' + a.name); sfx.achieve(); }
  }
  /* An achievement wears the drawing of the item it opens up, in that
     item's rarity, with a gleam across it once earned (owner 2026-11-13);
     one that opens nothing has an `icon` of its own in game.json. */
  function achIcon(a) {
    var it = a.unlocks && D.items.filter(function (x) { return x.id === a.unlocks; })[0];
    return '<span class="ou-ach-i is-' + (it ? it.rarity : 'gold') + '">' + spr((it && it.icon) || a.icon || 'bell') + '</span>';
  }
  function achList(ids) {
    return '<div class="ou-achs">' + ids.map(function (id) {
      var a = achOf(id), got = !!save.ach[id];
      return '<div class="ou-ach' + (got ? ' is-got' : '') + '">' + achIcon(a) + '<span><b>' + esc(a.name) + '</b>' + esc(a.text) +
        (a.unlocks ? '<small>' + (got ? 'Unlocked: ' : 'Unlocks ') + esc(itemName(a.unlocks)) + '</small>' : '') + '</span></div>';
    }).join('') + '</div>';
  }
  function showAch(from) {
    var all = D.achievements.map(function (a) { return a.id; }), n = all.filter(function (id) { return save.ach[id]; }).length;
    paper('ach',
      '<div class="ou-top ou-top--back"><span class="ou-kicker">Achievements</span><h2 class="ou-h">' + n + ' of ' + all.length + '</h2><span class="ou-label">Some open up new items</span>' +
      '<button class="ou-topback" data-act="back">Back</button></div>' +
      '<div class="ou-body-pad">' + achList(all) + '<p class="ou-fine">Kept on this phone. Settings can reset them.</p></div>' +
      '<div class="ou-foot"><button class="ou-btn" data-act="back">Back</button></div>');
    openOverlay(from);
  }
  /* Late in the week the items that only earn turn up less (owner
     2026-11-13: by then the player is after getting through). */
  function weighted(pool, shop) {
    var late = shop && G.day >= D.lateShop.fromDay, w = pool.map(function (it) { return late && it.kind === 'tips' ? D.lateShop.tips : 1; });
    var sum = w.reduce(function (a, b) { return a + b; }, 0), x = rand() * sum;
    for (var i = 0; i < pool.length; i++) { x -= w[i]; if (x <= 0) return pool[i]; }
    return pool[pool.length - 1];
  }
  function deal(n, not, shop) {
    var odds = D.odds[Math.min(G.day, D.odds.length - 1)], out = [];
    var falls = { epic: ['epic', 'rare', 'normal'], rare: ['rare', 'normal', 'epic'], normal: ['normal', 'rare', 'epic'] };
    for (var k = 0; k < n; k++) {
      var roll = rand() * 100, rar = roll < odds.epic ? 'epic' : roll < odds.epic + odds.rare ? 'rare' : 'normal', got = null;
      for (var f = 0; f < 3 && !got; f++) {
        var pool = D.items.filter(function (it) { return it.rarity === falls[rar][f] && has(it.id) < (it.max || 1) && out.indexOf(it) === -1 && not.indexOf(it.id) === -1 && !(it.id === 'spatula' && level().flip === 'none') && !(it.id === 'smalltalk' && !level().family) && !(it.id === 'horseshoe' && !level().trouble) && !locked(it.id); });
        if (pool.length) got = weighted(pool, shop);
      }
      if (got) out.push(got);
    }
    return out;
  }
  /* An item's number, for k of it owned (game.json: per, base, unit), and its
     text with that number highlighted (owner 2026-11-12: "20%", and more
     with each one). */
  function itemPer(id) { var it = D.items.filter(function (x) { return x.id === id; })[0]; return it ? it.per : 0; }
  function numText(it, k) {
    var n = (it.base || 0) + it.per * k;
    return it.unit === '%' ? n + '%' : it.unit === '$' ? money(n) : it.unit === 's' ? plural(n, 'second', 'seconds')
      : it.unit === 'times' ? (n === 1 ? 'Once' : n === 2 ? 'Twice' : n + ' times') : String(n);
  }
  function itemText(it, k) {
    if (it.per == null || it.text.indexOf('{n}') === -1) return esc(it.text);
    var bits = it.text.split('{n}');
    return esc(bits[0]) + '<b class="ou-num">' + esc(numText(it, k)) + '</b>' + esc(bits.slice(1).join(''));
  }
  function itemCard(it, act, i, extra) {
    var pips = '<i></i>'.repeat({ normal: 1, rare: 2, epic: 3, legendary: 4 }[it.rarity] || 1);
    return '<button class="ou-card is-' + it.rarity + (extra.cls || '') + '" data-act="' + act + '" data-i="' + i + '">' +
      '<span class="ou-rar">' + pips + D.rarityNames[it.rarity] + '</span>' +
      '<span class="ou-ci ou-sh">' + spr(it.icon) + '</span>' +
      '<span><b>' + esc(it.name) + '</b><span class="ou-ct">' + itemText(it, has(it.id) + (extra.sold ? 0 : 1)) + '</span>' +
      (has(it.id) ? '<span class="ou-own">You have ' + has(it.id) + (it.per != null && !extra.sold ? ' · now ' + numText(it, has(it.id)).toLowerCase() : '') + '</span>' : '') + '</span>' +
      (extra.price ? '<span class="ou-price' + (extra.was ? ' is-sale' : '') + '">' + (extra.was ? '<s>' + extra.was + '</s>' : '') + extra.price + '</span>' : '<span></span>') + '</button>';
  }

  function showClose() {
    // What was earned since the last close (all of the week's are listed again at the end).
    G.tonightAch = G.newAch.slice(G.achShown || 0); G.achShown = G.newAch.length;
    G.stage = 'pick'; G.pick = deal(3, [], false); G.shop = []; G.sold = []; G.reroll = D.reroll.first; G.sale = false;
    drawClose();
  }
  /* What turning down the free item pays tonight (owner 2026-11-12): more
     later in the week, when an item has fewer days left to pay off. */
  function skipBonus() { var b = D.skip.bonus; return b[Math.min(G.day, b.length - 1)]; }
  /* From the shop to the shop's stock. A week that has bought nothing by
     Wednesday's close may find the shop on sale (owner 2026-11-12: by
     Thursday an item has little time left to pay for itself). Decided once
     a close, kept through a restock. */
  function toShop() {
    G.stage = 'shop'; G.shop = deal(3, [], true); G.fryer = rand() * 100 < (D.legendaryChance || 0);
    G.sale = G.day >= D.sale.fromDay && !G.bought && rand() * 100 < D.sale.chance;
    drawClose();
  }
  /* The shop's price tonight: the careful week's sale, or Thursday's half
     price (owner 2026-11-13: an item bought then has only Friday left), the
     bigger of the two. Never the Deep Fryer. */
  function offTonight() { return Math.max(G.sale ? D.sale.off : 0, G.day === D.lastShop.day ? D.lastShop.off : 0); }
  function priceOf(it) {
    var off = offTonight();
    if (!off || it.rarity === 'legendary') return it.price;
    return Math.max(5, Math.round(it.price * (100 - off) / 500) * 5);
  }
  function drawClose() {
    var day = D.days[G.day], next = D.days[G.day + 1], body, foot = '';
    if (G.stage === 'pick') {
      body = (T.clean ? '<p class="ou-clean"><b>Flawless day: +' + money(T.clean) + '.</b> No walk-outs, nothing burnt.</p>' : '') +
        (G.tonightAch.length ? '<span class="ou-label">New achievements</span>' + achList(G.tonightAch) : '') +
        '<span class="ou-label">Pick one, free</span>' + G.pick.map(function (it, i) { return itemCard(it, 'pick', i, {}); }).join('');
      foot = '<div class="ou-foot"><button class="ou-btn ou-btn--quiet" data-act="skip">None tonight · ' + money(skipBonus()) + ' in tips instead</button></div>';
    } else {
      // Restock sits beside the shop's name, so the foot is one big button (owner 2026-11-13).
      body = '<div class="ou-shophead"><span class="ou-label">The shop</span>' +
        '<button class="ou-restock" data-act="reroll"' + (G.tips < G.reroll ? ' disabled' : '') + ' aria-label="Restock the shop for ' + money(G.reroll) + '">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        money(G.reroll) + '</button></div>' +
        (G.sale && offTonight() === D.sale.off ? '<p class="ou-sale"><b>' + D.sale.off + '% off tonight.</b> You haven’t bought a thing all week, so the supplier cut you a deal.</p>'
          : G.day === D.lastShop.day ? '<p class="ou-sale"><b>Half price tonight.</b> One day left: everything’s ' + D.lastShop.off + '% off.</p>' : '') +
        G.shop.map(function (it, i) {
        var sold = G.sold.indexOf(i) !== -1, cost = priceOf(it), poor = !sold && G.tips < cost;
        return itemCard(it, 'buy', i, { sold: sold, price: sold ? 'Yours' : money(cost), was: !sold && cost !== it.price ? money(it.price) : '', cls: sold ? ' is-sold' : poor ? ' is-poor' : '' });
      }).join('') +
        // The one thing that is never for sale: there is no fryer (see /feedback).
        (G.fryer && fryerItem() && !has('fryer') ? itemCard(fryerItem(), 'fryer', 0, { price: money(fryerItem().price), cls: G.tips < fryerItem().price ? ' is-poor' : '' }) : '') +
        '';
      foot = '<div class="ou-foot"><button class="ou-btn" data-act="next">Open ' + next.name + '</button></div>';
    }
    paper('close',
      '<div class="ou-top ou-top--wallet"><span class="ou-kicker">' + day.name + ' results</span><h2 class="ou-h">' + money(T.tips) + ' in tips</h2>' +
      '<span class="ou-label">' + plural(T.served, 'plate', 'plates') + ' · ' + plural(T.walk, 'walk-out', 'walk-outs') + '</span>' +
      '<div class="ou-wallet"><span class="ou-label">To spend</span><b>' + money(G.tips) + '</b></div></div>' +
      '<div class="ou-body-pad">' + body + ownedRow() + '</div>' + foot);
  }
  /* Tips in the game are points (owner 2026-11-12): said on How to play and
     under every finished week, so nobody reads them as the café's money. */
  var TIPS_NOTE = 'Tips in the game are points, not money. At The Café, real tips go to the cooks and the people who work there.';
  /* The week day by day: [tips, plates, walk-outs] for each day played. */
  function weekDays() {
    var out = [];
    for (var d = 0; d <= G.day; d++) {
      var l = (G.log && G.log[d]) || null;
      out.push(l ? l : [G.perDay[d] == null ? (T && d === G.day ? T.tips : 0) : G.perDay[d], d === G.day && T ? T.served : '', d === G.day && T ? T.walk : '']);
    }
    return out;
  }
  function own(it) { G.items[it.id] = (G.items[it.id] || 0) + 1; }
  /* The Deep Fryer (Legendary, owner 2026-11-12): a real item with real
     stats, priced past anything a week pays. It's never dealt by the odds;
     it turns up by itself in about one shop in three. */
  function fryerItem() { return D.items.filter(function (it) { return it.id === 'fryer'; })[0]; }

  /* A day's rarity by its slips (game.json, ranks). */
  function rankOf(slips) {
    if (slips == null) return null;
    return D.ranks.filter(function (x) { return slips <= x.max; })[0] || D.ranks[D.ranks.length - 1];
  }
  /* What a day's row says: "Flawless", or "Epic · 1 slip". */
  function rankWords(slips) {
    var r = rankOf(slips); if (!r) return '';
    return r.name || D.rarityNames[r.rarity] + ' · ' + plural(slips, 'slip', 'slips');
  }
  /* The day a week was lost or ended on is never ranked, however clean it
     was until then (owner 2026-11-13: failing or closing early is never
     Flawless). Its row says what happened instead. */
  function cutShort(p, i) { return i === p.d && p.w !== 'win'; }
  function stopWords(p) { return p.w === 'quit' ? 'Closed early' : p.w === 'late' ? 'Catering late' : 'Three coffees down'; }
  /* The week's days as rows, each in its day's rarity colour (owner
     2026-11-13: the whole row, not a tag in it, so a row stays one line).
     `p` is a kept week (keepWeek). */
  function dayRows(p) {
    var rows = p.t.map(function (tips, i) {
      var cut = cutShort(p, i), r = cut ? null : rankOf(p.s[i]);
      return '<div' + (r ? ' class="is-' + r.rarity + '"' : '') + '><b>' + D.days[i].short + '</b><span>' + (cut ? stopWords(p) : rankWords(p.s[i])) + '</span><strong>' + money(tips) + '</strong></div>';
    }).join('');
    if (p.f !== '') rows += '<div><b>Fri</b><span>Catering' + (p.w === 'win' ? ', on time' : p.w === 'late' ? ', late' : ', not finished') + '</span><strong>' + money(p.f) + '</strong></div>';
    return rows;
  }
  /* The same, small, for Past weeks: a tile a day in its colour. */
  function dayStrip(p) {
    var cells = p.t.map(function (tips, i) {
      var r = cutShort(p, i) ? null : rankOf(p.s[i]);
      return '<span class="is-' + (r ? r.rarity : 'none') + '" aria-label="' + D.days[i].name + ': ' + money(tips) + ', ' + (r ? rankWords(p.s[i]) : stopWords(p)) + '"><b>' + D.days[i].short + '</b>' + money(tips) + '</span>';
    });
    if (p.f !== '') cells.push('<span class="is-cater" aria-label="Catering: ' + money(p.f) + '"><b>Cater</b>' + money(p.f) + '</span>');
    return '<div class="ou-strip">' + cells.join('') + '</div>';
  }
  /* A finished week, kept on the phone (owner 2026-11-13: to find a week's
     code again later): the last PAST_MAX, newest first. Short keys, as it
     rides in the save code too: c week code, l level, a when, k kept, w how
     it ended, d its last day, t tips and s slips each day, f the catering's
     tips ('' if it never came). */
  var PAST_MAX = 12;
  function keepWeek(kept, why) {
    var p = { c: weekCode(G.run), l: G.level, a: Date.now(), k: kept, w: why, d: G.day,
      t: G.perDay.slice(0, G.day + 1).map(function (x) { return x || 0; }), s: G.slips.slice(0, G.day + 1), f: G.cater == null ? '' : G.cater };
    save.past = [p].concat(save.past.filter(function (x) { return x.c !== p.c; })).slice(0, PAST_MAX);
    return p;
  }
  /* How the week ended: [kicker, heading], short enough for one line. */
  function weekHead(p) {
    var day = D.days[p.d] || D.days[0];
    return p.w === 'win' ? ['Week done', 'Catering out on time']
      : p.w === 'late' ? ['So close', 'Catering out late']
      : p.w === 'quit' ? ['Week ended · ' + day.name, 'Closed early']
      : ['Rough week · ' + day.name, 'Three coffees down'];
  }
  /* The week as text to share (owner 2026-11-13): a coloured square a day,
     the tips, and what it kept. Never the week code: that stays private. */
  var SQUARE = { legendary: '\uD83D\uDFE8', epic: '\uD83D\uDFEA', rare: '\uD83D\uDFE6', normal: '\u2B1C' };
  function weekText(p) {
    var lines = ['Order Up, ' + (D.levels[p.l] ? D.levels[p.l].name + ' week' : 'a week') + ': ' + weekHead(p)[1].toLowerCase()];
    p.t.forEach(function (tips, i) { var r = cutShort(p, i) ? null : rankOf(p.s[i]); lines.push((r ? SQUARE[r.rarity] + ' ' : '') + D.days[i].short + ' ' + money(tips) + (r ? ' · ' + rankWords(p.s[i]) : ' · ' + stopWords(p).toLowerCase())); });
    if (p.f !== '') lines.push('Catering ' + money(p.f));
    lines.push('Kept ' + money(p.k));
    lines.push('A little game on The Café’s website, Leavenworth KS' + (STATS.listed ? ': ' + location.origin + '/play' : ''));
    return lines.join('\n');
  }
  /* The week as a picture to share (owner 2026-11-13): the end screen's
     table, drawn on a canvas in the game's colours and type, 1080 wide.
     Drawn all at once, with no waiting, so the Share sheet still counts as
     the tap's (an iPhone refuses one that comes later). Never the code. */
  var INK = { dark: '#22323A', grey: '#4A5A62', teal: '#2C5E70', tealDark: '#1F4552', cream: '#FAF7F2', mint: '#8ED9D4', red: '#C0392F', line: '#C5CFD3', total: '#EDF1F1' };
  var ROWINK = {
    normal: { bg: '#F1F3F4', bar: '#B9C2C6', ink: '#4A5A62' }, rare: { bg: '#D9E6F6', bar: '#2E6DB4', ink: '#2E6DB4' },
    epic: { bg: '#E6D9F4', bar: '#6E3FA6', ink: '#6E3FA6' }, legendary: { bg: null, bar: '#B8860B', ink: '#6B4E0A' }
  };
  function weekPicture(p) {
    var rows = [];
    p.t.forEach(function (tips, i) {
      var r = cutShort(p, i) ? null : rankOf(p.s[i]);
      rows.push({ day: D.days[i].short, words: r ? rankWords(p.s[i]) : stopWords(p), tips: money(tips), rar: r ? r.rarity : '', caps: true });
    });
    if (p.f !== '') rows.push({ day: 'Fri', words: 'Catering' + (p.w === 'win' ? ', on time' : p.w === 'late' ? ', late' : ', not finished'), tips: money(p.f) });
    rows.push({ day: 'Kept', words: 'your score', tips: money(p.k), total: true });
    var W = 1080, top = 330, RH = 118, x0 = 60, x1 = W - 60, tableH = rows.length * RH, H = top + 50 + tableH + 190;
    var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    var c = cv.getContext('2d'), serif = '"Playfair Display", Georgia, serif', sans = 'Lato, "Helvetica Neue", Arial, sans-serif';
    var spaced = function (txt, x, y, gap, align) {      // letter-spaced capitals, as the game's labels are
      var w = 0, k; for (k = 0; k < txt.length; k++) w += c.measureText(txt[k]).width + gap;
      var at = align === 'center' ? x - (w - gap) / 2 : align === 'right' ? x - (w - gap) : x;
      c.textAlign = 'left'; for (k = 0; k < txt.length; k++) { c.fillText(txt[k], at, y); at += c.measureText(txt[k]).width + gap; }
    };
    var round = function (x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); };
    c.fillStyle = INK.cream; c.fillRect(0, 0, W, H);
    // The band on top, as on the end screen.
    var g = c.createLinearGradient(0, 0, W, top); g.addColorStop(0, INK.tealDark); g.addColorStop(.55, INK.teal); g.addColorStop(1, '#3C7183');
    c.fillStyle = g; c.fillRect(0, 0, W, top); c.fillStyle = INK.red; c.fillRect(0, top - 14, W, 14);
    var head = weekHead(p), when = new Date(p.a).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    c.textBaseline = 'alphabetic'; c.fillStyle = INK.cream;
    c.font = 'italic 400 54px ' + serif; c.textAlign = 'left'; c.fillText(head[0], x0, 104);
    c.font = '700 92px ' + serif; c.fillText(head[1], x0, 200);
    c.fillStyle = INK.mint; c.font = '700 30px ' + sans; spaced(((D.levels[p.l] ? D.levels[p.l].name + ' week · ' : '') + when).toUpperCase(), x0, 262, 4);
    // The table.
    var ty = top + 50;
    c.save(); round(x0, ty, x1 - x0, tableH, 30); c.clip();
    c.fillStyle = '#fff'; c.fillRect(x0, ty, x1 - x0, tableH);
    rows.forEach(function (r, i) {
      var y = ty + i * RH, ink = ROWINK[r.rar];
      if (r.total) { c.fillStyle = INK.total; c.fillRect(x0, y, x1 - x0, RH); }
      if (ink) {
        if (ink.bg) c.fillStyle = ink.bg;
        else { var gg = c.createLinearGradient(x0, y, x1, y + RH); gg.addColorStop(0, '#FFE9A0'); gg.addColorStop(.35, '#FFE07A'); gg.addColorStop(.7, '#F4C542'); gg.addColorStop(1, '#FFE58A'); c.fillStyle = gg; }
        c.fillRect(x0, y, x1 - x0, RH); c.fillStyle = ink.bar; c.fillRect(x0, y, 16, RH);
      }
      if (i) { c.fillStyle = INK.line; c.fillRect(x0, y, x1 - x0, 3); }
      var base = y + RH / 2 + 18;
      c.fillStyle = ink || r.total ? INK.dark : INK.red; c.font = '700 56px ' + serif; c.textAlign = 'left'; c.fillText(r.day, x0 + 44, base);
      if (r.caps) { c.fillStyle = ink ? ink.ink : INK.grey; c.font = '700 30px ' + sans; spaced(r.words.toUpperCase(), x0 + 230, base - 4, 4); }
      else { c.fillStyle = INK.dark; c.font = '400 36px ' + sans; c.fillText(r.words, x0 + 230, base - 2); }
      c.fillStyle = INK.dark; c.font = '900 ' + (r.total ? 60 : 50) + 'px ' + sans; c.textAlign = 'right'; c.fillText(r.tips, x1 - 36, base);
    });
    c.restore();
    c.strokeStyle = INK.tealDark; c.lineWidth = 6; round(x0, ty, x1 - x0, tableH, 30); c.stroke();
    // Whose game it is (game/README.md: name the café, with the town).
    c.textAlign = 'center'; c.fillStyle = INK.tealDark; c.font = '700 58px ' + serif; c.fillText('Order Up', W / 2, ty + tableH + 100);
    c.fillStyle = INK.grey; c.font = '400 32px ' + sans; c.fillText('A little game on The Café’s website · Leavenworth, KS', W / 2, ty + tableH + 150);
    return cv;
  }
  /* A canvas as a PNG file, made on the spot (toBlob would wait). */
  function pngFile(cv, name) {
    var bin = atob(cv.toDataURL('image/png').split(',')[1]), a = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    var blob = new Blob([a], { type: 'image/png' });
    try { return new File([blob], name, { type: 'image/png' }); } catch (e) { blob.name = name; return blob; }
  }
  /* Share hands the phone's Share sheet the picture and the text; where it
     can't take a picture, the text; with no Share sheet at all, the picture
     is saved and the text copied. */
  function shareWeek(p) {
    var text = weekText(p), file = null, name = 'order-up-week-' + new Date(p.a).toISOString().slice(0, 10) + '.png';
    try { file = pngFile(weekPicture(p), name); } catch (e) { file = null; }
    var copy = function (said) { try { navigator.clipboard.writeText(text).then(function () { toast(said || 'Copied: paste it anywhere'); }, function () { if (said) toast(said); }); } catch (e) { if (said) toast(said); } };
    var keep = function () {
      if (!file) { copy(); return; }
      var url = URL.createObjectURL(file), a = document.createElement('a');
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      copy('Picture saved');
    };
    var fail = function (e) { if (!e || e.name !== 'AbortError') keep(); };
    if (navigator.share && file && navigator.canShare && navigator.canShare({ files: [file] })) navigator.share({ files: [file], text: text, title: 'Order Up' }).catch(fail);
    else if (navigator.share) navigator.share({ title: 'Order Up', text: text }).catch(fail);
    else keep();
  }
  function shareButton(i) { return '<button class="ou-btn ou-btn--quiet ou-share" data-act="share" data-i="' + i + '">Share week</button>'; }
  function showPast(from) {
    var list = save.past;
    paper('past',
      '<div class="ou-top ou-top--back"><span class="ou-kicker">Past weeks</span><h2 class="ou-h">' + (list.length > 1 ? 'Your last ' + list.length + ' weeks' : list.length ? 'Your last week' : 'None yet') + '</h2>' +
      '<button class="ou-topback" data-act="back">Back</button></div>' +
      '<div class="ou-body-pad">' + (list.length ? list.map(function (p, i) {
        var head = weekHead(p), when = new Date(p.a).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
        return '<div class="ou-past"><div class="ou-past-head"><span><b>' + esc(head[1]) + '</b><small>' + esc((D.levels[p.l] ? D.levels[p.l].name + ' · ' : '') + when) + '</small></span><strong>' + money(p.k) + '</strong></div>' +
          dayStrip(p) +
          '<div class="ou-row ou-row--code">' + codeButton(p.c, '') + shareButton(i) + '</div></div>';
      }).join('') : '<p class="ou-note">Finish a week and it turns up here with its week code, so the code can be found again later.</p>') +
      '<p class="ou-fine">The last ' + PAST_MAX + ' weeks, kept on this phone. The save code in Settings carries them too.</p></div>' +
      '<div class="ou-foot"><button class="ou-btn" data-act="back">Back</button></div>');
    openOverlay(from);
  }
  function weekOver(win, why) {
    if (!G) return;
    clearBubbles();
    bank();
    // Finishing the week pays, by level (game.json, finish).
    G.finish = win ? (D.finish[G.level] || 0) : 0;
    if (G.finish) { G.tips += G.finish; G.earned += G.finish; }
    if (T && G.perDay[G.day] == null) G.perDay[G.day] = T.cat ? T.tipsBefore : T.tips;
    if (T && T.cat && G.cater == null) G.cater = T.tips - T.tipsBefore;
    // The week's score is what's left in the tip jar: tips earned less what
    // was spent on items. Items help a week through; a week that needs few
    // scores best.
    if (T && !T.cat && G.slips[G.day] == null) G.slips[G.day] = T.slips;
    if (win) {
      award('firstweek', true);
      if (G.level === 'normal') award('regular', true);
      if (G.level === 'hard') award('rush', true);
      if (!G.bought) award('frugal', true);
      if (G.slips.length >= D.days.length && G.slips.every(function (s) { return s === 0; })) award('perfect', true);
    }
    var kept = Math.max(0, G.tips), spent = Math.max(0, G.earned - G.tips);
    var lvName = level().name, best = kept > (save.keeps[G.level] || 0);
    if (best) { save.keeps[G.level] = kept; save.bestRuns[G.level] = G.run; }
    var past = keepWeek(kept, win ? 'win' : why);
    save.weeks++; if (win) save.wins++; save.best = Math.max(save.best, kept); save.seen = true; save.run = null; persist();
    if (win) sfx.win();
    report('end', { day: G.day, why: win ? 'win' : why, total: kept, earned: G.earned, secs: Math.round(G.played), away: Math.round(G.away),
      items: Object.keys(G.items), u: T ? T.untrusted : 0, taps: T ? T.taps : '', days: weekDays(), cater: G.cater == null ? '' : G.cater, spent: spent, bonus: G.bonus, finish: G.finish, ach: G.newAch.slice() });
    lastRun = { run: G.run, lvl: G.level, total: kept, earned: G.earned, spent: spent, bonus: G.bonus, finish: G.finish, days: weekDays(), cater: G.cater == null ? '' : G.cater,
      why: win ? 'win' : why, day: G.day, items: Object.keys(G.items), secs: Math.round(G.played) };
    // After a finished week (not one that was quit), and only if results go
    // anywhere: a first name, and a way to reach them if they want one.
    var sendIn = !STATS.url || why === 'quit' ? '' :
      '<form class="ou-sendin" id="ou-sendin" novalidate>' +
      '<span class="ou-label">Send in your score</span>' +
      '<p class="ou-note">Let The Café know how your week went. Only we see it.</p>' +
      '<label class="ou-field"><span>First name</span><input name="name" type="text" maxlength="24" autocomplete="given-name" autocapitalize="words"></label>' +
      (STATS.askContact ? '<label class="ou-field"><span>Email or phone, if you’d like to hear back</span><input name="contact" type="text" maxlength="80" autocomplete="email"></label>' : '') +
      '<label class="ou-field ou-field--web" aria-hidden="true"><span>Website</span><input name="website" type="text" tabindex="-1" autocomplete="off"></label>' +
      '<input name="total" type="hidden" value="' + kept + '">' +
      '<p class="ou-fine">Used only to get in touch about the game. Under 13? Ask a grown-up first. <a href="/privacy">Privacy</a></p>' +
      '<button class="ou-btn ou-btn--quiet" type="submit">Send it in</button></form>';
    // A heading that fits one line (owner 2026-11-13: a shorter band on top).
    var head = weekHead(past), rows = dayRows(past);
    if (G.finish) rows += '<div><b></b><span>The week finished</span><strong>+' + money(G.finish) + '</strong></div>';
    rows += '<div><b>Week</b><span>Tips earned</span><strong>' + money(G.earned) + '</strong></div>';
    if (G.bonus) rows += '<div><b></b><span>Free items turned down</span><strong>+' + money(G.bonus) + '</strong></div>';
    rows += '<div><b></b><span>Spent on items</span><strong>' + (spent ? '−' + money(spent) : '$0') + '</strong></div>';
    rows += '<div class="is-total"><b>Kept</b><span>your score</span><strong>' + money(kept) + '</strong></div>';
    paper('over',
      '<div class="ou-top' + (win ? ' ou-top--fri' : '') + '"><span class="ou-kicker">' + head[0] + '</span><h2 class="ou-h">' + head[1] + '</h2>' +
      '<span class="ou-label">' + (best ? 'A new best ' + lvName + ' week' : 'Best ' + lvName + ' week: ' + money(save.keeps[G.level] || 0) + ' kept') + '</span></div>' +
      '<div class="ou-body-pad"><div class="ou-week">' + rows + '</div>' +
      '<div class="ou-row ou-row--code">' + codeButton(G.run, '') + shareButton(0) + '</div>' +
      '<p class="ou-fine">The Café can look this week up by its code. Keep it to yourself: it’s hidden until you tap, and a screenshot or a share never shows it. Past weeks, on the title screen, keeps it for later.</p>' +
      '<p class="ou-fine">A day’s colour is its slips (walk-outs and burnt food): gold for none, purple for one, blue for two or three.</p>' +
      (G.newAch.length ? '<span class="ou-label">Achievements this week</span>' + achList(G.newAch) : '') +
      ownedRow() + sendIn +
      '<p class="ou-fine">' + TIPS_NOTE + '</p>' +
      '<div class="ou-row"><button class="ou-btn ou-btn--quiet" data-act="box">Recipe Box</button><a class="ou-btn ou-btn--quiet" href="/menu">The real menu</a></div>' +
      '</div><div class="ou-foot"><button class="ou-btn" data-act="home">Back to the title</button></div>');
    G = null; T = null;
  }

  function showBox(from) {
    var list = D.recipes.concat([D.rollRecipe]).map(function (r) { return { id: r.id, name: r.name, photo: r.photo, sprite: D.parts[r.parts[r.parts.length > 1 ? 1 : 0]].sprite }; })
      .concat(D.specials.map(function (s) { return { id: 'sp-' + s.id, name: s.name, photo: s.photo, sprite: 'special' }; }));
    var seen = list.filter(function (r) { return save.served[r.id]; }).length;
    paper('box',
      '<div class="ou-top ou-top--back"><span class="ou-kicker">Recipe Box</span><h2 class="ou-h">' + seen + ' of ' + list.length + ' served</h2><span class="ou-label">Serve one 10 times to see the real plate</span>' +
      '<button class="ou-topback" data-act="back">Back</button></div>' +
      '<div class="ou-body-pad"><div class="ou-grid">' + list.map(function (r) {
        var n = save.served[r.id] || 0, real = n >= 10 && r.photo;
        return '<div class="ou-rc' + (n ? '' : ' is-new') + '"><span class="ou-rp">' + (real ? '<img src="' + esc(r.photo) + '" alt="' + esc(r.name) + ' at The Café" loading="lazy">' : spr(r.sprite)) + '</span>' +
          '<div><b>' + esc(r.name) + '</b><span>' + (n ? 'Served ' + n + (n < 10 && r.photo ? ' of 10' : '') : 'Not served yet') + '</span></div></div>';
      }).join('') + '</div></div><div class="ou-foot"><button class="ou-btn" data-act="back">Back</button></div>');
    openOverlay(from);
  }

  function showHow(from) {
    var li = function (icon, html) { return '<li>' + spr(icon, 'ou-sh') + '<span>' + html + '</span></li>'; }, flip = level().flip;
    paper('how',
      '<div class="ou-top"><span class="ou-kicker">How to play</span><h2 class="ou-h">Tickets in, plates out</h2></div>' +
      '<div class="ou-body-pad"><ul class="ou-how-list">' +
      li('patty', '<b>Tap a bin.</b> Food that cooks goes on the flat-top. The rest goes on the plate.') +
      (flip === 'none' ? '' : li('egg', flip === 'swipe' ? '<b>Eggs, bacon, burgers and chicken need a flip</b> half way. Swipe across them.' : '<b>Eggs, bacon, burgers and chicken need a flip</b> half way. Tap them, or swipe.')) +
      li('spatula', '<b>Pull it when the ring is full.</b> Leave it and it burns. Tap burnt food to scrap it.') +
      li('bell', '<b>Tap Send</b> when the plate has what a ticket shows. Faster plates tip more.') +
      li('pickle', '<b>At lunch there’s a Pickle bin.</b> No ticket asks for it. Tap it to add a pickle spear to any plate before you send it: $1 more in tips.') +
      li('cup-spilled', '<b>A ticket that runs out is a walk-out.</b> Three in a day and the week is over. A flawless day (no walk-outs, nothing burnt) pays extra.') +
      li('jar', '<b>After close,</b> pick one item for free. More cost tips, and <b>your score is the tips you keep</b>, so buy only what gets you through.') +
      li('tipjar', '<b>Tips here are points, not money.</b> At The Café, real tips go to the cooks and the people who work there.') +
      '</ul></div><div class="ou-foot"><button class="ou-btn" data-act="back">Got it</button></div>');
    openOverlay(from);
  }

  /* Settings, and who made it (owner 2026-11-12): sound, music, whether
     results go to The Café, and the credits. Kept off the title for room. */
  var CREDIT = 'Mitch Gardner', resetArmed = false;
  function showSettings() { resetArmed = false; drawSettings(); openOverlay('title'); }
  function drawSettings() {
    var row = function (act, label, on, note) {
      return '<button class="ou-set" data-act="' + act + '" aria-pressed="' + on + '"><span><b>' + label + '</b>' + (note ? '<small>' + note + '</small>' : '') + '</span><i>' + (on ? 'On' : 'Off') + '</i></button>';
    };
    paper('settings',
      '<div class="ou-top ou-top--back"><span class="ou-kicker">Settings</span><h2 class="ou-h">Order Up</h2><span class="ou-label">Version ' + esc(OrderUp.version) + '</span>' +
      '<button class="ou-topback" data-act="back">Back</button></div>' +
      '<div class="ou-body-pad">' +
      row('sound', 'Sound', save.sound, 'The sizzle, the bell, the tickets.') +
      row('music', 'Music', save.music, 'Slow jazz, made as it plays.') +
      (STATS.url ? row('stats', 'Send how my weeks go', !save.noStats, 'No name: the level, the days and the tips, so The Café can see if it’s too hard.') : '') +
      '<div class="ou-setbox"><span class="ou-label">On your home screen</span>' + installHtml() + '</div>' +
      '<div class="ou-setbox"><span class="ou-label">Save code</span>' +
      '<p class="ou-fine">Your achievements, best weeks and Recipe Box as one line of text. Keep it somewhere, and load it on another phone, another browser, or after the phone forgets.</p>' +
      bestList() +
      '<div class="ou-row"><button class="ou-btn ou-btn--quiet" data-act="savecopy">Copy code</button><button class="ou-btn ou-btn--quiet" data-act="saveopen">Load code</button></div>' +
      '<textarea class="ou-code" id="ou-code" rows="3" spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="Save code" hidden></textarea>' +
      '<button class="ou-btn ou-code-load" data-act="saveload" hidden>Load this code</button>' +
      '<p class="ou-code-msg" id="ou-code-msg" role="status"></p></div>' +
      '<button class="ou-btn ou-btn--quiet ou-reset" data-act="achreset">' + (resetArmed ? 'Tap again to reset every achievement' : 'Reset achievements') + '</button>' +
      '<div class="ou-credits"><span class="ou-label">About</span>' +
      '<p>A little game from <b>The Café</b> in Leavenworth, Kansas. The tickets are the real menu, the specials were real specials, and the photos in the Recipe Box are the real plates.</p>' +
      '<p class="ou-credit"><span class="ou-label">Made by</span><b>' + esc(CREDIT) + '</b></p>' +
      '<p class="ou-fine">Every drawing, sound and note of music is made in the game itself. ' + esc(TIPS_NOTE) + '</p>' +
      '<div class="ou-row"><a class="ou-btn ou-btn--quiet" href="/menu">Menu</a><a class="ou-btn ou-btn--quiet" href="/privacy">Privacy</a></div></div>' +
      '</div><div class="ou-foot"><button class="ou-btn" data-act="back">Back</button></div>');
  }
  /* A week's code: the first eight of its run id, which the results Sheet
     files in its `run` column (owner 2026-11-13: to check a week someone
     enters in a promotion, search the Sheet for it). */
  function weekCode(run) { return String(run || '').slice(0, 8); }
  /* The code shows only while tapped, and hides again after a few seconds
     (owner 2026-11-13: so a shared screenshot never gives it away). It
     isn't written on the page at all until then. */
  var codeTimer = 0;
  function codeButton(run, note) {
    return '<button class="ou-weekcode" data-act="showcode" data-run="' + esc(weekCode(run)) + '" aria-label="Show the week code">' +
      '<span class="ou-label">Week code</span><b>Tap to show</b>' + (note ? '<small>' + note + '</small>' : '') + '</button>';
  }
  function showCode(el) {
    var b = el.querySelector('b'), all = stage.querySelectorAll('.ou-weekcode.is-shown');
    for (var i = 0; i < all.length; i++) { all[i].classList.remove('is-shown'); all[i].querySelector('b').textContent = 'Tap to show'; }
    clearTimeout(codeTimer);
    b.textContent = el.getAttribute('data-run'); el.classList.add('is-shown');
    codeTimer = setTimeout(function () { el.classList.remove('is-shown'); b.textContent = 'Tap to show'; }, 6000);
  }
  function bestList() {
    var lv = Object.keys(D.levels).filter(function (id) { return save.keeps[id]; });
    if (!lv.length) return '';
    return '<ul class="ou-bests">' + lv.map(function (id) {
      return '<li><b>' + esc(D.levels[id].name) + '</b> ' + money(save.keeps[id]) + (save.bestRuns[id] ? codeButton(save.bestRuns[id], '') : '') + '</li>';
    }).join('') + '</ul>';
  }

  /* ---------- the save code (owner 2026-11-13) ----------
     Everything worth keeping, as one line: OU1.<data>.<seal>. The seal is
     the same signature the results use, so a code that was typed wrong or
     changed is turned away. Loading one adds to what the phone already has
     (the better of each best week, every achievement); it never takes
     anything away, and the settings stay the phone's own. */
  function b64(s) { return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function unb64(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return decodeURIComponent(escape(atob(s))); }
  function saveCode() {
    var data = b64(JSON.stringify({ v: 1, ach: save.ach, keeps: save.keeps, runs: save.bestRuns, weeks: save.weeks, wins: save.wins, served: save.served, past: save.past }));
    return seal('OU1.' + data).then(function (s) { return 'OU1.' + data + '.' + (s || 'x').slice(0, 16); });
  }
  function loadCode(text) {
    var m = String(text || '').replace(/\s+/g, '').match(/^(OU1\.[A-Za-z0-9_-]+)\.([0-9a-fx]{1,16})$/);
    if (!m) return Promise.resolve('That doesn’t look like a save code.');
    return seal(m[1]).then(function (s) {
      if ((s || 'x').slice(0, 16) !== m[2]) return 'That code has been changed or cut short, so it can’t be loaded.';
      var d; try { d = JSON.parse(unb64(m[1].slice(4))); } catch (e) { return 'That code can’t be read.'; }
      var n = 0, k;
      for (k in d.ach || {}) if (achOf(k) && !save.ach[k]) { save.ach[k] = d.ach[k]; n++; }
      for (k in d.keeps || {}) if (D.levels[k] && Number(d.keeps[k]) > (save.keeps[k] || 0)) { save.keeps[k] = Number(d.keeps[k]); save.bestRuns[k] = String((d.runs || {})[k] || ''); n++; }
      for (k in d.served || {}) if (Number(d.served[k]) > (save.served[k] || 0)) save.served[k] = Number(d.served[k]);
      save.weeks = Math.max(save.weeks, Number(d.weeks) || 0); save.wins = Math.max(save.wins, Number(d.wins) || 0);
      // Past weeks this phone hasn't got, newest first, the last PAST_MAX.
      var had = save.past.map(function (p) { return p.c; });
      var more = (Array.isArray(d.past) ? d.past : []).filter(function (p) { return p && typeof p.c === 'string' && D.levels[p.l] && Array.isArray(p.t) && Array.isArray(p.s) && had.indexOf(p.c) === -1; });
      if (more.length) { save.past = save.past.concat(more).sort(function (a, b) { return b.a - a.a; }).slice(0, PAST_MAX); n++; }
      persist();
      return n ? 'Loaded. Welcome back.' : 'Loaded: nothing new in it for this phone.';
    });
  }

  /* ---------- on the home screen (owner 2026-11-13) ----------
     Android and desktop Chrome offer an install prompt we can show from a
     button; iPhones only from Safari's Share menu; Facebook's own browser
     can't at all. The button says whichever is true here. */
  var installEvt = null, UA = navigator.userAgent || '';
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); installEvt = e; if (screen === 'settings') drawSettings(); });
  window.addEventListener('appinstalled', function () { installEvt = null; if (screen === 'settings') drawSettings(); });
  try { if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('/ou-sw.js', { scope: '/play' }); } catch (e) { /* no matter */ }
  function installHtml() {
    var standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone;
    var ios = /iPhone|iPad|iPod/.test(UA) || (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1);
    var keep = ' Copy your save code first: on an iPhone the home-screen game keeps its own progress.';
    if (standalone) return '<p class="ou-fine">You’re playing from your home screen. Nice.</p>';
    if (inApp) return '<p class="ou-fine">' + esc(inApp === 'an app' ? 'This app’s' : inApp + '’s') + ' own browser can’t do it. Open the ⋯ menu, choose <b>Open in browser</b>, then come back to Settings.' + keep + '</p>';
    if (installEvt) return '<button class="ou-btn" data-act="install">Add to Home Screen</button>';
    if (ios) return '<p class="ou-fine">In Safari, tap the <b>Share</b> button, then <b>Add to Home Screen</b>.' + keep + '</p>';
    return '<p class="ou-fine">Open your browser’s menu and choose <b>Add to Home screen</b> or <b>Install app</b>.</p>';
  }
  function drawTitle() {
    var lv = D.levels[save.level], best = save.keeps[save.level] || 0, run = save.run;
    $('#ou-best').textContent = best ? 'Best ' + lv.name + ' week: ' + money(best) + ' kept · ' + plural(save.wins, 'week', 'weeks') + ' finished' : 'Monday to Friday, 6am to 2pm';
    $('#ou-levels').innerHTML = Object.keys(D.levels).map(function (id) {
      return '<button class="ou-level' + (id === save.level ? ' is-on' : '') + '" data-act="level" data-level="' + id + '" aria-pressed="' + (id === save.level) + '">' + esc(D.levels[id].name) + '</button>';
    }).join('');
    $('#ou-level-text').textContent = lv.text;
    var go = $('#ou-go');
    go.textContent = run ? 'Continue: ' + D.days[run.day].name : 'Start the week';
    go.setAttribute('data-act', run ? 'continue' : 'start');
    $('#ou-fresh').hidden = !run;
    $('#ou-confirm').hidden = true;
    $('#ou-sound-pause').textContent = 'Sound: ' + (save.sound ? 'on' : 'off');
    $('#ou-music-pause').textContent = 'Music: ' + (save.music ? 'on' : 'off');
  }

  /* ---------- 8. taps ---------- */
  function setPaused(on) {
    if (!T || screen !== 'shift' || T.ended) return;
    T.paused = on; $('#ou-pausebox').hidden = !on;
    if (on) $('#ou-pause-own').innerHTML = ownedRow();
  }
  stage.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]'); if (!el || !stage.contains(el)) return;
    tapped(e);
    var act = el.getAttribute('data-act'), i = parseInt(el.getAttribute('data-i'), 10);
    var live = T && screen === 'shift' && !T.paused && !T.ended;
    switch (act) {
      case 'start': sfx.tap(); $('#ou-confirm').hidden = true; newRun(); if (!save.seen) showHow('dawn'); break;   // first week: the rules first
      case 'fresh':                // New week while one is saved: ask first
        $('#ou-confirm-q').textContent = 'Start a new week? Your ' + D.days[save.run.day].name + ' will be lost.';
        $('#ou-confirm').hidden = false; $('#ou-confirm').querySelector('[data-act="keep"]').focus(); sfx.tap(); break;
      case 'keep': $('#ou-confirm').hidden = true; sfx.tap(); break;
      case 'home': G = null; T = null; show('title'); drawTitle(); sfx.tap(); break;      // the week was kept this morning
      case 'leave': $('#ou-pausebox').hidden = true; if (T) T.ended = true; clearBubbles(); G = null; T = null; show('title'); drawTitle(); break;
      case 'continue': sfx.tap(); if (save.run) resumeRun(); else newRun(); break;
      case 'level': if (D.levels[el.getAttribute('data-level')]) { save.level = el.getAttribute('data-level'); persist(); drawTitle(); sfx.tap(); } break;
      case 'music': save.music = !save.music; persist(); drawTitle(); if (screen === 'settings') drawSettings(); break;
      case 'stats': save.noStats = !save.noStats; save.told = true; persist(); drawSettings(); sfx.tap(); break;
      case 'settings': sfx.tap(); showSettings(); break;
      case 'ach': sfx.tap(); showAch('title'); break;
      case 'past': sfx.tap(); showPast('title'); break;
      case 'share': if (save.past[i]) shareWeek(save.past[i]); sfx.tap(); break;
      case 'showcode': showCode(el); sfx.tap(); break;
      case 'install':
        if (installEvt) { var ev = installEvt; installEvt = null; ev.prompt(); if (ev.userChoice) ev.userChoice.then(function () { if (screen === 'settings') drawSettings(); }); }
        break;
      case 'savecopy':
        saveCode().then(function (code) {
          var box = $('#ou-code'), msg = $('#ou-code-msg'); if (!box) return;
          box.hidden = false; box.value = code; box.readOnly = true; box.select();
          $('[data-act="saveload"]').hidden = true;
          var done = function (ok) { msg.textContent = ok ? 'Copied. Paste it somewhere safe, like a note or a message to yourself.' : 'Select the code above and copy it.'; };
          try { navigator.clipboard.writeText(code).then(function () { done(true); }, function () { done(false); }); } catch (e) { done(false); }
        });
        sfx.tap(); break;
      case 'saveopen':
        var box2 = $('#ou-code'); box2.hidden = false; box2.readOnly = false; box2.value = ''; box2.focus();
        $('[data-act="saveload"]').hidden = false; $('#ou-code-msg').textContent = 'Paste your code, then Load.'; sfx.tap(); break;
      case 'saveload':
        loadCode($('#ou-code').value).then(function (words) { drawSettings(); $('#ou-code-msg').textContent = words; drawTitle(); });
        break;
      case 'achreset':             // two taps, so it isn't lost to a stray one
        if (!resetArmed) { resetArmed = true; drawSettings(); sfx.tap(); break; }
        resetArmed = false; save.ach = {}; persist(); drawSettings(); toast('Achievements reset'); sfx.bad(); break;
      case 'fryer':
        var fry = fryerItem();
        if (fry && G.tips >= fry.price) { G.tips -= fry.price; G.bought++; own(fry); sfx.win(); drawClose(); break; }
        sfx.bad(); el.classList.remove('is-nope'); void el.offsetWidth; el.classList.add('is-nope'); break;
      case 'how': showHow(screen); break;
      case 'box': showBox(screen === 'over' ? 'over' : 'title'); break;
      case 'back': closeOverlay(); break;
      case 'sound': save.sound = !save.sound; persist(); drawTitle(); if (screen === 'settings') drawSettings(); sfx.done(); break;
      case 'special': sfx.tap(); startDay(G.offers[i]); break;
      case 'bin': if (live) tapBin(el.getAttribute('data-part')); break;
      case 'spot': if (live && performance.now() - grabbedAt > 500) spotGesture(i, e.detail === 0 ? 'key' : 'tap'); break;   // a touch or mouse was dealt with on pointerup
      case 'pi': if (live) tapPlateItem(i); break;
      case 'scrap': if (live) scrap(); break;
      case 'swap': if (live) swapPlates(); break;
      case 'send': if (live) send(); break;
      case 'cookie': if (live) eatCookie(); break;
      case 'bubble': if (live) tapBubble(el.getAttribute('data-id')); break;
      case 'pause': setPaused(true); break;
      case 'resume': setPaused(false); break;
      case 'quit': $('#ou-pausebox').hidden = true; T.ended = true; weekOver(false, 'quit'); break;
      case 'pick': own(G.pick[i]); sfx.buy(); toShop(); break;
      case 'skip':                 // no free item tonight: tips instead (owner 2026-11-12)
        var bonus = skipBonus(); G.tips += bonus; G.earned += bonus; G.bonus += bonus; sfx.buy(); toShop(); break;
      case 'owninfo': ownInfo(el); sfx.tap(); break;
      case 'buy':
        var it = G.shop[i], cost = priceOf(it);
        if (G.sold.indexOf(i) !== -1) break;
        if (G.tips < cost) { sfx.bad(); break; }
        G.tips -= cost; G.bought++; own(it); G.sold.push(i); sfx.buy(); drawClose(); break;
      case 'reroll':
        if (G.tips < G.reroll) break;
        G.tips -= G.reroll; G.reroll += D.reroll.step; G.shop = deal(3, [], true); G.sold = []; G.fryer = rand() * 100 < (D.legendaryChance || 0); sfx.tap(); drawClose(); break;
      case 'next': G.day++; sfx.tap(); showDawn(); break;
    }
    musicSync();
  });
  document.addEventListener('visibilitychange', function () { if (document.hidden) setPaused(true); musicSync(); });
  stage.addEventListener('submit', function (e) {
    var form = e.target; if (!form || form.id !== 'ou-sendin') return;
    e.preventDefault();
    var name = form.elements.name.value.replace(/\s+/g, ' ').trim(), contact = form.elements.contact ? form.elements.contact.value.trim() : '';
    if (!name) { form.elements.name.focus(); return; }
    if (lastRun) report('score', { run: lastRun.run, lvl: lastRun.lvl, name: name, contact: contact, total: Number(form.elements.total.value), web: form.elements.website.value ? 1 : 0,
      earned: lastRun.earned, spent: lastRun.spent, bonus: lastRun.bonus, finish: lastRun.finish, days: lastRun.days, cater: lastRun.cater, why: lastRun.why, day: lastRun.day, items: lastRun.items, secs: lastRun.secs });
    form.outerHTML = '<p class="ou-note ou-sent" role="status">Sent. Thank you!</p>';
  });

  /* The flat-top takes a tap or a swipe. Both are read here, on the way up,
     from where the finger went down: a click can get lost when the griddle is
     redrawn under the finger, and a swipe is never a click at all. */
  var grab = null, grabbedAt = -1e9, scaleNow = 1;
  stage.addEventListener('pointerdown', function (e) {
    var el = e.target.closest ? e.target.closest('[data-act="spot"]') : null;
    grab = el ? { i: parseInt(el.getAttribute('data-i'), 10), x: e.clientX, y: e.clientY, id: e.pointerId } : null;
  });
  window.addEventListener('pointerup', function (e) {
    if (!grab || e.pointerId !== grab.id) return;
    var g = grab, dx = e.clientX - g.x, dy = e.clientY - g.y, far = Math.sqrt(dx * dx + dy * dy) > 18 * scaleNow;
    grab = null; grabbedAt = performance.now();
    if (far) tapped(e);
    if (T && screen === 'shift' && !T.paused && !T.ended) { spotGesture(g.i, far ? 'swipe' : 'tap'); musicSync(); }
  });
  window.addEventListener('pointercancel', function () { grab = null; });

  /* ---------- the loop ---------- */
  var last = 0;
  function frame(now) {
    var real = Math.min(0.1, (now - last) / 1000), dt = real * speed; last = now;
    if (T && screen === 'shift' && !T.ended) { if (T.paused) T.away += real; else T.played += real; }
    if (T && screen === 'shift' && !T.paused) {
      if (!T.ended) update(dt);
      if (T && screen === 'shift') draw(dt);
    }
    requestAnimationFrame(frame);
  }

  /* ---------- fitting the phone ----------
     The stage is 360 wide and at least 600 tall; scale it to fill the
     screen, and give a taller phone the extra height (the griddle and the
     table take it). */
  function fit() {
    // The keyboard coming up makes the screen "shorter". Don't shrink the
    // game for it: the form scrolls instead.
    var typing = document.activeElement;
    if (typing && typing.tagName === 'INPUT' && stage.contains(typing)) return;
    var vv = window.visualViewport, vw = vv ? vv.width : window.innerWidth, vh = vv ? vv.height : window.innerHeight;
    var s = Math.min(vw / W, vh / 600, 1.8), h = Math.min(vh / s, 800);
    scaleNow = s;
    stage.style.height = h + 'px';
    stage.style.transform = 'translate(' + Math.round((vw - W * s) / 2) + 'px,' + Math.round(Math.max(0, (vh - h * s) / 2)) + 'px) scale(' + s + ')';
  }
  window.addEventListener('resize', fit);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', fit);
  window.addEventListener('orientationchange', fit);

  fit(); drawTitle(); show('title');
  /* The first time, and only if results go anywhere: say what the game keeps
     and sends, with a choice. No cookies are used; this is about the phone's
     storage and the anonymous results (see /privacy). */
  /* An app's own browser (owner 2026-11-13): Facebook's, Instagram's,
     TikTok's and the like keep their own storage and can drop it, so a week,
     the best scores and the achievements may not be there next time. Warn
     before the first tap, and offer the way out. Once waved off, not again
     this visit. */
  var INAPP = [[/FBAN|FBAV|FB_IAB|FBIOS/, 'Facebook'], [/Messenger/, 'Messenger'], [/Instagram/, 'Instagram'], [/musical_ly|Bytedance|TikTok/i, 'TikTok'],
    [/Snapchat/, 'Snapchat'], [/Pinterest/, 'Pinterest'], [/LinkedInApp/, 'LinkedIn'], [/Line\//, 'LINE'], [/; wv\)/, 'an app']];
  var inApp = null;
  INAPP.some(function (x) { if (x[0].test(UA)) { inApp = x[1]; return true; } return false; });
  if (/[?&]inapp\b/.test(location.search)) inApp = 'Facebook';      // /play?inapp shows the warning, to see how it looks
  var waved = false; try { waved = sessionStorage.getItem('ou.inapp') === '1'; } catch (e) { /* no matter */ }
  if (inApp && !waved) {
    var android = /Android/.test(UA);
    // Android can hand the page to the phone's own browser, whichever it is
    // (owner 2026-11-13: not Chrome by name): an https intent with no app
    // named goes to the default browser, or asks which. An iPhone app's
    // browser can't be left from a link.
    var outLink = 'intent://' + location.host + location.pathname + '#Intent;scheme=https;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;end';
    $('#ou-inapp').innerHTML = '<p id="ou-inapp-h"><b>You’re in ' + esc(inApp === 'an app' ? 'an app’s' : inApp + '’s') + ' browser</b></p>' +
      '<p>It can forget your game: weeks, best scores and achievements may not be here next time. Play in your phone’s own browser to keep them.</p>' +
      (android ? '<a class="ou-btn" href="' + esc(outLink) + '">Open in my browser</a>'
        : '<p class="ou-inapp-how">Tap <b>⋯</b> (or the share button) at the top or bottom of the screen, then <b>Open in browser</b> or <b>Open in Safari</b>.</p>') +
      '<button class="ou-btn ou-btn--ghost" data-inapp="ok">Play here anyway</button>' +
      '<p class="ou-inapp-fine">Already have progress here? Copy your save code in Settings first.</p>';
    $('#ou-inapp').hidden = false;
  } else if (STATS.url && !save.told) $('#ou-told').hidden = false;
  /* The game opened from the home screen for the first time, with nothing
     saved (owner 2026-11-13): on an iPhone the home-screen game keeps its
     own storage, apart from Safari's, so offer the save code from there. On
     Android it shares the browser's, and this never shows. */
  var standaloneNow = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone;
  if (standaloneNow && !inApp && !save.weeks && !Object.keys(save.ach).length && !save.run) {
    $('#ou-inapp').innerHTML = '<p id="ou-inapp-h"><b>On your home screen</b></p>' +
      '<p>Played in your browser before? This home-screen game starts fresh on some phones. Bring your progress over with your save code: in the browser, Settings → Copy code; here, Load code.</p>' +
      '<button class="ou-btn" data-inapp="load">Load my save code</button>' +
      '<button class="ou-btn ou-btn--ghost" data-inapp="ok">Start fresh</button>';
    $('#ou-inapp').hidden = false; $('#ou-told').hidden = true;
  }
  stage.addEventListener('click', function (e) {
    if (!e.target.closest || !e.target.closest('[data-inapp]')) return;
    if (e.target.closest('[data-inapp="load"]')) {
      $('#ou-inapp').hidden = true; showSettings();
      var box = $('#ou-code'); if (box) { box.hidden = false; box.readOnly = false; box.focus(); $('[data-act="saveload"]').hidden = false; $('#ou-code-msg').textContent = 'Paste your code, then Load.'; }
      return;
    }
    $('#ou-inapp').hidden = true;
    try { sessionStorage.setItem('ou.inapp', '1'); } catch (err) { /* no matter */ }
    if (STATS.url && !save.told) $('#ou-told').hidden = false;
  });
  stage.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-told]'); if (!b) return;
    save.told = true; save.noStats = b.getAttribute('data-told') === 'no'; persist();
    $('#ou-told').hidden = true;
  });
  stage.addEventListener('focusout', function () { setTimeout(fit, 60); });
  window.ouStarted = true;      // the page's "the game didn't start" note looks for this
  requestAnimationFrame(function (now) { last = now; requestAnimationFrame(frame); });

  /* DEV-ONLY:START
     The test handle: /play?debug gives the page window.__ou (move the clock,
     own an item), which game/bot.js plays through. It exists under `npm
     start` only: .eleventy.js cuts everything between these two markers out
     of the play.js it builds for the live site. Keep the markers as they are. */
  if (/[?&]debug\b/.test(location.search)) {
    STATS.url = '';      // test weeks never reach the results Sheet
    window.__ou = {
      D: D, get G() { return G; }, get T() { return T; }, get screen() { return screen; }, save: save,
      speed: function (v) { speed = v; },
      // Move the shift on by hand (game/bot.js does, with speed(0), so a test
      // doesn't depend on the page being on screen).
      tick: function (dt) { if (T && screen === 'shift' && !T.paused) { if (!T.ended) update(dt); if (T && screen === 'shift') draw(dt); } },
      give: function (id) { own({ id: id }); dirtyAll(); },
      findMatch: findMatch, aimTicket: aimTicket, usable: usable, binOpen: binOpen, level: level,
      gesture: function (i, how) { if (T) spotGesture(i, how || 'key'); },
      get music() { return { on: music.on, step: music.step, audio: ac ? ac.state : 'none' }; }
    };
    /* /play?debug&cards: one card of each rarity, a sale price and the owned
       row, to judge the look of the rarities without playing to the shop. */
    if (/[?&]cards\b/.test(location.search)) {
      $('#ou-told').hidden = true;
      G = { level: 'normal', day: 3, tips: 2000, earned: 2000, bought: 0, bonus: 0, sale: false, items: { tipjar: 2, counter: 1, linecook: 1, fryer: 1 }, perDay: [] };
      var one = function (r, id) { return D.items.filter(function (x) { return x.rarity === r && (!id || x.id === id); })[0]; };
      paper('close', '<div class="ou-top ou-top--wallet"><span class="ou-kicker">Test page</span><h2 class="ou-h">The rarities</h2><span class="ou-label">Dev server only · /play?debug&amp;cards</span></div>' +
        '<div class="ou-body-pad"><span class="ou-label">The shop</span>' +
        itemCard(one('normal', 'picklejar'), 'buy', 0, { price: money(one('normal', 'picklejar').price) }) +
        itemCard(one('rare', 'counter'), 'buy', 1, { price: money(one('rare', 'counter').price) }) +
        itemCard(one('epic', 'linecook'), 'buy', 2, { price: money(one('epic', 'linecook').price) }) +
        itemCard(one('legendary'), 'fryer', 0, { price: money(one('legendary').price) }) +
        '<span class="ou-label">On sale</span><p class="ou-sale"><b>' + D.sale.off + '% off tonight.</b> You haven’t bought a thing all week, so the supplier cut you a deal.</p>' +
        itemCard(one('epic', 'goldspat'), 'buy', 3, { price: money(Math.round(one('epic', 'goldspat').price * (100 - D.sale.off) / 500) * 5), was: money(one('epic', 'goldspat').price) }) +
        ownedRow() + '</div>');
    }
  }
  /* DEV-ONLY:END */
})();
