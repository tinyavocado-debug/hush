/* Ember: set the incense length, light it, and watch it burn down as smoke curls away. */
(function () {
  'use strict';
  const { clamp, lerp, reducedMotion } = Spa;
  const $ = (s) => document.querySelector(s);
  const TAU = Math.PI * 2;
  const MAX = 120, BAMBOO = 34, SMOKE_LIFE = 8.5;

  const cv = $('#scene'), g = cv.getContext('2d');
  const stage = $('#stage'), readout = $('#readout'), num = $('#setNum'), unit = $('#setUnit');
  let W = 0, H = 0, stageRect = null;

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
  const emberS = sprite(255, 138, 61, 0.25), warmS = sprite(232, 130, 60), moteS = sprite(255, 226, 180, 0.2);

  const motes = Array.from({ length: reducedMotion ? 18 : 46 }, () => ({
    x: Math.random(), y: Math.random(), vx: (Math.random() - 0.5) * 0.004, vy: (Math.random() - 0.5) * 0.004,
    r: 0.6 + Math.random() * 1.6, ph: Math.random() * TAU,
  }));
  const smoke = [[], []];
  const flakes = [];
  let emitAcc = 0, ashLen = 0, ashMax = 8, flare = 0, crackleBoost = 0;
  let focus = 0, shownMin = 30, lit = false;

  function resize() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    W = innerWidth; H = innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    measure();
  }
  // The stage only has a real size while the setup screen is laid out, so measure lazily.
  function measure() {
    const r = stage.getBoundingClientRect();
    if (r.height > 0) stageRect = r;
  }
  addEventListener('resize', resize);

  function geometry() {
    const sr = stageRect || { left: 0, width: W, top: H * 0.2, bottom: H * 0.7, height: H * 0.5 };
    const setupBase = sr.bottom - 26, setupLen = Math.max(60, sr.height - 70 - BAMBOO);
    const sessBase = H - Math.max(130, H * 0.16);
    const sessLen = Math.max(60, sessBase - H * 0.36 - BAMBOO);
    return {
      x: lerp(sr.left + sr.width / 2, W / 2, focus),
      base: lerp(setupBase, sessBase, focus),
      ppm: lerp(setupLen, sessLen, focus) / MAX,
    };
  }

  /* ───────── drawing ───────── */
  function drawRoom(t, s) {
    g.globalCompositeOperation = 'lighter';
    // A slanted beam of light from a high window.
    const ax = W * 0.18, ay = -H * 0.05, bx = W * 0.92, by = H * 1.05;
    const ang = Math.atan2(by - ay, bx - ax), len = Math.hypot(bx - ax, by - ay), bw = Math.max(W, 360) * 0.2;
    g.save();
    g.translate(ax, ay); g.rotate(ang - Math.PI / 2);
    const lg = g.createLinearGradient(-bw, 0, bw, 0);
    const beam = (0.05 + 0.012 * Math.sin(t * 0.21)) * (1 - 0.5 * focus);
    lg.addColorStop(0, 'rgba(255,214,160,0)');
    lg.addColorStop(0.5, `rgba(255,214,160,${beam})`);
    lg.addColorStop(1, 'rgba(255,214,160,0)');
    g.fillStyle = lg;
    g.fillRect(-bw, 0, bw * 2, len);
    g.restore();

    // Dust motes that glint only when they drift through the beam.
    const nx = -(by - ay) / len, ny = (bx - ax) / len;
    for (const m of motes) {
      m.x = (m.x + (m.vx + Math.sin(t * 0.3 + m.ph) * 0.0015) * 0.016 + 1) % 1;
      m.y = (m.y + (m.vy - 0.0008) * 0.016 + 1) % 1;
      const px = m.x * W, py = m.y * H;
      const d = Math.abs((px - ax) * nx + (py - ay) * ny) / bw;
      const a = Math.exp(-d * d * 2.2) * (0.5 + 0.5 * Math.sin(t * 1.3 + m.ph)) * 0.8;
      if (a < 0.02) continue;
      g.globalAlpha = a;
      const r = m.r * 3;
      g.drawImage(moteS, px - r, py - r, r * 2, r * 2);
    }

    // An unseen hearth, warming the room when chosen.
    if (s.phase === 'session' && app.state.sound === 'hearth') {
      crackleBoost *= 0.9;
      const fl = 0.8 + 0.1 * Math.sin(t * 3.1) + 0.07 * Math.sin(t * 7.3) + crackleBoost;
      const r = Math.max(W, H) * 0.75;
      g.globalAlpha = 0.14 * fl * focus;
      g.drawImage(warmS, -W * 0.25 - r, H * 1.05 - r, r * 2, r * 2);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  function drawStick(geo, coated, total, s, t) {
    const { x, base, ppm } = geo;
    const bambooTop = base - BAMBOO;
    const tipY = bambooTop - coated * ppm;

    // Ghost of what has already burned.
    if (s.phase !== 'setup' && total > coated) {
      g.strokeStyle = 'rgba(241,226,204,0.07)';
      g.lineWidth = 1;
      g.setLineDash([2, 5]);
      g.beginPath(); g.moveTo(x, tipY - ashLen); g.lineTo(x, bambooTop - total * ppm); g.stroke();
      g.setLineDash([]);
    }

    // Bamboo core.
    g.strokeStyle = '#a4553a';
    g.lineWidth = 2.4;
    g.lineCap = 'butt';
    g.beginPath(); g.moveTo(x, base + 2); g.lineTo(x, bambooTop + 1); g.stroke();

    // Coated part.
    if (coated > 0) {
      const w = 6, lg = g.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
      lg.addColorStop(0, '#3a241a'); lg.addColorStop(0.45, '#7a4e35'); lg.addColorStop(1, '#2e1c15');
      g.fillStyle = lg;
      g.beginPath();
      g.roundRect ? g.roundRect(x - w / 2, tipY, w, bambooTop - tipY, [2, 2, 1, 1]) : g.rect(x - w / 2, tipY, w, bambooTop - tipY);
      g.fill();

      // Five-minute notches, gilded every quarter hour.
      const notchAlpha = s.phase === 'setup' ? 1 : 0.35;
      for (let m = 5; m < coated; m += 5) {
        const y = bambooTop - m * ppm;
        const major = m % 15 === 0;
        g.fillStyle = major ? `rgba(240,190,120,${0.75 * notchAlpha})` : `rgba(241,226,204,${0.2 * notchAlpha})`;
        g.fillRect(x - (major ? 5 : 3.5), y - 0.5, major ? 10 : 7, major ? 1.3 : 1);
      }
    }

    // Ember, ash and flakes.
    if (lit && coated > 0) {
      const breath = s.breath?.k ?? 0;
      const fl = 0.85 + 0.08 * Math.sin(t * 9.1) + 0.06 * Math.sin(t * 23.7 + 1.1);
      const dim = s.paused ? 0.45 : 1;
      if (ashLen > 0) {
        g.fillStyle = 'rgba(150,140,130,0.9)';
        g.fillRect(x - 2.6, tipY - ashLen, 5.2, ashLen);
      }
      g.globalCompositeOperation = 'lighter';
      const r1 = (14 + 8 * breath + flare * 40) * fl * dim;
      g.globalAlpha = 0.9 * dim;
      g.drawImage(emberS, x - r1, tipY - r1, r1 * 2, r1 * 2);
      const r2 = (90 + 30 * breath + flare * 140) * dim;
      g.globalAlpha = 0.12 * fl;
      g.drawImage(warmS, x - r2, tipY - r2, r2 * 2, r2 * 2);
      g.globalAlpha = 1;
      g.fillStyle = `rgba(255,${170 + 50 * breath},${90 + 40 * breath},${0.95 * dim})`;
      g.beginPath(); g.arc(x, tipY, 2.4, 0, TAU); g.fill();
      g.globalCompositeOperation = 'source-over';
    }
    for (const f of flakes) {
      g.fillStyle = `rgba(160,150,140,${f.a})`;
      g.fillRect(f.x - 2, f.y - 1.5, 4, 3);
    }

    // Ceramic dish with a bed of ash.
    const lg = g.createLinearGradient(0, base - 6, 0, base + 16);
    lg.addColorStop(0, '#3b2a22'); lg.addColorStop(1, '#130c0a');
    g.fillStyle = lg;
    g.beginPath(); g.ellipse(x, base + 4, 54, 13, 0, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(241,226,204,0.16)';
    g.lineWidth = 1;
    g.beginPath(); g.ellipse(x, base + 1, 52, 11, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
    g.fillStyle = '#5e5650';
    g.beginPath(); g.ellipse(x, base + 1.5, 40, 6.5, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.06)';
    g.beginPath(); g.ellipse(x - 8, base, 22, 2.6, 0, 0, TAU); g.fill();

    return { x, y: tipY - ashLen };
  }

  function updateSmoke(dt, t, tip, emit, wind) {
    if (emit) {
      emitAcc += dt;
      while (emitAcc > 1 / 30) {
        emitAcc -= 1 / 30;
        smoke[0].push({ x: tip.x - 0.5, y: tip.y, age: 0, vy: -46, s: 0 });
        smoke[1].push({ x: tip.x + 0.5, y: tip.y, age: 0, vy: -52, s: 1.9 });
      }
    }
    for (const r of smoke) {
      for (const p of r) {
        p.age += dt;
        p.vy *= Math.pow(0.94, dt);
        p.y += p.vy * dt;
        const amp = p.age * p.age * 3 + p.age * 4;
        p.x += (Math.sin(p.age * 0.9 + t * 0.35 + p.s) * amp * 0.35 + Math.sin(p.age * 2.1 + t * 0.8 + p.s * 2) * p.age * 3 + wind * p.age) * dt;
      }
      while (r.length && (r[0].age > SMOKE_LIFE || r[0].y < -40)) r.shift();
    }
  }

  function drawSmoke() {
    g.lineCap = 'round';
    smoke.forEach((r, ri) => {
      const k = ri ? 0.55 : 1;
      for (let i = 1; i < r.length; i++) {
        const a = r[i - 1], b = r[i];
        if (Math.abs(a.y - b.y) > 30) continue; // gap after a pause or a jump
        const life = b.age / SMOKE_LIFE;
        const al = 0.3 * k * Math.pow(1 - life, 1.6) * Math.min(1, b.age * 3);
        if (al < 0.004) continue;
        g.strokeStyle = `rgba(226,214,200,${al})`;
        g.lineWidth = 0.7 + b.age * 1.7;
        g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      }
    });
  }

  function frame(dt, t, s) {
    focus += ((s.phase === 'setup' ? 0 : 1) - focus) * Math.min(1, dt * 2.2);
    if (s.phase === 'setup') measure();
    shownMin += (s.minutes - shownMin) * Math.min(1, dt * 14);
    flare *= Math.pow(0.12, dt);

    const geo = geometry();
    let coated = shownMin, total = shownMin;
    if (s.phase === 'session') { coated = s.remaining / 60000; total = s.total / 60000; }
    else if (s.phase === 'complete') { coated = 0; total = app.minutes; }

    // Ash grows from the burning tip and now and then drops into the dish.
    if (lit && s.phase === 'session' && !s.paused) {
      ashLen += dt * 0.6;
      if (ashLen > ashMax) {
        const tipY = geo.base - BAMBOO - coated * geo.ppm;
        flakes.push({ x: geo.x, y: tipY - ashLen / 2, vy: 0, vx: (Math.random() - 0.5) * 20, a: 0.9 });
        ashLen = 0; ashMax = 5 + Math.random() * 8;
      }
    }
    for (let i = flakes.length - 1; i >= 0; i--) {
      const f = flakes[i];
      f.vy += 220 * dt; f.y += f.vy * dt; f.x += f.vx * dt;
      if (f.y > geo.base) { f.a -= dt * 2; f.y = geo.base; f.vy = 0; f.vx = 0; }
      if (f.a <= 0) flakes.splice(i, 1);
    }

    g.clearRect(0, 0, W, H);
    drawRoom(t, s);
    const tip = drawStick(geo, coated, total, s, t);
    readout.style.top = `${tip.y - (stageRect ? stageRect.top : 0)}px`;

    const emitting = lit && s.phase === 'session' && focus > 0.95 && (!s.paused || Math.random() < 0.3);
    const wind = s.breath ? (s.breath.k - 0.5) * 4 : 0;
    updateSmoke(dt, t, tip, emitting, wind);
    drawSmoke();
  }

  /* ───────── setup gesture ───────── */
  function render(m) {
    num.textContent = m;
    unit.textContent = m === 60 ? 'minutes · 1 hour' : m > 60 ? `min · ${Math.floor(m / 60)}h ${m % 60}m` : 'minutes';
    stage.setAttribute('aria-valuenow', m);
    stage.setAttribute('aria-valuetext', Spa.fmtDuration(m));
  }

  let drag = null;
  stage.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    Spa.audio.ensure();
    drag = { id: e.pointerId, y: e.clientY, raw: app.minutes };
    stage.setPointerCapture(e.pointerId);
    stage.classList.add('dragging');
  });
  stage.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const ppm = geometry().ppm;
    const raw = clamp(drag.raw + (drag.y - e.clientY) / ppm, app.min - 2.4, app.max + 2.4);
    app.setMinutes(raw, true);
    // Keep the anchor tight at the ends so reversing direction responds immediately.
    if (raw <= app.min || raw >= app.max) { drag.y = e.clientY; drag.raw = raw; }
  });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    stage.classList.remove('dragging');
  };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);
  stage.addEventListener('keydown', (e) => {
    const step = { ArrowUp: 5, ArrowRight: 5, ArrowDown: -5, ArrowLeft: -5, PageUp: 15, PageDown: -15 }[e.key];
    if (step) { e.preventDefault(); app.setMinutes(app.minutes + step, true); }
  });
  $('#minus').addEventListener('click', () => { Spa.audio.ensure(); app.setMinutes(app.minutes - 5, true); });
  $('#plus').addEventListener('click', () => { Spa.audio.ensure(); app.setMinutes(app.minutes + 5, true); });

  Spa.audio.onEvent = (type, d) => { if (type === 'crackle') crackleBoost = Math.min(0.6, crackleBoost + d.peak * 1.2); };

  const app = Spa.createApp({
    key: 'ember', title: 'Ember · Hush', short: 'Ember',
    min: 5, max: MAX, defaultMinutes: 30, defaultSound: 'temple',
    sounds: ['temple', 'hearth', 'silence'],
    bell: { f0: 174.6, vol: 0.5 },
    render,
    onStep: (m) => Spa.audio.tick(0.75 + m / 200),
    onBegin() { lit = true; flare = 1; ashLen = 0; smoke[0].length = 0; smoke[1].length = 0; },
    onComplete() { lit = false; flare = 0; },
    onPhase(p) { if (p === 'setup') { lit = false; flakes.length = 0; } },
    frame,
  });
  shownMin = app.minutes;
  resize();
})();
