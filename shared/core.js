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
      note: 'Traditionally used for settling the mind and reducing agitation. A gentler starting pattern is 4–6.' },
    { id: 'concentration', word: 'Concentration', name: 'Antara Kumbhaka', sub: 'Inhale retention', t: [4, 2, 4, 0],
      note: 'Introduces a pause after inhaling. Traditionally used to cultivate attention, steadiness, and control over the breath.' },
    { id: 'stillness', word: 'Stillness', name: 'Bahya Kumbhaka', sub: 'Exhale retention', t: [4, 0, 4, 2],
      note: 'Emphasizes the quiet pause after exhalation. Used to explore mental stillness and awareness of the urge to breathe.' },
    { id: 'discipline', word: 'Discipline', name: 'Sama Vritti', sub: 'With retention', t: [4, 4, 4, 4],
      note: 'The four-phase equal pattern commonly called box breathing. Useful for maintaining a deliberate rhythm under mental pressure.' },
    { id: 'control', word: 'Control', name: 'Visama Vritti', sub: 'Graduated retention', t: [4, 2, 6, 0],
      note: 'A mixed ratio that integrates inhalation retention with a longer exhale. A useful intermediate practice for learning measured breath control.' },
    { id: 'advanced', word: 'Advanced', name: 'Classical 1:4:2 ratio', sub: '', t: [4, 16, 8, 0],
      note: 'A traditional pranayama ratio associated with deeper concentration and mastery of retention. Not a beginner exercise; the long retention should be learned with qualified instruction.' },
    { id: 'alertness', word: 'Alertness', name: 'Visama Vritti', sub: 'Extended inhale', t: [6, 0, 4, 0],
      note: 'An inhale-emphasized variation sometimes used for a more activating experience. Evidence for a reliable alertness boost is limited.' },
    { id: 'body', word: 'Body', name: 'Three-part breathing', sub: 'Progressive', t: [6, 0, 6, 0], parts: ['belly', 'ribs', 'chest'],
      note: 'Inspired by Dirga Pranayama. The inhale is divided into three continuous expansions, followed by one smooth exhale. Useful for practicing respiratory coordination.' },
    { id: 'movement', word: 'Movement', name: 'Ujjayi', sub: 'Timed ocean breath', t: [5, 0, 5, 0],
      note: 'Uses a gentle throat narrowing to create an ocean-like sound. Can help coordinate breath with physical movement and sustained attention.' },
    { id: 'senses', word: 'Senses', name: 'Bhramari', sub: 'Humming exhale', t: [4, 0, 8, 0], say: { out: 'hum' },
      note: 'The extended humming exhale provides vibration and an auditory anchor. Traditionally used for inward attention and quieting mental chatter.' },
    { id: 'activating', word: 'Activating', name: 'Bhastrika', sub: 'Bellows breathing', t: [1, 0, 1, 0], say: { in: 'in', out: 'out' },
      note: '' },
  ];
  Spa.technique = (id) => Spa.TECHNIQUES.find((x) => x.id === id) || null;
  // Your own pace: how long each breath in and out lasts, and an optional hold after each.
  Spa.PACES = {
    short: { label: 'Short', inhale: 3000, exhale: 5000, hold: 2000 },
    steady: { label: 'Steady', inhale: 4000, exhale: 6000, hold: 3000 },
    long: { label: 'Long', inhale: 5000, exhale: 8000, hold: 4000 },
  };
  // Choose a pace (short, steady, long) with or without a hold, or a technique by its id.
  // `pace` is set only for your own pace; `id` is the pace or technique.
  Spa.setPattern = (id, hold) => {
    const T = Spa.technique(id);
    let t, pace = null, say = {}, parts = null;
    if (T) { t = T.t.map((x) => x * 1000); say = T.say || {}; parts = T.parts || null; hold = false; }
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
    'Stretch gently, and move slowly for a while.',
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

    const BEDS = {
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
        const high = gain(0.35);
        high.connect(c.bed);
        [[98, 0.16, c.bed], [98.35, 0.03, c.bed], [147, 0.08, c.bed], [196.2, 0.09, high], [293.7, 0.05, high], [392.4, 0.03, high]].forEach(([f, a, out], i) => {
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
        src(c, buf('brown'), 0.8).connect(rumble).connect(gain(0.6)).connect(c.bed);
        const roar = gain(0.05);
        src(c, buf('white')).connect(filt('bandpass', 900, 0.5)).connect(roar).connect(c.bed);
        lfo(c, 0.13, 0.006, roar.gain); // a faint flicker, small next to the breath
        c.breathe = (p) => {
          breathShape(roar.gain, p, 0.11, 0.035);
          breathShape(rumble.frequency, p, 560, 240, true);
        };
        chain(c, () => (25 + Math.random() ** 2 * 520) / (0.5 + 10 * now(roar.gain)), () => {
          const t = ctx.currentTime + 0.005, s = ctx.createBufferSource();
          const big = Math.random() < 0.06, peak = big ? 0.3 + Math.random() * 0.2 : 0.02 + Math.random() ** 3 * 0.18;
          s.buffer = buf('click'); s.playbackRate.value = 0.6 + Math.random() * 1.2;
          const g = gain(peak), p = panner(Math.random() * 1.4 - 0.7);
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
      to(c.bed.gain, 0, fade);
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

    // The breath menu, opened from a button at the top right (on the setup screen, and with the
    // session controls). It holds your own pace (Short / Steady / Long, and Hold) and the
    // breathing techniques; a change mid-session starts with the next breath.
    // Holding a technique draws an outline round it and makes it a favorite, which moves it to
    // the top; holding a favorite again unwinds the outline.
    const prefs = Spa.store('breath'); // shared by every room
    let favs = prefs.get('favorites', []).filter((id) => Spa.technique(id));
    let lastPace = Spa.PACES[prefs.get('pace')] ? prefs.get('pace') : 'steady'; // your own pace, kept while a technique is chosen
    let lastHold = !!prefs.get('hold', false);
    Spa.setPattern(prefs.get('choice', lastPace), lastHold);

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
        <p class="eyebrow">Your own pace</p>
        <div class="bmenu-own">
          <div class="paces" role="radiogroup" aria-label="Pace">
            ${Object.entries(Spa.PACES).map(([k, v]) => `<button type="button" role="radio" data-pace="${k}">${v.label}</button>`).join('')}
          </div>
          <button type="button" class="hold-toggle" aria-pressed="false">Hold</button>
        </div>
        <p class="eyebrow bmenu-or">Or breathe for</p>
        <div class="bmenu-grid" role="radiogroup" aria-label="Technique">
          ${Spa.TECHNIQUES.map((T) => `<button type="button" role="radio" data-tech="${T.id}">
            <svg class="bmenu-ring" aria-hidden="true"><rect pathLength="100"/></svg><span>${T.word}</span></button>`).join('')}
        </div>
        <p class="bmenu-tip">Hold one to make it a favorite</p>
        <div class="bmenu-about" aria-live="polite">
          <p class="bmenu-name"></p><p class="bmenu-counts"></p><p class="bmenu-note"></p>
        </div>
        <button type="button" class="ghost bmenu-done">Done</button>
      </div>`;
    document.body.appendChild(menu);
    const grid = menu.querySelector('.bmenu-grid');
    const techBtn = Object.fromEntries([...grid.children].map((b) => [b.dataset.tech, b]));
    menu.querySelectorAll('[data-pace]').forEach((b) => b.addEventListener('click', () => {
      setBreath(b.dataset.pace, Spa.pattern.pace ? Spa.pattern.hold : lastHold);
      audio.ensure(); audio.tick(1.2);
    }));
    // Hold toggles the hold on your own pace; from a technique, it goes to your pace with a hold.
    menu.querySelector('.hold-toggle').addEventListener('click', () => {
      setBreath(lastPace, Spa.pattern.pace ? !Spa.pattern.hold : true);
      audio.ensure(); audio.tick(1.2);
    });

    function openMenu() {
      menu.classList.add('open');
      sizeRings();
      menu.querySelector('[aria-checked="true"]')?.focus({ preventScroll: true });
    }
    function closeMenu() { menu.classList.remove('open'); opener.focus({ preventScroll: true }); }
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
      menu.querySelectorAll('[data-pace]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.pace === P.pace)));
      menu.querySelector('.hold-toggle').setAttribute('aria-pressed', String(!!P.pace && P.hold));
      Object.values(techBtn).forEach((b) => b.setAttribute('aria-checked', String(b.dataset.tech === P.id)));
      menu.querySelector('.bmenu-name').textContent = T ? (T.sub ? `${T.name} — ${T.sub}` : T.name) : `Your own pace — ${Spa.PACES[P.pace].label}`;
      menu.querySelector('.bmenu-counts').textContent = Spa.patternCounts(P);
      menu.querySelector('.bmenu-note').textContent = T ? T.note : '';
    }
    function setBreath(id, hold) {
      Spa.setPattern(id, hold);
      const P = Spa.pattern;
      if (P.pace) { lastPace = P.pace; lastHold = P.hold; prefs.set('pace', lastPace); prefs.set('hold', lastHold); }
      prefs.set('choice', P.id);
      renderBreath();
      if (st.phase === 'session') st.bChange = Math.floor(Math.max(0, st.bLocal) / st.bPat.cycle); // switch once this breath ends
    }
    arrange(false);
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

    function begin() {
      audio.ensure();
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
      audio.stopAmbience(early ? 2 : 4);
      const f0 = cfg.bell?.f0 ?? 196, vol = cfg.bell?.vol ?? 0.5;
      if (early) audio.bell(0.2, vol * 0.7, f0);
      else {
        audio.bell(0.6, vol, f0); audio.bell(4.6, vol * 0.85, f0); audio.bell(8.6, vol * 0.7, f0);
        vibrate([500, 250, 500, 250, 500]);
      }
      const m = Math.round(rested / 60000);
      el.rested.textContent = m < 1 ? 'You took a quiet moment.' : `You rested for ${Spa.fmtDuration(m)}.`;
      el.aftercare.textContent = Spa.AFTERCARE[Math.floor(Math.random() * Spa.AFTERCARE.length)];
      Spa.wake.off();
      document.title = cfg.title;
      setPhase('complete');
      cfg.onComplete?.(early);
    }

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
