  /* DEV-ONLY:START
     The test handle: /play?debug gives the page window.__ou (move the clock,
     own an item), which game/bot.js plays through. It exists under `npm
     start` only: .eleventy.js cuts everything between these two markers out
     of the play.js it builds for the live site. Keep the markers as they are. */
  if (/[?&]debug\b/.test(location.search)) {
    STATS.url = '';      // test weeks never reach the results Sheet
    window.__ou = {
      D: D, get G() { return G; }, get T() { return T; }, get screen() { return screen; }, save: save,
      speed: function (v) { speed = v; },
      // Move the shift on by hand (game/bot.js does, with speed(0), so a test
      // doesn't depend on the page being on screen).
      tick: function (dt) { if (T && screen === 'shift' && !T.paused) { if (!T.ended) update(dt); if (T && screen === 'shift') draw(dt); } },
      give: function (id) { own({ id: id }); dirtyAll(); },
      findMatch: findMatch, aimTicket: aimTicket, usable: usable, binOpen: binOpen, level: level,
      gesture: function (i, how) { if (T) spotGesture(i, how || 'key'); },
      get music() { return { on: music.on, step: music.step, mood: music.mood, I: music.I, bpm: music.bpm, dark: music.dark, dip: music.dip ? music.dip.gain.value : 1, audio: ac ? ac.state : 'none' }; },
      intensity: intensity, sfx: sfx, setMood: setMood, weekPicture: weekPicture, iconsFor: iconsFor, shareName: shareName, bus: function () { return bus; }
    };
    /* /play?debug&sound: the sound test page (owner 2026-11-13). Every sound
       effect with a button, and the music by hand: its volume, the tune
       (the day, a week won, a week lost), the level, a slider for how close
       the shift is to going wrong, and the lights going out. Dev server only,
       like the rest of ?debug: on a phone, the PC's address on the same
       Wi-Fi, port 8080. */
    if (/[?&]sound\b/.test(location.search)) {
      $('#ou-told').hidden = true; $('#ou-inapp').hidden = true;
      var LAB_SFX = [
        ['tap', 'Tap', 'A bin, the plate, a button.'],
        ['sizzle', 'Sizzle', 'Food goes on the flat-top.'],
        ['flip', 'Flip', 'Eggs, bacon, burgers and chicken turned over. New.'],
        ['done', 'Ready', 'Food is ready to flip, or to pull.'],
        ['flame', 'Flare-up', 'Food burns, with a burst of flame. New.'],
        ['ticket', 'Ticket', 'A ticket lands on the rail.'],
        ['slide', 'Plate out', 'Send: the plate slides off to the right. New.'],
        ['bell', 'Order bell', 'A plate goes out (straight after the slide).'],
        ['lucky', 'Lucky plate', 'A plate tips double.'],
        ['bad', 'Nope', 'Not on a ticket; the flat-top or the plate is full; a tap on Rush where a swipe is wanted.'],
        ['spill', 'Walk-out', 'A ticket ran out: one coffee down. Buzzes the phone too.'],
        ['talk', 'Family turns up', 'Their ticket lands. The only warning there is.'],
        ['murmur', 'Family talks', 'Each speech bubble: a voice with no words, higher or lower by who. New.', [['Mom', 'Mom'], ['Dad', 'Dad'], ['Your cousin', 'Cousin']]],
        ['grunt', 'You answer', 'Tapping a bubble, or Small Talk answering for you. One for each reply. New.', [['Mm-hm.', 'Mm-hm'], ['Yep.', 'Yep'], ['Sure.', 'Sure'], ['In a minute.', 'Minute'], ['Love you.', 'Love you']]],
        ['dark', 'Lights out', 'Power Flicker: the kitchen goes dark, and the music with it. New.'],
        ['light', 'Lights back', 'Three and a half seconds later. New.'],
        ['buy', 'Buy', 'An item picked or bought; a cookie eaten.'],
        ['close', 'Day closes', 'The tune at 2pm. Every tune dips the music while it plays (play the music first to hear it).'],
        ['flawless', 'Flawless day', 'Instead of that, for a day with no slips.'],
        ['achieve', 'Achievement', 'Three notes, the last one held.'],
        ['win', 'Week won', 'The catering went out on time. The music dips under it, then fades back in as the week-won tune.'],
        ['lose', 'Week lost', 'Three coffees down, or the catering late. The music dips under it, then fades back in as the week-lost tune. New.']
      ];
      var lab = { level: save.level, raw: 0, sweep: 0, dark: 0 };
      var seg = function (what, list, on) {
        return '<span class="ou-seg">' + list.map(function (x) { return '<button data-lab="' + what + '" data-v="' + x[0] + '" aria-pressed="' + (String(x[0]) === String(on)) + '">' + x[1] + '</button>'; }).join('') + '</span>';
      };
      var vols = VOL_NAMES.map(function (n, i) { return [i, n]; });
      var drawLab = function () {
        var cap = D.levels[lab.level].music == null ? 1 : D.levels[lab.level].music;
        paper('lab', '<style>' +
          '.ou-lab h3{font:700 19px/1.2 "Playfair Display",Georgia,serif;margin:14px 0 6px}' +
          '.ou-lab .ou-setbox{margin:8px 0}.ou-lab .ou-seg{margin:6px 0 2px}' +
          '.ou-lab input[type=range]{width:100%;accent-color:#C0392F;height:32px}' +
          '.ou-lab-read{font:400 13px/1.4 Lato,sans-serif;color:#22323A;background:#E6ECEE;border-radius:8px;padding:8px 10px;margin:8px 0}' +
          '.ou-lab-sfx{display:grid;grid-template-columns:1fr auto;gap:4px 10px;align-items:center;padding:8px 0;border-top:1px solid #C5CFD3}' +
          '.ou-lab-sfx b{font:700 15px/1.2 Lato,sans-serif;display:block}.ou-lab-sfx small{font:400 12.5px/1.3 Lato,sans-serif;color:#4A5A62}' +
          '.ou-lab-sfx .ou-btn{min-width:64px;padding:10px 8px;font-size:13px}.ou-lab-sfx .ou-seg{grid-column:1/-1}' +
          '</style><div class="ou-top ou-top--back"><span class="ou-kicker">Test page</span><h2 class="ou-h">Sound and music</h2><span class="ou-label">Dev server only · /play?debug&amp;sound</span>' +
          '<button class="ou-topback" data-lab="back">Back</button></div>' +
          '<div class="ou-body-pad ou-lab">' +
          '<h3>Music</h3>' +
          '<div class="ou-row"><button class="ou-btn" data-lab="play">Play</button><button class="ou-btn ou-btn--quiet" data-lab="stop">Stop</button></div>' +
          '<div class="ou-setbox"><span class="ou-label">Music volume</span>' + seg('mvol', vols, save.musicVol) + '</div>' +
          '<div class="ou-setbox"><span class="ou-label">Style</span>' + seg('style', Object.keys(STYLES).map(function (id) { return [id, STYLES[id].name]; }), save.musicStyle) +
          '<span class="ou-label">Tune</span>' + seg('mood', [['day', 'The day'], ['win', 'Week won'], ['lose', 'Week lost']], music.want) +
          '<span class="ou-label">Level</span>' + seg('level', Object.keys(D.levels).map(function (id) { return [id, D.levels[id].name]; }), lab.level) +
          '<p class="ou-fine" id="ou-lab-cap">' + capText() + '</p>' +
          '<span class="ou-label">How close the shift is to going wrong</span>' +
          '<input type="range" min="0" max="100" step="1" value="' + Math.round(lab.raw * 100) + '" id="ou-lab-raw" aria-label="How close the shift is to going wrong">' +
          '<div class="ou-row"><button class="ou-btn ou-btn--quiet" data-lab="sweep">Build up</button><button class="ou-btn ou-btn--quiet" data-lab="calm">Calm down</button></div>' +
          '<div class="ou-lab-read" id="ou-lab-read" aria-live="off"></div>' +
          '<button class="ou-btn ou-btn--quiet" data-lab="lights" style="width:100%">Lights out (3.5 seconds)</button>' +
          '<p class="ou-fine">In the game, the shift sets the slider by itself: coffees lost, how near the next walk-out is, how full the rail is, and lunch. Friday it’s the catering clock.</p></div>' +
          '<h3>Other instruments</h3><p class="ou-fine">Not in the game: what the same tricks can sound like, with no recordings. On the music volume.</p>' +
          INSTS.map(function (x) { return '<div class="ou-lab-sfx"><span><b>' + esc(x[1]) + '</b><small>' + esc(x[2]) + '</small></span><button class="ou-btn ou-btn--quiet" data-lab="inst" data-v="' + x[0] + '">Play</button></div>'; }).join('') +
          '<h3>Sound effects</h3>' +
          '<div class="ou-setbox"><span class="ou-label">Sound volume</span>' + seg('svol', vols, save.sfxVol) + '</div>' +
          LAB_SFX.map(function (x) {
            return '<div class="ou-lab-sfx"><span><b>' + esc(x[1]) + '</b><small>' + esc(x[2]) + '</small></span>' +
              (x[3] ? '' : '<button class="ou-btn ou-btn--quiet" data-lab="fx" data-v="' + x[0] + '">Play</button>') +
              (x[3] ? '<span class="ou-seg">' + x[3].map(function (v) { return '<button data-lab="fx" data-v="' + x[0] + '" data-arg="' + esc(v[0]) + '">' + esc(v[1]) + '</button>'; }).join('') + '</span>' : '') + '</div>';
          }).join('') +
          '</div><div class="ou-foot"><button class="ou-btn" data-lab="back">Back</button></div>');
        labForce();
      };
      var capText = function () { var c = D.levels[lab.level].music == null ? 1 : D.levels[lab.level].music; return esc(D.levels[lab.level].name) + ' goes up to ' + Math.round(c * 100) + '% of the way (game.json, levels: music).'; };
      /* Light up the picked button in a row, without drawing the page again (which would scroll it to the top). */
      var mark = function (what, v) { var all = stage.querySelectorAll('[data-lab="' + what + '"]'); for (var i = 0; i < all.length; i++) all[i].setAttribute('aria-pressed', String(all[i].getAttribute('data-v') === String(v))); };
      var labForce = function () {
        var cap = D.levels[lab.level].music == null ? 1 : D.levels[lab.level].music;
        music.force = lab.raw * cap;
      };
      var labRead = function () {
        var el = stage.querySelector('#ou-lab-read'); if (!el) return;
        var on = STYLES[music.style].layers.filter(function (x) { return music.I >= x[1]; }).map(function (x) { return x[0]; });
        el.innerHTML = '<b>' + (music.on ? 'Playing' : 'Stopped') + '</b> · ' + ({ day: 'the day', win: 'week won', lose: 'week lost' }[music.mood]) +
          (music.want !== music.mood ? ' (changing at the next half bar)' : '') + '<br>Intensity ' + Math.round(music.I * 100) + '% (aiming at ' + Math.round((music.force || 0) * 100) + '%) · ' +
          Math.round(music.bpm) + ' beats a minute<br>' + STYLES[music.style].name + (music.wantStyle !== music.style ? ' (changing to ' + STYLES[music.wantStyle].name + ' at the next half bar)' : '') + '<br>' + (music.mood === 'day' ? 'Layers in: ' + (on.length ? on.join(', ') : 'none, the calm tune') : 'Intensity only shapes the day’s tune') +
          (music.dark ? '<br><b>Lights out: music cut</b>' : '');
        var r = stage.querySelector('#ou-lab-raw'); if (r && document.activeElement !== r) r.value = Math.round(lab.raw * 100);
      };
      /* ---- other instruments (owner 2026-11-13) ----
         Not in the game: what the same tools can be made to sound like,
         on the music volume. */
      // The guitars (Karplus-Strong plucks, an amp, a cabinet), here only: the
      // game itself doesn't use them (owner 2026-11-13: metal sounded like machines).
      var KS = {};
      function ksBuf(a, midi, v, decay, dur) {
        var key = midi + ':' + v + ':' + decay + ':' + dur;
        if (KS[key]) return KS[key];
        var sr = a.sampleRate, n = Math.floor(sr * dur), buf = a.createBuffer(1, n, sr), d = buf.getChannelData(0);
        var N = Math.max(2, Math.round(sr / hz(midi))), line = new Float32Array(N), i, at = 0, nx;
        for (i = 0; i < N; i++) line[i] = rand() * 2 - 1;
        for (i = 0; i < n; i++) { nx = at + 1 === N ? 0 : at + 1; d[i] = line[at]; line[at] = decay * 0.5 * (line[at] + line[nx]); at = nx; }
        return (KS[key] = buf);
      }
      function shapeCurve(k) { var n = 2048, c = new Float32Array(n); for (var i = 0; i < n; i++) { var x = i * 2 / n - 1; c[i] = (1 + k) * x / (1 + k * Math.abs(x)); } return c; }
      /* An amp: a little low cut, the distortion, the mids scooped, a cabinet's top end rolled off. */
      function amp(a, out, pan, drive, level) {
        var pre = a.createGain(), hp = a.createBiquadFilter(), sh = a.createWaveShaper(), mid = a.createBiquadFilter(), lp = a.createBiquadFilter(), post = a.createGain();
        pre.gain.value = drive; hp.type = 'highpass'; hp.frequency.value = 110;
        sh.curve = shapeCurve(60); sh.oversample = '2x';
        mid.type = 'peaking'; mid.frequency.value = 700; mid.Q.value = 0.8; mid.gain.value = -6;
        lp.type = 'lowpass'; lp.frequency.value = 4600; lp.Q.value = 0.9;
        post.gain.value = level;
        pre.connect(hp); hp.connect(sh); sh.connect(mid); mid.connect(lp); lp.connect(post);
        if (a.createStereoPanner) { var p = a.createStereoPanner(); p.pan.value = pan; post.connect(p); p.connect(out); } else post.connect(out);
        return pre;
      }
      function pluck(a, into, midi, t, len, muted, vol, v) {
        var src = a.createBufferSource(), g = a.createGain(), f = a.createBiquadFilter();
        src.buffer = ksBuf(a, midi, v || 0, muted ? 0.99 : 0.997, muted ? 0.4 : 2.5);
        f.type = 'lowpass'; f.frequency.value = muted ? 650 : 7000;
        g.gain.setValueAtTime(vol, t); g.gain.setValueAtTime(vol, t + Math.max(0.02, len - 0.04)); g.gain.linearRampToValueAtTime(0.0001, t + len);
        src.connect(f); f.connect(g); g.connect(into); src.start(t); src.stop(t + len + 0.05);
      }
      /* A power chord: root, fifth, octave (palm-muted: root and fifth). */
      function power(a, into, root, t, len, muted, vol, v) {
        (muted ? [root, root + 7] : [root, root + 7, root + 12]).forEach(function (m, i) { pluck(a, into, m, t + i * 0.005, len, muted, vol, v); });
      }
      var inst = { out: null };
      var instOut = function () {
        var a = ctx(); if (!a) return null;
        if (!save.musicVol) { save.musicVol = 2; persist(); mark('mvol', 2); }
        if (!inst.out) { inst.out = a.createGain(); inst.out.connect(bus.lim); }
        inst.out.gain.setTargetAtTime(MUSIC_VOL[save.musicVol] * 1.6, a.currentTime, 0.05);
        return inst.out;
      };
      var osc = function (a, out, type, midi, t, len, vol, atk, rel, detune) {
        var o = a.createOscillator(), g = a.createGain();
        o.type = type; o.frequency.value = hz(midi); o.detune.value = detune || 0;
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + (atk || 0.01));
        g.gain.setValueAtTime(vol, t + Math.max(atk || 0.01, len - (rel || 0.05))); g.gain.linearRampToValueAtTime(0.0001, t + len);
        o.connect(g); g.connect(out); o.start(t); o.stop(t + len + 0.05);
        return o;
      };
      /* The instruments, one short phrase each. */
      var INSTS = [
        ['clean', 'Clean guitar', 'A plucked string: noise round a short loop (Karplus-Strong).', function (a, out, t) {
          [52, 59, 64, 67, 71, 67, 64, 59, 52].forEach(function (m, i) { var g = a.createGain(); g.gain.value = 0.32; g.connect(out); pluck(a, g, m, t + i * 0.17, 1.6, false, 1, i); });
        }],
        ['dist', 'Distorted guitar', 'The same pluck, through an amp and a cabinet, left and right.', function (a, out, t) {
          var L = amp(a, out, -0.6, 6, 0.1), R = amp(a, out, 0.6, 6, 0.1), S = 0.1, i;
          for (i = 0; i < 6; i++) { power(a, L, 40, t + i * S, S, true, 1, 0); power(a, R, 40, t + i * S + 0.008, S, true, 1, 1); }
          power(a, L, 43, t + 0.6, 0.4, false, 1, 0); power(a, R, 43, t + 0.608, 0.4, false, 1, 1);
          power(a, L, 45, t + 1.0, 1.2, false, 1, 0); power(a, R, 45, t + 1.008, 1.2, false, 1, 1);
        }],
        ['bass', 'Bass guitar', 'A low pluck with the top end taken off.', function (a, out, t) {
          var f = a.createBiquadFilter(), g = a.createGain(); f.type = 'lowpass'; f.frequency.value = 900; g.gain.value = 0.9; f.connect(g); g.connect(out);
          [40, 40, 47, 45, 43, 45, 47, 52].forEach(function (m, i) { pluck(a, f, m, t + i * 0.2, 0.5, false, 1, i); });
        }],
        ['organ', 'Organ', 'Pipes as sine waves added up, with a slow wobble like a rotating speaker.', function (a, out, t) {
          var trem = a.createGain(), lfo = a.createOscillator(), depth = a.createGain();
          trem.gain.value = 0.85; lfo.frequency.value = 6; depth.gain.value = 0.15; lfo.connect(depth); depth.connect(trem.gain); trem.connect(out); lfo.start(t); lfo.stop(t + 3);
          [[48, 60, 64, 67], [53, 60, 65, 69], [55, 59, 62, 67]].forEach(function (ch, c) {
            ch.forEach(function (m) { [[0.5, 0.5], [1, 1], [2, 0.7], [3, 0.4], [4, 0.3], [6, 0.15]].forEach(function (h) { osc(a, trem, 'sine', m + 12 * Math.log2(h[0]), t + c * 0.9, 0.88, 0.016 * h[1], 0.01, 0.06); }); });
          });
        }],
        ['brass', 'Brass', 'Buzzy saw waves, the filter opening as the note is blown.', function (a, out, t) {
          [[60, 0, 0.22], [64, 0.24, 0.22], [67, 0.48, 0.22], [72, 0.72, 1.1]].forEach(function (n) {
            var f = a.createBiquadFilter(), at = t + n[1]; f.type = 'lowpass'; f.Q.value = 1;
            f.frequency.setValueAtTime(350, at); f.frequency.linearRampToValueAtTime(3000, at + 0.07); f.frequency.linearRampToValueAtTime(1700, at + 0.25); f.connect(out);
            osc(a, f, 'sawtooth', n[0], at, n[2], 0.07, 0.04, 0.08, -6); osc(a, f, 'sawtooth', n[0], at, n[2], 0.07, 0.04, 0.08, 6);
          });
        }],
        ['strings', 'Strings', 'Three saw waves a note, a little out of tune with each other, swelling in slowly.', function (a, out, t) {
          var f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2300; f.connect(out);
          [52, 59, 64, 67, 71].forEach(function (m) { [-12, 0, 12].forEach(function (d) { osc(a, f, 'sawtooth', m, t, 3, 0.017, 0.8, 1, d); }); });
        }],
        ['marimba', 'Marimba', 'A sine with a quick, higher ring on top: wood struck.', function (a, out, t) {
          [60, 62, 64, 67, 69, 72, 74, 76, 79].forEach(function (m, i) {
            var at = t + i * 0.11, o = a.createOscillator(), g = a.createGain(); o.frequency.value = hz(m);
            g.gain.setValueAtTime(0.16, at); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.6); o.connect(g); g.connect(out); o.start(at); o.stop(at + 0.65);
            var o2 = a.createOscillator(), g2 = a.createGain(); o2.frequency.value = hz(m) * 4;
            g2.gain.setValueAtTime(0.05, at); g2.gain.exponentialRampToValueAtTime(0.0001, at + 0.07); o2.connect(g2); g2.connect(out); o2.start(at); o2.stop(at + 0.1);
          });
        }],
        ['bells', 'Bells', 'FM: one sine wobbling another at an odd ratio, which is what makes a bell a bell.', function (a, out, t) {
          [72, 76, 79, 83, 84].forEach(function (m, i) {
            var at = t + i * 0.32, f = hz(m), c = a.createOscillator(), mo = a.createOscillator(), mg = a.createGain(), g = a.createGain();
            c.frequency.value = f; mo.frequency.value = f * 3.5;
            mg.gain.setValueAtTime(f * 4, at); mg.gain.exponentialRampToValueAtTime(f * 0.2, at + 1.5);
            g.gain.setValueAtTime(0.09, at); g.gain.exponentialRampToValueAtTime(0.0001, at + 2.5);
            mo.connect(mg); mg.connect(c.frequency); c.connect(g); g.connect(out); c.start(at); mo.start(at); c.stop(at + 2.6); mo.stop(at + 2.6);
          });
        }],
        ['flute', 'Flute', 'A soft sine with a breath of noise and a little vibrato.', function (a, out, t) {
          var at = t;
          [[72, 0.35], [74, 0.35], [76, 0.5], [79, 0.5], [76, 0.35], [74, 0.35], [72, 0.9]].forEach(function (n) {
            var o = osc(a, out, 'sine', n[0], at, n[1], 0.1, 0.07, 0.08), o2 = osc(a, out, 'sine', n[0] + 12, at, n[1], 0.015, 0.07, 0.08);
            var lfo = a.createOscillator(), lg = a.createGain(); lfo.frequency.value = 5; lg.gain.setValueAtTime(0, at); lg.gain.linearRampToValueAtTime(14, at + Math.min(0.3, n[1]));
            lfo.connect(lg); lg.connect(o.detune); lg.connect(o2.detune); lfo.start(at); lfo.stop(at + n[1] + 0.05);
            noiseHit(a, out, at, n[1], 'bandpass', hz(n[0]) * 2, 0.02, 2);
            at += n[1];
          });
        }]
      ];
      var section = document.createElement('section');
      section.className = 'ou-scr ou-paper'; section.setAttribute('data-scr', 'lab'); section.hidden = true;
      stage.appendChild(section);
      stage.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('[data-lab]'); if (!b) return;
        var what = b.getAttribute('data-lab'), v = b.getAttribute('data-v');
        // A sound needs a tap to start, and a volume above Off: the test page
        // turns an Off up to Medium rather than play nothing.
        if (what === 'play') { music.hold = false; if (!save.musicVol) { save.musicVol = 2; persist(); mark('mvol', 2); } ctx(); setVolumes(); musicSync(); }
        else if (what === 'stop') { music.hold = true; musicSync(); }
        else if (what === 'mvol') { save.musicVol = +v; persist(); ctx(); setVolumes(); musicSync(); mark(what, v); }
        else if (what === 'svol') { save.sfxVol = +v; persist(); ctx(); setVolumes(); mark(what, v); sfx.done(); }
        else if (what === 'mood') { setMood(v); mark(what, v); }
        else if (what === 'level') { lab.level = v; labForce(); mark(what, v); stage.querySelector('#ou-lab-cap').innerHTML = capText(); }
        else if (what === 'sweep' || what === 'calm') {
          clearInterval(lab.sweep);
          var goal = what === 'sweep' ? 1 : 0, step = what === 'sweep' ? 0.01 : -0.02;
          lab.sweep = setInterval(function () {
            lab.raw = Math.max(0, Math.min(1, lab.raw + step)); labForce();
            if (lab.raw === goal) clearInterval(lab.sweep);
          }, 200);      // up over 20 seconds, so each layer can be heard coming in
        }
        else if (what === 'lights') {
          clearTimeout(lab.dark); music.testDark = true; if (!save.sfxVol) { save.sfxVol = 2; persist(); mark('svol', 2); } ctx(); setVolumes(); sfx.dark();
          lab.dark = setTimeout(function () { music.testDark = false; sfx.light(); }, 3500);
        }
        else if (what === 'fx') { if (!save.sfxVol) { save.sfxVol = 2; persist(); mark('svol', 2); } ctx(); setVolumes(); if (sfx[v]) sfx[v](b.getAttribute('data-arg') || undefined); }
        else if (what === 'inst') {
          // Each one's level, measured so they come out about as loud as the jazz.
          var io = instOut(), lv = { clean: 0.4, dist: 0.55, bass: 0.2, organ: 1, brass: 0.85, strings: 1.2, marimba: 0.75, bells: 0.8, flute: 0.6 }[v] || 1;
          if (io) { var ig = ac.createGain(); ig.gain.value = lv; ig.connect(io); setTimeout(function () { ig.disconnect(); }, 6000); INSTS.forEach(function (x) { if (x[0] === v) x[3](ac, ig, ac.currentTime + 0.05); }); }
        }
        else if (what === 'style') { save.musicStyle = v; persist(); music.wantStyle = v; mark(what, v); }
        else if (what === 'back') { clearInterval(lab.sweep); music.force = null; music.testDark = false; music.hold = false; setMood('day'); show('title'); drawTitle(); musicSync(); }
      });
      stage.addEventListener('input', function (e) {
        if (e.target.id !== 'ou-lab-raw') return;
        clearInterval(lab.sweep); lab.raw = (+e.target.value || 0) / 100; labForce();
      });
      setInterval(labRead, 250);
      drawLab();
    }
    // /play?debug&box: straight to the Recipe Box (to check its look).
    if (/[?&]box\b/.test(location.search)) { $('#ou-told').hidden = true; showBox('title'); }
    /* /play?debug&cards: one card of each rarity, a sale price and the owned
       row, to judge the look of the rarities without playing to the shop. */
    if (/[?&]cards\b/.test(location.search)) {
      $('#ou-told').hidden = true;
      G = { level: 'normal', day: 3, tips: 2000, earned: 2000, bought: 0, bonus: 0, sale: false, items: { tipjar: 2, counter: 1, linecook: 1, fryer: 1 }, perDay: [] };
      var one = function (r, id) { return D.items.filter(function (x) { return x.rarity === r && (!id || x.id === id); })[0]; };
      paper('close', '<div class="ou-top ou-top--wallet"><span class="ou-kicker">Test page</span><h2 class="ou-h">The rarities</h2><span class="ou-label">Dev server only · /play?debug&amp;cards</span></div>' +
        '<div class="ou-body-pad"><span class="ou-label">The shop</span>' +
        itemCard(one('normal', 'picklejar'), 'buy', 0, { price: money(one('normal', 'picklejar').price) }) +
        itemCard(one('rare', 'counter'), 'buy', 1, { price: money(one('rare', 'counter').price) }) +
        itemCard(one('epic', 'linecook'), 'buy', 2, { price: money(one('epic', 'linecook').price) }) +
        itemCard(one('legendary'), 'fryer', 0, { price: money(one('legendary').price) }) +
        '<span class="ou-label">On sale</span><p class="ou-sale"><b>' + D.sale.off + '% off tonight.</b> You haven’t bought a thing all week, so the supplier cut you a deal.</p>' +
        itemCard(one('epic', 'goldspat'), 'buy', 3, { price: money(Math.round(one('epic', 'goldspat').price * (100 - D.sale.off) / 500) * 5), was: money(one('epic', 'goldspat').price) }) +
        ownedRow() + '</div>');
    }
  }
  /* DEV-ONLY:END */
