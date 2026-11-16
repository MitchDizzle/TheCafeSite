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
        if (has('urn') && T.cups < TU.cups) { T.cups++; dirty.hud = true; credit('urn', 0, 1); setTimeout(function () { toast('Coffee Urn: one coffee poured again'); }, 1900); }
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
      if (T.outs.length && T.t >= T.outs[0] && trouble('outage')) { T.outs.shift(); T.dark = trouble('outage').secs; dirty.rail = true; toast('The lights went out'); sfx.dark(); }
      if (T.dark > 0) { T.dark -= dt; if (T.dark <= 0) { T.dark = 0; dirty.rail = true; sfx.light(); } }
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
      if (t.left <= 0.4 && !t.boarded && has('board') && !t.family) { t.boarded = true; t.left += 6; t.gift.board = 6; toast('Kitchen Board: #' + t.n + ' waits a little longer'); }
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
        if (has('scraper')) { it.gone += dt; if (it.gone > 0.9) { T.grill[i] = null; dirty.grill = dirty.bins = true; credit('scraper', 0, 1); } }
        continue;
      }
      if (it.state === 'flip') {       // waiting to be turned: this side is still on the heat
        it.wait += dt;
        if (!gold && it.wait >= burnAfter) { it.state = 'burnt'; dirty.grill = true; burnt(it); }
        continue;
      }
      it.t += dt;
      if (it.state === 'raw' && flips && D.parts[it.part].flip && !it.flipped && it.t >= cook / 2) {
        it.t = cook / 2;
        if (has('spatula')) { flipIt(it); credit('spatula', 0, 1); } else { it.state = 'flip'; it.wait = 0; dirty.grill = true; sfx.done(); }
      }
      else if (it.state === 'raw' && it.t >= cook) { it.state = 'done'; dirty.grill = true; sfx.done(); }
      else if (it.state === 'done' && !gold && it.t >= cook + burnAfter) { it.state = 'burnt'; dirty.grill = true; burnt(it); }
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
      if (T.dry >= 25) { T.dry = 0; T.cups++; dirty.hud = true; credit('bottomless', 0, 1); toast('Bottomless Coffee: poured again'); }
    }

    // family
    if (T.fam) {
      // How much they say is the level's (owner 2026-11-13: on Regular only a
      // few lines, and they hold off while the rail is full or a ticket is late).
      var talk = famTalk();
      if (!(talk.quiet && swamped())) T.fam.say -= dt;
      if (T.fam.say <= 0) { T.fam.say = talk.every; if (T.bubbles.length < talk.max && T.fam.said < talk.lines) { T.fam.said++; addBubble(); } }
    }
    // Small Talk: each line is answered by itself after a moment.
    for (i = T.bubbles.length - 1; i >= 0; i--) {
      if (T.bubbles[i].auto == null) continue;
      T.bubbles[i].auto -= dt;
      if (T.bubbles[i].auto <= 0) { credit('smalltalk', 0, 1); sfx.grunt(T.bubbles[i].reply); dropBubble(T.bubbles[i].id); }
    }
  }

  function endDay() {
    // A flawless day (owner 2026-11-12): no walk-outs, family fed, nothing burnt.
    T.dark = 0;
    var last = G.day >= D.days.length - 1;
    if (!T.slips && T.served) {
      var cb = D.clean.bonus[Math.min(G.day, D.clean.bonus.length - 1)];
      // Friday's is held for the performance bonus, paid only if the
      // catering goes out on time (owner 2026-11-13; cateringDone).
      if (last) G.friClean = cb;
      else { T.clean = cb; T.tips += cb; G.tips += cb; G.earned += cb; award('flawless', true); }
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
    if (last) { startCatering(); if (G.friClean) setTimeout(function () { if (T) toast('Flawless lunch: its bonus comes at the end'); }, 2100); } else showClose();
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
    var bonus = D.catering.bonus;
    T.tips += bonus; G.tips += bonus; G.earned += bonus;
    T.ended = true;
    G.cater = T.tips - T.tipsBefore;
    // The performance bonus (owner 2026-11-13), paid at the end of a won week
    // and said before the results: Friday's flawless-lunch bonus, held since
    // 2pm, and the time left on the catering clock (game.json, performance).
    var clean = G.friClean || 0, quick = Math.floor(Math.max(0, T.cat.left) / D.performance.secondsPerDollar);
    G.perf = clean + quick; G.tips += G.perf; G.earned += G.perf;
    if (clean) award('flawless', true);
    banner('Performance bonus +' + money(G.perf), clean ? 'A flawless lunch, and ' + money(quick) + ' for time to spare' : money(quick) + ' for time to spare on the clock');
    if (clean) sfx.flawless(); else sfx.achieve();
    setTimeout(function () { weekOver(true, 'win'); }, 900 + BANNER_S * 1000);
  }

