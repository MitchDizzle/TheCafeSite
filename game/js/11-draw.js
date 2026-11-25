  /* ---------- 6. drawing the kitchen ---------- */
  var dirty = {};
  function dirtyAll() { dirty = { hud: true, rail: true, grill: true, plate: true, bins: true, pass: true }; }

  function binOpen(part) {
    if (part === 'roll') return has('rollcase') && T.bins === 'breakfast';
    if (part === 'puff') return has('puffcase') && T.bins === 'lunch';
    if (D.bins.lunchOnly.indexOf(part) !== -1 && T.bins !== 'lunch') return false;
    if (part === 'special' && T.cat) return false;
    if (T.noShow === part && T.bins === 'breakfast' && trouble('noshow')) return false;
    return true;
  }

  function drawHud() {
    $('#ou-day').textContent = T.cat ? 'Catering' : D.days[G.day].name;
    var cups = '';
    for (var i = 0; i < TU.cups; i++) cups += '<span' + (i < T.cups ? '' : ' class="is-spilled"') + '>' + spr(i < T.cups ? 'cup' : 'cup-spilled') + '</span>';
    var el = $('#ou-cups'); el.innerHTML = cups;
    el.setAttribute('aria-label', plural(T.cups, 'coffee', 'coffees') + ' left');
    $('#ou-tips').textContent = money(T.tips);
  }
  function popTips() { var el = $('#ou-tips'); el.classList.remove('is-pop'); void el.offsetWidth; el.classList.add('is-pop'); }

  function drawRail() {
    var rail = $('#ou-rail'), aim = aimTicket();
    stage.classList.toggle('is-dark', !!(T.dark > 0));
    if (!T.tickets.length) {
      rail.innerHTML = '<div class="ou-rail-empty">' + (T.closing ? 'The rail is clear.' : 'No tickets. Get ahead: start something cooking.') + '</div>';
      return;
    }
    rail.innerHTML = T.tickets.map(function (t) {
      var have = aim && aim.t === t ? aim.have : null, cls = 'ou-ticket', flag = '';
      if (t.age < 0.25) cls += ' is-new';
      if (t.togo) cls += ' is-togo';
      if (t.hurry) cls += ' is-hurry';
      if (t.late) cls += ' is-late';
      if (have) cls += ' is-aim';
      if (t.special) { cls += ' is-special'; flag = 'Special'; }
      if (t.usual) { cls += ' is-usual'; flag = 'x3'; }
      if (t.family) { cls += ' is-family'; flag = 'Free'; }
      var label = t.family ? esc(t.who.replace(/^Your /, '')) :t.catering ? 'Catering' : '#' + t.n + (t.late ? ' · Late' : t.hurry ? ' · Impatient' : t.togo ? ' · To go' : t.usual ? ' · The usual' : '');
      var parts = t.parts.map(function (p, i) { return '<span' + (have && have[i] ? ' class="is-have"' : '') + '>' + partSprite(p) + '</span>'; }).join('');
      return '<div class="' + cls + '" data-id="' + t.id + '"' + (flag ? ' data-flag="' + flag + '"' : '') + '>' +
        '<span class="ou-label">' + label + '</span><span class="ou-tname">' + esc(t.name) + '</span>' +
        '<span class="ou-parts" aria-label="' + esc(t.parts.map(function (p) { return D.parts[p].name; }).join(', ')) + '">' + parts + '</span>' +
        '<span class="ou-timer"><i></i></span></div>';
    }).join('');
    T.tickets.forEach(function (t) { t.bar = rail.querySelector('[data-id="' + t.id + '"] .ou-timer i'); });
  }

  function drawGrill() {
    var n = usable(), all = spots(), html = '', swipe = level().flip === 'swipe', now = performance.now();
    for (var i = 0; i < all; i++) {
      if (i >= n) { html += '<div class="ou-spot is-broken" data-tag="Out today" aria-label="Broken: out today"></div>'; continue; }
      var it = T.grill[i], cold = trouble('cold') && i === T.coldAt ? ' is-cold' : '';
      if (!it) { html += '<div class="ou-spot' + cold + '"' + (cold ? ' data-tag="Cold spot"' : '') + '></div>'; continue; }
      var name = D.parts[it.part].name;
      var tag = it.state === 'done' ? 'Pull' : it.state === 'burnt' ? 'Burnt' : it.state === 'flip' ? (swipe ? 'Swipe' : 'Flip') : '';
      var says = it.state === 'raw' ? 'cooking' : it.state === 'flip' ? 'ready to flip' : it.state;
      var pale = it.state === 'flip' || (it.state === 'raw' && !it.flipped);      // the side that's up is still raw
      // A flip in the air and a flare-up run on their own clocks, so a redraw
      // half way through picks them up where they were (--ago, in ms).
      var flipAgo = it.flipAt ? now - it.flipAt : 1e9, burnAgo = it.burnAt ? now - it.burnAt : 1e9;
      var flying = flipAgo < FLIP_MS, flaring = it.state === 'burnt' && burnAgo < FLAME_MS;
      html += '<button class="ou-spot is-' + it.state + cold + (it.flipped ? ' is-turned' : '') + (flying ? ' is-flipping' : '') + '" data-act="spot" data-i="' + i + '"' +
        (flying || flaring ? ' style="--ago:' + Math.round(flying ? flipAgo : burnAgo) + '"' : '') +
        (tag ? ' data-tag="' + tag + '"' : '') + ' aria-label="' + name + ', ' + says + '">' +
        '<svg class="ou-ring" viewBox="0 0 64 64" aria-hidden="true"><circle class="ou-ring-bg" cx="32" cy="32" r="29"/><circle class="ou-ring-fg" cx="32" cy="32" r="29"/></svg>' +
        '<span class="ou-food ou-sh">' + partSprite(it.part, '', pale) + '</span>' +
        (it.state === 'burnt' ? '<svg class="ou-smoke" viewBox="0 0 30 16" aria-hidden="true"><path class="ou-steam" d="M5 15c-4-4 4-6 0-11M15 15c-4-4 4-6 0-11M25 15c-4-4 4-6 0-11" stroke="#C5CFD3" stroke-width="2.500" fill="none" stroke-linecap="round"/></svg>' : '') +
        (flying ? '<i class="ou-puff" aria-hidden="true"></i>' : '') +
        (flaring ? spr('flame', 'ou-flame') : '') +
        '</button>';
    }
    var el = $('#ou-griddle'); el.className = 'ou-griddle is-n' + all; el.innerHTML = html;
    for (var j = 0; j < n; j++) if (T.grill[j]) T.grill[j].fg = el.children[j].querySelector('.ou-ring-fg');
  }

  var LAYOUT = {
    1: [[50, 50]], 2: [[34, 50], [66, 50]], 3: [[50, 33], [32, 64], [68, 64]],
    4: [[33, 34], [67, 34], [33, 67], [67, 67]], 5: [[50, 50], [28, 30], [72, 30], [28, 71], [72, 71]]
  };
  function drawPlate() {
    var lay = LAYOUT[T.plate.length] || [];
    $('#ou-plate').innerHTML = spr('plate', 'ou-sh') + T.plate.map(function (p, i) {
      return '<button class="ou-pi' + (i === T.plateNew ? ' is-new' : '') + '" data-act="pi" data-i="' + i + '" style="left:' + lay[i][0] + '%;top:' + lay[i][1] + '%" aria-label="Take off ' + D.parts[p].name + '">' + partSprite(p) + '</button>';
    }).join('');
    T.plateNew = -1;
    var m = findMatch(), sendEl = $('#ou-send');
    sendEl.className = 'ou-send' + (m ? ' is-ready' : ' is-off');
    $('#ou-scrap').disabled = !T.plate.length;
    drawSpare();
    drawHint();
  }

  function drawSpare() {
    var el = $('#ou-spare'), on = !!has('spare');
    el.hidden = !on; if (!on) return;
    var n = T.spare.length, show = T.spare.slice(0, n > 3 ? 2 : 3);
    var lay = { 1: [[50, 50]], 2: [[34, 50], [66, 50]], 3: [[50, 32], [30, 64], [70, 64]] }[show.length] || [];
    el.innerHTML = spr('plate') + show.map(function (p, i) { return '<span style="left:' + lay[i][0] + '%;top:' + lay[i][1] + '%">' + partSprite(p) + '</span>'; }).join('') +
      (n > 3 ? '<em>+' + (n - 2) + '</em>' : '') + '<b>' + (n ? 'Swap' : T.plate.length ? 'Park' : 'Spare') + '</b>';
    el.className = 'ou-spare' + (n ? ' is-full' : '');
    el.setAttribute('aria-label', n ? 'Second plate: ' + T.spare.map(function (p) { return D.parts[p].name; }).join(', ') + '. Tap to swap the plates' : 'Second plate, empty. Tap to park this plate on it');
  }

  var hintHold = 0;
  function hintFlash(text) { var el = $('#ou-hint'); el.textContent = text; el.className = 'ou-hint is-bad'; hintHold = 1.1; }
  function drawHint() {
    if (hintHold > 0) return;
    var el = $('#ou-hint'), text = '', bad = false, m = T.plate.length ? findMatch() : null;
    var coach = !save.seen && G.day === 0 && !T.cat;
    if (T.plate.length) {
      if (m) text = coach ? 'That’s a ticket. Tap Send.' : 'Ready: ' + m.t.name;
      else { var aim = aimTicket(); if (aim) text = 'For ' + aim.t.name; else { text = 'Not on a ticket. Tap food to take it off.'; bad = true; } }
    } else if (coach) {
      var doneOne = T.grill.some(function (x) { return x && x.state === 'done'; }), rawOne = T.grill.some(function (x) { return x && x.state === 'raw'; });
      var flipOne = T.grill.some(function (x) { return x && x.state === 'flip'; });
      text = flipOne ? (level().flip === 'swipe' ? 'Swipe across it to flip it.' : 'Half way. Tap it to flip it.') : doneOne ? 'Done. Tap it to plate it.' : rawOne ? 'Cooking. Wait for the ring.' : T.tickets.length ? 'Tap the bins a ticket shows.' : 'Tickets land up top.';
    } else if (T.cat) {
      text = plural(T.cat.n - T.cat.done, 'platter', 'platters') + ' to go';
    }
    el.textContent = text; el.className = 'ou-hint' + (bad ? ' is-bad' : '');
  }

  function drawBins() {
    var full = !T.grill.slice(0, usable()).some(function (x) { return !x; });
    $('#ou-bins').innerHTML = D.bins[T.bins].map(function (part) {
      var p = D.parts[part];
      if ((part === 'roll' || part === 'puff') && !binOpen(part)) return '<span></span>';
      var open = binOpen(part), cls = 'ou-bin' + (p.cook ? ' is-cook' : '') + (open ? '' : ' is-off') + (open && p.cook && full ? ' is-full' : '');
      return '<button class="' + cls + '" data-act="bin" data-part="' + part + '"' + (open ? '' : ' aria-disabled="true"') + '>' + partSprite(part, 'ou-sh') + '<span class="ou-label">' + p.name + '</span></button>';
    }).join('');
  }

  function drawPass() {
    $('#ou-phase').textContent = T.cat ? 'Catering' : T.closing ? 'Last call' : T.bins === 'lunch' ? 'Lunch' : T.phase === 'lunch' ? 'Last breakfast' : 'Breakfast';
    var html = '';
    if (has('counter')) html += '<span title="Counter Help">' + spr('apron') + '</span>';
    if (has('linecook')) html += '<span title="Line Cook">' + spr('hat') + '<span class="ou-meter"><i id="ou-line"></i></span></span>';
    if (T.cookies > 0) html += '<button class="ou-cookie" data-act="cookie" aria-label="Cookie: start every ticket’s clock over. ' + T.cookies + ' left">' + spr('cookie') + '<b>' + T.cookies + '</b></button>';
    $('#ou-crew').innerHTML = html;
    T.lineEl = stage.querySelector('#ou-line');
  }

  /* The strip of sky in the window: dawn at 6am, gold by 8, blue by 11. */
  var SKY = [
    [360, '#9C8BC4', '#F4A9B8', '#F8BE8A'], [480, '#F4A9B8', '#F8BE8A', '#F7D88C'],
    [660, '#9FD3E3', '#BFE2EC', '#F7E6B8'], [780, '#7EC4DA', '#A9DCEA', '#D4EEF4'], [840, '#7EC4DA', '#A9DCEA', '#D4EEF4']
  ];
  function mix(a, b, f) {
    var out = '#';
    for (var i = 1; i < 7; i += 2) { var x = parseInt(a.substr(i, 2), 16), y = parseInt(b.substr(i, 2), 16), v = Math.round(x + (y - x) * f).toString(16); out += v.length < 2 ? '0' + v : v; }
    return out;
  }
  function drawSky(min) {
    var pass = $('#ou-pass');
    if (T.cat) { pass.style.setProperty('--sky1', '#6E5E9E'); pass.style.setProperty('--sky2', '#E88FA0'); pass.style.setProperty('--sky3', '#F59E5E'); pass.style.setProperty('--sun-y', '40px'); return; }
    var i = 0; while (i < SKY.length - 2 && min > SKY[i + 1][0]) i++;
    var a = SKY[i], b = SKY[i + 1], f = Math.max(0, Math.min(1, (min - a[0]) / (b[0] - a[0])));
    for (var k = 1; k <= 3; k++) pass.style.setProperty('--sky' + k, mix(a[k], b[k], f));
    var day = (min - 360) / 480;
    pass.style.setProperty('--sun-x', (8 + day * 80) + '%');
    pass.style.setProperty('--sun-y', (22 - Math.sin(Math.min(1, day * 1.15) * Math.PI) * 20) + 'px');
  }

  function draw(dt) {
    if (hintHold > 0) { hintHold -= dt; if (hintHold <= 0) { hintHold = 0; drawHint(); } }
    // late flags flip here so a ticket shakes once, when it turns
    T.tickets.forEach(function (t) {
      if (t.catering) return;
      var late = t.left / t.total < TU.lateAt;
      if (late !== t.late) { t.late = late; dirty.rail = true; }
    });
    if (dirty.hud) drawHud();
    if (dirty.rail) { drawRail(); if (!dirty.plate) drawPlate(); }
    if (dirty.grill) drawGrill();
    if (dirty.plate) drawPlate();
    if (dirty.bins) drawBins();
    if (dirty.pass) drawPass();
    dirty = {};

    // the cheap, every-frame parts
    var i, t;
    for (i = 0; i < T.tickets.length; i++) {
      t = T.tickets[i]; if (!t.bar) continue;
      var f = t.catering ? T.cat.left / T.cat.total : t.left / t.total;
      t.bar.style.transform = 'scaleX(' + Math.max(0, Math.min(1, f)).toFixed(3) + ')';
    }
    var burnAfter = burnSecs(), gold = has('goldspat');
    for (i = 0; i < T.grill.length; i++) {
      var it = T.grill[i]; if (!it || !it.fg || it.state === 'burnt') continue;
      var cook = cookTime(it.part, i);
      var left = it.state === 'raw' ? 1 - it.t / cook : gold ? 0 : it.state === 'flip' ? it.wait / burnAfter : (it.t - cook) / burnAfter;
      it.fg.style.strokeDashoffset = (182.2 * Math.max(0, Math.min(1, left))).toFixed(1);
    }
    if (T.lineEl) T.lineEl.style.transform = 'scaleX(' + Math.min(1, T.lineT / LINE_S).toFixed(3) + ')';

    var clock;
    if (T.cat) { var s = Math.max(0, Math.ceil(T.cat.left)); clock = Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60); }
    else clock = clockText(minutesNow());
    if (clock !== T.lastClock) { T.lastClock = clock; $('#ou-clock').textContent = clock; drawSky(T.cat ? 0 : minutesNow()); }
  }

  var toastTimer = 0, bannerTimer = 0, BANNER_S = 2;     // seconds a banner stays over the rail
  function toast(text) {
    var el = $('#ou-toast'); el.textContent = text; el.classList.add('is-on');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.classList.remove('is-on'); }, 1700);
  }
  function banner(title, sub) {
    var el = $('#ou-banner'); el.innerHTML = '<b>' + esc(title) + '</b><span>' + esc(sub || '') + '</span>';
    el.classList.remove('is-on'); void el.offsetWidth; el.classList.add('is-on');
    clearTimeout(bannerTimer); bannerTimer = setTimeout(function () { el.classList.remove('is-on'); }, BANNER_S * 1000);
  }

