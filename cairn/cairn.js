/* Cairn: a koi pond seen from above. It breathes on the shared clock: a ring spreads from the
   centre as each breath in starts, rain drops ring the water, and a garden chime drops a petal. */
(function () {
  'use strict';
  const { reducedMotion } = Spa;
  const $ = (s) => document.querySelector(s);
  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);

  const cv = $('#scene'), g = cv.getContext('2d');
  let W = 0, H = 0, M = 0, dpr = 1, dim = 0;

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
  const blob = (s, x, y, r, a) => { g.globalAlpha = a; g.drawImage(s, x - r, y - r, r * 2, r * 2); };

  /* ───────── the pond ───────── */
  const pond = (() => {
    const lightS = sprite(190, 235, 210, 0.3), shadeS = sprite(4, 18, 16, 0.5);
    let pads = [], koi = [], rings = [], petals = [];
    const KOI = [
      { body: '#f3ede4', patch: '#e2662c' },
      { body: '#e98a3a', patch: '#f6efe6' },
      { body: '#f4efe8', patch: '#2b2622' },
    ];
    function init() {
      // On a resize (a phone's address bar showing or hiding), keep the pond as it is.
      if (koi.length) {
        koi.forEach((f) => { f.len = M * f.size; f.x = Math.min(f.x, W - 40); f.y = Math.min(f.y, H - 40); });
        return;
      }
      pads = Array.from({ length: 9 }, (_, i) => {
        const a = (i / 9) * TAU + rand(-0.3, 0.3), d = rand(0.3, 0.62);
        return { x: 0.5 + Math.cos(a) * d * 0.62, y: 0.5 + Math.sin(a) * d * 0.62, r: rand(0.05, 0.085), rot: rand(0, TAU), vr: rand(-0.02, 0.02), notch: rand(0.18, 0.3), flower: i % 4 === 1, ph: rand(0, TAU) };
      });
      koi = KOI.map((c, i) => { const size = rand(0.14, 0.19); return { ...c, x: W * rand(0.3, 0.7), y: H * rand(0.3, 0.7), a: rand(0, TAU), size, len: M * size, trail: [], turn: 0, ph: i * 2 }; });
    }
    function ring(x, y, o) {
      if (reducedMotion) return;
      rings.push({ x, y, age: 0, life: o.life ?? 3, r0: o.r0 ?? 1, max: o.max ?? 40, alpha: o.alpha ?? 0.3, n: o.n ?? 2, gap: o.gap ?? 6 });
      if (rings.length > 60) rings.shift();
    }
    function drawPad(p, k, t) {
      const r = p.r * M * (1 + 0.025 * k), x = p.x * W + Math.sin(t * 0.2 + p.ph) * 4, y = p.y * H + Math.cos(t * 0.17 + p.ph) * 4;
      g.save();
      g.translate(x, y);
      g.globalAlpha = 0.35;
      g.fillStyle = '#04110f';
      g.beginPath(); g.arc(r * 0.12, r * 0.16, r, 0, TAU); g.fill();
      g.rotate(p.rot);
      g.globalAlpha = 1;
      const gr = g.createRadialGradient(-r * 0.2, -r * 0.2, 0, 0, 0, r);
      gr.addColorStop(0, '#7fa765'); gr.addColorStop(1, '#3f6a3c');
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, r, p.notch, TAU - 0.05); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(220,240,200,0.18)'; g.lineWidth = 1;
      for (let i = 1; i < 7; i++) { const a = p.notch + (i / 7) * (TAU - p.notch); g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9); g.stroke(); }
      if (p.flower) {
        g.rotate(-p.rot + t * 0.02);
        const fr = r * 0.5 * (0.92 + 0.12 * k);
        for (let layer = 0; layer < 2; layer++) for (let i = 0; i < 8; i++) {
          g.save();
          g.rotate((i / 8) * TAU + layer * 0.4);
          g.fillStyle = layer ? '#fbeef0' : '#efc1cb';
          g.beginPath(); g.ellipse(fr * (layer ? 0.38 : 0.55), 0, fr * (layer ? 0.36 : 0.48), fr * 0.2, 0, 0, TAU); g.fill();
          g.restore();
        }
        g.fillStyle = '#f2cf63'; g.beginPath(); g.arc(0, 0, fr * 0.16, 0, TAU); g.fill();
      }
      g.restore();
    }
    function spine(f, n) {
      const pts = [[f.x, f.y]], step = f.len / n;
      let [px, py] = [f.x, f.y], acc = 0;
      for (let j = 0; j < f.trail.length && pts.length <= n; j++) {
        const [qx, qy] = f.trail[j];
        let d = Math.hypot(qx - px, qy - py);
        while (acc + d >= step && pts.length <= n) {
          const u = (step - acc) / d;
          px += (qx - px) * u; py += (qy - py) * u;
          pts.push([px, py]);
          d = Math.hypot(qx - px, qy - py); acc = 0;
        }
        acc += d; px = qx; py = qy;
      }
      while (pts.length <= n) { const [lx, ly] = pts[pts.length - 1]; pts.push([lx - Math.cos(f.a) * step, ly - Math.sin(f.a) * step]); }
      return pts;
    }
    function drawKoi(f, t, shadow) {
      const N = 14, pts = spine(f, N), wMax = f.len * 0.12;
      const L = [], R = [];
      for (let i = 0; i <= N; i++) {
        const [x, y] = pts[i], [x2, y2] = pts[Math.min(N, i + 1)], [x0, y0] = pts[Math.max(0, i - 1)];
        const a = Math.atan2(y0 - y2, x0 - x2), u = i / N;
        const w = wMax * Math.sin(Math.PI * Math.min(1, 0.12 + u * 0.95)) * (1 - u * 0.55);
        const wig = Math.sin(t * 5 + f.ph - u * 4) * f.len * 0.025 * u;
        const nx = -Math.sin(a), ny = Math.cos(a);
        L.push([x + nx * (w + wig), y + ny * (w + wig)]); R.push([x - nx * (w - wig), y - ny * (w - wig)]);
      }
      const off = shadow ? f.len * 0.09 : 0;
      g.save();
      g.translate(off, off * 1.3);
      // Tail fan.
      const [tx, ty] = pts[N], [bx, by] = pts[N - 2], ta = Math.atan2(ty - by, tx - bx) + Math.sin(t * 5 + f.ph - 4) * 0.35;
      g.fillStyle = shadow ? 'rgba(2,12,10,0.35)' : f.body;
      g.globalAlpha = shadow ? 1 : 0.8;
      g.beginPath(); g.moveTo(tx, ty);
      g.lineTo(tx + Math.cos(ta + 0.45) * f.len * 0.2, ty + Math.sin(ta + 0.45) * f.len * 0.2);
      g.quadraticCurveTo(tx + Math.cos(ta) * f.len * 0.12, ty + Math.sin(ta) * f.len * 0.12, tx + Math.cos(ta - 0.45) * f.len * 0.2, ty + Math.sin(ta - 0.45) * f.len * 0.2);
      g.closePath(); g.fill();
      // Pectoral fins.
      const [fx, fy] = pts[3], fa = Math.atan2(pts[2][1] - pts[4][1], pts[2][0] - pts[4][0]), flap = Math.sin(t * 3 + f.ph) * 0.3;
      for (const s of [1, -1]) {
        g.beginPath(); g.ellipse(fx + Math.cos(fa + s * 1.9) * wMax, fy + Math.sin(fa + s * 1.9) * wMax, f.len * 0.09, f.len * 0.035, fa + s * (2.4 + flap), 0, TAU); g.fill();
      }
      g.globalAlpha = 1;
      g.beginPath();
      L.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      for (let i = R.length - 1; i >= 0; i--) g.lineTo(R[i][0], R[i][1]);
      g.closePath();
      g.fill();
      if (!shadow) {
        g.save(); g.clip();
        g.fillStyle = f.patch;
        for (const [i, r] of [[2, 1.1], [6, 1.3], [10, 0.9]]) { g.beginPath(); g.arc(pts[i][0] + wMax * 0.3, pts[i][1], wMax * r, 0, TAU); g.fill(); }
        g.restore();
      }
      g.restore();
    }
    function moveKoi(f, dt, k, t) {
      const cx = W / 2, cy = H / 2, d = Math.hypot(f.x - cx, f.y - cy);
      f.turn += (rand(-1, 1) * 1.2 - f.turn * 0.5) * dt;
      let da = f.turn;
      if (d > M * 0.42 || f.x < 40 || f.x > W - 40 || f.y < 40 || f.y > H - 40) {
        const want = Math.atan2(cy - f.y, cx - f.x);
        da += Math.atan2(Math.sin(want - f.a), Math.cos(want - f.a)) * 0.9;
      }
      f.a += da * dt;
      const v = f.len * (0.28 + 0.22 * k);
      f.x += Math.cos(f.a) * v * dt; f.y += Math.sin(f.a) * v * dt;
      f.trail.unshift([f.x, f.y]);
      if (f.trail.length > 240) f.trail.length = 240;
    }
    function frame(dt, t, s) {
      const k = s.breath.k;
      const bg = g.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H / 2, Math.max(W, H) * 0.75);
      bg.addColorStop(0, '#1d4a42'); bg.addColorStop(0.6, '#123532'); bg.addColorStop(1, '#0a1f1d');
      g.fillStyle = bg; g.fillRect(0, 0, W, H);
      // Light under the water, swelling with each breath in.
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 5; i++) blob(lightS, W * (0.5 + 0.35 * Math.sin(t * 0.05 + i * 1.7)), H * (0.5 + 0.35 * Math.cos(t * 0.04 + i * 2.3)), M * 0.35, 0.05);
      blob(lightS, W / 2, H / 2, M * (0.3 + 0.25 * k), 0.06 + 0.1 * k);
      g.globalCompositeOperation = 'source-over';
      for (const f of koi) { if (!s.paused) moveKoi(f, dt, k, t); drawKoi(f, t, true); }
      for (const f of koi) drawKoi(f, t, false);
      // Petals that fell with a chime, floating and turning.
      for (let i = petals.length - 1; i >= 0; i--) {
        const p = petals[i];
        p.age += dt;
        if (p.age > 40) { petals.splice(i, 1); continue; }
        p.x += Math.sin(t * 0.3 + p.ph) * 3 * dt; p.rot += p.vr * dt;
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot);
        g.globalAlpha = Math.min(1, p.age * 2) * Math.min(1, (40 - p.age) / 6) * 0.9;
        g.fillStyle = '#f2ccd3'; g.beginPath(); g.ellipse(0, 0, M * 0.011, M * 0.006, 0, 0, TAU); g.fill();
        g.restore();
      }
      g.globalAlpha = 1;
      for (const p of pads) { if (!s.paused) p.rot += p.vr * dt; drawPad(p, k, t); }
      // Ripples.
      g.lineWidth = 1.2;
      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i];
        r.age += dt;
        const pr = r.age / r.life;
        if (pr >= 1) { rings.splice(i, 1); continue; }
        const rad = r.r0 + (r.max - r.r0) * (1 - Math.pow(1 - pr, 2)), fade = (1 - pr) * (1 - pr);
        for (let j = 0; j < r.n; j++) {
          const rr = rad - j * r.gap;
          if (rr <= 0) continue;
          g.strokeStyle = `rgba(220,245,232,${r.alpha * fade * (1 - j / r.n)})`;
          g.beginPath(); g.arc(r.x, r.y, rr, 0, TAU); g.stroke();
        }
      }
      // Shade at the edges of the pond.
      const vg = g.createRadialGradient(W / 2, H / 2, M * 0.3, W / 2, H / 2, Math.max(W, H) * 0.8);
      vg.addColorStop(0, 'rgba(3,12,11,0)'); vg.addColorStop(1, 'rgba(3,12,11,0.6)');
      g.fillStyle = vg; g.fillRect(0, 0, W, H);
    }
    return {
      init, frame, ring,
      breath() { ring(W / 2, H / 2, { r0: M * 0.08, max: Math.max(W, H) * 0.7, life: 9, alpha: 0.22, n: 3, gap: 22 }); },
      drop(d) { if (Math.random() < 0.7) ring(W * (0.5 + d.pan * 0.5) + rand(-40, 40), rand(0, H), { max: 10 + d.peak * 700, life: 1.8, alpha: 0.3 + d.peak * 4, n: 2, gap: 5 }); },
      chime() { const x = rand(0.15, 0.85) * W, y = rand(0.15, 0.85) * H; petals.push({ x, y, age: 0, rot: rand(0, TAU), vr: rand(-0.3, 0.3), ph: rand(0, TAU) }); ring(x, y, { max: 30, life: 2.5, alpha: 0.35 }); },
    };
  })();

  function resize() {
    dpr = Math.min(2, devicePixelRatio || 1);
    W = innerWidth; H = innerHeight; M = Math.min(W, H);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    pond.init();
  }
  addEventListener('resize', resize);

  Spa.audio.onEvent = (type, d) => {
    if (type === 'drop') pond.drop(d);
    if (type === 'chime') pond.chime(d);
  };

  /* ───────── setup gesture: tap for more, swipe down for less ───────── */
  const stage = $('#stage'), num = $('#setNum');
  let drag = null;
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
    if (Math.abs(dy) >= 36) { app.setMinutes(app.minutes + (dy > 0 ? -5 : 5), true); drag.y = e.clientY; }
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

  const app = Spa.createApp({
    key: 'cairn', title: 'Cairn · Hush', short: 'Cairn',
    min: 5, max: 90, defaultMinutes: 30, defaultSound: 'garden',
    sounds: ['garden', 'rain', 'silence'],
    bell: { f0: 261.6, vol: 0.42 },
    render(m) {
      num.textContent = m;
      stage.setAttribute('aria-valuenow', m);
      stage.setAttribute('aria-valuetext', Spa.fmtDuration(m));
    },
    onStep() { Spa.audio.tick(); pond.ring(W / 2, H / 2, { r0: M * 0.06, max: M * 0.3, life: 2.4, alpha: 0.3, n: 2, gap: 8 }); },
    onBreath(b) { if (b.p < 600) pond.breath(b); },
    frame(dt, t, s) {
      g.clearRect(0, 0, W, H); pond.frame(dt, t, s);
      // The pond dims behind the closing words.
      dim += ((s.phase === 'complete' ? 0.55 : 0) - dim) * Math.min(1, dt * 1.2);
      if (dim > 0.005) { g.globalAlpha = dim; g.fillStyle = '#06130f'; g.fillRect(0, 0, W, H); } g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; },
  });
  resize();
})();
