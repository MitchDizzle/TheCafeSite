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

