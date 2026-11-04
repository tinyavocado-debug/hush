/* Still: turn the stone around the pool, breathe with the ripples. */
(function () {
  'use strict';
  const { clamp, reducedMotion } = Spa;
  const $ = (s) => document.querySelector(s);
  const TAU = Math.PI * 2;
  const R = 118, DIAL_C = TAU * R, MAX = 180;

  /* ───────── canvas scene: caustics, candle glow, steam, ripples ───────── */
  const scene = (() => {
    const cv = $('#scene'), g = cv.getContext('2d');
    let W = 0, H = 0, focus = 0, focusTarget = 0;
    const steam = [], ripples = [];

    function sprite(r, gg, b) {
      const c = document.createElement('canvas'), s = 128;
      c.width = c.height = s;
      const x = c.getContext('2d'), gr = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      gr.addColorStop(0, `rgba(${r},${gg},${b},1)`);
      gr.addColorStop(0.4, `rgba(${r},${gg},${b},.45)`);
      gr.addColorStop(1, `rgba(${r},${gg},${b},0)`);
      x.fillStyle = gr; x.fillRect(0, 0, s, s);
      return c;
    }
    const steamS = sprite(255, 244, 228), causticS = sprite(120, 196, 182), candleS = sprite(242, 176, 104);

    function makeSteam(initial) {
      const s = Math.max(W, H), maxLife = 16 + Math.random() * 18;
      return {
        x: Math.random() * W, y: initial ? Math.random() * H : H + 80,
        r: s * (0.1 + Math.random() * 0.2), vy: -(8 + Math.random() * 14), vx: (Math.random() - 0.5) * 6,
        sway: 10 + Math.random() * 30, ph: Math.random() * TAU,
        life: initial ? Math.random() * maxLife : 0, maxLife, a: 0.05 + Math.random() * 0.07,
      };
    }

    function resize() {
      const dpr = Math.min(2, devicePixelRatio || 1);
      W = innerWidth; H = innerHeight;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round(clamp((W * H) / 14000, 16, 40) * (reducedMotion ? 0.5 : 1));
      while (steam.length < n) steam.push(makeSteam(true));
      steam.length = n;
    }

    function ripple(x, y, o = {}) {
      if (reducedMotion) return;
      ripples.push({
        x, y, age: 0, r0: o.r0 ?? 0, max: o.max ?? Math.hypot(W, H) * 0.5, life: o.life ?? 7,
        rings: o.rings ?? 3, gap: o.gap ?? 16, alpha: o.alpha ?? 0.2, width: o.width ?? 1,
      });
      if (ripples.length > 40) ripples.shift();
    }

    function frame(dt, t) {
      focus += (focusTarget - focus) * Math.min(1, dt * 0.6);
      g.clearRect(0, 0, W, H);
      g.globalCompositeOperation = 'lighter';
      const big = Math.max(W, H);

      for (let i = 0; i < 4; i++) {
        const x = W * (0.5 + 0.42 * Math.sin(t * 0.031 + i * 1.9));
        const y = H * (0.45 + 0.38 * Math.cos(t * 0.023 + i * 2.7));
        const r = big * (0.45 + 0.1 * Math.sin(t * 0.05 + i));
        g.globalAlpha = 0.07 * (1 - 0.45 * focus);
        g.drawImage(causticS, x - r, y - r, r * 2, r * 2);
      }

      const flick = 0.85 + 0.08 * Math.sin(t * 2.3) + 0.05 * Math.sin(t * 5.7 + 1.3) + 0.03 * Math.sin(t * 11.1);
      const cr = big * 0.55;
      g.globalAlpha = 0.16 * flick;
      g.drawImage(candleS, W / 2 - cr, H * 1.04 - cr, cr * 2, cr * 2);

      for (const p of steam) {
        p.life += dt;
        p.y += p.vy * dt * (reducedMotion ? 0.4 : 1);
        p.x += p.vx * dt;
        p.r += dt * 2;
        if (p.life > p.maxLife || p.y < -p.r) Object.assign(p, makeSteam(false));
        const k = Math.sin(Math.PI * Math.min(1, p.life / p.maxLife));
        g.globalAlpha = p.a * k * (1 + 0.4 * focus);
        const sx = Math.sin(t * 0.2 + p.ph) * p.sway;
        g.drawImage(steamS, p.x + sx - p.r, p.y - p.r, p.r * 2, p.r * 2);
      }

      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i];
        r.age += dt;
        const prog = r.age / r.life;
        if (prog >= 1) { ripples.splice(i, 1); continue; }
        const rad = r.r0 + (r.max - r.r0) * (1 - Math.pow(1 - prog, 2));
        const fade = (1 - prog) * (1 - prog);
        g.lineWidth = r.width;
        for (let k = 0; k < r.rings; k++) {
          const rr = rad - k * r.gap;
          if (rr <= 0) continue;
          g.beginPath();
          g.arc(r.x, r.y, rr, 0, TAU);
          g.strokeStyle = `rgba(234,223,203,${r.alpha * fade * (1 - k / r.rings)})`;
          g.stroke();
        }
      }
    }

    addEventListener('resize', resize);
    resize();
    return { frame, ripple, setFocus: (v) => (focusTarget = v), get W() { return W; }, get H() { return H; } };
  })();

  /* ───────── dial ───────── */
  const dial = $('#dial'), arc = $('#dialArc'), knob = $('#dialKnob');
  const num = $('#setNum'), unit = $('#setUnit');
  arc.style.strokeDasharray = `${DIAL_C}`;

  const ticks = $('#dialTicks');
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU - Math.PI / 2;
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', 150 + Math.cos(a) * (R + 16));
    c.setAttribute('cy', 150 + Math.sin(a) * (R + 16));
    c.setAttribute('r', i % 3 === 0 ? 2.4 : 1.4);
    c.setAttribute('class', `tick${i % 3 === 0 ? ' major' : ''}`);
    ticks.appendChild(c);
  }

  // Completed laps: one ring per full hour already wound, nested just inside the track.
  const LAP = 60, LAP_GAP = 10;
  const laps = Array.from({ length: Math.ceil(MAX / LAP) - 1 }, (_, i) => {
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle'), r = R - LAP_GAP * (i + 1);
    c.setAttribute('cx', 150); c.setAttribute('cy', 150); c.setAttribute('r', r);
    c.setAttribute('class', 'lap');
    c.style.setProperty('--from', (R / r).toFixed(4)); // starts on the arc, then settles inward
    $('#dialLaps').appendChild(c);
    return c;
  });

  function render(m) {
    const lapFrac = (m % LAP) / LAP, frac = lapFrac === 0 ? 1 : lapFrac;
    arc.style.strokeDashoffset = `${DIAL_C * (1 - frac)}`;
    const done = Math.ceil(m / LAP) - 1; // e.g. 90 min → one finished loop + half the arc
    laps.forEach((c, i) => c.classList.toggle('on', i < done));
    const a = frac * TAU - Math.PI / 2;
    knob.setAttribute('transform', `translate(${150 + Math.cos(a) * R} ${150 + Math.sin(a) * R})`);
    num.textContent = m;
    unit.textContent = m >= 60 ? `min · ${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` : 'minutes';
    dial.setAttribute('aria-valuenow', m);
    dial.setAttribute('aria-valuetext', Spa.fmtDuration(m));
  }

  let drag = null;
  const polar = (e) => {
    const b = dial.getBoundingClientRect();
    const x = e.clientX - (b.left + b.width / 2), y = e.clientY - (b.top + b.height / 2);
    return { a: Math.atan2(y, x), d: Math.hypot(x, y), size: b.width };
  };
  dial.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    Spa.audio.ensure();
    drag = { id: e.pointerId, last: polar(e).a, raw: app.minutes };
    dial.setPointerCapture(e.pointerId);
    dial.classList.add('dragging');
  });
  dial.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const p = polar(e);
    if (p.d < p.size * 0.12) { drag.last = p.a; return; } // too close to centre: angles are jumpy
    let da = p.a - drag.last;
    if (da > Math.PI) da -= TAU;
    if (da < -Math.PI) da += TAU;
    drag.last = p.a;
    drag.raw = clamp(drag.raw + (da / TAU) * 60, app.min - 2.4, app.max + 2.4);
    app.setMinutes(drag.raw, true);
  });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    dial.classList.remove('dragging');
  };
  dial.addEventListener('pointerup', endDrag);
  dial.addEventListener('pointercancel', endDrag);
  dial.addEventListener('keydown', (e) => {
    const step = { ArrowUp: 5, ArrowRight: 5, ArrowDown: -5, ArrowLeft: -5, PageUp: 15, PageDown: -15 }[e.key];
    if (step) { e.preventDefault(); app.setMinutes(app.minutes + step, true); }
    if (e.key === 'Home') app.setMinutes(app.min, true);
    if (e.key === 'End') app.setMinutes(app.max, true);
  });
  $('#minus').addEventListener('click', () => { Spa.audio.ensure(); app.setMinutes(app.minutes - 5, true); });
  $('#plus').addEventListener('click', () => { Spa.audio.ensure(); app.setMinutes(app.minutes + 5, true); });

  /* ───────── session visuals ───────── */
  const orb = $('#orb'), orbWrap = $('.orb-wrap');
  const orbCenter = () => {
    const b = orbWrap.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2, r: b.width / 2 };
  };

  let nextAmbient = 0;
  Spa.audio.onEvent = (type, d) => {
    if (type !== 'drop' || app.state.phase !== 'session' || Math.random() > 0.5) return;
    scene.ripple(scene.W * (0.5 + d.pan * 0.45), scene.H * (0.12 + Math.random() * 0.78), {
      r0: 2, max: 18 + d.peak * 1400, life: 2 + Math.random(), rings: 2, gap: 7, alpha: 0.14 + d.peak * 3,
    });
  };

  const app = Spa.createApp({
    key: 'still', title: 'Still · Hush', short: 'Still',
    min: 5, max: MAX, defaultMinutes: 30, defaultSound: 'ocean',
    sounds: ['ocean', 'rain', 'silence'],
    bell: { f0: 196, vol: 0.5 },
    render,
    onPhase: (p) => scene.setFocus(p === 'session' ? 1 : 0),
    onBreath(b) {
      if (b.p > 600) return; // only ripple at the true start of an inhale
      const c = orbCenter();
      scene.ripple(c.x, c.y, { r0: c.r * 0.6, max: Math.hypot(scene.W, scene.H) * 0.62, life: 9, rings: 3, gap: 22, alpha: 0.16 });
    },
    onComplete() {
      scene.ripple(scene.W / 2, scene.H / 2, { max: Math.hypot(scene.W, scene.H) * 0.7, life: 10, rings: 4, gap: 26, alpha: 0.24 });
    },
    frame(dt, t, s) {
      if (s.phase === 'session') {
        orb.style.transform = `scale(${0.72 + 0.28 * s.breath.k})`;
      } else if (t > nextAmbient) {
        // A slow drip into the pool every few seconds while idle.
        nextAmbient = t + 5 + Math.random() * 6;
        scene.ripple(scene.W * (0.15 + Math.random() * 0.7), scene.H * (0.15 + Math.random() * 0.7),
          { max: 60 + Math.random() * 120, life: 5, rings: 3, gap: 12, alpha: 0.14 });
      }
      scene.frame(dt, t);
    },
  });
})();
