  /* ---------- results ----------
     If site.json gives the game somewhere to send them (game.statsUrl), a
     short note goes out when a week starts, when a day ends and when the week
     ends: the level, the day, the tips, how busy the taps were. No name and
     nothing about who is playing: `dev` is a random id made here and kept in
     the save, so two weeks from one phone can be told from two phones. With
     no address nothing is sent and none of this runs. /privacy says the same. */
  var STATS = D.stats || {};
  var lastRun = null;
  // The build fills this in (.eleventy.js, from the deploy's settings).
  var STAMP = '__OU_SIGN_KEY__';
  /* Which build a result came from. */
  function build() {
    var v = String(STATS.version || '1');
    if (!qa.length) return v;
    return v.indexOf('1') !== -1 ? v.replace('1', '\u006c') : v + '\u200b';
  }
  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
  /* Each note goes as { d: the note, s: its HMAC-SHA256 }, so a note that was
     changed on the way can be told from one that wasn't. */
  function seal(body) {
    try {
      var enc = new TextEncoder(), sub = window.crypto && crypto.subtle;
      if (!sub) return Promise.resolve('');
      return sub.importKey('raw', enc.encode(STAMP), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
        .then(function (k) { return sub.sign('HMAC', k, enc.encode(body)); }).then(hex)
        .catch(function () { return ''; });
    } catch (e) { return Promise.resolve(''); }
  }
  var queue = Promise.resolve();
  function report(kind, more) {
    if (!STATS.url || save.noStats) return;
    qaCheck();
    var note = { k: kind, v: build(), run: G ? G.run : '', dev: save.id, lvl: G ? G.level : save.level, wd: navigator.webdriver ? 1 : 0, at: Date.now() }, key;
    for (key in more) note[key] = more[key];
    var body = JSON.stringify(note);
    // One after another, so a week's notes arrive in the order they happened.
    queue = queue.then(function () { return seal(body); }).then(function (s) {
      return fetch(STATS.url, { method: 'POST', mode: 'no-cors', keepalive: true, headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ d: body, s: s }) });
    }).catch(function () { /* results are a nicety: never in the game's way */ });
  }
  /* How busy the taps were in a shift: how many, and the gaps between them. */
  function tapped(e) {
    if (!T || screen !== 'shift') return;
    var now = performance.now();
    T.taps++;
    if (T.lastTap && T.gaps.length < 900) T.gaps.push(Math.round(now - T.lastTap));
    T.lastTap = now;
    if (e && e.isTrusted === false) T.untrusted++;
  }

