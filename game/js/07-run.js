  /* ---------- 2. the run and the day ---------- */
  var G = null;      // the week: day, tips to spend, what's owned
  var T = null;      // the shift being played
  var screen = 'title';
  var uid = 0;
  var speed = 1;     // debug only

  function has(id) { return (G && G.items[id]) || 0; }
  /* What each item did this week (owner 2026-11-13): days on the line, tips
     it brought in, and its count (saves, plates, flips: ITEM_DID says what).
     Kept with the week and added to save.itemLife at the end; never sent. */
  function ist(id) { var s = G.ist[id]; if (!s) s = G.ist[id] = { d: 0, tips: 0, n: 0, paid: 0 }; return s; }
  function credit(id, tips, n) { if (!G || !has(id)) return; var s = ist(id); s.tips += tips || 0; s.n += n || 0; }
  /* How hard: the level the week was started on (game.json, levels). */
  function level() { return D.levels[(G && G.level) || save.level] || D.levels.normal; }

  function newRun() {
    G = { level: save.level, run: rid(), began: Date.now(), played: 0, away: 0, day: 0, tips: 0, earned: 0, bought: 0, bonus: 0, perf: 0, friClean: 0, sale: false, perDay: [], cater: null, items: {}, reroll: D.reroll.first, offers: [], stage: '', pick: [], shop: [], sold: [], fryer: false, trouble: null, troubleDay: -1, lastTrouble: null, troublePart: '', slips: [], fed: 0, newAch: [], ist: {}, usedSp: [], seenSp: [], offersDay: -1 };
    report('start', {});
    showDawn();
  }
  /* A week left half way is kept each morning and picked up from that morning. */
  /* Kept each morning, and after close (owner 2026-11-13): when a day is
     done, and again as the free pick, the shop and every buy change it, so
     a week left then picks up at that night's pick or shop, with the same
     cards on offer. Closing the game never deals new ones. */
  function keepRun(at) {
    var night = at === 'close', done = night ? G.day + 1 : G.day;
    var ids = function (list) { return (list || []).map(function (x) { return x.id; }); };
    save.run = { level: G.level, run: G.run, began: G.began, played: G.played, away: G.away, day: G.day, tips: G.tips, earned: G.earned, bought: G.bought, bonus: G.bonus, perDay: G.perDay.slice(0, done), items: G.items, trouble: G.trouble, troubleDay: G.troubleDay, troublePart: G.troublePart, slips: G.slips.slice(0, done), fed: G.fed, ist: G.ist,
      usedSp: G.usedSp, seenSp: G.seenSp, offers: ids(G.offers), offersDay: G.offersDay, at: night ? 'close' : 'dawn', lastTrouble: G.lastTrouble, log: (G.log || []).slice(0, done) };
    if (night) {
      save.run.close = { tips: T.tips, served: T.served, walk: T.walk, clean: T.clean || 0 };
      save.run.stage = G.stage; save.run.pick = ids(G.pick); save.run.shop = ids(G.shop); save.run.sold = G.sold.slice();
      save.run.reroll = G.reroll; save.run.sale = !!G.sale; save.run.fryer = !!G.fryer; save.run.ach = (G.tonightAch || []).slice(); save.run.achShown = G.achShown || 0;
    }
    persist();
  }
  function resumeRun() {
    var r = save.run, items = {};
    for (var id in r.items) if (D.items.some(function (it) { return it.id === id; })) items[id] = r.items[id];
    G = { level: r.level, run: r.run || rid(), began: r.began || Date.now(), played: r.played || 0, away: r.away || 0, day: r.day, tips: r.tips || 0, earned: r.earned || 0, bought: r.bought || 0, bonus: r.bonus || 0, sale: false, perDay: (r.perDay || []).slice(), cater: null, items: items, reroll: D.reroll.first, offers: [], stage: '', pick: [], shop: [], sold: [], fryer: false,
      trouble: troubleOf(r.trouble) ? r.trouble : null, troubleDay: r.troubleDay == null ? -1 : r.troubleDay, lastTrouble: null,
      troublePart: D.parts[r.troublePart] ? r.troublePart : '', slips: Array.isArray(r.slips) ? r.slips.slice() : [], fed: r.fed || 0, newAch: [], ist: (r.ist && typeof r.ist === 'object') ? r.ist : {},
      usedSp: Array.isArray(r.usedSp) ? r.usedSp.slice() : [], seenSp: Array.isArray(r.seenSp) ? r.seenSp.slice() : [], offersDay: r.offersDay == null ? -1 : r.offersDay };
    // The morning's three, as they were when the week was left (a week picked up again can't deal itself new ones).
    G.offers = (Array.isArray(r.offers) && G.offersDay === G.day ? r.offers : []).map(function (id) { return D.specials.filter(function (x) { return x.id === id; })[0]; }).filter(Boolean);
    if (G.offers.length < 3) G.offersDay = -1;
    G.lastTrouble = r.lastTrouble || null; if (Array.isArray(r.log)) G.log = r.log.slice();
    // Left after close: back to that night's pick or shop, as it was.
    if (r.at === 'close' && r.close) {
      var item = function (id) { return D.items.filter(function (x) { return x.id === id; })[0]; };
      G.stage = r.stage === 'shop' ? 'shop' : 'pick';
      G.pick = (r.pick || []).map(item).filter(Boolean); G.shop = (r.shop || []).map(item).filter(Boolean);
      G.sold = Array.isArray(r.sold) ? r.sold.slice() : []; G.reroll = r.reroll || D.reroll.first; G.sale = !!r.sale; G.fryer = !!r.fryer;
      G.tonightAch = Array.isArray(r.ach) ? r.ach.slice() : []; G.achShown = r.achShown || 0;
      if (G.stage === 'pick' && !G.pick.length) G.pick = deal(3, [], false);
      if (G.stage === 'shop' && !G.shop.length) G.shop = deal(3, [], true);
      T = { tips: r.close.tips || 0, served: r.close.served || 0, walk: r.close.walk || 0, clean: r.close.clean || 0, resumed: true };
      drawClose();
      return;
    }
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
    for (var oid in G.items) ist(oid).d++;
    dirtyAll();
    show('shift');
    $('#ou-pausebox').hidden = true;
    $('#ou-bubbles').innerHTML = '';
    banner(day.name, T.trouble ? 'Trouble today: ' + T.trouble.name + '.' : 'Open at 6am. Breakfast first.');
  }

  var FLIP_MS = 520, FLAME_MS = 850;     // how long a flip and a flare-up show (play.css has the same)
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
    if (!tr || G.day < tr.from || rand() * 100 >= tr.chance) return null;
    if (has('horseshoe')) { credit('horseshoe', 0, 1); return null; }      // the Horseshoe: no trouble, any day
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
  /* Something burnt: a slip (no flawless day), and with an Accident it costs.
     It goes up in a burst of flame (owner 2026-11-13; drawGrill). */
  function burnt(it) {
    it.burnAt = performance.now(); sfx.flame(); T.slips++;
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

