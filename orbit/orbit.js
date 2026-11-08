/* Orbit: turn the stone around the dial, breathe with the ripples among the stars. */
(function () {
  'use strict';
  const { clamp, reducedMotion } = Spa;
  const $ = (s) => document.querySelector(s);
  const TAU = Math.PI * 2;
  const R = 118, DIAL_C = TAU * R, MAX = 180;

  /* ───────── canvas scene: drifting violet light, stars, a low blue glow, haze, ripples ───────── */
  const scene = (() => {
    const cv = $('#scene'), g = cv.getContext('2d');
    let W = 0, H = 0, focus = 0, focusTarget = 0;
    const steam = [], ripples = [], stars = [];

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
    const steamS = sprite(255, 244, 228), causticS = sprite(80, 70, 220), candleS = sprite(40, 70, 200);

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
      // A still field of stars, each glimmering at its own pace.
      stars.length = 0;
      for (let i = 0, m = Math.round(clamp((W * H) / 5000, 60, 260)); i < m; i++) {
        stars.push({ x: Math.random() * W, y: Math.random() * H, r: 0.4 + Math.pow(Math.random(), 4) * 1.3,
          a: 0.25 + Math.random() * 0.65, ph: Math.random() * TAU, sp: 0.4 + Math.random() * 1.2 });
      }
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

      g.fillStyle = '#fff';
      for (const st of stars) {
        g.globalAlpha = st.a * (reducedMotion ? 1 : 0.7 + 0.3 * Math.sin(t * st.sp + st.ph));
        g.beginPath(); g.arc(st.x, st.y, st.r, 0, TAU); g.fill();
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
        g.globalAlpha = p.a * k * (1 + 0.4 * focus) * 0.25; // only a faint haze in space
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
  const orbWrap = $('.orb-wrap');
  const orbCenter = () => {
    const b = orbWrap.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2, r: b.width / 2 };
  };

  /* The breathing sphere, drawn in WebGL: a hollow globe of fine stone-coloured dots with a
     warm rim, turning slowly while a brighter swell drifts across its surface. It is in focus
     only at the turn of each breath, at its largest and smallest; while it grows and shrinks
     it drifts out of focus, the dots softening into a haze. Without WebGL the CSS .orb stays. */
  const SHELL_SCALE = 1.6; // canvas size relative to .orb-wrap; keep in step with .shell in orbit.css
  const shell = (() => {
    const cv = document.createElement('canvas');
    cv.className = 'shell';
    cv.setAttribute('aria-hidden', 'true');
    const gl = cv.getContext('webgl', { premultipliedAlpha: true, antialias: false });
    if (!gl) return null;

    const VS = 'attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }';
    const FS = `
      precision highp float;
      uniform vec2 uRes;
      uniform float uT, uR, uBlur, uPat, uKind;
      uniform mat3 uM;
      const float PI = 3.14159265;
      const float ROWS = 62.0;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      // Dots on a latitude grid, fewer per row toward the poles so they stay evenly spaced.
      // Out of focus they spread into their average coverage.
      float dots(vec3 q){
        float lat = asin(clamp(q.y, -1.0, 1.0));
        float lon = atan(q.z, q.x);
        float v = (lat / PI + 0.5) * ROWS;
        float latC = ((floor(v) + 0.5) / ROWS - 0.5) * PI;
        float ncol = max(1.0, floor(2.0 * ROWS * cos(latC)));
        float u = (lon / (2.0 * PI) + 0.5) * ncol;
        vec2 d = vec2((fract(u) - 0.5) * 2.0 * cos(lat) * ROWS / ncol, fract(v) - 0.5);
        float sharp = 1.0 - smoothstep(0.12, 0.26, length(d));
        return mix(sharp, 0.15, uBlur);
      }
      // Where the dots brighten: drifting swells and one slow band.
      float swell(vec3 q){
        float a = sin(3.1 * q.x + uT * 0.7) * sin(2.3 * q.y - uT * 0.5 + 1.7) * sin(2.7 * q.z + uT * 0.6 + 0.4);
        float band = exp(-pow(q.y + 0.35 * sin(2.0 * q.x + uT * 0.4) - 0.5 * sin(uT * 0.23), 2.0) * 7.0);
        return 0.15 + 1.3 * max(a, 0.0) + 1.4 * band;
      }
      // At the smallest, for a beat, the dots light up in a figure. uKind picks it.
      float figure(vec3 q){
        float lat = asin(clamp(q.y, -1.0, 1.0)), lon = atan(q.z, q.x);
        if (uKind < 0.5)                                    // three rings of latitude
          return exp(-pow(q.y / 0.07, 2.0)) + 0.8 * exp(-pow((abs(q.y) - 0.55) / 0.05, 2.0));
        if (uKind < 1.5) return pow(max(0.0, sin(lon * 3.0 + lat * 6.0)), 14.0);   // a spiral
        return pow(max(0.0, cos(lon * 6.0)), 18.0);                                // meridians
      }
      void main(){
        vec2 p = ((gl_FragCoord.xy / uRes) * 2.0 - 1.0) / uR;
        float r = length(p);
        float soft = 0.008 + 0.09 * uBlur;
        float inside = 1.0 - smoothstep(1.0 - soft, 1.0 + soft, r);
        float rim = exp(-pow((r - 1.0) / (0.022 + 0.08 * uBlur), 2.0));
        float z = sqrt(max(0.0, 1.0 - min(r, 1.0) * min(r, 1.0)));
        vec3 pf = normalize(vec3(p, z)), pb = normalize(vec3(p, -z));
        vec3 qf = uM * pf, qb = uM * pb;
        float fres = pow(1.0 - z, 2.5);

        vec3 stone = vec3(0.84, 0.81, 0.75), sand = vec3(0.92, 0.74, 0.52), amber = vec3(1.0, 0.7, 0.4);
        float sf = swell(qf), sb = swell(qb);
        float dim = mix(1.0, 0.15, uPat);
        float df = dots(qf) * (sf * (0.12 + 1.0 * fres) * dim + figure(qf) * uPat * 1.1);
        float db = dots(qb) * (sb * 0.4 * (0.15 + 0.85 * fres) * dim + figure(qb) * uPat * 0.5);
        vec3 col = (stone * db + mix(stone, sand, fres) * df) * inside;
        col += mix(stone, amber, clamp(sf - 0.9, 0.0, 1.0)) * df * 0.25 * inside; // warmer where it swells
        col += mix(sand, amber, 0.5) * rim * (0.6 - 0.3 * uBlur);
        float a = clamp(max(col.r, max(col.g, col.b)), 0.0, 1.0);
        col += (hash(gl_FragCoord.xy + fract(uT * 7.0) * 311.0) - 0.5) * 0.05 * a; // film grain
        gl_FragColor = vec4(col, a);
      }`;
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
    };
    const vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS);
    if (!vs || !fs) return null;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aLoc = gl.getAttribLocation(prog, 'a');
    gl.enableVertexAttribArray(aLoc);
    gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0);
    const u = {};
    ['uRes', 'uT', 'uR', 'uBlur', 'uM', 'uPat', 'uKind'].forEach((n) => (u[n] = gl.getUniformLocation(prog, n)));

    orbWrap.prepend(cv);
    orbWrap.classList.add('gl');

    let size = 0;
    return function draw(t, b) {
      const px = Math.round(cv.clientWidth * Math.min(2, devicePixelRatio || 1));
      if (px !== size) { size = cv.width = cv.height = px; gl.viewport(0, 0, px, px); }
      // Focus: sharp at the turn of each breath, softest midway through it.
      // Holds stay in focus.
      const moving = b.stage === 'in' || b.stage === 'out', f = b.f;
      const blur = moving ? Math.pow(Math.sin(Math.PI * clamp(f, 0, 1)), 0.7) : 0;
      // A slow turn about a tilted axis.
      const ay = t * 0.12, ax = 0.4;
      const cy = Math.cos(ay), sy = Math.sin(ay), cx = Math.cos(ax), sx = Math.sin(ax);
      gl.uniform2f(u.uRes, px, px);
      gl.uniform1f(u.uT, t);
      // Radius in timer-ring units (the ring sits at 0.96): from 0.68 breathed out to 1.22
      // breathed in, well past the ring. The canvas is 1.6x the ring box to leave room.
      gl.uniform1f(u.uR, (0.68 + 0.54 * b.k) / SHELL_SCALE);
      gl.uniform1f(u.uBlur, blur);
      // The pattern shows around the turn from out-breath to in-breath, a new figure each breath.
      // Not while the session opens (the settle and the opening inhale, cycles -1 and 0):
      // the first one comes at the end of the first out-breath. It stays through a hold after the out-breath.
      const near = { in: 1 - Spa.ease(f / 0.4), 'hold-in': 0, out: Spa.ease((f - 0.6) / 0.4), 'hold-out': 1 }[b.stage];
      const opened = b.inhale ? b.cycle >= 1 : b.cycle >= 0;
      gl.uniform1f(u.uPat, opened ? near : 0);
      gl.uniform1f(u.uKind, ((b.inhale ? b.cycle : b.cycle + 1) + 2) % 3); // rings first, then spiral, meridians
      gl.uniformMatrix3fv(u.uM, false, [cy, sx * sy, -cx * sy, 0, cx, sx, sy, -sx * cy, cx * cy]);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
  })();

  let nextAmbient = 0;
  Spa.audio.onEvent = (type, d) => {
    if (type !== 'drop' || app.state.phase !== 'session' || Math.random() > 0.5) return;
    scene.ripple(scene.W * (0.5 + d.pan * 0.45), scene.H * (0.12 + Math.random() * 0.78), {
      r0: 2, max: 18 + d.peak * 1400, life: 2 + Math.random(), rings: 2, gap: 7, alpha: 0.14 + d.peak * 3,
    });
  };

  const app = Spa.createApp({
    key: 'still', title: 'Orbit · Hush', short: 'Orbit', // key kept from Still, so saved lengths carry over
    min: 5, max: MAX, defaultMinutes: 30,
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
      const b = s.breath;
      if (s.phase === 'session') {
        if (shell) shell(t, b);
        else orbWrap.style.setProperty('--k', b.k.toFixed(3)); // CSS fallback: scale and edge softness
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
