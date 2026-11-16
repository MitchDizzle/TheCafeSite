  /* ---------- 8. taps ---------- */
  function setPaused(on) {
    if (!T || screen !== 'shift' || T.ended) return;
    T.paused = on; $('#ou-pausebox').hidden = !on;
    if (on) $('#ou-pause-own').innerHTML = ownedRow();
  }
  stage.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]'); if (!el || !stage.contains(el)) return;
    tapped(e);
    var act = el.getAttribute('data-act'), i = parseInt(el.getAttribute('data-i'), 10);
    var live = T && screen === 'shift' && !T.paused && !T.ended;
    switch (act) {
      case 'start': sfx.tap(); $('#ou-confirm').hidden = true; newRun(); if (!save.seen) showHow('dawn'); break;   // first week: the rules first
      case 'fresh':                // New week while one is saved: ask first
        $('#ou-confirm-q').textContent = 'Start a new week? Your ' + D.days[save.run.day].name + ' will be lost.';
        $('#ou-confirm').hidden = false; $('#ou-confirm').querySelector('[data-act="keep"]').focus(); sfx.tap(); break;
      case 'keep': $('#ou-confirm').hidden = true; sfx.tap(); break;
      case 'home': G = null; T = null; show('title'); drawTitle(); sfx.tap(); break;      // the week was kept this morning
      case 'leave': $('#ou-pausebox').hidden = true; if (T) T.ended = true; clearBubbles(); G = null; T = null; show('title'); drawTitle(); break;
      case 'continue': sfx.tap(); if (save.run) resumeRun(); else newRun(); break;
      case 'level': if (D.levels[el.getAttribute('data-level')]) { save.level = el.getAttribute('data-level'); persist(); drawTitle(); sfx.tap(); } break;
      // Pause's two buttons step through Off, Low, Medium, High; Settings picks one.
      case 'music': save.musicVol = (save.musicVol + 1) % 4; persist(); setVolumes(); drawTitle(); break;
      case 'style': if (STYLES[el.getAttribute('data-v')]) { save.musicStyle = el.getAttribute('data-v'); music.wantStyle = save.musicStyle; persist(); drawSettings(); sfx.tap(); } break;
      case 'vol':
        var vk = el.getAttribute('data-kind') === 'music' ? 'musicVol' : 'sfxVol';
        save[vk] = Math.max(0, Math.min(3, parseInt(el.getAttribute('data-v'), 10) || 0)); persist(); setVolumes(); drawTitle(); drawSettings();
        if (vk === 'sfxVol') sfx.done();
        break;
      case 'stats': save.noStats = !save.noStats; save.told = true; persist(); drawSettings(); sfx.tap(); break;
      case 'settings': sfx.tap(); showSettings(); break;
      case 'ach': sfx.tap(); showAch('title'); break;
      case 'past': sfx.tap(); showPast('title'); break;
      case 'share': if (save.past[i]) shareWeek(save.past[i]); sfx.tap(); break;
      case 'showcode': showCode(el); sfx.tap(); break;
      case 'install':
        if (installEvt) { var ev = installEvt; installEvt = null; ev.prompt(); if (ev.userChoice) ev.userChoice.then(function () { if (screen === 'settings') drawSettings(); }); }
        break;
      case 'savecopy':
        saveCode().then(function (code) {
          var box = $('#ou-code'), msg = $('#ou-code-msg'); if (!box) return;
          box.hidden = false; box.value = code; box.readOnly = true; box.select();
          $('[data-act="saveload"]').hidden = true;
          var done = function (ok) { msg.textContent = ok ? 'Copied. Paste it somewhere safe, like a note or a message to yourself.' : 'Select the code above and copy it.'; };
          try { navigator.clipboard.writeText(code).then(function () { done(true); }, function () { done(false); }); } catch (e) { done(false); }
        });
        sfx.tap(); break;
      case 'saveopen':
        var box2 = $('#ou-code'); box2.hidden = false; box2.readOnly = false; box2.value = ''; box2.focus();
        $('[data-act="saveload"]').hidden = false; $('#ou-code-msg').textContent = 'Paste your code, then Load.'; sfx.tap(); break;
      case 'saveload':
        loadCode($('#ou-code').value).then(function (words) { drawSettings(); $('#ou-code-msg').textContent = words; drawTitle(); });
        break;
      case 'achreset':             // two taps, so it isn't lost to a stray one
        if (!resetArmed) { resetArmed = true; drawSettings(); sfx.tap(); break; }
        resetArmed = false; save.ach = {}; persist(); drawSettings(); toast('Achievements reset'); sfx.bad(); break;
      case 'fryer':
        var fry = fryerItem();
        if (fry && G.tips >= fry.price) { G.tips -= fry.price; G.bought++; own(fry); ist('fryer').paid += fry.price; sfx.win(); drawClose(); break; }
        sfx.bad(); el.classList.remove('is-nope'); void el.offsetWidth; el.classList.add('is-nope'); break;
      case 'how': showHow(screen); break;
      case 'box': showBox(screen === 'over' ? 'over' : 'title'); break;
      case 'back': closeOverlay(); break;
      case 'sound': save.sfxVol = (save.sfxVol + 1) % 4; persist(); setVolumes(); drawTitle(); sfx.done(); break;
      case 'special': sfx.tap(); if (G.usedSp.indexOf(G.offers[i].id) === -1) G.usedSp.push(G.offers[i].id); startDay(G.offers[i]); break;
      case 'bin': if (live) tapBin(el.getAttribute('data-part')); break;
      case 'spot': if (live && performance.now() - grabbedAt > 500) spotGesture(i, e.detail === 0 ? 'key' : 'tap'); break;   // a touch or mouse was dealt with on pointerup
      case 'pi': if (live) tapPlateItem(i); break;
      case 'scrap': if (live) scrap(); break;
      case 'swap': if (live) swapPlates(); break;
      case 'send': if (live) send(); break;
      case 'cookie': if (live) eatCookie(); break;
      case 'bubble': if (live) tapBubble(el.getAttribute('data-id')); break;
      case 'pause': setPaused(true); break;
      case 'resume': setPaused(false); break;
      case 'quit': $('#ou-pausebox').hidden = true; T.ended = true; weekOver(false, 'quit'); break;
      case 'pick': own(G.pick[i]); sfx.buy(); toShop(); break;
      case 'skip':                 // no free item tonight: tips instead (owner 2026-11-12)
        var bonus = skipBonus(); G.tips += bonus; G.earned += bonus; G.bonus += bonus; sfx.buy(); toShop(); break;
      case 'owninfo': ownInfo(el); sfx.tap(); break;
      case 'buy':
        var it = G.shop[i], cost = priceOf(it);
        if (G.sold.indexOf(i) !== -1) break;
        if (G.tips < cost) { sfx.bad(); break; }
        G.tips -= cost; G.bought++; own(it); ist(it.id).paid += cost; G.sold.push(i); sfx.buy(); drawClose(); break;
      case 'reroll':
        if (G.tips < G.reroll) break;
        G.tips -= G.reroll; G.reroll += D.reroll.step; G.shop = deal(3, [], true); G.sold = []; G.fryer = rand() * 100 < (D.legendaryChance || 0); sfx.tap(); drawClose(); break;
      case 'next': G.day++; sfx.tap(); showDawn(); break;
    }
    musicSync();
  });
  document.addEventListener('visibilitychange', function () { if (document.hidden) setPaused(true); musicSync(); });
  stage.addEventListener('submit', function (e) {
    var form = e.target; if (!form || form.id !== 'ou-sendin') return;
    e.preventDefault();
    var name = form.elements.name.value.replace(/\s+/g, ' ').trim(), contact = form.elements.contact ? form.elements.contact.value.trim() : '';
    if (!name) { form.elements.name.focus(); return; }
    if (lastRun) report('score', { run: lastRun.run, lvl: lastRun.lvl, name: name, contact: contact, total: Number(form.elements.total.value), web: form.elements.website.value ? 1 : 0,
      earned: lastRun.earned, spent: lastRun.spent, bonus: lastRun.bonus, finish: lastRun.finish, days: lastRun.days, cater: lastRun.cater, why: lastRun.why, day: lastRun.day, items: lastRun.items, secs: lastRun.secs });
    form.outerHTML = '<p class="ou-note ou-sent" role="status">Sent. Thank you!</p>';
  });

  /* The flat-top takes a tap or a swipe. Both are read here, on the way up,
     from where the finger went down: a click can get lost when the griddle is
     redrawn under the finger, and a swipe is never a click at all. */
  var grab = null, grabbedAt = -1e9, scaleNow = 1;
  stage.addEventListener('pointerdown', function (e) {
    var el = e.target.closest ? e.target.closest('[data-act="spot"]') : null;
    grab = el ? { i: parseInt(el.getAttribute('data-i'), 10), x: e.clientX, y: e.clientY, id: e.pointerId } : null;
  });
  window.addEventListener('pointerup', function (e) {
    if (!grab || e.pointerId !== grab.id) return;
    var g = grab, dx = e.clientX - g.x, dy = e.clientY - g.y, far = Math.sqrt(dx * dx + dy * dy) > 18 * scaleNow;
    grab = null; grabbedAt = performance.now();
    if (far) tapped(e);
    if (T && screen === 'shift' && !T.paused && !T.ended) { spotGesture(g.i, far ? 'swipe' : 'tap'); musicSync(); }
  });
  window.addEventListener('pointercancel', function () { grab = null; });

  /* ---------- the loop ---------- */
  var last = 0;
  function frame(now) {
    var real = Math.min(0.1, (now - last) / 1000), dt = real * speed; last = now;
    if (T && screen === 'shift' && !T.ended) { if (T.paused) T.away += real; else T.played += real; }
    if (T && screen === 'shift' && !T.paused) {
      if (!T.ended) update(dt);
      if (T && screen === 'shift') draw(dt);
    }
    requestAnimationFrame(frame);
  }

