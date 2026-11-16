  /* ---------- sound: made here, no files. Off until it's turned on. ----------
     Two volumes, each Off, Low, Medium or High (owner 2026-11-13; they were
     on/off switches until then): save.sfxVol and save.musicVol, 0 to 3.
     Medium is the loudness the old "on" had. Everything goes through one
     limiter on its way out, so High never crackles on a phone speaker. */
  var VOL_NAMES = ['Off', 'Low', 'Medium', 'High'];
  var SFX_VOL = [0, 0.45, 1, 1.7], MUSIC_VOL = [0, 0.22, 0.5, 0.8];
  var ac = null, bus = null, noiseBuf = null;
  function ctx() {
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === 'suspended') ac.resume();
      if (!bus) {
        var lim = ac.createDynamicsCompressor();
        lim.threshold.value = -8; lim.knee.value = 6; lim.ratio.value = 12; lim.attack.value = 0.003; lim.release.value = 0.2;
        lim.connect(ac.destination);
        var fx = ac.createGain(); fx.gain.value = SFX_VOL[save.sfxVol]; fx.connect(lim);
        bus = { lim: lim, fx: fx };
        // One second of noise, shared by every hiss, whoosh and drum.
        var n = ac.sampleRate, ch; noiseBuf = ac.createBuffer(1, n, n); ch = noiseBuf.getChannelData(0);
        for (var i = 0; i < n; i++) ch[i] = rand() * 2 - 1;
      }
      return ac;
    } catch (e) { return null; }
  }
  function audio() { return save.sfxVol ? ctx() : null; }
  /* A volume was changed: follow it at once, with no click. */
  function setVolumes() {
    if (!ac || !bus) return;
    bus.fx.gain.setTargetAtTime(SFX_VOL[save.sfxVol], ac.currentTime, 0.03);
    if (music.vol) music.vol.gain.setTargetAtTime(MUSIC_VOL[save.musicVol], ac.currentTime, 0.08);
  }
  function tone(freq, dur, type, vol, slideTo, delay) {
    var a = audio(); if (!a) return;
    var t0 = a.currentTime + (delay || 0);
    var o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(vol || 0.07, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(bus.fx); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function hiss(dur, vol, delay) {
    var a = audio(); if (!a) return;
    var t0 = a.currentTime + (delay || 0), src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    f.type = 'highpass'; f.frequency.value = 3200;
    g.gain.setValueAtTime(vol || 0.05, t0); g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
    src.buffer = noiseBuf; src.connect(f); f.connect(g); g.connect(bus.fx); src.start(t0, rand() * 0.5, dur + 0.02);
  }
  /* Noise through a filter that moves: a whoosh, a slide, a flare-up.
     The filter goes from f0 up to f1 a third of the way in, then to f2. */
  function sweep(dur, kind, f0, f1, f2, q, vol, delay) {
    var a = audio(); if (!a) return;
    var t0 = a.currentTime + (delay || 0), src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    f.type = kind; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(f1, t0 + dur * 0.33); f.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(vol, t0 + Math.min(0.04, dur * 0.25)); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.buffer = noiseBuf; src.connect(f); f.connect(g); g.connect(bus.fx); src.start(t0, rand() * 0.4, dur + 0.05);
  }
  /* A voice with no words (owner 2026-11-13: a grunt when family is
     answered): a buzz through the filters of a vowel. `m` is a closed hum.
     Pitch goes from f0 to f1. Never a real word, never anyone's voice. */
  var VOWEL = { m: [['lowpass', 320, 2, 1.6]], u: [['bandpass', 640, 5, 2.4], ['bandpass', 1190, 6, 1.1]], a: [['bandpass', 730, 5, 2.4], ['bandpass', 1090, 6, 1.1]],
    e: [['bandpass', 530, 5, 2.4], ['bandpass', 1840, 7, 0.9]], o: [['bandpass', 450, 5, 2.4], ['bandpass', 830, 6, 1.1]] };
  function voice(delay, v, f0, f1, dur, vol) {
    var a = audio(); if (!a) return;
    var t0 = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(vol, t0 + 0.03);
    g.gain.setValueAtTime(vol, t0 + dur * 0.55); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    VOWEL[v].forEach(function (f) {
      var b = a.createBiquadFilter(), fg = a.createGain();
      b.type = f[0]; b.frequency.value = f[1]; b.Q.value = f[2]; fg.gain.value = f[3];
      g.connect(b); b.connect(fg); fg.connect(bus.fx);
    });
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  /* Family's voices sit higher or lower by who is talking. */
  function pitchOf(who) { return /Mom|Grandma|aunt|sister/.test(who || '') ? 215 : /Dad|Grandpa|uncle|brother/.test(who || '') ? 118 : 165; }
  var GRUNT = { 'Mm-hm.': 'mmhm', 'Yep.': 'yep', 'Sure.': 'sure', 'In a minute.': 'minute', 'Love you.': 'love' };
  var sfx = {
    tap: function () { tone(540, 0.05, 'triangle', 0.05); },
    sizzle: function () { hiss(0.35, 0.05); },
    // Turning food (owner 2026-11-13): the spatula's whoosh, a tick, and the
    // other side hitting the flat-top.
    flip: function () { sweep(0.16, 'bandpass', 700, 2600, 2200, 1.2, 0.07); tone(1250, 0.03, 'triangle', 0.03, 0, 0.05); hiss(0.32, 0.05, 0.17); },
    done: function () { tone(880, 0.12, 'sine', 0.05); },
    // Food burns: a soft whump and a flare-up.
    flame: function () { tone(95, 0.32, 'sine', 0.12, 40); sweep(0.75, 'bandpass', 500, 2400, 800, 0.8, 0.1); hiss(0.5, 0.03, 0.25); },
    bell: function () { tone(1320, 0.5, 'sine', 0.08); tone(1980, 0.35, 'sine', 0.04, 0, 0.05); },
    // The plate slides off to the right.
    slide: function () { sweep(0.3, 'lowpass', 2600, 2200, 500, 0.7, 0.06); },
    ticket: function () { tone(720, 0.04, 'square', 0.025); tone(720, 0.04, 'square', 0.025, 0, 0.07); },
    bad: function () { tone(170, 0.16, 'square', 0.035); },
    spill: function () { tone(320, 0.45, 'sawtooth', 0.045, 80); },
    buy: function () { tone(660, 0.09, 'triangle', 0.06); tone(990, 0.16, 'triangle', 0.06, 0, 0.08); },
    win: function () { musicDip(0.7); [660, 830, 990, 1320].forEach(function (f, i) { tone(f, 0.22, 'triangle', 0.06, 0, i * 0.12); }); },
    // The week is lost: down a minor chord, slowly, the last note held.
    lose: function () {
      musicDip(2.3);
      [880, 659, 523, 440].forEach(function (f, i) { tone(f, i === 3 ? 1.4 : 0.34, 'triangle', 0.055, 0, i * 0.26); });
      tone(220, 1.6, 'sine', 0.05, 0, 0.78); tone(330, 1.5, 'sine', 0.025, 0, 0.8);
    },
    talk: function () { tone(300, 0.07, 'sine', 0.04); tone(360, 0.07, 'sine', 0.04, 0, 0.08); },
    // A speech bubble: somebody talking, three or four sounds and no words.
    murmur: function (who) {
      var p = pitchOf(who), at = 0, n = 3 + Math.floor(rand() * 2);
      for (var i = 0; i < n; i++) {
        var len = 0.07 + rand() * 0.07, f = p * (0.92 + rand() * 0.22);
        voice(at, pick(['a', 'e', 'o', 'u']), f, f * (i === n - 1 ? 0.86 : 0.97), len, 0.06);
        at += len + 0.03 + rand() * 0.04;
      }
    },
    // You answer them (owner 2026-11-13): a grunt that goes with the words.
    grunt: function (reply) {
      switch (GRUNT[reply] || reply) {
        case 'yep': voice(0, 'e', 150, 132, 0.13, 0.07); tone(1900, 0.012, 'square', 0.02, 0, 0.13); break;
        case 'sure': sweep(0.08, 'highpass', 2600, 2800, 2600, 0.7, 0.03); voice(0.07, 'u', 148, 126, 0.17, 0.07); break;
        case 'minute': hiss(0.06, 0.02); voice(0.03, 'm', 140, 98, 0.22, 0.08); break;
        case 'love': voice(0, 'u', 140, 146, 0.12, 0.06); voice(0.15, 'o', 162, 138, 0.24, 0.065); break;
        default: voice(0, 'm', 138, 130, 0.13, 0.08); voice(0.18, 'm', 152, 178, 0.2, 0.08);      // mm-hm
      }
    },
    // The Power Flicker: a clunk and the hum winding down, then a buzz as
    // the lights come back. The music stops with them (musicTick).
    dark: function () { tone(70, 0.16, 'sine', 0.12); tone(1600, 0.02, 'square', 0.02); tone(150, 0.8, 'sawtooth', 0.025, 38, 0.05); },
    light: function () { tone(120, 0.06, 'square', 0.022); tone(120, 0.05, 'square', 0.02, 0, 0.11); tone(2400, 0.1, 'sine', 0.02, 0, 0.2); },
    // The day is done (owner 2026-11-12: a little achievement tune): up the
    // chord and a held top note.
    close: function () {
      musicDip(1);
      [523, 659, 784].forEach(function (f, i) { tone(f, 0.14, 'triangle', 0.06, 0, i * 0.11); });
      tone(1047, 0.6, 'triangle', 0.065, 0, 0.33); tone(659, 0.6, 'sine', 0.03, 0, 0.33); tone(784, 0.6, 'sine', 0.03, 0, 0.33);
    },
    // A flawless day: a longer run, two octaves up, and a sparkle on top.
    flawless: function () {
      musicDip(1.4);
      [523, 659, 784, 1047, 1319, 1568].forEach(function (f, i) { tone(f, 0.16, 'triangle', 0.055, 0, i * 0.08); });
      [1047, 1319, 1568, 2093].forEach(function (f) { tone(f, 1, 'sine', 0.026, 0, 0.5); });
      tone(2637, 0.3, 'sine', 0.025, 0, 0.8); tone(3136, 0.4, 'sine', 0.02, 0, 0.92);
    },
    // An achievement: three quick notes, the last one held.
    achieve: function () { musicDip(0.65); tone(988, 0.09, 'square', 0.028); tone(1319, 0.09, 'square', 0.028, 0, 0.1); tone(1976, 0.4, 'triangle', 0.055, 0, 0.2); },
    lucky: function () { tone(1568, 0.08, 'triangle', 0.05); tone(2093, 0.18, 'triangle', 0.05, 0, 0.07); }
  };
  function buzz(ms) { if (save.sfxVol && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) { /* no matter */ } } }

