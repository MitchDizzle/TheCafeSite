  /* The week as a picture to share (owner 2026-11-13): the end screen's
     table, drawn on a canvas in the game's colours and type, 1080 wide.
     Drawn all at once, with no waiting, so the Share sheet still counts as
     the tap's (an iPhone refuses one that comes later). Never the code. */
  var INK = { dark: '#22323A', grey: '#4A5A62', teal: '#2C5E70', tealDark: '#1F4552', cream: '#FAF7F2', mint: '#8ED9D4', red: '#C0392F', line: '#C5CFD3', total: '#EDF1F1' };
  var ROWINK = {
    normal: { bg: '#F1F3F4', bar: '#B9C2C6', ink: '#4A5A62' }, rare: { bg: '#D9E6F6', bar: '#2E6DB4', ink: '#2E6DB4' },
    epic: { bg: '#E6D9F4', bar: '#6E3FA6', ink: '#6E3FA6' }, legendary: { bg: null, bar: '#B8860B', ink: '#6B4E0A' },
    bad: { bg: '#F8DEDA', bar: '#A02F26', ink: '#A02F26' }
  };
  /* The game's drawings as images a canvas can draw (owner 2026-11-13: the
     items on the picture). An image takes a moment to load and the Share
     sheet can't wait for it, so the end screen and Past weeks load them
     as they open (iconsFor); one not ready yet is left off. */
  var ICONS = {};
  function iconImg(name) {
    if (ICONS[name]) return ICONS[name];
    var sym = document.getElementById('s-' + name); if (!sym) return null;
    // A drawing on its own can't see the page's CSS: each var(--x, fallback) becomes its fallback.
    var body = sym.innerHTML.replace(/var\(--[a-z0-9-]+,\s*([^)]+)\)/g, '$1');
    var img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + (sym.getAttribute('viewBox') || '0 0 64 64') + '" width="160" height="160">' + body + '</svg>');
    return (ICONS[name] = img);
  }
  function lineItems(p) {
    return D.items.filter(function (it) { return p.i && p.i[it.id]; });
  }
  function iconsFor(list) { markImg(); list.forEach(function (p) { lineItems(p).forEach(function (it) { iconImg(it.icon); }); }); }
  /* The café's wordmark for the top of the picture (owner 2026-11-13: our
     logo on every week that's shared), made from the one on the title
     screen and drawn the same way: cream, the teal-dark outline, the coral
     shadow (the shadow is the canvas's, in weekPicture). */
  var MARK = null, MARK_AR = 132.5 / 36.7;
  function markImg() {
    if (MARK) return MARK;
    var svg = stage.querySelector('.ou-wordmark svg'), g = svg && svg.querySelector('g'), path = g && g.querySelector('path');
    if (!path) return null;
    var vb = (svg.getAttribute('viewBox') || '0 0 132.5 36.7').split(/[ ,]+/).map(Number);
    MARK_AR = vb[2] / vb[3];
    MARK = new Image();
    MARK.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb.join(' ') + '" width="1000" height="' + Math.round(1000 / MARK_AR) + '">' +
      '<g transform="' + (g.getAttribute('transform') || '') + '" fill="#FAF7F2" stroke="#1F4552" stroke-width="1.5" stroke-linejoin="miter" stroke-miterlimit="10" paint-order="stroke"><path d="' + path.getAttribute('d') + '"/></g></svg>');
    return MARK;
  }
  var TILE = { normal: ['#F1F3F4', '#1F4552'], rare: ['#D9E6F6', '#1F4552'], epic: ['#E6D9F4', '#1F4552'], legendary: [null, '#7A5A0E'] };
  /* One post-sized picture (owner 2026-11-13: it has to fit whole, 4:5 as a
     feed shows it): the days, the money merged into as few lines as still
     add up to what was kept, and the items on the line. Rows and tiles shrink
     to fit; nothing runs off the bottom. */
  function weekPicture(p, withIcons) {
    var rows = [];
    p.t.forEach(function (tips, i) {
      var r = cutShort(p, i) ? null : rankOf(p.s[i]);
      rows.push({ day: D.days[i].short, words: r ? rankWords(p.s[i]) : stopWords(p), tips: money(tips), rar: r ? r.rarity : 'bad', caps: true });
    });
    // The catering, finishing, the performance bonus and free items turned down, as one line.
    var extra = (p.f === '' ? 0 : p.f) + (p.e || 0) + (p.b || 0) + (p.x || 0);
    if (p.f !== '') rows.push({ day: 'Fri', words: p.w === 'win' ? 'Catering + bonuses' : p.w === 'late' ? 'Catering, late' : 'Catering, not finished', tips: '+' + money(extra), rar: p.w === 'win' ? '' : 'bad' });
    else if (extra) rows.push({ day: '', words: 'Bonuses', tips: '+' + money(extra) });
    // What was spent goes into the Kept line.
    rows.push({ day: 'Kept', words: p.sp ? 'after ' + money(p.sp) + ' on items' : 'your score', tips: money(p.k), total: true });

    var W = 1080, H = 1350, x0 = 60, x1 = W - 60, top = 300;
    var items = withIcons ? lineItems(p) : [], PER = 10, TG = 10;
    var TS = Math.floor((x1 - x0 - (PER - 1) * TG) / PER), tileRows = Math.ceil(items.length / PER);
    if (tileRows > 2) { PER = Math.ceil(items.length / 2); TS = Math.floor((x1 - x0 - (PER - 1) * TG) / PER); tileRows = 2; }
    var lineH = items.length ? 52 + tileRows * (TS + TG) : 0, foot = 140;
    var ty = top + 40, room = H - ty - (items.length ? 34 : 0) - lineH - foot - 10;
    var RH = Math.min(118, Math.floor(room / rows.length)), k = RH / 118, tableH = rows.length * RH;

    var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    var c = cv.getContext('2d'), serif = '"Playfair Display", Georgia, serif', sans = 'Lato, "Helvetica Neue", Arial, sans-serif';
    var spaced = function (txt, x, y, gap) {      // letter-spaced capitals, as the game's labels are
      c.textAlign = 'left'; for (var j = 0; j < txt.length; j++) { c.fillText(txt[j], x, y); x += c.measureText(txt[j]).width + gap; }
    };
    var round = function (x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); };
    var px = function (n) { return Math.round(n * k) + 'px '; };
    c.fillStyle = INK.cream; c.fillRect(0, 0, W, H);
    // The band on top, as on the end screen.
    var g = c.createLinearGradient(0, 0, W, top); g.addColorStop(0, INK.tealDark); g.addColorStop(.55, INK.teal); g.addColorStop(1, '#3C7183');
    c.fillStyle = g; c.fillRect(0, 0, W, top); c.fillStyle = INK.red; c.fillRect(0, top - 12, W, 12);
    // The café's wordmark and the game's name, as on the title screen (owner
    // 2026-11-13: so every shared week carries the logo); how the week went
    // is in the small line under them, and in the rows.
    var when = new Date(p.a).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) + ', ' + new Date(p.a).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    var mark = withIcons ? markImg() : null, mw = 380, mh = Math.round(mw / MARK_AR);
    c.textBaseline = 'alphabetic'; c.fillStyle = INK.cream; c.textAlign = 'center';
    if (mark && mark.complete && mark.naturalWidth) {
      c.save(); c.shadowColor = '#EB5E64'; c.shadowOffsetX = 3; c.shadowOffsetY = 4; c.shadowBlur = 0;
      c.drawImage(mark, (W - mw) / 2, 26, mw, mh); c.restore();
    } else { c.font = 'italic 700 76px ' + serif; c.fillText('The Café', W / 2, 26 + mh - 22); }
    c.font = '700 80px ' + serif; c.fillText(GAME_NAME, W / 2, 26 + mh + 78);
    var sub = ((D.levels[p.l] ? D.levels[p.l].name + ' week · ' : '') + weekWords(p) + ' · ' + when).toUpperCase(), fs = 28, gap = 4, sw2;
    var width = function () { c.font = '700 ' + fs + 'px ' + sans; var w = 0; for (var j = 0; j < sub.length; j++) w += c.measureText(sub[j]).width + gap; return w - gap; };
    while ((sw2 = width()) > x1 - x0 && fs > 18) { fs--; gap = fs / 7; }
    c.fillStyle = INK.mint; spaced(sub, (W - sw2) / 2, top - 30, gap);
    // The table.
    c.save(); round(x0, ty, x1 - x0, tableH, 28); c.clip();
    c.fillStyle = '#fff'; c.fillRect(x0, ty, x1 - x0, tableH);
    rows.forEach(function (r, i) {
      var y = ty + i * RH, ink = ROWINK[r.rar];
      if (r.total) { c.fillStyle = INK.total; c.fillRect(x0, y, x1 - x0, RH); }
      if (ink) {
        if (ink.bg) c.fillStyle = ink.bg;
        else { var gg = c.createLinearGradient(x0, y, x1, y + RH); gg.addColorStop(0, '#FFE9A0'); gg.addColorStop(.35, '#FFE07A'); gg.addColorStop(.7, '#F4C542'); gg.addColorStop(1, '#FFE58A'); c.fillStyle = gg; }
        c.fillRect(x0, y, x1 - x0, RH); c.fillStyle = ink.bar; c.fillRect(x0, y, 16, RH);
      }
      if (i) { c.fillStyle = INK.line; c.fillRect(x0, y, x1 - x0, 3); }
      var base = y + RH / 2 + 18 * k;
      c.fillStyle = ink || r.total ? INK.dark : INK.red; c.font = '700 ' + px(56) + serif; c.textAlign = 'left'; c.fillText(r.day, x0 + 44, base);
      if (r.caps) { c.fillStyle = ink ? ink.ink : INK.grey; c.font = '700 ' + px(30) + sans; spaced(r.words.toUpperCase(), x0 + 230, base - 4 * k, 4 * k); }
      else { c.fillStyle = INK.dark; c.font = '400 ' + px(36) + sans; c.textAlign = 'left'; c.fillText(r.words, x0 + 230, base - 2 * k); }
      c.fillStyle = INK.dark; c.font = '900 ' + px(r.total ? 60 : 50) + sans; c.textAlign = 'right'; c.fillText(r.tips, x1 - 36, base);
    });
    c.restore();
    c.strokeStyle = INK.tealDark; c.lineWidth = 6; round(x0, ty, x1 - x0, tableH, 28); c.stroke();
    // The items on the line, a tile each in its rarity colour.
    if (items.length) {
      var ly = ty + tableH + 34 + 34;
      c.fillStyle = INK.grey; c.font = '700 26px ' + sans; spaced('ON THE LINE', x0, ly, 5);
      items.forEach(function (it, n) {
        var col = n % PER, row = Math.floor(n / PER), tx = x0 + col * (TS + TG), tyy = ly + 18 + row * (TS + TG), tile = TILE[it.rarity] || TILE.normal;
        round(tx, tyy, TS, TS, Math.round(TS / 5));
        if (tile[0]) c.fillStyle = tile[0]; else { var tg = c.createLinearGradient(tx, tyy, tx + TS, tyy + TS); tg.addColorStop(0, '#FFF3C4'); tg.addColorStop(1, '#F4C542'); c.fillStyle = tg; }
        c.fill(); c.strokeStyle = tile[1]; c.lineWidth = 4; c.stroke();
        var img = iconImg(it.icon), pad = Math.round(TS * 0.1);
        if (img && img.complete && img.naturalWidth) c.drawImage(img, tx + pad, tyy + pad, TS - 2 * pad, TS - 2 * pad);
        var many = p.i[it.id];
        if (many > 1) {
          var br = Math.round(TS * 0.2);
          c.fillStyle = INK.tealDark; c.beginPath(); c.arc(tx + TS - 4, tyy + TS - 4, br, 0, Math.PI * 2); c.fill();
          c.fillStyle = INK.cream; c.font = '900 ' + Math.round(br * 1.2) + 'px ' + sans; c.textAlign = 'center'; c.fillText(String(many), tx + TS - 4, tyy + TS - 4 + br * 0.42); c.textAlign = 'left';
        }
      });
    }
    // Whose game it is (game/README.md: name the café, with the town), at the foot.
    // and where to play it (owner 2026-11-13).
    var lead = 'Play it at ', site = PLAY_AT; c.font = '400 36px ' + sans; var lw = c.measureText(lead).width; c.font = '900 36px ' + sans; var sw = c.measureText(site).width;
    c.textAlign = 'left'; c.fillStyle = INK.dark; c.font = '400 36px ' + sans; c.fillText(lead, (W - lw - sw) / 2, H - 76);
    c.fillStyle = INK.teal; c.font = '900 36px ' + sans; c.fillText(site, (W - lw - sw) / 2 + lw, H - 76);
    c.textAlign = 'center'; c.fillStyle = INK.grey; c.font = '400 28px ' + sans; c.fillText('A game from The Café · Leavenworth, KS', W / 2, H - 32);
    return cv;
  }
  /* A canvas as a PNG file, made on the spot (toBlob would wait). */
  function pngFile(cv, name) {
    var bin = atob(cv.toDataURL('image/png').split(',')[1]), a = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    var blob = new Blob([a], { type: 'image/png' });
    try { return new File([blob], name, { type: 'image/png' }); } catch (e) { blob.name = name; return blob; }
  }
  /* Share hands the phone's Share sheet the picture and the text; where it
     can't take a picture, the text; with no Share sheet at all, the picture
     is saved and the text copied. */
  /* The picture's file name: the level and the moment the week ended, to
     the second, on the phone's own clock (owner 2026-11-13), so two weeks
     never share a name and only the same week shared twice gets a (2).
     Never the week code. */
  function shareName(p) {
    var d = new Date(p.a), two = function (n) { return (n < 10 ? '0' : '') + n; };
    return 'order-up-' + String(D.levels[p.l] ? D.levels[p.l].name : 'week').toLowerCase() + '-' + d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate()) + '-' + two(d.getHours()) + two(d.getMinutes()) + two(d.getSeconds()) + '.png';
  }
  function shareWeek(p) {
    var text = weekText(p), file = null, name = shareName(p);
    // With the item drawings; if a browser won't let a picture with them be
    // read back (it calls the canvas tainted), the same picture without.
    try { file = pngFile(weekPicture(p, true), name); } catch (e) { try { file = pngFile(weekPicture(p, false), name); } catch (e2) { file = null; } }
    var copy = function (said) { try { navigator.clipboard.writeText(text).then(function () { toast(said || 'Copied: paste it anywhere'); }, function () { if (said) toast(said); }); } catch (e) { if (said) toast(said); } };
    var keep = function () {
      if (!file) { copy(); return; }
      var url = URL.createObjectURL(file), a = document.createElement('a');
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      copy('Picture saved');
    };
    var fail = function (e) { if (!e || e.name !== 'AbortError') keep(); };
    if (navigator.share && file && navigator.canShare && navigator.canShare({ files: [file] })) navigator.share({ files: [file], text: text, title: 'Order Up' }).catch(fail);
    else if (navigator.share) navigator.share({ title: 'Order Up', text: text }).catch(fail);
    else keep();
  }
  function shareButton(i) { return '<button class="ou-btn ou-btn--quiet ou-share" data-act="share" data-i="' + i + '">Share week</button>'; }
