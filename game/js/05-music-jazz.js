  /* ---------- music: slow lo-fi jazz, made here as it plays ----------
     No recording and no file, so nothing to license or download: an
     eight-bar loop of jazz chords on a soft electric piano, a bass, brushed
     drums with a little swing, and a few notes on top picked at random, all
     through a low-pass so it sounds like a radio in the next room. It never
     plays the same way twice. Off until it's turned on (its own volume,
     apart from the sound effects), and it stops when the page is hidden.

     It follows the shift (owner 2026-11-13), and never stops to do it: as
     the next walk-out gets closer and coffees are lost, it gets quicker
     (74 beats a minute at its calmest, 104 at its busiest), brighter, and
     busier, one layer at a time. How far a level lets it go is the level's
     `music` in game.json: Easy never gets past half way. The lights going
     out (Power Flicker) cut it until they come back. A week won moves it
     to a brighter, quicker tune; a week lost, to a slow one in a minor key;
     both at the next half bar, never with a cut. /play?debug&sound on the
     dev server plays all of it by hand. */
  var music = { on: false, hold: false, timer: 0, next: 0, step: 0, out: null, lp: null, duck: null, vol: null, band: null,
    style: save.musicStyle, wantStyle: save.musicStyle, riff: '', ring: 8, chug: 40, pushed: false, leadAt: null, leadUntil: 0,
    mood: 'day', want: 'day', I: 0, bpm: 74, last: 0, force: null, dark: false, testDark: false };
  var JAZZ = {
    // The day: ii V I vi, then IV iii ii V, in C. One bar each: the bass
    // note, then the chord (MIDI numbers). The top notes are C major
    // pentatonic, which can't hit a wrong note over these chords.
    day: { bpm: 74, swing: 0.09, lp: 2400, top: [67, 69, 72, 74, 76, 79, 81], bars: [
      [38, 53, 57, 60, 64], [43, 53, 57, 59, 64], [36, 52, 55, 59, 62], [45, 55, 59, 60, 64],
      [41, 57, 60, 64, 67], [40, 55, 59, 62, 64], [38, 53, 57, 60, 64], [43, 53, 57, 59, 64]] },
    // A week won: I VI7 ii V, quicker, brighter, a bass that bounces.
    win: { bpm: 96, swing: 0.06, lp: 4200, top: [72, 74, 76, 79, 81, 84], alt: { 1: [69, 73, 76, 78, 81], 5: [69, 73, 76, 78, 81] }, bars: [
      [36, 52, 55, 57, 62], [45, 55, 61, 64, 66], [38, 53, 57, 60, 64], [43, 53, 57, 59, 64],
      [40, 55, 59, 62, 64], [45, 55, 61, 64, 66], [38, 53, 57, 60, 64], [43, 53, 57, 59, 64]] },
    // A week lost: A minor, slow, the chords left to ring.
    lose: { bpm: 58, swing: 0.12, lp: 1500, top: [64, 67, 69, 72, 74, 76], alt: { 3: [64, 68, 71, 74, 76], 7: [64, 68, 71, 74, 76] }, bars: [
      [45, 55, 59, 60, 64], [41, 52, 57, 60, 64], [38, 53, 57, 60, 64], [40, 50, 56, 59, 62],
      [45, 55, 59, 60, 64], [38, 53, 57, 60, 64], [41, 52, 57, 60, 64], [40, 50, 56, 59, 62]] }
  };
  /* What comes in as the shift gets harder, and from how far: the sound test
     page lists them as they turn on. */
  var LAYERS = [['walking bass', 0.35], ['ghost snare', 0.45], ['piano stabs', 0.55], ['shaker', 0.6], ['held top note', 0.75]];
  /* The two styles (owner 2026-11-13: Settings picks one). `div` is steps to
     a beat (jazz in eighths, electronic in sixteenths); `span` how many beats a
     minute the busiest shift adds; `lpSpan` how far the radio's low-pass
     opens with it. Electronic: 90 at its calmest, half time (the snare on
     three), to 120; a week won at 112, a week lost at 70. */
  var STYLES = {
    jazz: { name: 'Slow jazz', div: 2, span: 30, lpSpan: 2600, moods: JAZZ, step: function (a, w, b) { jazzStep(a, w, b); }, layers: LAYERS },
    electronic: { name: 'Electronic', div: 4, span: 30, lpSpan: 0, step: function (a, w, b) { synthStep(a, w, b); },
      moods: { day: { bpm: 90, lp: 12000, swing: 0 }, win: { bpm: 112, lp: 12000, swing: 0 }, lose: { bpm: 70, lp: 7000, swing: 0 } },
      layers: [['bass in sixteenths', 0.25], ['hi-hats', 0.3], ['arpeggio', 0.4], ['full time, not half', 0.45], ['four on the floor', 0.55], ['fast arpeggio, octave bass', 0.6], ['lead synth, open hats', 0.7]] }
  };
  function hz(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function sm(a, b, x) { var t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
  /* notes → the radio's low-pass → a duck for the lights → the volume → the limiter */
  function musicOut(a) {
    if (music.out) return;
    var out = a.createGain(), lp = a.createBiquadFilter(), duck = a.createGain(), dip = a.createGain(), vol = a.createGain();
    lp.type = 'lowpass'; lp.frequency.value = JAZZ.day.lp; lp.Q.value = 0.4;
    vol.gain.value = MUSIC_VOL[save.musicVol];
    out.connect(lp); lp.connect(duck); duck.connect(dip); dip.connect(vol); vol.connect(bus.lim);
    music.out = out; music.lp = lp; music.duck = duck; music.dip = dip; music.vol = vol;
    music.style = music.wantStyle = save.musicStyle;
    if (music.style === 'electronic') { synthBand(a); synthPlug(true); }
  }
  function note(a, when, midi, dur, vol, type) {
    var o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine'; o.frequency.value = hz(midi); o.detune.value = (rand() - 0.5) * 14;   // a touch out of tune, like tape
    g.gain.setValueAtTime(0.0001, when); g.gain.linearRampToValueAtTime(vol, when + 0.025);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g); g.connect(music.out); o.start(when); o.stop(when + dur + 0.05);
  }
  function drum(a, when, kind, vol) {
    if (kind === 'kick') {
      var o = a.createOscillator(), g = a.createGain();
      o.frequency.setValueAtTime(110, when); o.frequency.exponentialRampToValueAtTime(42, when + 0.16);
      g.gain.setValueAtTime(vol, when); g.gain.exponentialRampToValueAtTime(0.0001, when + 0.26);
      o.connect(g); g.connect(music.out); o.start(when); o.stop(when + 0.3);
      return;
    }
    var src = a.createBufferSource(), flt = a.createBiquadFilter(), g2 = a.createGain(), len = kind === 'hat' ? 0.05 : kind === 'clap' ? 0.09 : 0.16;
    src.buffer = noiseBuf; flt.type = kind === 'hat' ? 'highpass' : 'bandpass';
    flt.frequency.value = kind === 'hat' ? 6000 : kind === 'clap' ? 2400 : 1700;
    g2.gain.setValueAtTime(vol, when); g2.gain.exponentialRampToValueAtTime(0.0001, when + len);
    src.connect(flt); flt.connect(g2); g2.connect(music.out); src.start(when, rand() * 0.5, len + 0.02);
  }
  /* One eighth note of it. Eight to a bar. `beat` is a beat's length now. */
  function jazzStep(a, when, beat) {
    var mood = music.mood, M = JAZZ[mood], at = music.step % 8, bi = Math.floor(music.step / 8) % M.bars.length;
    var bar = M.bars[bi], next = M.bars[(bi + 1) % M.bars.length], top = (M.alt && M.alt[bi]) || M.top, i;
    if (mood === 'lose') {
      if (at === 0) {
        for (i = 1; i < bar.length; i++) note(a, when + (i - 1) * 0.05, bar[i], 3.6, 0.045, i % 2 ? 'sine' : 'triangle');
        note(a, when, bar[0], 3, 0.15, 'sine'); drum(a, when, 'kick', 0.12);
      }
      if (at === 4 && rand() < 0.5) note(a, when, bar[0] + 7, 1.4, 0.08, 'sine');
      if (at === 2 || at === 6) drum(a, when, 'snare', 0.03);
      if (at % 2 === 0) drum(a, when, 'hat', 0.014);
      if (at % 2 === 0 && rand() < 0.2) note(a, when, pick(top), 1.6 + rand(), 0.04, 'triangle');
      return;
    }
    if (mood === 'win') {
      if (at === 0) for (i = 1; i < bar.length; i++) note(a, when + (i - 1) * 0.012, bar[i], 0.7, 0.05, i % 2 ? 'sine' : 'triangle');
      if (at === 3) for (i = 1; i < bar.length; i++) note(a, when, bar[i], 0.35, 0.035, 'triangle');
      if (at % 2 === 0) note(a, when, bar[0] + [0, 7, 12, 7][at / 2], 0.38, 0.13, 'sine');
      if (at === 0 || at === 4) drum(a, when, 'kick', 0.22);
      if (at === 2 || at === 6) { drum(a, when, 'snare', 0.09); drum(a, when, 'clap', 0.05); }
      drum(a, when, 'hat', at % 2 ? 0.025 : 0.04);
      if (rand() < 0.32) note(a, when, pick(top), 0.3 + rand() * 0.3, 0.05, 'triangle');
      return;
    }
    // The day: at no intensity, the tune as it always was. Each layer fades
    // in over its own stretch of I, so nothing switches on with a jolt.
    var I = music.I, walk = sm(0.35, 0.6, I), stab = sm(0.55, 0.8, I), shake = sm(0.6, 0.9, I), hold = sm(0.75, 1, I);
    if (at === 0) {
      for (i = 1; i < bar.length; i++) note(a, when + (i - 1) * 0.018, bar[i], 2.6, 0.05, i % 2 ? 'sine' : 'triangle');   // the chord, rolled a little
      note(a, when, bar[0], 1.3 - 0.6 * walk, 0.16, 'sine');
      if (hold) note(a, when, bar[bar.length - 1] + 12, beat * 4, 0.03 * hold, 'triangle');
    }
    if (at === 5 && rand() < 0.6) for (i = 2; i < bar.length; i++) note(a, when, bar[i], 1.1, 0.028, 'sine');
    if (stab && (at === 3 || at === 7)) for (i = 2; i < bar.length; i++) note(a, when, bar[i], 0.18, 0.03 * stab, 'triangle');
    if (at === 4) note(a, when, bar[0] + (rand() < 0.5 ? 7 : 12), 0.9 - 0.4 * walk, 0.11, 'sine');
    if (at === 2 && rand() < walk) note(a, when, bar[1] - 12, 0.5, 0.11, 'sine');
    if (at === 6 && rand() < walk) note(a, when, next[0] + (rand() < 0.5 ? 1 : -1), 0.5, 0.11, 'sine');     // a step into the next bar
    if (at === 0 || (at === 5 && rand() < 0.7)) drum(a, when, 'kick', 0.22);
    if (at === 3 && rand() < sm(0.5, 0.8, I) * 0.6) drum(a, when, 'kick', 0.16);
    if (at === 2 || at === 6) drum(a, when, 'snare', 0.07 + 0.03 * I);
    if ((at === 3 || at === 7) && rand() < sm(0.45, 0.75, I)) drum(a, when, 'snare', 0.025);
    drum(a, when, 'hat', (at % 2 ? 0.022 : 0.04) * (1 + 0.6 * I));
    if (shake) drum(a, when + beat / 4, 'hat', 0.016 * shake);
    if (rand() < (at % 2 ? 0.16 : 0.26) * (1 + 0.8 * I)) note(a, when, pick(top), 0.9 + rand() - 0.5 * I, 0.045, 'triangle');
  }
  /* How close the shift is to going wrong, 0 to 1: coffees lost, how near
     the next walk-out is, how full the rail is, and lunch. On Friday it's
     the catering clock. Scaled by the level (game.json, levels: `music`).
     Null while paused, so the music holds where it was. */
  function intensity() {
    if (!T || !G || screen !== 'shift') return 0;
    if (T.paused) return null;
    var cap = level().music == null ? 1 : level().music, d, worst = 1;
    if (T.cat) d = 0.35 + 0.65 * (1 - T.cat.left / T.cat.total);
    else {
      T.tickets.forEach(function (t) { if (!t.family && !t.catering) worst = Math.min(worst, t.left / t.total); });
      d = 0.4 * Math.min(1, (TU.cups - T.cups) / (TU.cups - 1)) + 0.45 * Math.max(0, (0.6 - worst) / 0.6) +
        0.1 * T.tickets.length / TU.rail + (T.bins === 'lunch' ? 0.1 : 0);
    }
    return Math.max(0, Math.min(1, d)) * cap;
  }
  function setMood(m) { music.want = m; }
  /* Room for a tune (owner 2026-11-13): the music dips quickly under it,
     holds low while it plays, and fades back in. `len` is the tune's length
     in seconds. Only when the tune is heard: with sound off, no dip. */
  function musicDip(len) {
    var g = music.dip, a = ac; if (!g || !a || !music.on || !save.sfxVol) return;
    var now = a.currentTime;
    g.gain.cancelScheduledValues(now); g.gain.setValueAtTime(g.gain.value, now);
    g.gain.linearRampToValueAtTime(0.15, now + 0.08); g.gain.setValueAtTime(0.15, now + len);
    g.gain.linearRampToValueAtTime(1, now + len + 1.8);
  }
  function musicTick() {
    var a = ac; if (!a || !music.on) return;
    var now = a.currentTime, dt = Math.min(0.5, now - (music.last || now)); music.last = now;
    // Up quickly (about a second), down slowly, so a close call is heard and
    // the calm after it comes back gently.
    var goal = music.force != null ? music.force : music.mood === 'day' ? intensity() : 0;
    if (goal == null) goal = music.I;
    music.I += (goal - music.I) * (1 - Math.exp(-dt / (goal > music.I ? 1.2 : 4)));
    var dark = music.testDark || !!(T && screen === 'shift' && T.dark > 0);
    if (dark !== music.dark) { music.dark = dark; music.duck.gain.setTargetAtTime(dark ? 0 : 1, now, dark ? 0.03 : 0.4); }
    if (music.next < now) music.next = now + 0.06;
    while (music.next < now + 0.4) {
      // A new tune (a week won or lost, or back to the day) starts on the
      // next half bar, from its own first bar.
      // So does the other style, picked in Settings.
      var S = STYLES[music.style];
      if ((music.want !== music.mood || music.wantStyle !== music.style) && music.step % (2 * S.div) === 0) {
        if (music.wantStyle !== music.style) { music.style = music.wantStyle; if (music.style === 'electronic') synthBand(a); synthPlug(music.style === 'electronic'); }
        music.mood = music.want; music.step = 0; S = STYLES[music.style];
      }
      var M = S.moods[music.mood], day = music.mood === 'day';
      music.bpm += (M.bpm + (day ? S.span * music.I : 0) - music.bpm) * (day ? 0.15 : 0.3) * 2 / S.div;
      var beat = 60 / music.bpm;
      music.lp.frequency.setTargetAtTime(M.lp + (day ? S.lpSpan * music.I : 0), music.next, 0.5);
      S.step(a, music.next + (music.step % 2 && M.swing ? beat * M.swing : 0), beat);    // the jazz's off-beats come late: swing
      music.next += beat / S.div; music.step++;
    }
  }
  /* Start or stop to match the volume. A browser only lets sound start from
     a tap, so every tap calls this. */
  function musicSync() {
    var want = save.musicVol > 0 && !document.hidden && !music.hold;
    if (want && !music.on) {
      var a = ctx(); if (!a) return;
      musicOut(a); music.on = true; music.next = 0; music.last = 0;
      music.timer = setInterval(musicTick, 100); musicTick();
    } else if (!want && music.on) { music.on = false; clearInterval(music.timer); }
  }

