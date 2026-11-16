  /* ---------- 3. the kitchen ---------- */
  function makeTicket(recipe, o) {
    var day = D.days[G.day];
    var t = {
      id: ++uid, n: T.seq++, rid: recipe.id, name: recipe.name, when: recipe.when || 'lunch', parts: recipe.parts.slice(),
      age: 0, togo: false, usual: false, special: false, family: false, catering: false, boarded: false, late: false, auto: null, hurry: false
    };
    for (var key in o) t[key] = o[key];
    t.gift = {};      // seconds each item gave this ticket, to tell a save
    t.total = (TU.waitBase + TU.waitPerPart * t.parts.length) * day.patience * level().wait;
    // Never less than it takes to make: the longest thing on it has to cook,
    // and every part is a tap or two. Luck can make a day hard, not undoable.
    var longest = 0;
    t.parts.forEach(function (p) { longest = Math.max(longest, D.parts[p].cook || 0); });
    t.total = Math.max(t.total, longest * TU.fair.cookTimes + TU.fair.perPart * t.parts.length + TU.fair.base);
    if (has('refills')) { t.gift.refills = itemPer('refills') * has('refills'); t.total += t.gift.refills; }
    if (t.togo && has('clamshell')) { t.total += 8; t.gift.clamshell = 8; }
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
    var roll = rand() * 100, share = review ? review.share : 1;
    if (lunch && roll < (TU.specialShare + TU.postShare * has('fbpost')) * share) {
      recipe = { id: 'sp-' + T.special.id, name: T.special.name, when: 'lunch', parts: ['special'].concat(T.special.sides.map(function () { return 'side'; })) };
      o.special = true;
      if (roll >= TU.specialShare * share) o.posted = true;      // here only by the Facebook Post
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
      if (at >= TU.griddle) credit('flattop', 0, 1);
      if (has('press')) credit('press', 0, info.cook - info.cook / (1 + itemPer('press') / 100 * has('press')));
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
    if (it.state === 'done') heatSave(it.t - cookTime(it.part, i));
    T.plate.push(it.part); T.plateNew = T.plate.length - 1; T.grill[i] = null;
    dirty.grill = dirty.plate = dirty.rail = dirty.bins = true; sfx.tap();
  }
  /* Food that flips (game.json, parts) stops at the half until it's turned.
     `how` is tap, swipe or key. On Rush only a swipe turns it; a keyboard
     always can, so the game is never out of reach without a touch screen. */
  /* Food taken or turned after it would have burnt without the Warming
     Shelf, or the Golden Spatula: a save for that item. */
  function heatSave(over) {
    var base = D.days[G.day].burn * level().burn;
    if (over < base) return;
    if (has('goldspat') && over >= burnSecs()) credit('goldspat', 0, 1); else credit('shelf', 0, 1);
  }
  function flipIt(it) {
    if (it.state === 'flip') heatSave(it.wait);
    it.flipped = true; it.state = 'raw'; it.wait = 0; it.flipAt = performance.now();
    dirty.grill = true; sfx.flip();
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
    var t = T.plate; T.plate = T.spare; T.spare = t; T.plateNew = -1; credit('spare', 0, 1);
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
    slidePlate();
    T.plate = []; dirty.plate = true;
    complete(m.t, m.kind, false);
  }
  /* The plate that went out slides off to the right, under Send, and a clean
     one is set down (owner 2026-11-13). Only a picture: the next plate is
     ready at once, and nothing here can be tapped. */
  var stillMotion = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  function slidePlate() {
    var pl = $('#ou-plate');
    sfx.slide();
    if (!pl || (stillMotion && stillMotion.matches)) return;
    var ghost = pl.cloneNode(true), acts = ghost.querySelectorAll('[data-act]');
    for (var i = 0; i < acts.length; i++) acts[i].removeAttribute('data-act');
    ghost.removeAttribute('id'); ghost.className = 'ou-plate ou-plate-gone'; ghost.setAttribute('aria-hidden', 'true');
    ghost.style.left = pl.offsetLeft + 'px'; ghost.style.top = pl.offsetTop + 'px';
    ghost.style.width = pl.offsetWidth + 'px'; ghost.style.height = pl.offsetHeight + 'px';
    pl.parentNode.appendChild(ghost);
    pl.classList.remove('is-fresh'); void pl.offsetWidth; pl.classList.add('is-fresh');
    setTimeout(function () { ghost.remove(); pl.classList.remove('is-fresh'); }, 480);
  }

  /* A ticket goes out: by Send, or by a helper (`by` names who). */
  function complete(t, kind, by) {
    var tip = t.parts.length + (t.special ? 2 : 0), adds = {};
    var frac = t.left / t.total;
    if (!t.catering) tip += frac > 0.5 ? 2 : frac > 0.25 ? 1 : 0;
    if (t.catering) tip += 2;
    if (t.rid === 'roll') tip = itemPer('rollcase');
    if (kind === 'pickle') tip += 1;
    if (kind === 'pickle' || t.parts.indexOf('pickle') !== -1 || kind === 'wild') adds.picklejar = itemPer('picklejar') * has('picklejar');
    adds.tipjar = itemPer('tipjar') * has('tipjar');
    var base = tip, mults = [];      // [item, factor]: who made the plate tip more
    tip += adds.picklejar || 0; tip += adds.tipjar;
    var mult = 1;
    if (t.special && has('drink')) { mult *= 2; mults.push(['drink', 2]); }
    if (t.n <= itemPer('earlybird') && has('earlybird') && !t.catering) { mult *= 2; mults.push(['earlybird', 2]); }
    if (t.usual) { mult *= 3; mults.push(['regular', 3]); }
    if (has('fryer')) { mult *= 3; mults.push(['fryer', 3]); }
    // The Lucky Penny: a chance a plate is a lucky one (the Big Tipper makes it triple).
    var luckyPct = TU.luckyBase + itemPer('penny') * has('penny');
    var lucky = !t.family && rand() * 100 < luckyPct;
    if (lucky) {
      mult *= has('bigtipper') ? 3 : 2;
      // A lucky plate the Penny made: its share of the chance.
      mults.push(['penny', Math.pow(2, has('penny') ? (luckyPct - TU.luckyBase) / luckyPct : 0)]);
      if (has('bigtipper')) mults.push(['bigtipper', 1.5]);
    }
    tip *= mult;
    if (t.family) tip = 0;
    else {
      // Who brought what in: what an item adds, times every multiplier; what
      // multipliers add to the rest, shared by how much each multiplies.
      for (var a in adds) if (adds[a]) credit(a, adds[a] * mult, 0);
      var gain = base * (mult - 1), lnAll = Math.log(mult);
      mults.forEach(function (m) { if (lnAll > 0 && m[1] > 1) credit(m[0], gain * Math.log(m[1]) / lnAll, 0); });
      if (t.rid === 'roll') credit('rollcase', base, 1);
      if (t.posted) credit('fbpost', 2, 1);
      if (t.usual) credit('regular', 0, 1);
      if (lucky && has('penny') && luckyPct > TU.luckyBase) credit('penny', 0, 1);
      if (kind === 'wild') credit('bigdill', 0, 1);
      if (by === 'Counter Help') credit('counter', tip, 1);
      if (by === 'Line Cook') credit('linecook', tip, 1);
      // Sent in time only because of the seconds items gave it: a save, for
      // the one that gave the most.
      if (!by && !t.catering) {
        var g = 0, top = null;
        for (var gi in t.gift) { g += t.gift[gi]; if (!top || t.gift[gi] > t.gift[top]) top = gi; }
        if (top && t.left < g) credit(top, 0, 1);
      }
    }
    // Achievements earned at the pass.
    if (!t.family) { if (lucky && T.lastLucky) award('lucky'); T.lastLucky = lucky; }
    if (kind === 'pickle' && ++T.pickles >= 10) award('pickles');
    if (t.special && T.grill.filter(function (x) { return x && x.state !== 'burnt'; }).length >= 3) award('multitask');

    removeTicket(t);
    T.served++; T.tips += tip; G.tips += tip; G.earned += tip;
    save.served[t.rid] = (save.served[t.rid] || 0) + 1;
    if (has('bell')) T.tickets.forEach(function (o) {
      if (o.catering) return;
      var was = o.left; o.left = Math.min(o.total, o.left + 2);
      if (o.left > was) o.gift.bell = (o.gift.bell || 0) + o.left - was;
    });
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

