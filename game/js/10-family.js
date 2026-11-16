  /* ---------- 5. family at the counter ----------
     They eat free and they talk. Each line sits on top of the kitchen until
     it's tapped, which is the whole problem. Words only, never a face. */
  function familyArrives() {
    T.familyAt = null;
    var pool = D.recipes.filter(function (r) { return r.when === 'lunch' && r.tier <= 2 && r.parts.length > 1; });
    var who = pick(D.family.who);
    var t = makeTicket(pick(pool), { family: true, who: who });
    T.tickets.push(t);
    T.fam = { who: who, say: 1.2, said: 0 };
    dirty.rail = true;       // no banner, no warning: they just turn up (owner 2026-11-11)
    sfx.talk();
  }
  function addBubble() {
    var box = $('#ou-bubbles'), h = stage.offsetHeight, bw = 196, x, y, tries = 0, ok;
    do {
      x = 6 + rand() * (W - bw - 12); y = 172 + rand() * Math.max(40, h - 172 - 150); ok = true;
      for (var i = 0; i < T.bubbles.length; i++) if (Math.abs(T.bubbles[i].x - x) < 90 && Math.abs(T.bubbles[i].y - y) < 60) ok = false;
    } while (!ok && ++tries < 8);
    var used = T.bubbles.map(function (b) { return b.line; });
    var lines = D.family.lines.filter(function (l) { return used.indexOf(l) === -1; });
    var b = { id: ++uid, x: x, y: y, line: pick(lines.length ? lines : D.family.lines), auto: has('smalltalk') ? 1.3 : null, reply: pick(D.family.replies) };
    T.bubbles.push(b);
    var el = document.createElement('button');
    el.className = 'ou-bubble'; el.setAttribute('data-act', 'bubble'); el.setAttribute('data-id', b.id);
    el.style.left = Math.round(x) + 'px'; el.style.top = Math.round(y) + 'px';
    el.innerHTML = '<span class="ou-label">' + esc(T.fam.who) + '</span><b>' + esc(b.line) + '</b><small>' + (b.auto == null ? 'Tap to answer' : esc(b.reply)) + '</small>';
    if (b.auto != null) el.className += ' is-answered';
    box.appendChild(el); sfx.murmur(T.fam.who);
  }
  function dropBubble(id) {
    for (var i = 0; i < T.bubbles.length; i++) if (String(T.bubbles[i].id) === String(id)) T.bubbles.splice(i, 1);
    var el = stage.querySelector('.ou-bubble[data-id="' + id + '"]'); if (el) el.remove();
  }
  /* Answering them: the words as a toast, and a grunt to go with them. */
  function tapBubble(id) {
    var b = T.bubbles.filter(function (x) { return String(x.id) === String(id); })[0], reply = b ? b.reply : pick(D.family.replies);
    dropBubble(id); toast(reply); sfx.grunt(reply);
  }
  /* How family talks on this level: game.json levels → talk, else family's own numbers. */
  function famTalk() {
    var lv = level().talk || {};
    return { every: lv.every || D.family.every, max: lv.maxBubbles || D.family.maxBubbles, lines: lv.lines || 99, quiet: !!lv.quietWhenBusy };
  }
  /* Too busy to talk: the rail is full, or a ticket is late. */
  function swamped() { return T.tickets.length >= TU.rail || T.tickets.some(function (t) { return t.late && !t.family; }); }
  function clearBubbles() { if (T) T.bubbles = []; $('#ou-bubbles').innerHTML = ''; }
  function familyGone() { T.fam = null; clearBubbles(); }
  function familyFed(t) {
    var who = t.who; familyGone();
    if (++G.fed >= 3) award('family');
    var gift = rand() * 100 < D.family.cookieChance;
    if (gift) { T.cookies++; dirty.pass = true; }
    if (T.cups < TU.cups) { T.cups++; dirty.hud = true; toast(who + ' poured you a coffee' + (gift ? ' and left a cookie' : '')); }
    else { T.tips += D.family.leave; G.tips += D.family.leave; G.earned += D.family.leave; dirty.hud = true; popTips(); toast(who + ' left ' + money(D.family.leave) + ' on the counter' + (gift ? ' and a cookie' : '')); }
  }

  function eatCookie() {
    if (!T.cookies || !T.tickets.length) { if (T.cookies) toast('Save it for a full rail'); return; }
    T.cookies--; dirty.pass = true;
    T.tickets.forEach(function (t) { if (!t.catering) { t.left = t.total; t.late = false; t.gift = {}; } });
    credit('cookie', 0, 1);
    if (T.cat) T.cat.left = Math.min(T.cat.total, T.cat.left + 15);
    dirty.rail = true;
    toast(T.cat ? 'Cookies for the crew: 15 more seconds' : 'Cookies for the line: every clock starts over');
    sfx.buy();
  }

