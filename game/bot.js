// A stand-in player for Order Up, for checking the balance after changing
// numbers in src/_data/game.json. Not part of the site.
//
// Open /play?debug (the ?debug gives the page a window.__ou handle), paste
// this file into the browser console, then:
//     await ouBot({ weeks: 5, apm: 90, level: 'normal' })      // easy, normal or hard
// It plays whole weeks the way a fair player would (`apm` taps a minute,
// one thing at a time, most urgent ticket first) and returns how each week
// went: the day it ended on, tips per day, walk-outs, what it owned.
// About 60 taps a minute is a slow thumb, 90 a steady one, 150 a quick one.
// `slip` (0 to 1) is how often a beat is wasted, the way a person hesitates
// or mis-taps: 0.1 is a fair guess, 0 is a machine.
// It moves the shift's clock itself (__ou.tick), so a week takes a second
// or two and the page doesn't have to be on screen.
window.ouBot = async function (opt) {
  opt = Object.assign({ weeks: 3, apm: 90, level: 'normal', slip: 0, buy: true, log: false }, opt);
  var ou = window.__ou, D = ou.D, results = [];
  if (!ou) throw new Error('Open /play?debug first');
  var q = function (s) { return document.querySelector('#ou-stage ' + s); };
  var click = function (s) { var el = typeof s === 'string' ? q(s) : s; if (el) el.click(); return !!el; };
  // Step aside for a moment without a timer: a browser slows timers right
  // down on a page that isn't on screen, and a test shouldn't care.
  var sleep = function () { return new Promise(function (r) { var c = new MessageChannel(); c.port1.onmessage = function () { r(); }; c.port2.postMessage(0); }); };
  var step = 60 / opt.apm;      // game seconds between taps
  ou.speed(0);                  // the page's own clock stands still; we move it

  function act() {
    var T = ou.T; if (!T || T.paused || T.ended) return;
    if (T.bubbles.length) return click('.ou-bubble');
    if (ou.findMatch()) return click('[data-act=send]');
    for (var b = 0; b < T.grill.length; b++) if (T.grill[b] && T.grill[b].state === 'burnt') return click('[data-act=spot][data-i="' + b + '"]');
    // turn whatever is waiting to be flipped (a click from here counts as a key press, so it flips on Rush too)
    for (var fl = 0; fl < T.grill.length; fl++) if (T.grill[fl] && T.grill[fl].state === 'flip') return click('[data-act=spot][data-i="' + fl + '"]');
    var list = T.tickets.filter(function (t) { return t.auto == null; }).sort(function (a, c) { return (a.catering ? a.n : a.left) - (c.catering ? c.n : c.left); });
    var t = list[0];
    if (!t) return;
    // what the ticket still needs beyond the plate
    var need = t.parts.slice(), spare = false;
    T.plate.forEach(function (p) { var at = need.indexOf(p); if (at === -1) spare = true; else need.splice(at, 1); });
    if (spare) return click('[data-act=scrap]');
    for (var i = 0; i < need.length; i++) {
      var p = need[i], info = D.parts[p];
      if (!info.cook) { if (ou.binOpen(p)) return click('[data-part=' + p + ']'); continue; }
      for (var g = 0; g < T.grill.length; g++) if (T.grill[g] && T.grill[g].part === p && T.grill[g].state === 'done') return click('[data-act=spot][data-i="' + g + '"]');
    }
    // start anything this ticket needs that isn't cooking yet; then the next ticket's
    for (var k = 0; k < list.length; k++) {
      var want = {}, parts = k === 0 ? need : list[k].parts;
      parts.forEach(function (p) { if (D.parts[p].cook) want[p] = (want[p] || 0) + 1; });
      for (var part in want) {
        var on = T.grill.filter(function (x) { return x && x.part === part && x.state !== 'burnt'; }).length;
        if (on < want[part] && T.grill.slice(0, ou.usable()).some(function (x) { return !x; }) && ou.binOpen(part)) return click('[data-part=' + part + ']');
      }
    }
    if (T.cookies && list.some(function (x) { return !x.catering && x.left / x.total < 0.2; })) return click('[data-act=cookie]');
  }

  for (var w = 0; w < opt.weeks; w++) {
    ou.save.level = opt.level;
    click('[data-act=start]');
    if (ou.screen === 'how') click('[data-scr=how] [data-act=back]');
    var days = [], guard = 0, lastDay = -1, walk = [], began = Date.now(), troubles = [], cleans = [], items = {};
    while (ou.screen !== 'over' && Date.now() - began < 120000) {
      guard++;
      var s = ou.screen;
      if (ou.G) items = Object.assign({}, ou.G.items);
      if (s === 'dawn') { troubles[ou.G.day] = ou.G.trouble || '-'; click('[data-act=special]'); }
      else if (s === 'close') {
        if (ou.T) { cleans[ou.G.day] = ou.T.clean || 0; days[ou.G.day] = ou.T.tips; }
        if (ou.G.stage === 'pick') click('[data-act=pick]');
        else {
          var bought = false;
          if (opt.buy) ou.G.shop.forEach(function (it, i) { if (!bought && ou.G.sold.indexOf(i) === -1 && ou.G.tips >= it.price) { bought = click('[data-act=buy][data-i="' + i + '"]'); } });
          if (!bought) click('[data-act=next]');
        }
      } else if (s === 'shift') {
        var T = ou.T;
        if (T) { lastDay = ou.G.day; walk[lastDay] = T.walk; days[lastDay] = T.tips; cleans[lastDay] = T.clean || 0; }
        if (T && !T.ended) { for (var k = 0, n = Math.ceil(step / 0.05); k < n; k++) ou.tick(step / n); if (Math.random() >= opt.slip) act(); if (guard % 40) continue; }
        else { await sleep(60); continue; }
      }
      await sleep(0);
    }
    var head = q('[data-scr=over] .ou-h');
    var r = { ended: head ? head.textContent : '?', day: D.days[lastDay] ? D.days[lastDay].short : '?', tips: days, walk: walk, week: (q('[data-scr=over] .is-total strong') || {}).textContent,
      items: Object.keys(items), trouble: troubles.slice(), clean: cleans.slice() };
    results.push(r); (window.__weeks = window.__weeks || []).push(r); if (opt.log) console.log(JSON.stringify(r));
  }
  ou.speed(1);
  return results;
};
