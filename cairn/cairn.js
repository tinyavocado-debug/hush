/* Cairn: every stone is five minutes. During the session they return to light, top first. */
(function () {
  'use strict';
  const { clamp, lerp, reducedMotion } = Spa;
  const $ = (s) => document.querySelector(s);
  const TAU = Math.PI * 2;
  const MAX = 90, MAXN = MAX / 5, BLOCK = 5 * 60000;
  const WORDS = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven',
    'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen'];
  const PALETTE = ['#8f8b83', '#a49e93', '#74736d', '#b8b0a2', '#7f796f', '#9b968a', '#666963', '#a8a69c'];

  const cv = $('#scene'), g = cv.getContext('2d');
  const stage = $('#stage'), num = $('#setNum'), unit = $('#setUnit');
  let W = 0, H = 0, stageRect = null, focus = 0;

  /* ───────── stones: stable, seeded shapes ───────── */
  function rng(seed) {
    return () => {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const mix = (c, k) => `rgb(${c.map((v) => Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k))).join(',')})`;

  const stones = Array.from({ length: MAXN }, (_, i) => {
    const r = rng(i * 9973 + 17);
    const h = [r() * 0.07, r() * 0.05, r() * 0.035], ph = [r() * TAU, r() * TAU, r() * TAU];
    const pts = [];
    for (let k = 0; k < 40; k++) {
      const a = (k / 40) * TAU;
      const rad = 1 + h[0] * Math.cos(2 * a + ph[0]) + h[1] * Math.cos(3 * a + ph[1]) + h[2] * Math.cos(5 * a + ph[2]);
      let y = Math.sin(a) * rad;
      if (y > 0) y *= 0.8; // flatter undersides balance better
      pts.push([Math.cos(a) * rad, y]);
    }
    const base = hex(PALETTE[Math.floor(r() * PALETTE.length)]);
    return {
      pts, wJ: 0.9 + r() * 0.16, hR: 0.32 + r() * 0.1, off: (r() - 0.5) * 0.12, tilt: (r() - 0.5) * 0.07,
      light: mix(base, 0.32), mid: mix(base, 0), dark: mix(base, -0.35),
      p: 0, landed: false, // animation presence
    };
  });

  function stonePath(s, w, h) {
    g.beginPath();
    s.pts.forEach(([x, y], k) => (k ? g.lineTo(x * w / 2, y * h / 2) : g.moveTo(x * w / 2, y * h / 2)));
    g.closePath();
  }

  function drawStone(s, cx, cy, w, h, alpha, glow) {
    if (alpha <= 0.003) return;
    g.save();
    g.translate(cx, cy);
    g.rotate(s.tilt);
    g.globalAlpha = alpha * 0.22;
    g.fillStyle = '#2f3b35';
    // h is negative for the mirrored reflection; ellipse radii must stay positive.
    g.beginPath(); g.ellipse(0, h * 0.42, w * 0.42, Math.abs(h) * 0.16, 0, 0, TAU); g.fill();
    g.globalAlpha = alpha;
    stonePath(s, w, h);
    const lg = g.createLinearGradient(0, -h / 2, 0, h / 2);
    lg.addColorStop(0, s.light); lg.addColorStop(0.55, s.mid); lg.addColorStop(1, s.dark);
    g.fillStyle = lg;
    g.fill();
    g.save();
    g.clip();
    const rg = g.createRadialGradient(-w * 0.18, -h * 0.3, 0, -w * 0.18, -h * 0.3, w * 0.5);
    rg.addColorStop(0, 'rgba(255,255,255,0.38)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg;
    g.fillRect(-w, -h, w * 2, h * 2);
    if (glow > 0) {
      g.fillStyle = `rgba(255,236,196,${glow})`;
      g.fillRect(-w, -h, w * 2, h * 2);
    }
    g.restore();
    g.restore();
  }

  /* ───────── scene parts ───────── */
  function sprite(r, gg, b, mid = 0.4) {
    const c = document.createElement('canvas'), s = 128;
    c.width = c.height = s;
    const x = c.getContext('2d'), gr = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gr.addColorStop(0, `rgba(${r},${gg},${b},1)`);
    gr.addColorStop(mid, `rgba(${r},${gg},${b},.4)`);
    gr.addColorStop(1, `rgba(${r},${gg},${b},0)`);
    x.fillStyle = gr; x.fillRect(0, 0, s, s);
    return c;
  }
  const sunS = sprite(255, 228, 180, 0.3), leafS = sprite(58, 78, 62, 0.5), mistS = sprite(255, 255, 255, 0.45), moteS = sprite(255, 222, 150, 0.2);

  const leaves = Array.from({ length: 14 }, (_, i) => ({
    x: 0.62 + Math.random() * 0.5, y: -0.06 + Math.random() * 0.28, r: 0.05 + Math.random() * 0.09, ph: i * 1.3,
  }));
  const mists = Array.from({ length: 7 }, () => ({ x: Math.random(), y: Math.random(), r: 0.2 + Math.random() * 0.2, v: 0.004 + Math.random() * 0.006 }));
  const glints = Array.from({ length: 16 }, () => ({ x: Math.random(), y: Math.random(), w: 6 + Math.random() * 22, ph: Math.random() * TAU }));
  const ripples = [], motes = [];

  function resize() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    W = innerWidth; H = innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    measure();
  }
  function measure() {
    const r = stage.getBoundingClientRect();
    if (r.height > 0) stageRect = r;
  }
  addEventListener('resize', resize);

  function geometry() {
    const sr = stageRect || { left: 0, width: W, top: H * 0.2, bottom: H * 0.7, height: H * 0.5 };
    const sGround = sr.bottom - 66, sAvail = sGround - (sr.top + 96);
    const qGround = H * 0.78, qAvail = qGround - H * 0.34;
    const bwFor = (avail) => clamp(avail / 3.3, 46, Math.min(W * 0.42, 180));
    return {
      x: lerp(sr.left + sr.width / 2, W / 2, focus),
      ground: lerp(sGround, qGround, focus),
      bw: lerp(bwFor(sAvail), bwFor(qAvail), focus),
    };
  }

  // Rest positions for the whole stack, so stones never shift when another is added.
  function layout(geo) {
    const out = [];
    let y = geo.ground;
    for (let i = 0; i < MAXN; i++) {
      const s = stones[i];
      const w = geo.bw * Math.pow(0.92, i) * s.wJ, h = w * s.hR;
      out.push({ x: geo.x + s.off * w, y: y - h / 2, w, h });
      y -= h * 0.86;
    }
    return out;
  }

  function lakeRipple(x, y, o = {}) {
    if (reducedMotion) return;
    ripples.push({ x, y, age: 0, life: o.life ?? 6, max: o.max ?? 160, r0: o.r0 ?? 10, alpha: o.alpha ?? 0.3, rings: o.rings ?? 3, gap: o.gap ?? 12 });
    if (ripples.length > 30) ripples.shift();
  }

  function drawBackdrop(t, s, geo, horizon) {
    const k = s.breath ? s.breath.k : 0;
    // Morning sun, swelling softly with each breath.
    const sr = Math.max(W, H) * (0.55 + 0.08 * k);
    g.globalAlpha = 0.55 + 0.2 * k;
    g.drawImage(sunS, W * 0.12 - sr, -H * 0.08 - sr, sr * 2, sr * 2);

    // Far shore haze.
    g.globalAlpha = 1;
    g.fillStyle = 'rgba(128,148,134,0.16)';
    g.beginPath();
    g.moveTo(0, horizon);
    for (let x = 0; x <= W + 10; x += 10) {
      g.lineTo(x, horizon - 14 - 10 * Math.sin(x * 0.006 + 1.2) - 6 * Math.sin(x * 0.017 + 0.4));
    }
    g.lineTo(W, horizon); g.closePath(); g.fill();

    // Lake.
    const lg = g.createLinearGradient(0, horizon, 0, H);
    lg.addColorStop(0, 'rgba(206,216,208,0.9)');
    lg.addColorStop(1, 'rgba(160,182,174,0.85)');
    g.fillStyle = lg;
    g.fillRect(0, horizon, W, H - horizon);
    g.fillStyle = 'rgba(47,59,53,0.12)';
    g.fillRect(0, horizon, W, 1);

    // Glints on the water.
    for (const gl of glints) {
      const y = horizon + 8 + gl.y * (H - horizon - 8);
      const depth = (y - horizon) / (H - horizon);
      const a = (0.25 + 0.25 * Math.sin(t * 0.9 + gl.ph)) * (0.4 + depth);
      g.fillStyle = `rgba(255,255,255,${a})`;
      g.fillRect(((gl.x * W + t * 3 * (0.5 + depth)) % (W + 40)) - 20, y, gl.w * (0.5 + depth), 1.2);
    }
  }

  function drawStack(lay, s, alphaOf, mirror, horizon) {
    for (let i = 0; i < MAXN; i++) {
      const a = alphaOf(i);
      if (a.alpha <= 0.003) continue;
      const L = lay[i];
      const y = mirror ? 2 * horizon - (L.y + a.dy) : L.y + a.dy;
      drawStone(stones[i], L.x, y, L.w, mirror ? -L.h : L.h, a.alpha * (mirror ? 0.16 : 1), mirror ? 0 : a.glow);
    }
  }

  let lastBlocks = -1;
  function frame(dt, t, s) {
    focus += ((s.phase === 'setup' ? 0 : 1) - focus) * Math.min(1, dt * 2.2);
    if (s.phase === 'setup') measure();
    const geo = geometry();
    const horizon = geo.ground + geo.bw * 0.05;
    const lay = layout(geo);

    // Presence of each stone.
    let blocks = 0, topFrac = 1;
    if (s.phase === 'session') {
      blocks = Math.ceil(s.remaining / BLOCK);
      topFrac = (s.remaining - (blocks - 1) * BLOCK) / BLOCK;
      if (lastBlocks > blocks && blocks >= 0) {
        // A stone has returned to light.
        Spa.audio.chime(659.25 + blocks * 20);
        const L = lay[Math.min(blocks, MAXN - 1)];
        for (let k = 0; k < 18; k++) motes.push({ x: L.x + (Math.random() - 0.5) * L.w, y: L.y, vx: (Math.random() - 0.5) * 16, vy: -12 - Math.random() * 26, life: 0, max: 3 + Math.random() * 3 });
      }
      lastBlocks = blocks;
    }

    for (let i = 0; i < MAXN; i++) {
      const st = stones[i];
      if (s.phase === 'setup') {
        const want = i < s.minutes / 5;
        if (want) {
          st.p = Math.min(1, st.p + dt / 0.42);
          if (st.p >= 1 && !st.landed) {
            st.landed = true;
            Spa.audio.clack(0.8 + i * 0.05);
            lakeRipple(geo.x, horizon + 3, { max: geo.bw * 1.6, r0: geo.bw * 0.6, life: 3, alpha: 0.22, rings: 2 });
          }
        } else {
          st.p = Math.max(0, Math.min(st.p, 1) - dt / 0.3);
          st.landed = false;
        }
      }
    }

    const alphaOf = (i) => {
      const st = stones[i];
      if (s.phase === 'setup') {
        const p = st.p;
        if (p <= 0) return { alpha: 0, dy: 0, glow: 0 };
        if (st.landed || i < s.minutes / 5) {
          const e = 1 - Math.min(1, p);
          return { alpha: Math.min(1, p * 4), dy: -110 * e * e, glow: 0 };
        }
        return { alpha: p, dy: -(1 - p) * 40, glow: 0 };
      }
      if (s.phase === 'session') {
        if (i < blocks - 1) return { alpha: 1, dy: 0, glow: 0 };
        if (i === blocks - 1) return { alpha: 0.12 + 0.88 * Math.pow(topFrac, 0.8), dy: -(1 - topFrac) * 6, glow: (1 - topFrac) * 0.5 };
      }
      return { alpha: 0, dy: 0, glow: 0 };
    };

    // Motes rising from the stone that is dissolving.
    if (s.phase === 'session' && !s.paused && blocks > 0 && Math.random() < dt * 5 * (0.3 + (1 - topFrac))) {
      const L = lay[blocks - 1];
      motes.push({ x: L.x + (Math.random() - 0.5) * L.w * 0.8, y: L.y - L.h * 0.2, vx: (Math.random() - 0.5) * 6, vy: -10 - Math.random() * 14, life: 0, max: 3 + Math.random() * 3 });
    }

    g.clearRect(0, 0, W, H);
    drawBackdrop(t, s, geo, horizon);

    // Reflection, then the flat rock the cairn stands on, then the cairn.
    drawStack(lay, s, alphaOf, true, horizon);
    g.globalAlpha = 1;
    const rw = geo.bw * 0.95, rh = geo.bw * 0.13;
    const rg = g.createLinearGradient(0, geo.ground - rh, 0, geo.ground + rh);
    rg.addColorStop(0, '#8c8d86'); rg.addColorStop(1, '#5a5d58');
    g.fillStyle = rg;
    g.beginPath(); g.ellipse(geo.x, geo.ground + rh * 0.3, rw, rh, 0, Math.PI, TAU); g.lineTo(geo.x + rw, horizon + 2); g.lineTo(geo.x - rw, horizon + 2); g.closePath(); g.fill();
    drawStack(lay, s, alphaOf, false, horizon);
    g.globalAlpha = 1;

    // Lake ripples, foreshortened.
    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i];
      r.age += dt;
      const prog = r.age / r.life;
      if (prog >= 1) { ripples.splice(i, 1); continue; }
      const rad = r.r0 + (r.max - r.r0) * (1 - Math.pow(1 - prog, 2));
      const fade = (1 - prog) * (1 - prog);
      g.lineWidth = 1;
      for (let k = 0; k < r.rings; k++) {
        const rr = rad - k * r.gap;
        if (rr <= 0) continue;
        g.strokeStyle = `rgba(255,255,255,${r.alpha * fade * (1 - k / r.rings)})`;
        g.beginPath(); g.ellipse(r.x, r.y, rr, rr * 0.2, 0, 0, TAU); g.stroke();
      }
    }

    // Mist drifting low over the water.
    for (const m of mists) {
      m.x = (m.x + m.v * dt) % 1.3;
      const r = W * m.r * 1.6;
      g.globalAlpha = 0.22;
      g.drawImage(mistS, m.x * W * 1.3 - W * 0.3 - r, horizon - 10 + m.y * 30 - r * 0.25, r * 2, r * 0.5);
    }

    // Leaf shadow from a tree just out of frame.
    g.globalCompositeOperation = 'multiply';
    for (const l of leaves) {
      const r = Math.max(W, H) * l.r;
      g.globalAlpha = 0.16;
      g.drawImage(leafS, l.x * W + Math.sin(t * 0.45 + l.ph) * 10 - r, l.y * H + Math.cos(t * 0.33 + l.ph) * 6 - r, r * 2, r * 2);
    }
    g.globalCompositeOperation = 'source-over';

    for (let i = motes.length - 1; i >= 0; i--) {
      const m = motes[i];
      m.life += dt;
      if (m.life > m.max) { motes.splice(i, 1); continue; }
      m.x += (m.vx + Math.sin(t + i) * 4) * dt; m.y += m.vy * dt;
      const a = Math.sin(Math.PI * (m.life / m.max));
      g.globalAlpha = a * 0.9;
      g.drawImage(moteS, m.x - 6, m.y - 6, 12, 12);
    }
    g.globalAlpha = 1;
  }

  /* ───────── setup gesture: tap to place, swipe down to lift ───────── */
  let prevN = 0;
  function render(m) {
    const n = m / 5;
    // When several stones arrive at once (e.g. on first load), drop them one after another.
    for (let i = prevN, k = 0; i < n; i++) if (stones[i].p <= 0) stones[i].p = -(k++) * 0.28;
    prevN = n;
    num.textContent = m;
    unit.textContent = `minutes · ${WORDS[n]} stone${n > 1 ? 's' : ''}`;
    stage.setAttribute('aria-valuenow', m);
    stage.setAttribute('aria-valuetext', `${Spa.fmtDuration(m)}, ${n} stones`);
  }

  let drag = null;
  const STEP_PX = 36;
  stage.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    Spa.audio.ensure();
    drag = { id: e.pointerId, y: e.clientY, moved: false };
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dy = e.clientY - drag.y;
    if (Math.abs(dy) > 10) drag.moved = true;
    if (Math.abs(dy) >= STEP_PX) {
      app.setMinutes(app.minutes + (dy > 0 ? -5 : 5), true);
      drag.y = e.clientY;
    }
  });
  stage.addEventListener('pointerup', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved) app.setMinutes(app.minutes + 5, true);
    drag = null;
  });
  stage.addEventListener('pointercancel', () => { drag = null; });
  stage.addEventListener('keydown', (e) => {
    const step = { ArrowUp: 5, ArrowRight: 5, ArrowDown: -5, ArrowLeft: -5 }[e.key];
    if (step) { e.preventDefault(); app.setMinutes(app.minutes + step, true); }
  });
  $('#minus').addEventListener('click', () => { Spa.audio.ensure(); app.setMinutes(app.minutes - 5, true); });
  $('#plus').addEventListener('click', () => { Spa.audio.ensure(); app.setMinutes(app.minutes + 5, true); });

  Spa.audio.onEvent = (type, d) => {
    if (type !== 'drop' || app.state.phase !== 'session' || Math.random() > 0.55) return;
    const horizon = geometry().ground;
    lakeRipple(W * (0.5 + d.pan * 0.5), horizon + 10 + Math.random() * (H - horizon - 10), {
      max: 14 + d.peak * 900, r0: 1, life: 2.2, rings: 2, gap: 5, alpha: 0.35 + d.peak * 4,
    });
  };

  const app = Spa.createApp({
    key: 'cairn', title: 'Cairn · Hush', short: 'Cairn',
    min: 5, max: MAX, defaultMinutes: 30, defaultSound: 'garden',
    sounds: ['garden', 'rain', 'silence'],
    bell: { f0: 261.6, vol: 0.42 },
    render,
    onStep: () => {}, // the stone's clack on landing is the feedback
    onBegin() { lastBlocks = -1; },
    onBreath(b) {
      if (b.p > 600) return;
      const geo = geometry();
      lakeRipple(geo.x, geo.ground + geo.bw * 0.08, { r0: geo.bw, max: Math.max(W, 400) * 0.8, life: 9, alpha: 0.3, rings: 3, gap: 18 });
    },
    onPhase(p) {
      // Restack from the ground up whenever we come back to setup.
      if (p === 'setup') stones.forEach((st, i) => { st.p = -i * 0.22; st.landed = false; });
    },
    frame,
  });
  resize();
})();
