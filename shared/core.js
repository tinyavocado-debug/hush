/* Shared engine for the three Hush rooms:
   storage, generative audio, wake lock, breathing clock and the session state machine. */
(function () {
  'use strict';

  const Spa = (window.Spa = {});
  const clamp = (Spa.clamp = (v, a, b) => Math.min(b, Math.max(a, v)));
  Spa.lerp = (a, b, t) => a + (b - a) * t;
  Spa.ease = (t) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(t, 0, 1));
  Spa.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const INHALE = (Spa.INHALE = 4000);
  const EXHALE = (Spa.EXHALE = 6000);
  const CYCLE = (Spa.CYCLE = INHALE + EXHALE);
  const GUIDE_CYCLES = 6; // breathing words fade away after the first minute
  // Every session opens with a brief stillness, then one breath in shown large across the
  // screen. The countdown starts when that inhale ends, on the first "breathe out".
  const SETTLE = (Spa.SETTLE = 1500);
  const OPENING = (Spa.OPENING = SETTLE + INHALE);
  const AT_REST = Object.freeze({ cycle: -1, p: 0, inhale: true, k: 0 });

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
  Spa.breathAt = (elapsed) => {
    const cycle = Math.floor(elapsed / CYCLE), p = elapsed % CYCLE, inhale = p < INHALE;
    const k = inhale ? Spa.ease(p / INHALE) : 1 - Spa.ease((p - INHALE) / EXHALE);
    return { cycle, p, inhale, k };
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

    // Shape a parameter to follow one breath: rise over the inhale, settle over the exhale.
    // A param's value right now, following any curve we scheduled on it.
    const now = (param) => { const curve = curves.get(param); return curve ? curve(ctx.currentTime) : param.value; };

    // How far each sound swells toward its in-breath peak. 1 is the full swing set in each bed;
    // lower softens the top of every breath in every room.
    const BREATH_DEPTH = 0.65;

    function breathShape(param, p, hi, lo, tau = 3) {
      hi = lo + (hi - lo) * BREATH_DEPTH;
      const t = ctx.currentTime;
      const up = Math.max(0, (INHALE - p) / 1000);
      const down = p < INHALE ? EXHALE / 1000 : (CYCLE - p) / 1000;
      const v0 = hold(param, t), tc = Math.max(0.1, down / tau), peak = up > 0 ? hi : v0;
      if (up > 0) param.linearRampToValueAtTime(hi, t + up);
      param.setTargetAtTime(lo, t + up, tc);
      curves.set(param, (x) => (x < t + up
        ? v0 + (hi - v0) * Math.max(0, x - t) / up
        : lo + (peak - lo) * Math.exp(-(x - t - up) / tc)));
    }

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
          breathShape(surf.frequency, p, 1700, 380, 3.2);
          breathShape(swell.gain, p, 0.95, 0.3, 3);
          breathShape(foam.gain, p, 0.07, 0, 4);
        };
      },
      rain(c) {
        // Each in-breath brings a gust: the hiss brightens and swells and the drops quicken.
        const hissTone = filt('lowpass', 5000), hiss = gain(0.12);
        src(c, buf('white')).connect(filt('highpass', 900)).connect(hissTone).connect(hiss).connect(c.bed);
        src(c, buf('brown'), 1.1).connect(filt('lowpass', 500)).connect(gain(0.45)).connect(c.bed);
        c.breathe = (p) => {
          breathShape(hissTone.frequency, p, 8000, 3200, 3);
          breathShape(hiss.gain, p, 0.22, 0.09, 3);
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
        const tone = filt('lowpass', 800, 0.4);
        tone.connect(gain(1)).connect(c.bed);
        [[98, 0.16], [98.35, 0.06], [147, 0.08], [196.2, 0.07], [293.7, 0.03], [392.4, 0.018]].forEach(([f, a], i) => {
          const g = gain(a);
          osc(c, 'sine', f).connect(g).connect(tone);
          lfo(c, 0.035 + i * 0.021, a * 0.6, g.gain);
        });
        src(c, buf('brown')).connect(filt('bandpass', 700, 0.6)).connect(gain(0.12)).connect(c.bed);
        c.breathe = (p) => breathShape(tone.frequency, p, 1500, 650, 3);
      },
      hearth(c) {
        // Breathes like bellows: roar and rumble rise on the in-breath, and the crackles with them.
        const rumble = filt('lowpass', 260);
        src(c, buf('brown'), 0.8).connect(rumble).connect(gain(0.6)).connect(c.bed);
        const roar = gain(0.05);
        src(c, buf('white')).connect(filt('bandpass', 900, 0.5)).connect(roar).connect(c.bed);
        lfo(c, 0.13, 0.03, roar.gain);
        c.breathe = (p) => {
          breathShape(roar.gain, p, 0.11, 0.035, 3);
          breathShape(rumble.frequency, p, 560, 240, 3);
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
        c.breathe = (p) => breathShape(breeze.gain, p, 1.7, 0.6, 3);
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
          for (let i = 0; i < n; i++) chime(c.bed, i * (0.18 + Math.random() * 0.3), notes[Math.floor(Math.random() * notes.length)]);
        });
      },
    };

    A.ensure = ensure;
    A.startAmbience = (kind) => {
      if (!ensure()) return;
      A.stopAmbience(1.5);
      A.dimmed = false;
      to(ambienceGain.gain, 1, 0.3);
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
    A.breathe = (p) => { if (ctx && cur?.breathe && !A.dimmed) cur.breathe(p); };
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
      sound: store.get('sound', cfg.defaultSound),
      phase: 'setup', total: 0, endAt: 0, remaining: 0, paused: false, muted: false,
      lastSecs: -1, lastCycle: -1, label: '', sessionStart: 0,
    };
    if (!cfg.sounds.includes(st.sound)) st.sound = cfg.defaultSound;

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

    document.querySelectorAll('[data-sound]').forEach((b) =>
      b.addEventListener('click', () => { st.sound = b.dataset.sound; store.set('sound', st.sound); renderChoices(); audio.ensure(); audio.tick(1.3); }));

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
      // The session runs the settle, the opening inhale and the timer; st.remaining counts down the whole span.
      st.total = st.minutes * 60000;
      st.span = st.total + OPENING;
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
    $('#again').addEventListener('click', () => { audio.ensure(); setPhase('setup'); });
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
      if (st.phase === 'session' && e.code === 'Space') { e.preventDefault(); togglePause(); }
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
        const breath = settling ? AT_REST : Spa.breathAt(into - SETTLE); // one clock from the opening inhale onwards
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
          audio.breathe(breath.p);
          cfg.onBreath?.(breath);
        }
        // During the opening breath the large "breathe in" speaks instead of the small label.
        const label = st.paused ? 'paused' : opening ? '' : breath.inhale ? 'breathe in' : 'breathe out';
        setLabel(label, st.paused || (!opening && breath.cycle < GUIDE_CYCLES));
        info = { phase: 'session', minutes: st.minutes, total: st.total, remaining: left, elapsed, progress: elapsed / st.total, paused: st.paused, opening, breath };
        if (st.remaining <= 0 && !st.paused) complete(false);
      } else {
        // Outside a session the scene still breathes, on a free-running clock.
        info = { phase: st.phase, minutes: st.minutes, paused: false, progress: 0, breath: Spa.breathAt(now) };
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
