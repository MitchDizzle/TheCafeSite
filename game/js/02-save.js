  /* ---------- 1. the save ---------- */
  /* The save's key and shape. Updates must keep old saves working (owner
     2026-11-13), so: KEY never changes, a new field gets a default in `save`
     below, and anything that changes the meaning of a field gets a step in
     migrate() with SAVE_VER raised. Never rename an item's or an
     achievement's id: saves and weeks left half way are keyed by them. */
  var KEY = 'orderup.v1', SAVE_VER = 3;
  var save = { told: false, noStats: false, best: 0, bests: {}, keeps: {}, weeks: 0, wins: 0, served: {}, sound: false, music: false, sfxVol: 0, musicVol: 0, musicStyle: 'jazz', seen: false, level: 'normal', run: null, id: '', qa: [], sum: '', ach: {}, ver: 0, bestRuns: {}, past: [], itemLife: {} };
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
  if (!save.itemLife || typeof save.itemLife !== 'object') save.itemLife = {};
  migrate();
  /* One step per change of shape, oldest first. A save from any earlier
     version walks up through all of them. */
  function migrate() {
    if (save.ver < 2) {
      // 2 (game 1.2): achievements began. Nothing to move; just the mark.
      save.ver = 2;
    }
    if (save.ver < 3) {
      // 3 (game 1.5, owner 2026-11-13): sound and music became volumes, Off
      // to High. A switch that was on is Medium, as loud as "on" was.
      save.sfxVol = save.sound ? 2 : 0; save.musicVol = save.music ? 2 : 0;
      save.ver = 3;
    }
    save.sfxVol = Math.max(0, Math.min(3, save.sfxVol | 0)); save.musicVol = Math.max(0, Math.min(3, save.musicVol | 0));
    if (save.musicStyle === 'metal') save.musicStyle = 'electronic';      // its name for an evening, never released
    if (save.musicStyle !== 'electronic') save.musicStyle = 'jazz';      // owner 2026-11-13: the jazz, or retro electronic
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

