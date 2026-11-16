  /* ---------- 7. the paper screens ---------- */
  function show(name) {
    screen = name;
    if (name === 'title' || name === 'dawn') setMood('day');      // a new week or a new day: the day's tune again
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
    info.innerHTML = '<b>' + esc(it.name) + '</b> <span>' + D.rarityNames[it.rarity] + (n > 1 ? ' · you have ' + n : '') + '</span><br>' + itemText(it, n) +
      (G && G.ist && G.ist[id] && G.ist[id].d ? '<br><small>This week: ' + didText(id, G.ist[id]) + '</small>' : '');
    info.hidden = false;
  }

  function troubleCard() {
    var tr = troubleOf(G.trouble); if (!tr) return '';
    return '<div class="ou-trouble" role="note">' + spr(tr.icon) + '<span><span class="ou-label">Trouble today</span><b>' + esc(tr.name) + '</b>' + esc(troubleText(tr, G.troublePart)) + '</span></div>';
  }
  function showDawn() {
    var day = D.days[G.day], friday = G.day === D.days.length - 1;
    if (G.troubleDay !== G.day) { G.trouble = dealTrouble(); G.troubleDay = G.day; }
    // Each special once a week (owner 2026-11-13): one served this week is never
    // offered again, and the morning's three are ones not yet seen this week
    // while there are any (15 specials, 15 cards a week). Dealt once a morning.
    if (G.offersDay !== G.day || G.offers.length < 3) {
      var left = D.specials.filter(function (x) { return G.usedSp.indexOf(x.id) === -1; });
      var fresh = shuffle(left.filter(function (x) { return G.seenSp.indexOf(x.id) === -1; }));
      G.offers = fresh.concat(shuffle(left.filter(function (x) { return fresh.indexOf(x) === -1; }))).slice(0, 3);
      G.offers.forEach(function (x) { if (G.seenSp.indexOf(x.id) === -1) G.seenSp.push(x.id); });
      G.offersDay = G.day;
    }
    keepRun('dawn');
    paper('dawn',
      '<div class="ou-top ou-top--dawn ou-top--back"><button class="ou-topback" data-act="home">Back</button><span class="ou-kicker">Today’s special</span><h2 class="ou-h">' + day.name + ', 6am</h2><span class="ou-label">Choose today’s lunch special</span></div>' +
      '<div class="ou-body-pad">' + troubleCard() + G.offers.map(function (s, i) {
        return '<button class="ou-card ou-card--special" data-act="special" data-i="' + i + '">' +
          '<span class="ou-ci">' + (s.photo ? '<img src="' + esc(s.photo) + '" alt="" loading="lazy">' : spr('special')) + '</span>' +
          '<span><b>' + esc(s.name) + '</b><span class="ou-ct">' + esc(s.sides.join(', ')) + '</span>' +
          '<span class="ou-chip">' + (s.sides.length > 1 ? 'Two sides · higher tips' : 'One side · quicker') + '</span></span><span></span></button>';
      }).join('') +
      '<p class="ou-note">Lunch starts at 11am. ' + (friday ? 'Friday ends with a catering order: five platters on one clock.' : 'Three walk-outs in a day and the week is over.') + '</p>' +
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
