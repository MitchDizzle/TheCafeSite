  /* ---------- electronic: the second style of music ----------
     Owner 2026-11-13: tried first as heavy metal, which came out sounding
     like machines, so it became retro electronic instead, the synths and
     drum machines of the eighties: a pulsing bass, an arpeggio, wide pads
     that duck under the kick, a gated snare in a big room, and a lead near
     the top. All of it made as it plays, like the jazz, and none of it
     anybody else's tune. */
  function noiseHit(a, out, t, len, type, f, v, q) {
    var s = a.createBufferSource(), fl = a.createBiquadFilter(), g = a.createGain();
    s.buffer = noiseBuf; s.loop = true; fl.type = type; fl.frequency.value = f; if (q) fl.Q.value = q;
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    s.connect(fl); fl.connect(g); g.connect(out); s.start(t, rand() * 0.5, len + 0.02);
  }
  /* One synth note: oscillators (detuned copies for width), a low-pass that
     opens and closes like a pluck, and its own loudness shape. */
  function synVoice(a, out, type, midi, t, len, vol, f0, f1, q, atk, detunes) {
    var f = a.createBiquadFilter(), g = a.createGain();
    f.type = 'lowpass'; f.Q.value = q || 1; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + Math.min(len, 0.25));
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + (atk || 0.005));
    g.gain.setValueAtTime(vol, t + Math.max(atk || 0.005, len * 0.7)); g.gain.linearRampToValueAtTime(0.0001, t + len);
    f.connect(g); g.connect(out);
    (detunes || [0]).forEach(function (d) {
      var o = a.createOscillator(); o.type = type; o.frequency.value = hz(midi); o.detune.value = d;
      o.connect(f); o.start(t); o.stop(t + len + 0.05);
    });
  }
  /* A room for it: reverb from two seconds of fading noise, made once. */
  function roomIR(a) {
    var n = Math.floor(a.sampleRate * 2.2), buf = a.createBuffer(2, n, a.sampleRate);
    for (var c = 0; c < 2; c++) { var d = buf.getChannelData(c); for (var i = 0; i < n; i++) d[i] = (rand() * 2 - 1) * Math.pow(1 - i / n, 3); }
    return buf;
  }
  /* The band, made once and plugged into the music only while it plays:
     a dry mix, a pad bus that ducks under each kick, an echo and a room. */
  function synthBand(a) {
    if (music.band) return music.band;
    var mix = a.createGain(), pump = a.createGain(), rev = a.createConvolver(), revOut = a.createGain(), echo = a.createDelay(1), fb = a.createGain(), echoOut = a.createGain();
    mix.gain.value = SYNTH_MIX; rev.buffer = roomIR(a); revOut.gain.value = 0.32; fb.gain.value = 0.32; echoOut.gain.value = 0.28;
    pump.connect(mix); pump.connect(rev); rev.connect(revOut); revOut.connect(mix);
    echo.connect(fb); fb.connect(echo); echo.connect(echoOut); echoOut.connect(mix); echoOut.connect(rev);
    music.band = { mix: mix, pump: pump, rev: rev, echo: echo, on: false };
    return music.band;
  }
  function synthPlug(on) {
    var b = music.band; if (!b || b.on === on) return;
    b.on = on; if (on) b.mix.connect(music.out); else b.mix.disconnect();
  }
  var SYNTH_MIX = 0.3;      // measured: a touch under the jazz when calm, about level at its busiest (owner 2026-11-13: it sounded louder)
  /* One chord a bar: the bass note (low), then the pad's chord. The day:
     A minor, Am F C G, the eighties' favourite four. A week won: C major,
     C G Am F. A week lost: D minor, slower, ending on A major. */
  var SYNTH = {
    day: { prog: [[33, 57, 60, 64], [29, 57, 60, 65], [36, 55, 60, 64], [31, 55, 59, 62]], lead: [69, 72, 74, 76, 79, 81, 84] },
    win: { prog: [[36, 60, 64, 67], [31, 59, 62, 67], [33, 57, 60, 64], [29, 57, 60, 65]], lead: [72, 74, 76, 79, 81, 84, 86] },
    lose: { prog: [[38, 57, 62, 65], [33, 57, 60, 64], [34, 58, 62, 65], [33, 57, 61, 64]], lead: [62, 64, 65, 69, 74] }
  };
  var ARP = [0, 1, 2, 3, 4, 5, 4, 3, 2, 1];      // up the chord and down again, two octaves
  /* One sixteenth note of it. Sixteen to a bar. */
  function synthStep(a, when, beat) {
    var b = music.band, mood = music.mood, P = SYNTH[mood], s = music.step % 16, bi = Math.floor(music.step / 16) % P.prog.length;
    var ch = P.prog[bi], S16 = beat / 4, I = mood === 'day' ? music.I : mood === 'win' ? 0.65 : 0.1;
    var half = mood === 'lose' || (mood === 'day' && I < 0.45);      // half time: the snare on three
    var kick = function (v) {
      var o = a.createOscillator(), g = a.createGain();
      o.frequency.setValueAtTime(150, when); o.frequency.exponentialRampToValueAtTime(42, when + 0.09);
      g.gain.setValueAtTime(v, when); g.gain.exponentialRampToValueAtTime(0.0001, when + 0.32);
      o.connect(g); g.connect(b.mix); o.start(when); o.stop(when + 0.34);
      b.pump.gain.cancelScheduledValues(when); b.pump.gain.setValueAtTime(0.35, when); b.pump.gain.linearRampToValueAtTime(1, when + beat * 0.45);    // the pads duck under it
    };
    var snare = function (v) {      // a clap and a noise burst, sent into the room
      noiseHit(a, b.mix, when, 0.16, 'bandpass', 1600, v, 0.8); noiseHit(a, b.mix, when + 0.012, 0.12, 'bandpass', 1300, v * 0.7, 0.8);
      noiseHit(a, b.rev, when, 0.2, 'bandpass', 1500, v * 1.2, 0.7);
    };
    // The pad: the bar's chord, three saws a note, slow in.
    if (s === 0) ch.slice(1).forEach(function (n) { synVoice(a, b.pump, 'sawtooth', n, when, beat * 4 + 0.15, 0.011, 1500 + 1500 * I, 1500 + 1500 * I, 0.7, 0.18, [-10, 0, 10]); });
    // The bass: half notes on a week lost, eighths when calm, then pulsing sixteenths, jumping the octave near the top.
    var every = mood === 'lose' ? 8 : mood === 'day' && I < 0.25 ? 2 : 1;
    if (s % every === 0) {
      var up = mood !== 'lose' && I > 0.6 && s % 4 === 2 ? 12 : 0;
      synVoice(a, b.mix, 'sawtooth', ch[0] + up, when, (every === 8 ? beat * 2 : S16 * every) * 0.92, 0.09, 1600, 320, 4, 0.004, [0, 7]);
      synVoice(a, b.mix, 'square', ch[0] - 12 + up, when, (every === 8 ? beat * 2 : S16 * every) * 0.92, 0.05, 500, 200, 1, 0.004);
    }
    // The arpeggio: in on the day as it gets busy, all through a week won, slow and sparse on a week lost.
    var arpOn = mood === 'win' || (mood === 'day' && rand() < sm(0.4, 0.6, I)) || (mood === 'lose' && s % 4 === 0);
    if (arpOn && (mood !== 'day' || I > 0.6 || s % 2 === 0)) {
      var tones = ch.slice(1).concat(ch.slice(1).map(function (n) { return n + 12; }));
      var n = tones[ARP[music.step % ARP.length] % tones.length] + (mood === 'lose' ? 0 : 12);
      synVoice(a, b.mix, 'square', n, when, S16 * (mood === 'lose' ? 3 : 0.9), 0.03, 3600, 900, 2, 0.003);
      synVoice(a, b.echo, 'square', n, when, S16 * 0.9, 0.022, 3000, 900, 2, 0.003);
    }
    // The drum machine.
    if (mood === 'lose') { if (s === 0) kick(0.32); if (s === 8 && bi % 2 === 1) snare(0.12); }
    else {
      var floor = mood === 'win' || I > 0.55;      // four on the floor
      if (s === 0 || (floor ? s % 4 === 0 : s === 10 && rand() < 0.5)) kick(0.5);
      var fill = bi % 4 === 3 && s >= 12 && (mood === 'win' || I > 0.6);
      if (fill) snare(0.1 + 0.03 * (s - 12));
      else if (half ? s === 8 : s === 4 || s === 12) snare(0.2);
      if (mood === 'win' || I > 0.3) noiseHit(a, b.mix, when, 0.03, 'highpass', 9000, s % 2 ? 0.03 : 0.018);
      else if (s % 2 === 0) noiseHit(a, b.mix, when, 0.03, 'highpass', 9000, 0.016);
      if ((mood === 'win' || I > 0.7) && s % 4 === 2) noiseHit(a, b.mix, when, 0.16, 'highpass', 8000, 0.022);     // open hat on the off-beat
    }
    // The lead: on the day near the top, on a week won, and now and then, long, on a week lost.
    var leadP = mood === 'day' ? 0.45 * sm(0.68, 0.9, I) : mood === 'win' ? 0.3 : 0.12;
    if (s % 2 === 0 && music.step >= (music.leadUntil || 0) && rand() < leadP && (mood !== 'lose' || s % 4 === 0)) {
      var L = P.lead; music.leadAt = Math.max(0, Math.min(L.length - 1, (music.leadAt == null ? 2 : music.leadAt) + pick([-2, -1, -1, 1, 1, 2])));
      var steps = mood === 'lose' ? 6 + Math.floor(rand() * 5) : 2 + 2 * Math.floor(rand() * 2), len = steps * S16;
      var lg = a.createGain(); lg.connect(b.mix); lg.connect(b.echo); lg.connect(b.rev);
      synVoice(a, lg, 'sawtooth', L[music.leadAt], when, len, 0.035, 2600, 1800, 1.5, 0.02, [-6, 6]);
      synVoice(a, lg, 'square', L[music.leadAt], when, len, 0.02, 2600, 1800, 1.5, 0.02);
      setTimeout(function () { try { lg.disconnect(); } catch (e) { /* no matter */ } }, (when - a.currentTime + len + 3) * 1000);
      music.leadUntil = music.step + steps;
    }
  }

