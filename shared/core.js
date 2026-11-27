/* Shared engine for the three Hush rooms:
   storage, generative audio, wake lock, breathing clock and the session state machine. */
(function () {
  'use strict';

  const Spa = (window.Spa = {});
  const clamp = (Spa.clamp = (v, a, b) => Math.min(b, Math.max(a, v)));
  Spa.lerp = (a, b, t) => a + (b - a) * t;
  Spa.ease = (t) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(t, 0, 1));
  Spa.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Breathing techniques, picked from the breath menu. `t` is seconds for each stage:
  // in, hold after in, out, hold after out. `say` renames a stage's word (in, out, hold);
  // `parts` splits the breath in into named sections, as three-part breathing does.
  Spa.TECHNIQUES = [
    { id: 'balance', word: 'Balance', name: 'Sama Vritti', sub: 'Equal breathing', t: [4, 0, 4, 0],
      note: 'Builds a consistent breathing rhythm. Useful for centering yourself before work, yoga, or meditation.' },
    { id: 'recovery', word: 'Recovery', name: 'Visama Vritti', sub: 'Extended exhale', t: [4, 0, 8, 0],
      note: 'Traditionally used for settling the mind and reducing agitation. If eight counts out feels long, Steady (4 in, 6 out) is a gentler start.' },
    { id: 'concentration', word: 'Concentration', name: 'Antara Kumbhaka', sub: 'Inhale retention', t: [4, 2, 4, 0],
      note: 'Introduces a pause after inhaling. Traditionally used to cultivate attention, steadiness, and control over the breath.' },
    { id: 'stillness', word: 'Stillness', name: 'Bahya Kumbhaka', sub: 'Exhale retention', t: [4, 0, 4, 2],
      note: 'Emphasizes the quiet pause after exhalation. Used to explore mental stillness and awareness of the urge to breathe.' },
    { id: 'discipline', word: 'Discipline', name: 'Sama Vritti', sub: 'With retention', t: [4, 4, 4, 4],
      note: 'The four-phase equal pattern commonly called box breathing. Useful for maintaining a deliberate rhythm under mental pressure.' },
    { id: 'control', word: 'Control', name: 'Visama Vritti', sub: 'Graduated retention', t: [4, 2, 6, 0],
      note: 'A mixed ratio that integrates inhalation retention with a longer exhale. A useful intermediate practice for learning measured breath control.' },
    { id: 'advanced', word: 'Advanced', name: 'Classical 1:4:2 ratio', sub: '', t: [4, 16, 8, 0],
      note: 'A traditional pranayama ratio (the Gheranda Samhita counts it 16 : 64 : 32), associated with deeper concentration and mastery of retention. Not a beginner exercise: learn the long hold with a qualified teacher, and skip it if you are pregnant or have heart or blood-pressure problems.' },
    { id: 'alertness', word: 'Alertness', name: 'Visama Vritti', sub: 'Extended inhale', t: [6, 0, 4, 0],
      note: 'An inhale-emphasized variation sometimes used for a more activating experience. Evidence for a reliable alertness boost is limited.' },
    { id: 'body', word: 'Body', name: 'Three-part breathing', sub: 'Progressive', t: [6, 0, 6, 0], parts: ['belly', 'ribs', 'chest'],
      note: 'Inspired by Dirga Pranayama. The inhale is divided into three continuous expansions, followed by one smooth exhale. Useful for practicing respiratory coordination.' },
    { id: 'movement', word: 'Movement', name: 'Ujjayi', sub: 'Timed ocean breath', t: [5, 0, 5, 0],
      note: 'Uses a gentle throat narrowing to create an ocean-like sound. Can help coordinate breath with physical movement and sustained attention.' },
    { id: 'senses', word: 'Senses', name: 'Bhramari', sub: 'Humming exhale', t: [4, 0, 8, 0], say: { out: 'hum' },
      note: 'The extended humming exhale provides vibration and an auditory anchor. Traditionally used for inward attention and quieting mental chatter.' },
    { id: 'activating', word: 'Activating', name: 'Bhastrika', sub: 'Bellows breathing', t: [1, 0, 1, 0], say: { in: 'in', out: 'out' },
      note: 'Quick, forceful breaths in and out through the nose, pumped from the belly, traditionally used to energize. Stop if you feel dizzy. Usually advised against with high blood pressure, heart disease, epilepsy, hernia, or pregnancy.' },
  ];
  Spa.technique = (id) => Spa.TECHNIQUES.find((x) => x.id === id) || null;
  // Your own pace: how long each breath in and out lasts, and an optional hold after each.
  Spa.PACES = {
    short: { label: 'Short', inhale: 3000, exhale: 5000, hold: 2000 },
    steady: { label: 'Steady', inhale: 4000, exhale: 6000, hold: 3000 },
    long: { label: 'Long', inhale: 5000, exhale: 8000, hold: 4000 },
  };
  // Choose a pace (short, steady, long) with or without a hold, or a technique by its id.
  // `pace` is set only for your own pace; `id` is the pace or technique. `counts` replaces a
  // technique's own seconds (the program's eased version).
  Spa.setPattern = (id, hold, counts) => {
    const T = Spa.technique(id);
    let t, pace = null, say = {}, parts = null;
    if (T) { t = (counts || T.t).map((x) => x * 1000); say = T.say || {}; parts = T.parts || null; hold = false; }
    else {
      pace = Spa.PACES[id] ? id : 'steady'; // an unknown saved choice goes back to Steady
      id = pace; hold = !!hold;
      const P = Spa.PACES[pace], h = hold ? P.hold : 0;
      t = [P.inhale, h, P.exhale, h];
    }
    const [inhale, holdIn, exhale, holdOut] = t;
    Spa.pattern = Object.freeze({ id, pace, hold, inhale, holdIn, exhale, holdOut, cycle: inhale + holdIn + exhale + holdOut, say, parts });
    return Spa.pattern;
  };
  // A pattern's counts in seconds, e.g. "4 in · 2 hold · 4 out", or "2 belly · 2 ribs · 2 chest · 6 out".
  Spa.patternCounts = (P) => {
    const sec = (ms) => +(ms / 1000).toFixed(1), out = [];
    if (P.parts) P.parts.forEach((x) => out.push(`${sec(P.inhale / P.parts.length)} ${x}`));
    else out.push(`${sec(P.inhale)} ${P.say.in || 'in'}`);
    if (P.holdIn) out.push(`${sec(P.holdIn)} hold`);
    out.push(`${sec(P.exhale)} ${P.say.out || 'out'}`);
    if (P.holdOut) out.push(`${sec(P.holdOut)} hold`);
    return out.join(' · ');
  };
  Spa.setPattern('steady'); // the app restores the last choice

  const GUIDE_CYCLES = 6; // breathing words fade away after the first few breaths
  // Every session opens with a brief stillness, then one breath in shown large across the
  // screen. The countdown starts when that inhale (and its hold) ends, on the first "breathe out".
  const SETTLE = (Spa.SETTLE = 1500);
  const AT_REST = Object.freeze({ cycle: -1, p: 0, stage: 'in', f: 0, inhale: true, k: 0 });
  const STAGE_WORDS = { in: 'breathe in', 'hold-in': 'hold', out: 'breathe out', 'hold-out': 'hold' };
  // The word for where a breath stands, following the technique's own words.
  const stageWord = (b, P) => {
    if (b.stage === 'in' && P.parts) return P.parts[Math.min(P.parts.length - 1, Math.floor(b.f * P.parts.length))];
    const k = b.stage === 'in' ? 'in' : b.stage === 'out' ? 'out' : 'hold';
    return P.say[k] || STAGE_WORDS[b.stage];
  };

  Spa.AFTERCARE = [
    'Take a slow sip of water before you rise.',
    'Stretch, and move slowly for a while.',
    'Carry a little of this stillness with you.',
    'Notice your shoulders. Let them stay soft.',
    'There is no hurry. Return when you are ready.',
  ];

  /* ───────────── storage (per design) ───────────── */
  Spa.store = (ns) => ({
    // Keys keep the original 'spa.' prefix so saved lengths and sounds survive the rename.
    get(k, d) {
      try {
        const v = localStorage.getItem(`spa.${ns}.${k}`);
        return v === null ? d : JSON.parse(v);
      } catch { return d; }
    },
    set(k, v) {
      try { localStorage.setItem(`spa.${ns}.${k}`, JSON.stringify(v)); } catch { /* private mode */ }
    },
  });

  /* ───────────── formatting ───────────── */
  const pad = (n) => String(n).padStart(2, '0');
  Spa.fmtClock = (secs) => {
    const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
    return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  };
  Spa.fmtDuration = (min) => {
    if (min < 60) return min === 1 ? 'one minute' : `${min} minutes`;
    const h = Math.floor(min / 60), m = min % 60;
    return `${h} hour${h > 1 ? 's' : ''}${m ? ` ${m} minutes` : ''}`;
  };
  // Where a breath stands after `elapsed` ms: its cycle, position p within it, the stage
  // ('in', 'hold-in', 'out', 'hold-out'), progress f through that stage, and fullness k (0..1).
  // `inhale` is true from the start of the breath in until the breath out begins.
  Spa.breathAt = (elapsed, P = Spa.pattern) => {
    const cycle = Math.floor(elapsed / P.cycle), p = elapsed % P.cycle;
    const full = P.inhale + P.holdIn, empty = full + P.exhale;
    let stage, f, k;
    if (p < P.inhale) { stage = 'in'; f = p / P.inhale; k = Spa.ease(f); }
    else if (p < full) { stage = 'hold-in'; f = (p - P.inhale) / P.holdIn; k = 1; }
    else if (p < empty) { stage = 'out'; f = (p - full) / P.exhale; k = 1 - Spa.ease(f); }
    else { stage = 'hold-out'; f = (p - empty) / P.holdOut; k = 0; }
    return { cycle, p, stage, f, inhale: p < full, k };
  };

  /* ───────────── wake lock ───────────── */
  Spa.wake = {
    lock: null,
    async on() {
      try {
        if ('wakeLock' in navigator && !this.lock) {
          this.lock = await navigator.wakeLock.request('screen');
          this.lock.addEventListener('release', () => { this.lock = null; });
        }
      } catch { /* unsupported or denied */ }
    },
    async off() {
      try { await this.lock?.release(); } catch { /* ignore */ }
      this.lock = null;
    },
  };

  /* ───────────── generative audio ───────────── */
  Spa.audio = (() => {
    let ctx = null, master, reverb, ambienceGain, muteGain, cur = null;
    const bufs = {};
    const A = { onEvent: null, dimmed: false };

    function ensure() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        // Let iOS play through the silent switch, like a media app.
        try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* ignore */ }
        ctx = new AC();
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -16; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.4;
        master = gain(0.9);
        master.connect(comp); comp.connect(ctx.destination);
        reverb = ctx.createConvolver();
        reverb.buffer = impulse(4, 2.4);
        reverb.connect(gain(0.34)).connect(master);
        muteGain = gain(1); muteGain.connect(master);
        muteGain.connect(gain(0.35)).connect(reverb);
        ambienceGain = gain(1); ambienceGain.connect(muteGain);
      }
      if (ctx.state !== 'running') ctx.resume().catch(() => {});
      return ctx;
    }

    const gain = (v) => { const g = ctx.createGain(); g.gain.value = v; return g; };
    const filt = (type, f, q = 0.7) => {
      const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b;
    };
    const panner = (v) => {
      if (!ctx.createStereoPanner) return gain(1);
      const p = ctx.createStereoPanner(); p.pan.value = v; return p;
    };
    // Freeze a param at its current value before scheduling new automation.
    // Not cancelAndHoldAtTime: in Chrome it drops to 0 mid-setTargetAtTime, which made the
    // ocean thump at every breath. Instead we remember each curve we schedule and evaluate it.
    const curves = new WeakMap();
    function hold(param, t) {
      const curve = curves.get(param);
      const v = curve ? curve(t) : param.value;
      param.cancelScheduledValues(t);
      param.setValueAtTime(v, t);
      return v;
    }
    function to(param, v, sec) {
      const t = ctx.currentTime, v0 = hold(param, t);
      param.linearRampToValueAtTime(v, t + sec);
      curves.set(param, (x) => (x >= t + sec ? v : v0 + (v - v0) * Math.max(0, x - t) / sec));
    }
    // Fade to silence on an eased curve: it leaves the top slowly and thins out to nothing,
    // so the ear hears an even fade (a straight ramp seems to hold, then drop at the end).
    function fadeOut(param, sec) {
      const t = ctx.currentTime, v0 = hold(param, t);
      const shape = (k) => v0 * ((1 + Math.cos(Math.PI * Math.min(1, Math.max(0, k)))) / 2) ** 2;
      const pts = new Float32Array(64).map((_, i) => shape(i / 63));
      // Starts a hair after the held value, as some browsers refuse a curve that shares its start.
      param.setValueCurveAtTime(pts, t + 0.01, sec);
      curves.set(param, (x) => shape((x - t - 0.01) / sec));
    }

    function impulse(sec, decay) {
      const len = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = b.getChannelData(c);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
      return b;
    }

    // Seamlessly looping stereo noise: the head is cross-faded with the tail.
    function buf(kind) {
      if (bufs[kind]) return bufs[kind];
      const sr = ctx.sampleRate;
      if (kind === 'click') {
        const L = Math.floor(sr * 0.04), b = ctx.createBuffer(1, L, sr), d = b.getChannelData(0);
        for (let i = 0; i < L; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / L, 6);
        return (bufs[kind] = b);
      }
      const L = Math.floor(sr * 11), X = Math.floor(sr * 0.5);
      const b = ctx.createBuffer(2, L, sr), raw = new Float32Array(L + X);
      for (let c = 0; c < 2; c++) {
        let last = 0;
        for (let i = 0; i < L + X; i++) {
          const w = Math.random() * 2 - 1;
          if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; raw[i] = last * 3.5; } else raw[i] = w;
        }
        const d = b.getChannelData(c);
        for (let i = 0; i < L; i++) d[i] = raw[i];
        for (let i = 0; i < X; i++) { const t = i / X; d[i] = raw[i] * t + raw[L + i] * (1 - t); }
      }
      return (bufs[kind] = b);
    }

    function src(c, b, rate = 1) {
      const s = ctx.createBufferSource();
      s.buffer = b; s.loop = true; s.playbackRate.value = rate;
      s.start(ctx.currentTime, Math.random() * b.duration);
      c.sources.push(s);
      return s;
    }
    function osc(c, type, f) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.start();
      c.sources.push(o);
      return o;
    }
    function lfo(c, rate, depth, param) {
      const o = osc(c, 'sine', rate), g = gain(depth); o.connect(g); g.connect(param);
    }
    function chain(c, delay, fn) {
      const ch = { id: 0 };
      const run = () => { if (c.stopped) return; if (!A.dimmed) fn(); ch.id = setTimeout(run, delay()); };
      ch.id = setTimeout(run, delay());
      c.chains.push(ch);
    }
    const emit = (type, data) => { try { A.onEvent?.(type, data); } catch { /* ignore */ } };

    // A param's value right now, following any curve we scheduled on it.
    const now = (param) => { const curve = curves.get(param); return curve ? curve(ctx.currentTime) : param.value; };

    // How far each sound swells toward its in-breath peak. 1 is the full swing set in each bed;
    // lower softens the top of every breath in every room.
    const BREATH_DEPTH = 0.65;

    // Shape a parameter to follow one breath from position p to the end of the cycle.
    // fn maps a breath (as Spa.breathAt gives it: stage, f, k) to the param's value, so sound
    // runs on the very same clock and curve as the visuals.
    // Built from short linear ramps, not setValueCurveAtTime: a curve can't be cut short safely.
    const STEP = 0.1; // seconds per ramp segment
    function breathCurve(param, p, fn) {
      const P = breathPattern, t = ctx.currentTime, span = Math.max(0, (P.cycle - p) / 1000);
      const val = (x) => fn(Spa.breathAt(p + Math.min(span, Math.max(0, x - t)) * 1000, P));
      const v0 = hold(param, t);
      // Ease from wherever the param stands into the breath over the first segment.
      for (let s = STEP; s < span + STEP; s += STEP) param.linearRampToValueAtTime(val(t + Math.min(s, span)), t + Math.min(s, span));
      curves.set(param, (x) => (x < t + STEP ? v0 + (val(t + STEP) - v0) * Math.max(0, x - t) / STEP : val(x)));
    }
    // Rise with fullness k from lo to hi (softened by BREATH_DEPTH). Frequencies (log) move
    // evenly in pitch rather than in Hz.
    function breathShape(param, p, hi, lo, log = false) {
      hi = log ? lo * Math.pow(hi / lo, BREATH_DEPTH) : lo + (hi - lo) * BREATH_DEPTH;
      breathCurve(param, p, (b) => (log ? lo * Math.pow(hi / lo, b.k) : lo + (hi - lo) * b.k));
    }
    const sweep = (lo, hi, k) => lo * Math.pow(hi / lo, k);

    function chime(dest, delay, f) {
      const t = ctx.currentTime + 0.02 + delay;
      const out = gain(0.05); out.connect(dest); out.connect(reverb);
      [[1, 1, 4.5], [2.76, 0.35, 2.2], [5.4, 0.12, 1.1]].forEach(([r, a, d]) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = f * r;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(a, t + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(g).connect(out); o.start(t); o.stop(t + d + 0.1);
      });
      setTimeout(() => emit('chime', { f }), (delay + 0.02) * 1000);
    }

    /* Orbit's sounds: a relaxing fairytale told among the stars (chosen 2026-11-16). D major in
       just intonation, one chord per breath going round D, B minor, G, A, under faint starlight
       that blooms with each breath in, in a long warm reverb. Float is a far-off choir calling in an
       enchanted glade (Beacon); Voyage is a storybook harp. */
    const D = 146.83; // D3; every Orbit note is a just ratio of it

    // A long (6 s), warm, wide reverb, made once and fed only by Orbit's sounds. Smoothed noise,
    // different in each ear. It returns through the ambience gain, so dim and mute reach it.
    let space = null;
    function spaceSend() {
      if (space) return space;
      const len = Math.floor(ctx.sampleRate * 6), b = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = b.getChannelData(ch);
        let s = 0;
        for (let i = 0; i < len; i++) { s += 0.35 * (Math.random() * 2 - 1 - s); d[i] = s * Math.pow(1 - i / len, 2.5); }
      }
      const conv = ctx.createConvolver();
      conv.buffer = b;
      space = gain(0.9);
      space.connect(conv).connect(ambienceGain);
      return space;
    }

    // A ping-pong echo into the bed: each repeat a little softer and darker, left then right.
    function echo(c, wet) {
      const input = gain(1), out = gain(wet), l = ctx.createDelay(2), r = ctx.createDelay(2);
      l.delayTime.value = 0.42; r.delayTime.value = 0.63;
      const lr = gain(0.5), rl = gain(0.5), dark = filt('lowpass', 2600);
      input.connect(l);
      l.connect(lr).connect(r); r.connect(dark).connect(rl).connect(l);
      l.connect(panner(-0.75)).connect(out); r.connect(panner(0.75)).connect(out);
      out.connect(c.bed);
      return input;
    }

    // A celesta-like note: a sine with a quiet, quickly fading 4th and 2nd harmonic, a soft
    // strike and a ring. Goes dry to `dest` and into the echo.
    function celesta(c, at, f, vol, ring, pan = 0) {
      const p = panner(pan); p.connect(c.notes); p.connect(c.echo);
      [[1, 1, ring], [4, 0.16, ring * 0.15], [2, 0.08, ring * 0.4]].forEach(([r, a, d]) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = f * r;
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(vol * a, at + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, at + d);
        o.connect(g).connect(p); o.start(at); o.stop(at + d + 0.1);
      });
    }

    // Notes planned ahead on the audio clock are remembered, so a new breath can call off the
    // ones not yet started; any already ringing ring on.
    function later(c, at, oscs) { (c.pending ||= []).push({ at, oscs }); }
    function callOff(c) {
      const t = ctx.currentTime + 0.02;
      (c.pending || []).forEach((n) => { if (n.at > t) n.oscs.forEach((o) => { try { o.stop(t); } catch { /* ignore */ } }); });
      c.pending = [];
      (c.dropT || []).forEach(clearTimeout); c.dropT = [];
    }
    // Plays a list of [ms into the breath, ...args] from a breath now `p` ms in, skipping any
    // already past: fn(at, ...args) gets the audio-clock time. `ripple` (0 to 1) also ripples
    // the scene as the note sounds.
    function playList(c, p, list, fn, ripple = 0) {
      const t0 = ctx.currentTime - p / 1000;
      list.forEach(([ms, ...args]) => {
        if (ms < p - 50) return;
        fn(t0 + Math.max(ms, p) / 1000 + 0.02, ...args);
        if (ripple) (c.dropT ||= []).push(setTimeout(() => { if (!c.stopped) emit('drop', { pan: args[2] ?? 0, peak: ripple }); }, Math.max(0, ms - p)));
      });
    }

    const MAJOR = [1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8]; // D E F# G A B C#
    // Scale degree to Hz: degree 0 is D at `base`, 7 the D above, -1 the C# below.
    const deg = (d, base) => base * MAJOR[((d % 7) + 7) % 7] * Math.pow(2, Math.floor(d / 7));
    const TALE = [ // the four chords: roots, and the chord tones as scale degrees
      { root: 0, tones: [0, 2, 4] },  // D
      { root: 5, tones: [5, 0, 2] },  // B minor
      { root: 3, tones: [3, 5, 0] },  // G
      { root: 4, tones: [4, 6, 1] },  // A
    ];
    const taleChord = (cycle) => TALE[((cycle % 4) + 4) % 4];

    // Voyage's harp: plucked strings made the Karplus-Strong way (a burst of soft noise
    // circling a loop one period long, a little duller each time round), rendered once per note.
    const harpBufs = new Map();
    function harpBuf(f) {
      const key = Math.round(f * 10);
      if (harpBufs.has(key)) return harpBufs.get(key);
      const sr = ctx.sampleRate, len = Math.floor(sr * 5), N = Math.max(2, Math.round(sr / f));
      const b = ctx.createBuffer(1, len, sr), d = b.getChannelData(0);
      const decay = Math.pow(0.001, 1 / (f * Math.min(5, 1.5 + 600 / f))); // lower strings ring longer
      let s = 0;
      for (let i = 0; i < N; i++) { s += 0.5 * (Math.random() * 2 - 1 - s); d[i] = s; } // a soft, fingertip pluck
      for (let i = N; i < len; i++) d[i] = decay * 0.5 * (d[i - N] + d[i - N + 1]);
      let pk = 0; for (let i = 0; i < len; i++) pk = Math.max(pk, Math.abs(d[i]));
      for (let i = 0; i < len; i++) d[i] /= pk || 1;
      harpBufs.set(key, b);
      return b;
    }
    function harp(c, at, f, vol, pan) {
      const s = ctx.createBufferSource(), g = gain(vol), p = panner(pan);
      s.buffer = harpBuf(f);
      s.connect(filt('lowpass', Math.min(5000, f * 5))).connect(g).connect(p);
      p.connect(c.notes); p.connect(c.echo);
      s.start(at);
      later(c, at, [s]);
    }

    // A warm, slow string pad on the tale's chords: two sawtooths a hair apart per note, well
    // muffled, gliding to each new chord and swelling with the breath.
    function stringPad(c, level) {
      const tone = filt('lowpass', 600, 0.4), swell = gain(0.35);
      swell.connect(tone).connect(gain(level)).connect(c.bed);
      const pads = [-7, 0, 2, 4].map((dg, i) => [-0.12, 0.12].map((cents) => {
        const o = osc(c, 'sawtooth', deg(dg, D)); o.detune.value = cents * 100;
        o.connect(panner([0, -0.4, 0.4, 0][i])).connect(gain(i ? 0.18 : 0.26)).connect(swell);
        return o;
      }));
      return {
        breathe(p) { breathShape(swell.gain, p, 1, 0.35); breathShape(tone.frequency, p, 1500, 550, true); },
        chord(ch) {
          // The bass on the root; the three upper voices take the chord's notes within D3 to C#4, so
          // each moves only a step or two.
          const t = ctx.currentTime, notes = [ch.root - 7, ...[...ch.tones].sort((a, b) => a - b)];
          pads.forEach((pair, i) => pair.forEach((o) => { o.frequency.cancelScheduledValues(t); o.frequency.setTargetAtTime(deg(notes[i], D), t, 0.6); }));
        },
      };
    }

    // Starlight: three very high, pure tones on the chord (around D6), panned wide, that bloom with
    // each breath in and all but vanish on the breath out, gliding to each new chord.
    function starlight(c, level) {
      const bloom = gain(0);
      bloom.connect(gain(level)).connect(c.bed);
      const stars = [0, 1, 2].map((i) => {
        const o = osc(c, 'sine', deg(TALE[0].tones[i] + 14, D));
        o.connect(gain([0.5, 0.35, 0.25][i])).connect(panner([-0.6, 0.6, 0][i])).connect(bloom);
        return o;
      });
      return {
        breathe(p) { breathShape(bloom.gain, p, 1, 0.05); },
        chord(ch) {
          const t = ctx.currentTime;
          [...ch.tones].sort((a, b) => a - b).forEach((d, i) => { stars[i].frequency.cancelScheduledValues(t); stars[i].frequency.setTargetAtTime(deg(d + 14, D), t, 1.2); });
        },
      };
    }

    // Float's choir: a distant "ooh", three voices a little out of tune with each other an octave
    // below the note, shaped by the vowel's resonances and swelling in slowly.
    function choirNote(c, at, f, dur, vol, pan) {
      const p = panner(pan), env = ctx.createGain(), vowel = gain(1), oscs = [];
      p.connect(c.notes); p.connect(c.echo); env.connect(p);
      env.gain.setValueAtTime(0.0001, at);
      env.gain.exponentialRampToValueAtTime(vol, at + 0.5);
      env.gain.setTargetAtTime(0.0001, at + dur, 0.45);
      [[330, 6, 1], [880, 8, 0.25], [2400, 10, 0.05]].forEach(([ff, q, a]) => vowel.connect(filt('bandpass', ff, q)).connect(gain(a * 3)).connect(env));
      const vib = ctx.createOscillator(), vd = gain(f * 0.004);
      vib.frequency.value = 4.8; vib.connect(vd);
      [-9, 0, 8].forEach((cents) => {
        const o = ctx.createOscillator(); o.type = 'sawtooth';
        o.frequency.value = f / 2; o.detune.value = cents;
        vd.connect(o.frequency);
        o.connect(gain(0.33)).connect(vowel); oscs.push(o);
      });
      oscs.push(vib);
      oscs.forEach((o) => { o.start(at); o.stop(at + dur + 2.5); });
      later(c, at, oscs);
    }

    // Float's call, two long choir notes a 4th or 5th apart through each breath out (ratios of D5,
    // one pair per chord: D, B minor, G, A).
    const BEACON = [[3 / 2, 1], [5 / 4, 5 / 6], [2, 4 / 3], [15 / 8, 9 / 8]];

    const BEDS = {
      float(c) {
        // Beacon (chosen 2026-11-16): a far-off call in an enchanted glade among the stars. A soft
        // solar wind rises with each breath in, three faint grains of fairy dust as each breath in
        // starts, and a distant choir sings two long, overlapping notes through each breath out,
        // trailing off in a long echo, over the faint string pad, starlight and a deep, quiet hum.
        const send = gain(0.95); send.connect(spaceSend()); c.bed.connect(send);
        c.notes = gain(1); c.notes.connect(c.bed);
        c.echo = echo(c, 0.3);
        const pad = stringPad(c, 0.08), star = starlight(c, 0.02);
        const wind = gain(0.009), band = filt('bandpass', 500, 1.1);
        src(c, buf('white')).connect(band).connect(wind).connect(c.bed);
        osc(c, 'sine', D / 2).connect(gain(0.035)).connect(c.bed); // D2
        c.breathe = (p, cycle) => {
          const P = breathPattern;
          pad.breathe(p); star.breathe(p);
          breathShape(wind.gain, p, 0.042, 0.009);
          breathShape(band.frequency, p, 1300, 380, true);
          callOff(c);
          if (!P.inhale) return;
          const ch = taleChord(cycle), k = ((cycle % 4) + 4) % 4;
          if (p < 300) { pad.chord(ch); star.chord(ch); }
          const dust = [];
          [2, 4, 7].forEach((d, i) => dust.push([150 + i * (260 + Math.random() * 120), deg(d, D * 8), 0.009 - i * 0.0015, -0.4 + i * 0.4]));
          playList(c, p, dust, (at, f, v, pan) => celesta(c, at, f, v, 2.2, pan), 0.015);
          const out = P.inhale + P.holdIn, E = P.exhale;
          if (E > 0) {
            playList(c, p, BEACON[k].map((r, i) => [out + i * E * 0.4, D * 4 * r, (E * 0.6) / 1000, 0.06, 0.3 - i * 0.6]),
              (at, f, dur, v, pan) => choirNote(c, at, f, dur, v, pan));
          }
        };
      },
      voyage(c) {
        // Once upon a time: a harp rolls slowly up through the chord through each breath in, two or
        // three strings drift back down through each breath out, over a warm string pad that swells
        // with the breath and moves to the next chord each breath, under starlight and a deep,
        // quiet hum. The strings echo off into space. Kept soft and far off.
        const send = gain(1); send.connect(spaceSend()); c.bed.connect(send);
        c.notes = gain(1); c.notes.connect(c.bed);
        c.echo = echo(c, 0.25);
        const pad = stringPad(c, 0.14), star = starlight(c, 0.02);
        osc(c, 'sine', D / 2).connect(gain(0.035)).connect(c.bed); // D2
        c.breathe = (p, cycle) => {
          const P = breathPattern;
          pad.breathe(p); star.breathe(p);
          callOff(c);
          if (!P.inhale) return;
          const ch = taleChord(cycle), list = [];
          if (p < 300) { pad.chord(ch); star.chord(ch); }
          // Six of the chord's notes up from its root (from G3 to D4), two octaves.
          const up = [], s = ch.root ? -7 : 0;
          for (let o = 0; up.length < 6; o += 7) ch.tones.forEach((t) => { const d = (t < ch.root ? t + 7 : t) + o + s; if (up.length < 6) up.push(d); });
          up.sort((a, b) => a - b);
          const roll = Math.min(3500, P.inhale * 0.75); // an unhurried roll through most of the breath in
          up.forEach((d, i) => list.push([(i * roll) / up.length, deg(d, D * 2), 0.08 - i * 0.006, -0.5 + (i * 1.0) / (up.length - 1)]));
          const out = P.inhale + P.holdIn;
          if (P.exhale > 0) {
            const down = [up[5], up[3], up[1]].slice(0, P.exhale >= 4000 ? 3 : 2);
            down.forEach((d, i) => list.push([out + (i * P.exhale) / (down.length + 0.5), deg(d, D * 2), 0.05, 0.4 - i * 0.4]));
          }
          playList(c, p, list, (at, f, v, pan) => harp(c, at, f, v * 2.4, pan), 0.02);
        };
      },
      ocean(c) {
        src(c, buf('brown'), 0.9).connect(filt('lowpass', 180)).connect(gain(0.55)).connect(c.bed);
        const surf = filt('lowpass', 420, 0.5), swell = gain(0.3);
        src(c, buf('brown')).connect(surf).connect(swell).connect(c.bed);
        const foam = gain(0);
        src(c, buf('white')).connect(filt('bandpass', 2600, 0.5)).connect(foam).connect(c.bed);
        c.breathe = (p) => {
          breathShape(surf.frequency, p, 1700, 380, true);
          breathShape(swell.gain, p, 0.95, 0.3);
          breathShape(foam.gain, p, 0.07, 0);
        };
      },
      rain(c) {
        // Each in-breath brings a gust: the hiss brightens and swells and the drops quicken.
        const hissTone = filt('lowpass', 5000), hiss = gain(0.12);
        src(c, buf('white')).connect(filt('highpass', 900)).connect(hissTone).connect(hiss).connect(c.bed);
        src(c, buf('brown'), 1.1).connect(filt('lowpass', 500)).connect(gain(0.45)).connect(c.bed);
        c.breathe = (p) => {
          breathShape(hissTone.frequency, p, 8000, 3200, true);
          breathShape(hiss.gain, p, 0.22, 0.09);
        };
        chain(c, () => (90 + Math.random() * Math.random() * 900) / (0.5 + 4 * now(hiss.gain)), () => {
          const t = ctx.currentTime + 0.01, f = 900 + Math.random() * 2600;
          const peak = 0.008 + Math.random() * Math.random() * 0.05, pan = Math.random() * 2 - 1;
          const o = ctx.createOscillator(), g = ctx.createGain(), p = panner(pan * 0.8);
          o.frequency.setValueAtTime(f * 0.6, t);
          o.frequency.exponentialRampToValueAtTime(f, t + 0.045);
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(peak, t + 0.003);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07 + Math.random() * 0.05);
          o.connect(g).connect(p).connect(c.bed);
          o.start(t); o.stop(t + 0.15);
          emit('drop', { pan, peak });
        });
      },
      temple(c) {
        // The fundamental stays steady; the upper tones bloom and a breath of air brightens on
        // the in-breath. A high note marks the start of each in-breath, a low one each out-breath.
        const high = gain(0.35); // the low hum (98, 147 Hz) half its old level, a little quieter (2026-11-27)
        high.connect(c.bed);
        [[98, 0.08, c.bed], [98.35, 0.015, c.bed], [147, 0.04, c.bed], [196.2, 0.09, high], [293.7, 0.05, high], [392.4, 0.03, high]].forEach(([f, a, out], i) => {
          const g = gain(a);
          osc(c, 'sine', f).connect(g).connect(out);
          lfo(c, 0.035 + i * 0.021, a * 0.15, g.gain); // slow shimmer only, so the breath leads
        });
        const airTone = filt('bandpass', 600, 1), air = gain(0);
        src(c, buf('white')).connect(airTone).connect(air).connect(c.bed);
        c.breathe = (p, cycle) => {
          const P = breathPattern;
          breathCurve(high.gain, p, (b) => 0.35 + 0.81 * b.k);
          breathCurve(air.gain, p, (b) => 0.12 * b.k);
          breathCurve(airTone.frequency, p, (b) => sweep(600, 1300, b.k));
          clearTimeout(c.cueT);
          // No high note on the opening breath in: the bowl has just rung. It first sounds on the second.
          if (p < 300 && cycle > 0) chime(c.bed, 0, 784);
          const outIn = P.inhale + P.holdIn - p;
          if (outIn > 0) c.cueT = setTimeout(() => { if (!c.stopped && !A.dimmed) chime(c.bed, 0, 392); }, outIn);
        };
      },
      hearth(c) {
        // Breathes like bellows: roar and rumble rise on the in-breath, and the crackles with them.
        const rumble = filt('lowpass', 260);
        src(c, buf('brown'), 0.8).connect(rumble).connect(gain(0.48)).connect(c.bed);
        const roar = gain(0.04); // roar and rumble 0.8x, a little quieter (2026-11-27)
        src(c, buf('white')).connect(filt('bandpass', 900, 0.5)).connect(roar).connect(c.bed);
        lfo(c, 0.13, 0.005, roar.gain); // a faint flicker, small next to the breath
        c.breathe = (p) => {
          breathShape(roar.gain, p, 0.088, 0.028);
          breathShape(rumble.frequency, p, 560, 240, true);
        };
        chain(c, () => (25 + Math.random() ** 2 * 520) / (0.5 + 12.5 * now(roar.gain)), () => {
          const t = ctx.currentTime + 0.005, s = ctx.createBufferSource();
          const big = Math.random() < 0.06, peak = big ? 0.3 + Math.random() * 0.2 : 0.02 + Math.random() ** 3 * 0.18;
          s.buffer = buf('click'); s.playbackRate.value = 0.6 + Math.random() * 1.2;
          const g = gain(peak * 1.6), p = panner(Math.random() * 1.4 - 0.7); // crackles a little louder (2026-11-27)
          s.connect(filt('highpass', big ? 700 : 1200 + Math.random() * 2800)).connect(g).connect(p).connect(c.bed);
          s.start(t);
          emit('crackle', { peak, big });
        });
      },
      garden(c) {
        // A breeze through the leaves on each in-breath; the chimes ring more while it blows.
        const breeze = gain(1);
        breeze.connect(c.bed);
        c.breathe = (p) => breathShape(breeze.gain, p, 1.7, 0.6);
        src(c, buf('brown'), 1.2).connect(filt('lowpass', 400)).connect(gain(0.22)).connect(c.bed);
        [[700, 1.2, 0.07, 250, 0.31], [1700, 0.9, 0.05, 500, 0.53], [3200, 0.7, 0.022, 900, 0.71]].forEach(([f, q, a, dep, rate]) => {
          const b = filt('bandpass', f, q);
          src(c, buf('white')).connect(b).connect(gain(a)).connect(breeze);
          lfo(c, rate, dep, b.frequency);
          lfo(c, rate * 1.7, dep * 0.6, b.frequency);
        });
        const notes = [523.25, 587.33, 659.25, 783.99, 880, 1046.5];
        chain(c, () => (2500 + Math.random() * 7000) / now(breeze.gain), () => {
          const n = Math.random() < 0.35 ? 2 + Math.floor(Math.random() * 2) : 1;
          for (let i = 0; i < n; i++) {
            const d = i * (0.18 + Math.random() * 0.3), f = notes[Math.floor(Math.random() * notes.length)];
            chime(c.bed, d, f);
            setTimeout(() => emit('chime', { f }), d * 1000);
          }
        });
      },
    };

    A.ensure = ensure;
    A.startAmbience = (kind) => {
      if (!ensure()) return;
      A.dimmed = false;
      to(ambienceGain.gain, 1, 0.3);
      // Already playing (a preview from the setup screen): keep it, and let it settle to rest.
      if (cur && cur.kind === kind) { settle(); return; }
      A.stopAmbience(1.5);
      if (!BEDS[kind]) return;
      const c = { kind, bed: gain(0), sources: [], chains: [], stopped: false, breathe: null };
      c.bed.connect(ambienceGain);
      BEDS[kind](c);
      to(c.bed.gain, 1, 5);
      cur = c;
    };
    A.stopAmbience = (fade = 3) => {
      if (!ctx || !cur) return;
      const c = cur; cur = null;
      c.stopped = true;
      c.chains.forEach((ch) => clearTimeout(ch.id));
      fadeOut(c.bed.gain, fade);
      setTimeout(() => {
        c.sources.forEach((s) => { try { s.stop(); } catch { /* already stopped */ } });
        try { c.bed.disconnect(); } catch { /* ignore */ }
      }, fade * 1000 + 250);
    };
    let breathPattern = Spa.pattern; // the pattern of the breath being shaped
    A.breathe = (p, P = Spa.pattern, cycle = 1) => {
      breathPattern = P;
      if (ctx && cur?.breathe && !A.dimmed) { cur.lastBreath = { p, P, t: ctx.currentTime }; cur.breathe(p, cycle); }
    };
    A.playing = () => cur?.kind ?? null;
    // Ease the bed from wherever its breath stands down to rest over the session's opening
    // stillness, as the scene does, by shaping it with a lone breath out that ends at rest then.
    function settle() {
      const lb = cur.lastBreath;
      if (!lb || !cur.breathe) return;
      const k = Spa.breathAt(Math.min(lb.P.cycle - 1, lb.p + (ctx.currentTime - lb.t) * 1000), lb.P).k;
      const f = Math.acos(clamp(2 * k - 1, -1, 1)) / Math.PI; // how far through a breath out k sits
      const L = f > 0.98 ? Spa.SETTLE : Spa.SETTLE / (1 - f);
      breathPattern = { inhale: 0, holdIn: 0, exhale: L, holdOut: 1, cycle: L + 1 };
      cur.breathe(Math.min(L, f * L), 0);
    }
    A.dim = (on) => { A.dimmed = on; if (ctx) to(ambienceGain.gain, on ? 0.2 : 1, 1.5); };
    A.mute = (on) => { if (ctx) to(muteGain.gain, on ? 0 : 1, 0.6); };

    // Singing bowl: inharmonic partials, each a detuned pair for a slow shimmer.
    A.bell = (delay = 0, vol = 0.5, f0 = 196) => {
      if (!ensure()) return;
      const t = ctx.currentTime + 0.05 + delay;
      const out = gain(vol); out.connect(master); out.connect(gain(0.9)).connect(reverb);
      [[1, 1, 11], [2.756, 0.5, 7], [5.404, 0.25, 4.5], [8.933, 0.11, 2.6]].forEach(([r, a, d], i) => {
        [-1, 1].forEach((sign) => {
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.frequency.value = f0 * r + sign * (0.5 + i * 0.35);
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(a * 0.16, t + 0.008);
          g.gain.exponentialRampToValueAtTime(0.0001, t + d);
          o.connect(g).connect(out); o.start(t); o.stop(t + d + 0.1);
        });
      });
      const s = ctx.createBufferSource(); s.buffer = buf('click');
      s.connect(filt('bandpass', 1800, 1.2)).connect(gain(0.25)).connect(out);
      s.start(t);
    };

    A.chime = (f = 880) => { if (ensure()) chime(master, 0, f); };

    A.tick = (pitch = 1) => {
      if (!ctx || ctx.state !== 'running') return;
      const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(1100 * pitch, t);
      o.frequency.exponentialRampToValueAtTime(420 * pitch, t + 0.03);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      o.connect(g).connect(master); o.start(t); o.stop(t + 0.06);
    };

    // Two stones meeting: a dull thump plus a bright click.
    A.clack = (size = 1) => {
      if (!ctx || ctx.state !== 'running') return;
      const t = ctx.currentTime + 0.005, o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(260 / size, t);
      o.frequency.exponentialRampToValueAtTime(120 / size, t + 0.08);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      o.connect(g).connect(master); o.start(t); o.stop(t + 0.15);
      const s = ctx.createBufferSource(); s.buffer = buf('click'); s.playbackRate.value = 1.4;
      const sg = gain(0.18);
      s.connect(filt('bandpass', 2600 / size, 1.5)).connect(sg).connect(master);
      sg.connect(reverb);
      s.start(t);
    };

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && ctx && ctx.state !== 'running') ctx.resume().catch(() => {});
    });

    return A;
  })();

  /* ───────────── app controller ─────────────
     Wires the shared markup (sounds, begin, session controls, complete screen)
     and runs the frame loop. Each design supplies its own setup gesture and visuals. */
  Spa.createApp = (cfg) => {
    const $ = (s) => document.querySelector(s);
    const store = Spa.store(cfg.key);
    const main = $('#app');
    const audio = Spa.audio;
    const snap = (m) => clamp(Math.round(m / 5) * 5, cfg.min, cfg.max);

    const st = {
      minutes: snap(store.get('minutes', cfg.defaultMinutes)),
      sound: 'silence', // every visit starts quiet; choosing a sound plays it straight away
      phase: 'setup', total: 0, endAt: 0, remaining: 0, paused: false, muted: false,
      lastSecs: -1, lastCycle: -1, label: '', sessionStart: 0,
    };

    const el = {
      time: $('#time'), ring: $('#ringFill'), breath: $('#breath'),
      pause: $('#pauseBtn'), pauseLabel: $('#pauseLabel'), sound: $('#soundBtn'),
      rested: $('#rested'), aftercare: $('#aftercare'),
    };
    // The large opening "breathe in", shared by every room.
    const openingEl = document.createElement('p');
    openingEl.className = 'opening-breath';
    openingEl.textContent = 'breathe in';
    $('.session').appendChild(openingEl);

    // The session's mode, picked on the setup screen:
    //   Sleep: breathes at the Long pace, and ends with no bells and no vibration.
    //   Steady: your own pace (Short / Steady / Long, and Hold). Picking it sets Steady + Hold;
    //   during a session the pace row sits above the controls, so it can change mid-breath.
    //   Program: a star picked from the program at the top (shared/program.js); its breath and
    //   length. The complete screen then asks how it was. (Replaced the Breath orb, 2026-11-27;
    //   the technique grid and favorites in the breath menu are no longer reached.)
    const MODES = { sleep: 'Sleep', steady: 'Steady' };
    const PROG = Spa.program;
    const prefs = Spa.store('breath'); // shared by every room
    let favs = prefs.get('favorites', []).filter((id) => Spa.technique(id));
    let lastPace = Spa.PACES[prefs.get('pace')] ? prefs.get('pace') : 'steady';
    let lastHold = !!prefs.get('hold', false);
    const saved = prefs.get('mode');
    let mode = MODES[saved] ? saved : (saved === 'program' || saved === 'breath') && PROG ? 'program' : 'steady';
    const progPattern = () => { const S = PROG.star(); return [S.id, false, S.counts]; };
    const modePattern = (m = mode) => (m === 'sleep' ? ['long', false] : m === 'program' ? progPattern() : [lastPace, lastHold]);
    Spa.setPattern(...modePattern());

    const paceRow = `
      <div class="pace-row">
        <div class="paces" role="radiogroup" aria-label="Pace">
          ${Object.entries(Spa.PACES).map(([k, v]) => `<button type="button" role="radio" data-pace="${k}">${v.label}</button>`).join('')}
        </div>
        <button type="button" class="hold-toggle" aria-pressed="false">Hold</button>
      </div>`;

    // On the setup screen, above the sounds: Sleep / Steady as one thin pill split in two (Toggle,
    // chosen 2026-11-27 over the orbs, Words and Dots), and below it the mode's choice
    // (Steady's pace reopens the breath menu).
    const modeBox = document.createElement('div');
    modeBox.className = 'mode';
    modeBox.innerHTML = `
      <div class="modes" role="radiogroup" aria-label="Session">
        ${Object.entries(MODES).map(([k, v]) => `<button type="button" role="radio" data-mode="${k}">${v}</button>`).join('')}
      </div>
      <div class="mode-more">
        <button type="button" class="mode-pick" aria-haspopup="dialog"><span></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button>
        <p class="mode-sleep">Ends quietly · no bells, no buzz</p>
        <p class="mode-prog"></p>
      </div>`;
    $('.options').prepend(modeBox);

    const opener = document.createElement('button');
    opener.type = 'button';
    opener.className = 'breath-open';
    opener.setAttribute('aria-haspopup', 'dialog');
    opener.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9c2.5-2.5 5.5-2.5 8 0s5.5 2.5 8 0"/><path d="M4 15c2.5-2.5 5.5-2.5 8 0s5.5 2.5 8 0"/></svg><span class="breath-open-word"></span>`;
    main.appendChild(opener);

    const menu = document.createElement('div');
    menu.className = 'bmenu';
    menu.setAttribute('role', 'dialog');
    menu.setAttribute('aria-modal', 'true');
    menu.setAttribute('aria-label', 'Breath');
    menu.innerHTML = `
      <div class="bmenu-panel">
        <div class="bmenu-pace">
          <p class="eyebrow">Your own pace</p>
          ${paceRow}
        </div>
        <div class="bmenu-tech">
          <p class="eyebrow">Breathe for</p>
          <div class="bmenu-grid" role="radiogroup" aria-label="Technique">
            ${Spa.TECHNIQUES.map((T) => `<button type="button" role="radio" data-tech="${T.id}">
              <svg class="bmenu-ring" aria-hidden="true"><rect pathLength="100"/></svg><span>${T.word}</span></button>`).join('')}
          </div>
          <p class="bmenu-tip">Hold one to make it a favorite</p>
        </div>
        <div class="bmenu-about" aria-live="polite">
          <p class="bmenu-name"></p><p class="bmenu-counts"></p><p class="bmenu-note"></p>
        </div>
        <button type="button" class="ghost bmenu-done">Done</button>
      </div>`;
    document.body.appendChild(menu);
    // Steady's pace row in the session, shown with the controls.
    const sessionPace = document.createElement('div');
    sessionPace.className = 'session-pace';
    sessionPace.innerHTML = paceRow;
    $('.session').appendChild(sessionPace);
    const paceBoxes = [menu, sessionPace];
    const paceAll = (sel) => paceBoxes.flatMap((x) => [...x.querySelectorAll(sel)]);
    const grid = menu.querySelector('.bmenu-grid');
    const techBtn = Object.fromEntries([...grid.children].map((b) => [b.dataset.tech, b]));
    paceAll('[data-pace]').forEach((b) => b.addEventListener('click', () => {
      setBreath(b.dataset.pace, lastHold);
      audio.ensure(); audio.tick(1.2);
    }));
    paceAll('.hold-toggle').forEach((b) => b.addEventListener('click', () => {
      setBreath(lastPace, !lastHold);
      audio.ensure(); audio.tick(1.2);
    }));
    function chooseMode(m) {
      mode = m;
      prefs.set('mode', m);
      if (m === 'steady') { lastPace = 'steady'; lastHold = true; } // Steady starts as Steady + Hold
      setBreath(...modePattern());
      audio.ensure(); audio.tick(1.3);
    }

    // The program's stars at the top of the setup screen. Picking one chooses the Program
    // mode, its breath and its length.
    const prog = PROG?.mount($('.setup'), (i) => {
      if (!PROG.select(i)) return;
      mode = 'program';
      prefs.set('mode', mode);
      setBreath(...modePattern());
      setMinutes(PROG.star().min);
      audio.ensure(); audio.tick(1.3);
    });
    modeBox.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => chooseMode(b.dataset.mode)));

    modeBox.querySelector('.mode-pick').addEventListener('click', openMenu);

    function openMenu() {
      menuFrom = document.activeElement?.closest?.('button') || opener;
      menu.classList.add('open');
      sizeRings();
      menu.querySelector('[aria-checked="true"]')?.focus({ preventScroll: true });
    }
    let menuFrom = opener; // where focus goes back to
    function closeMenu() { menu.classList.remove('open'); menuFrom.focus({ preventScroll: true }); }
    opener.addEventListener('click', openMenu);
    menu.querySelector('.bmenu-done').addEventListener('click', closeMenu);
    menu.addEventListener('click', (e) => { if (e.target === menu) closeMenu(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu.classList.contains('open')) closeMenu(); });

    // Every button is the same size; fit the outline to it (a pill, so the corners are half its height).
    function sizeRings() {
      const b = grid.firstElementChild, w = b.offsetWidth, h = b.offsetHeight;
      if (!w) return;
      Object.values(techBtn).forEach((x) => {
        const r = x.querySelector('rect');
        r.setAttribute('x', 0.75); r.setAttribute('y', 0.75);
        r.setAttribute('width', w - 1.5); r.setAttribute('height', h - 1.5);
        r.setAttribute('rx', (h - 1.5) / 2);
      });
    }
    addEventListener('resize', sizeRings);

    // Favorites first, newest at the top, then the rest in their usual order.
    // FLIP: note where each button was, reorder, then glide each one from there.
    function arrange(animate) {
      const ids = [...favs, ...Spa.TECHNIQUES.map((x) => x.id).filter((id) => !favs.includes(id))];
      const btns = ids.map((id) => techBtn[id]);
      const was = animate && !Spa.reducedMotion ? new Map(btns.map((b) => [b, b.getBoundingClientRect()])) : null;
      btns.forEach((b) => { grid.appendChild(b); b.classList.toggle('fav', favs.includes(b.dataset.tech)); });
      if (!was) return;
      const moved = btns.filter((b) => {
        const a = was.get(b), z = b.getBoundingClientRect(), dx = a.left - z.left, dy = a.top - z.top;
        if (!dx && !dy) return false;
        b.style.transition = 'none';
        b.style.transform = `translate(${dx}px, ${dy}px)`;
        return true;
      });
      void grid.offsetWidth;
      moved.forEach((b) => {
        b.style.transition = 'transform 0.7s cubic-bezier(0.2, 0.7, 0.2, 1)';
        b.style.transform = '';
        setTimeout(() => { b.style.transition = ''; }, 750);
      });
    }

    function toggleFav(id) {
      favs = favs.includes(id) ? favs.filter((x) => x !== id) : [id, ...favs];
      prefs.set('favorites', favs);
      audio.tick(favs.includes(id) ? 1.5 : 0.8);
      vibrate(12);
      arrange(true);
    }

    const HOLD_MS = 800;
    let press = null, swallowClick = false;
    function endPress() {
      if (!press) return;
      clearTimeout(press.t);
      press.b.classList.remove('winding', 'unwinding');
      press = null;
    }
    grid.addEventListener('pointerdown', (e) => {
      const b = e.target.closest('[data-tech]');
      if (!b || e.button > 0) return;
      endPress();
      swallowClick = false;
      press = { b, x: e.clientX, y: e.clientY };
      b.classList.add(b.classList.contains('fav') ? 'unwinding' : 'winding');
      press.t = setTimeout(() => {
        const id = b.dataset.tech;
        endPress();
        swallowClick = true; // the release that follows is not a tap
        toggleFav(id);
      }, HOLD_MS);
    });
    grid.addEventListener('pointermove', (e) => {
      if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 12) endPress();
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => grid.addEventListener(t, endPress));
    grid.addEventListener('contextmenu', (e) => e.preventDefault());
    grid.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tech]');
      if (!b) return;
      if (swallowClick) { swallowClick = false; return; }
      setBreath(b.dataset.tech);
      audio.ensure(); audio.tick(1.2);
    });

    function renderBreath() {
      const P = Spa.pattern, T = Spa.technique(P.id);
      opener.querySelector('.breath-open-word').textContent = T ? T.word : `${Spa.PACES[P.pace].label}${P.hold ? ' · Hold' : ''}`;
      opener.setAttribute('aria-label', `Breath: ${opener.textContent}`);
      paceAll('[data-pace]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.pace === P.pace)));
      paceAll('.hold-toggle').forEach((b) => b.setAttribute('aria-pressed', String(!!P.pace && P.hold)));
      modeBox.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === mode)));
      const pick = `${Spa.PACES[lastPace].label}${lastHold ? ' · Hold' : ''}`;
      modeBox.querySelector('.mode-pick span').textContent = pick;
      modeBox.querySelector('.mode-pick').setAttribute('aria-label', `Pace: ${pick}. Change`);
      prog?.render(mode === 'program');
      if (mode === 'program') modeBox.querySelector('.mode-prog').textContent = Spa.patternCounts(P);
      main.dataset.mode = menu.dataset.mode = mode;
      Object.values(techBtn).forEach((b) => b.setAttribute('aria-checked', String(b.dataset.tech === P.id)));
      menu.querySelector('.bmenu-name').textContent = T ? (T.sub ? `${T.name} — ${T.sub}` : T.name) : `Your own pace — ${Spa.PACES[P.pace].label}`;
      menu.querySelector('.bmenu-counts').textContent = Spa.patternCounts(P);
      menu.querySelector('.bmenu-note').textContent = T ? T.note : '';
    }
    function setBreath(id, hold) {
      Spa.setPattern(id, hold);
      const P = Spa.pattern;
      if (mode === 'steady') { lastPace = P.pace; lastHold = P.hold; prefs.set('pace', lastPace); prefs.set('hold', lastHold); }
      renderBreath();
      if (st.phase === 'session') st.bChange = Math.floor(Math.max(0, st.bLocal) / st.bPat.cycle); // switch once this breath ends
    }
    arrange(false);
    if (mode === 'program') st.minutes = snap(PROG.star().min);
    renderBreath();

    // The session's breath clock. It runs on the pattern it began with until a new one is
    // chosen; then, as the current breath ends, it picks up the new pattern from there.
    function sessionBreath(e) {
      let local = e - st.bOrigin;
      const c = Math.floor(local / st.bPat.cycle);
      if (st.bPat !== Spa.pattern && c > st.bChange) {
        st.bOrigin += c * st.bPat.cycle;
        st.bOffset += c;
        st.bPat = Spa.pattern;
        st.guideUntil = st.bOffset + 3; // show the words again for a few breaths at the new pace
        local = e - st.bOrigin;
      }
      st.bLocal = local;
      const b = Spa.breathAt(local, st.bPat);
      b.cycle += st.bOffset;
      return b;
    }
    const ringC = el.ring ? 2 * Math.PI * Number(el.ring.getAttribute('r')) : 0;
    if (el.ring) el.ring.style.strokeDasharray = `${ringC}`;

    const vibrate = (p) => { try { navigator.vibrate?.(p); } catch { /* ignore */ } };

    function setMinutes(m, haptic) {
      m = snap(m);
      if (m === st.minutes) return false;
      st.minutes = m;
      store.set('minutes', m);
      renderChoices();
      cfg.render?.(m);
      if (haptic) { (cfg.onStep || (() => audio.tick()))(m); vibrate(6); }
      return true;
    }

    function renderChoices() {
      document.querySelectorAll('[data-sound]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.sound === st.sound)));
      if (el.sound) el.sound.hidden = st.sound === 'silence';
    }

    // Choosing a sound on the setup screen plays it, breathing with the scene, so it can be
    // heard before beginning. Begin carries it on into the session.
    function preview(kind) {
      if (kind === audio.playing()) return;
      if (kind === 'silence') audio.stopAmbience(1.5);
      else { audio.startAmbience(kind); st.previewCycle = -1; }
    }
    document.querySelectorAll('[data-sound]').forEach((b) =>
      b.addEventListener('click', () => { st.sound = b.dataset.sound; renderChoices(); audio.ensure(); audio.tick(1.3); preview(st.sound); }));

    function setPhase(p) {
      st.phase = p;
      main.dataset.state = p;
      document.body.dataset.phase = p;
      cfg.onPhase?.(p);
    }

    function showControls(persist) {
      main.classList.add('show-controls');
      clearTimeout(showControls.t);
      if (!persist && !st.paused) showControls.t = setTimeout(() => main.classList.remove('show-controls'), 4500);
    }

    // After a session from the program: "How was that?" on the complete screen.
    const ask = document.createElement('div');
    ask.className = 'prog-ask';
    ask.innerHTML = `<p class="prog-q">How was that?</p>
      <div class="prog-row"><button type="button" data-f="easy">Easy</button><button type="button" data-f="right">About right</button><button type="button" data-f="hard">Hard</button></div>
      <p class="prog-said" aria-live="polite"></p>`;
    $('#again')?.before(ask);
    ask.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => {
      if (st.progStar == null) return;
      const said = PROG.answer(st.progStar, b.dataset.f);
      track(`program/${PROG.LADDER[st.progStar].id}/${b.dataset.f}`);
      st.progStar = null;
      ask.querySelector('.prog-said').textContent = said;
      ask.classList.add('answered');
      audio.tick(1.3);
      if (mode === 'program') { setBreath(...modePattern()); setMinutes(PROG.star().min); }
    }));

    function begin() {
      audio.ensure();
      st.progStar = mode === 'program' ? PROG.star().i : null;
      // The session runs the settle, the opening inhale (and its hold) and the timer;
      // st.remaining counts down the whole span.
      st.total = st.minutes * 60000;
      renderBreath();
      st.span = st.total + SETTLE + Spa.pattern.inhale + Spa.pattern.holdIn;
      st.bPat = Spa.pattern; st.bOrigin = 0; st.bOffset = 0; st.bChange = -1; st.bLocal = 0;
      st.guideUntil = GUIDE_CYCLES;
      main.style.setProperty('--inhale', `${Spa.pattern.inhale / 1000}s`);
      st.remaining = st.span;
      st.endAt = Date.now() + st.span;
      st.opening = true;
      main.classList.add('opening');
      st.paused = false;
      st.lastSecs = -1; st.lastCycle = -1; st.label = '';
      st.muted = false; audio.mute(false);
      el.sound?.setAttribute('aria-pressed', 'true');
      main.classList.remove('paused', 'show-controls', 'muted');
      if (el.breath) el.breath.classList.remove('show');
      setPhase('session');
      audio.startAmbience(st.sound);
      audio.bell(0.4, cfg.bell?.vol ?? 0.45, cfg.bell?.f0 ?? 196);
      Spa.wake.on();
      main.classList.add('show-hint'); // not 'hint': that's the hint text's own class
      setTimeout(() => main.classList.remove('show-hint'), 5000);
      cfg.onBegin?.();
      track(`begin/${room}/${soundName()}/${breathName()}/${st.minutes}m`);
    }

    function togglePause() {
      if (st.phase !== 'session') return;
      if (st.paused) {
        st.paused = false;
        st.endAt = Date.now() + st.remaining;
        st.lastCycle = -1;
        audio.dim(false);
        Spa.wake.on();
        main.classList.remove('paused');
        showControls();
      } else {
        st.paused = true;
        st.remaining = Math.max(0, st.endAt - Date.now());
        audio.dim(true);
        main.classList.add('paused');
        showControls(true);
      }
      el.pauseLabel.textContent = st.paused ? 'Resume' : 'Pause';
      el.pause.setAttribute('aria-label', st.paused ? 'Resume' : 'Pause');
    }

    function complete(early) {
      if (st.phase !== 'session') return;
      if (!st.paused) st.remaining = Math.max(0, st.endAt - Date.now());
      const rested = st.total - (early ? Math.min(st.total, st.remaining) : 0);
      st.opening = st.inhaling = false;
      main.classList.remove('opening', 'inhaling');
      st.paused = false;
      main.classList.remove('paused', 'show-controls');
      audio.dim(false);
      // Sleep ends without the three bells or the buzz; its sound just fades away slowly.
      const sleep = mode === 'sleep';
      audio.stopAmbience(early ? 3 : sleep ? 20 : 12);
      const f0 = cfg.bell?.f0 ?? 196, vol = cfg.bell?.vol ?? 0.5;
      if (early) audio.bell(0.2, vol * 0.7, f0);
      else if (!sleep) {
        audio.bell(0.6, vol, f0); audio.bell(4.6, vol * 0.85, f0); audio.bell(8.6, vol * 0.7, f0);
        vibrate([500, 250, 500, 250, 500]);
      }
      const m = Math.round(rested / 60000);
      // Ask only when the program's session ran at least a minute.
      if (st.progStar != null && rested < 60000) st.progStar = null;
      ask.classList.toggle('on', st.progStar != null);
      ask.classList.remove('answered');
      ask.querySelector('.prog-said').textContent = '';
      el.rested.textContent = m < 1 ? 'You took a quiet moment.' : `You rested for ${Spa.fmtDuration(m)}.`;
      el.aftercare.textContent = Spa.AFTERCARE[Math.floor(Math.random() * Spa.AFTERCARE.length)];
      Spa.wake.off();
      document.title = cfg.title;
      setPhase('complete');
      cfg.onComplete?.(early);
      track(`${early ? 'ended-early' : 'finished'}/${room}/${m}m`);
    }

    // Usage counts (shared/analytics.js): the room, its sound, breath and length.
    const room = cfg.short.toLowerCase();
    const track = (name) => window.hushTrack?.(name);
    const soundName = () => (document.querySelector(`[data-sound="${st.sound}"]`)?.textContent.trim() || st.sound).toLowerCase();
    const breathName = () => (mode === 'sleep' ? 'sleep' : Spa.pattern.id + (Spa.pattern.hold ? '+hold' : ''));

    $('#begin').addEventListener('click', begin);
    $('#again').addEventListener('click', () => { audio.ensure(); st.sound = 'silence'; renderChoices(); setPhase('setup'); });
    el.pause.addEventListener('click', togglePause);
    $('#endBtn').addEventListener('click', () => complete(true));
    el.sound?.addEventListener('click', () => {
      st.muted = !st.muted;
      audio.mute(st.muted);
      el.sound.setAttribute('aria-pressed', String(!st.muted));
      el.sound.setAttribute('aria-label', st.muted ? 'Ambience off' : 'Ambience on');
      main.classList.toggle('muted', st.muted);
    });
    $('.session').addEventListener('click', (e) => {
      if (e.target.closest('button')) { showControls(st.paused); return; }
      if (main.classList.contains('show-controls') && !st.paused) main.classList.remove('show-controls');
      else showControls();
    });
    document.addEventListener('keydown', (e) => {
      if (st.phase === 'session' && e.code === 'Space' && !menu.classList.contains('open')) { e.preventDefault(); togglePause(); }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && st.phase === 'session' && !st.paused) Spa.wake.on();
    });
    // Background safety net: rAF stops in hidden tabs, so check completion on a timer too.
    setInterval(() => {
      if (st.phase === 'session' && !st.paused && Date.now() >= st.endAt) complete(false);
    }, 1000);

    function setLabel(text, visible) {
      if (!el.breath) return;
      if (text !== st.label) {
        // Cross-fade between words; with nothing on screen yet, show the first word straight away.
        const wait = st.label ? 450 : 0;
        st.label = text;
        el.breath.classList.remove('show');
        clearTimeout(setLabel.t);
        setLabel.t = setTimeout(() => {
          el.breath.textContent = text;
          if (visible) el.breath.classList.add('show');
        }, wait);
      } else if (!visible) el.breath.classList.remove('show');
    }

    let last = performance.now();
    function frame(now) {
      // Schedule first, so an error in a design's drawing can't stop the countdown.
      requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = now / 1000;
      let info;
      if (st.phase === 'session') {
        if (!st.paused) st.remaining = Math.max(0, st.endAt - Date.now());
        const into = st.span - st.remaining, settling = into < SETTLE;
        const opening = st.remaining > st.total; // settle + opening inhale: the clock is hidden
        const inhaling = opening && !settling;   // the large "breathe in" is shown
        if (opening !== st.opening) { st.opening = opening; main.classList.toggle('opening', opening); }
        if (inhaling !== st.inhaling) { st.inhaling = inhaling; main.classList.toggle('inhaling', inhaling); }
        const left = Math.min(st.total, st.remaining); // the countdown holds at full time until the opening breath ends
        const elapsed = st.total - left;
        const breath = settling ? AT_REST : sessionBreath(into - SETTLE); // one clock from the opening inhale onwards
        const secs = Math.ceil(left / 1000);
        if (secs !== st.lastSecs) {
          st.lastSecs = secs;
          if (el.time) {
            el.time.textContent = Spa.fmtClock(secs);
            el.time.classList.toggle('long', secs >= 3600);
          }
          document.title = `${Spa.fmtClock(secs)} · ${cfg.short}`;
        }
        if (el.ring) el.ring.style.strokeDashoffset = `${ringC * (elapsed / st.total)}`;
        if (!st.paused && !settling && breath.cycle !== st.lastCycle) {
          st.lastCycle = breath.cycle;
          audio.breathe(breath.p, st.bPat, breath.cycle);
          cfg.onBreath?.(breath);
        }
        // During the opening breath the large "breathe in" speaks instead of the small label.
        const label = st.paused ? 'paused' : opening ? '' : stageWord(breath, st.bPat);
        setLabel(label, st.paused || (!opening && breath.cycle < st.guideUntil));
        info = { phase: 'session', minutes: st.minutes, total: st.total, remaining: left, elapsed, progress: elapsed / st.total, paused: st.paused, opening, breath };
        if (st.remaining <= 0 && !st.paused) complete(false);
      } else {
        // Outside a session the scene still breathes, on a free-running clock.
        const breath = Spa.breathAt(now);
        // A sound being previewed follows this same clock.
        if (st.phase === 'setup' && st.sound !== 'silence' && breath.cycle !== st.previewCycle) {
          st.previewCycle = breath.cycle;
          audio.breathe(breath.p, Spa.pattern, breath.cycle);
        }
        info = { phase: st.phase, minutes: st.minutes, paused: false, progress: 0, breath };
      }
      cfg.frame?.(dt, t, info);
    }

    renderChoices();
    cfg.render?.(st.minutes);
    setPhase('setup');
    requestAnimationFrame(frame);

    return {
      get minutes() { return st.minutes; },
      get state() { return st; },
      setMinutes, snap, min: cfg.min, max: cfg.max,
    };
  };
})();
