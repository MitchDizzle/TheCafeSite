  function showBox(from) {
    var list = D.recipes.concat([D.rollRecipe]).map(function (r) { return { id: r.id, name: r.name, photo: r.photo, sprite: D.parts[r.parts[r.parts.length > 1 ? 1 : 0]].sprite }; })
      .concat(D.specials.map(function (s) { return { id: 'sp-' + s.id, name: s.name, photo: s.photo, sprite: 'special' }; }));
    var seen = list.filter(function (r) { return save.served[r.id]; }).length;
    paper('box',
      '<div class="ou-top ou-top--back"><span class="ou-kicker">Recipe Box</span><h2 class="ou-h">' + seen + ' of ' + list.length + ' served</h2><span class="ou-label">Serve one 10 times to see our photo of it</span>' +
      '<button class="ou-topback" data-act="back">Back</button></div>' +
      '<div class="ou-body-pad"><div class="ou-grid">' + list.map(function (r) {
        var n = save.served[r.id] || 0, real = n >= 10 && r.photo;
        return '<div class="ou-rc' + (n ? '' : ' is-new') + '"><span class="ou-rp">' + (real ? '<img src="' + esc(r.photo) + '" alt="' + esc(r.name) + ' at The Café" loading="lazy">' : spr(r.sprite)) + '</span>' +
          '<div><b>' + esc(r.name) + '</b><span>' + (n ? 'Served ' + n + (!r.photo ? (n >= 10 ? ' · no photo yet' : '') : n < 10 ? ' · photo at 10' : '') : 'Not served yet') + '</span></div></div>';
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
    // Off, Low, Medium, High (owner 2026-11-13), one row of four.
    var vol = function (kind, label, v, note) {
      return '<div class="ou-set ou-set--vol" role="group" aria-label="' + label + '"><span><b>' + label + '</b><small>' + note + '</small></span><span class="ou-seg">' +
        VOL_NAMES.map(function (n, i) { return '<button data-act="vol" data-kind="' + kind + '" data-v="' + i + '" aria-pressed="' + (i === v) + '">' + n + '</button>'; }).join('') + '</span></div>';
    };
    var row = function (act, label, on, note) {
      return '<button class="ou-set" data-act="' + act + '" aria-pressed="' + on + '"><span><b>' + label + '</b>' + (note ? '<small>' + note + '</small>' : '') + '</span><i>' + (on ? 'On' : 'Off') + '</i></button>';
    };
    paper('settings',
      '<div class="ou-top ou-top--back"><span class="ou-kicker">Settings</span><h2 class="ou-h">Order Up</h2><span class="ou-label">Version ' + esc(OrderUp.version) + '</span>' +
      '<button class="ou-topback" data-act="back">Back</button></div>' +
      '<div class="ou-body-pad">' +
      vol('sfx', 'Sound', save.sfxVol, 'The sizzle, the bell, the tickets.') +
      vol('music', 'Music', save.musicVol, 'Made as it plays, never the same twice. It picks up when the kitchen does.') +
      // Which music (owner 2026-11-13): the jazz, or retro electronic.
      '<div class="ou-set ou-set--vol" role="group" aria-label="Music style"><span><b>Music style</b></span><span class="ou-seg">' +
        Object.keys(STYLES).map(function (id) { return '<button data-act="style" data-v="' + id + '" aria-pressed="' + (id === save.musicStyle) + '">' + STYLES[id].name + '</button>'; }).join('') + '</span></div>' +
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
    go.textContent = run ? 'Continue: ' + (run.at === 'close' ? D.days[run.day].short + ' night' : D.days[run.day].name) : 'Start the week';
    go.setAttribute('data-act', run ? 'continue' : 'start');
    $('#ou-fresh').hidden = !run;
    $('#ou-confirm').hidden = true;
    $('#ou-sound-pause').innerHTML = '<span>Sound</span>' + VOL_NAMES[save.sfxVol];
    $('#ou-music-pause').innerHTML = '<span>Music</span>' + VOL_NAMES[save.musicVol];
  }

