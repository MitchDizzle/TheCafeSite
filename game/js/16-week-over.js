  function showPast(from) {
    var list = save.past;
    iconsFor(list);
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
    // Each item's week, added to every week before (kept on the phone only).
    for (var li in G.ist) {
      var L = save.itemLife[li] || (save.itemLife[li] = { weeks: 0, d: 0, tips: 0, n: 0, paid: 0 }), w = G.ist[li];
      L.weeks++; L.d += w.d; L.tips += w.tips; L.n += w.n; L.paid += w.paid;
    }
    var itemRows = itemTable(G.ist);
    var kept = Math.max(0, G.tips), spent = Math.max(0, G.earned - G.tips);
    var lvName = level().name, best = kept > (save.keeps[G.level] || 0);
    if (best) { save.keeps[G.level] = kept; save.bestRuns[G.level] = G.run; }
    var past = keepWeek(kept, win ? 'win' : why, spent);
    save.weeks++; if (win) save.wins++; save.best = Math.max(save.best, kept); save.seen = true; save.run = null; persist();
    // The music moves to a tune for how it went (owner 2026-11-13): brighter
    // for a week won, slow and minor for one lost. Ended from pause: no change.
    if (win) { sfx.win(); setMood('win'); } else if (why !== 'quit') { sfx.lose(); setMood('lose'); }
    report('end', { day: G.day, why: win ? 'win' : why, total: kept, earned: G.earned, secs: Math.round(G.played), away: Math.round(G.away),
      items: Object.keys(G.items), u: T ? T.untrusted : 0, taps: T ? T.taps : '', days: weekDays(), cater: G.cater == null ? '' : G.cater, spent: spent, bonus: G.bonus, finish: G.finish, perf: G.perf || 0, ach: G.newAch.slice() });
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
    if (G.perf) rows += '<div><b></b><span>Performance bonus</span><strong>+' + money(G.perf) + '</strong></div>';
    rows += '<div><b>Week</b><span>Tips earned</span><strong>' + money(G.earned) + '</strong></div>';
    if (G.bonus) rows += '<div><b></b><span>Free items turned down</span><strong>+' + money(G.bonus) + '</strong></div>';
    rows += '<div><b></b><span>Spent on items</span><strong>' + (spent ? '−' + money(spent) : '$0') + '</strong></div>';
    rows += '<div class="is-total"><b>Kept</b><span>your score</span><strong>' + money(kept) + '</strong></div>';
    iconsFor([past]);
    paper('over',
      '<div class="ou-top' + (win ? ' ou-top--fri' : '') + '"><span class="ou-kicker">' + head[0] + '</span><h2 class="ou-h">' + head[1] + '</h2>' +
      '<span class="ou-label">' + (best ? 'A new best ' + lvName + ' week' : 'Best ' + lvName + ' week: ' + money(save.keeps[G.level] || 0) + ' kept') + '</span></div>' +
      '<div class="ou-body-pad"><div class="ou-week">' + rows + '</div>' +
      '<div class="ou-row ou-row--code">' + codeButton(G.run, '') + shareButton(0) + '</div>' +
      '<p class="ou-fine">The Café can look this week up by its code. Keep it to yourself: it’s hidden until you tap, and a screenshot or a share never shows it. Past weeks, on the title screen, keeps it for later.</p>' +
      '<p class="ou-fine">A day’s colour is its slips (walk-outs and burnt food): gold for none, purple for one, blue for two or three. Red is where the week went wrong.</p>' +
      (G.newAch.length ? '<span class="ou-label">Achievements this week</span>' + achList(G.newAch) : '') +
      itemRows + sendIn +
      '<p class="ou-fine">' + TIPS_NOTE + '</p>' +
      '<div class="ou-row"><button class="ou-btn ou-btn--quiet" data-act="box">Recipe Box</button><a class="ou-btn ou-btn--quiet" href="/menu">The real menu</a></div>' +
      '</div><div class="ou-foot"><button class="ou-btn" data-act="home">Back to the title</button></div>');
    G = null; T = null;
  }

