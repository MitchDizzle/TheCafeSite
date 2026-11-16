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
      return '<div class="is-' + (cut ? 'bad' : r ? r.rarity : 'none') + '"><b>' + D.days[i].short + '</b><span>' + (cut ? stopWords(p) : rankWords(p.s[i])) + '</span><strong>' + money(tips) + '</strong></div>';
    }).join('');
    if (p.f !== '') rows += '<div' + (p.w === 'win' ? '' : ' class="is-bad"') + '><b>Fri</b><span>Catering' + (p.w === 'win' ? ', on time' : p.w === 'late' ? ', late' : ', not finished') + '</span><strong>' + money(p.f) + '</strong></div>';
    return rows;
  }
  /* The same, small, for Past weeks: a tile a day in its colour. */
  function dayStrip(p) {
    var cells = p.t.map(function (tips, i) {
      var cut = cutShort(p, i), r = cut ? null : rankOf(p.s[i]);
      return '<span class="is-' + (cut ? 'bad' : r ? r.rarity : 'none') + '" aria-label="' + D.days[i].name + ': ' + money(tips) + ', ' + (r ? rankWords(p.s[i]) : stopWords(p)) + '"><b>' + D.days[i].short + '</b>' + money(tips) + '</span>';
    });
    if (p.f !== '') cells.push('<span class="is-' + (p.w === 'win' ? 'cater' : 'bad') + '" aria-label="Catering' + (p.w === 'win' ? '' : ', late') + ': ' + money(p.f) + '"><b>Cater</b>' + money(p.f) + '</span>');
    return '<div class="ou-strip">' + cells.join('') + '</div>';
  }
  /* A finished week, kept on the phone (owner 2026-11-13: to find a week's
     code again later): the last PAST_MAX, newest first. Short keys, as it
     rides in the save code too: c week code, l level, a when, k kept, w how
     it ended, d its last day, t tips and s slips each day, f the catering's
     tips ('' if it never came), b the performance bonus, e what finishing
     paid, x the free items turned down, sp what was spent: with them the
     picture adds up to what was kept. i the items on the line. */
  var PAST_MAX = 12;
  /* What was on the line, { id: how many }, for the picture (owner 2026-11-13). */
  function lineOf() {
    var out = {}; D.items.forEach(function (it) { if (G.items[it.id]) out[it.id] = G.items[it.id]; }); return out;
  }
  function keepWeek(kept, why, spent) {
    var p = { c: weekCode(G.run), l: G.level, a: Date.now(), k: kept, w: why, d: G.day,
      t: G.perDay.slice(0, G.day + 1).map(function (x) { return x || 0; }), s: G.slips.slice(0, G.day + 1), f: G.cater == null ? '' : G.cater, b: G.perf || 0, e: G.finish || 0, x: G.bonus || 0, sp: spent || 0, i: lineOf() };
    save.past = [p].concat(save.past.filter(function (x) { return x.c !== p.c; })).slice(0, PAST_MAX);
    return p;
  }
  /* How the week ended: [kicker, heading], short enough for one line. */
  /* How a week ended, in a few words for the picture's small line. */
  function weekWords(p) {
    return p.w === 'win' ? 'Catering on time' : p.w === 'late' ? 'Catering late' : p.w === 'quit' ? 'Closed early on ' + (D.days[p.d] || D.days[0]).short : 'Three coffees down on ' + (D.days[p.d] || D.days[0]).short;
  }
  var GAME_NAME = 'Order Up';      // the game's name wherever it's drawn rather than written in the page
  function weekHead(p) {
    var day = D.days[p.d] || D.days[0];
    return p.w === 'win' ? ['Week done', 'Catering out on time']
      : p.w === 'late' ? ['So close', 'Catering out late']
      : p.w === 'quit' ? ['Week ended · ' + day.name, 'Closed early']
      : ['Rough week · ' + day.name, 'Three coffees down'];
  }
  /* The week as text to share (owner 2026-11-13): a coloured square a day,
     the tips, and what it kept. Never the week code: that stays private. */
  var SQUARE = { legendary: '\uD83D\uDFE8', epic: '\uD83D\uDFEA', rare: '\uD83D\uDFE6', normal: '\u2B1C', bad: '\uD83D\uDFE5' };
  /* Where to play, as the picture and the text say it (owner 2026-11-13):
     site.json's game.playAt, else the site's own address and /play. */
  var PLAY_AT = STATS.playAt || String(STATS.home || 'https://lvcafetogo.com').replace(/^https?:\/\//, '').replace(/\/$/, '') + '/play';
  function weekText(p) {
    var lines = ['Order Up, ' + (D.levels[p.l] ? D.levels[p.l].name + ' week' : 'a week') + ': ' + weekHead(p)[1].toLowerCase()];
    p.t.forEach(function (tips, i) { var r = cutShort(p, i) ? null : rankOf(p.s[i]); lines.push((r ? SQUARE[r.rarity] : SQUARE.bad) + ' ' + D.days[i].short + ' ' + money(tips) + (r ? ' · ' + rankWords(p.s[i]) : ' · ' + stopWords(p).toLowerCase())); });
    if (p.f !== '') lines.push('Catering ' + money(p.f));
    if (p.e) lines.push('Week completion bonus +' + money(p.e));
    if (p.b) lines.push('Performance bonus +' + money(p.b));
    if (p.x) lines.push('Free items turned down +' + money(p.x));
    if (p.sp) lines.push('Spent on items −' + money(p.sp));
    lines.push('Kept ' + money(p.k));
    lines.push('A little game from The Café, Leavenworth KS. Play it at ' + PLAY_AT);
    return lines.join('\n');
  }
