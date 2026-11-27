/* The program: the twelve breaths as a row of stars, climbing from beginner to expert.
   Shown at the top of every room's setup screen; picking a star sets the breath and the dial.
   After a session from the program, the complete screen asks "How was that?":
     Easy: the star lights now and the next one opens (an expert star needs two sessions first).
     About right: five minutes longer next time.
     Hard: next time is eased (shorter holds, a shorter long breath, five minutes less).
   Every session fills a dot whatever the answer, and three dots light a star, so there is
   always progress. A star lit while eased opens the next one eased.
   The state is kept in this browser and shared by every room. */
(function () {
  'use strict';
  const Spa = window.Spa;

  // Easiest first. Lengths are in the dial's five-minute steps.
  const LADDER = [
    { id: 'balance', lvl: 0, min: 5 },
    { id: 'alertness', lvl: 0, min: 5 },
    { id: 'recovery', lvl: 0, min: 5 },
    { id: 'body', lvl: 0, min: 5 },
    { id: 'movement', lvl: 1, min: 10 },
    { id: 'senses', lvl: 1, min: 10 },
    { id: 'concentration', lvl: 1, min: 10 },
    { id: 'stillness', lvl: 1, min: 10 },
    { id: 'control', lvl: 2, min: 15 },
    { id: 'discipline', lvl: 2, min: 15 },
    { id: 'activating', lvl: 2, min: 5 },
    { id: 'advanced', lvl: 2, min: 10 },
  ];
  const LEVELS = ['Beginner', 'Intermediate', 'Expert'];
  const NEED = 3, EXPERT_MIN = 2, STEP = 5, MAX_EXTRA = 10, N = LADDER.length;

  const store = Spa.store('program');
  const fresh = () => ({ done: Array(N).fill(0), lit: Array(N).fill(false), min: LADDER.map((L) => L.min), eased: Array(N).fill(false), sel: 0 });
  let s = (() => {
    const x = store.get('state', null), f = fresh();
    if (!x) return f;
    for (const k of ['done', 'lit', 'min', 'eased']) if (Array.isArray(x[k]) && x[k].length === N) f[k] = x[k];
    if (Number.isInteger(x.sel) && x.sel >= 0 && x.sel < N) f.sel = x.sel;
    return f;
  })();
  const save = () => store.set('state', s);

  const word = (i) => Spa.technique(LADDER[i].id).word;
  const now = () => s.lit.indexOf(false); // the star being worked on; -1 when all are lit
  const isOpen = (i) => s.lit[i] || i === now();
  // Eased counts: holds halved, and a long breath in or out brought nearer the other.
  const easeT = (t) => t.map((v, j) => (j === 1 || j === 3) ? Math.ceil(v / 2)
    : j === 2 && v > t[0] ? Math.max(t[0], v - 2) : j === 0 && v > t[2] ? Math.max(t[2], v - 2) : v);

  function star(i = s.sel) {
    const L = LADDER[i], T = Spa.technique(L.id);
    return { i, id: L.id, T, lvl: L.lvl, level: LEVELS[L.lvl], min: s.min[i], eased: s.eased[i], done: s.done[i], lit: s.lit[i], open: isOpen(i),
      counts: s.eased[i] ? easeT(T.t) : null };
  }

  function select(i) { if (!isOpen(i)) return false; s.sel = i; save(); return true; }

  // Record a finished session on star i and return a line saying what changed.
  function answer(i, f) {
    const L = LADDER[i], w = word(i), wasLit = s.lit[i], lines = [];
    s.done[i]++;
    const longer = () => { const m = Math.min(L.min + MAX_EXTRA, s.min[i] + STEP); const did = m > s.min[i]; s.min[i] = m; return did; };
    let light = false;
    if (f === 'hard') {
      // Say only what changes: the counts (if easing changes them) and the length (if above the floor).
      const T = Spa.technique(L.id).t, e = easeT(T), m = Math.max(STEP, s.min[i] - STEP);
      const changes = [];
      if (!s.eased[i] && (e[1] < T[1] || e[3] < T[3])) changes.push('shorter holds');
      if (!s.eased[i] && e[0] < T[0]) changes.push('a shorter breath in');
      if (!s.eased[i] && e[2] < T[2]) changes.push('a shorter breath out');
      if (m < s.min[i]) changes.push('five minutes less');
      s.min[i] = m; s.eased[i] = true;
      lines.push(changes.length ? `Counted. Next time: ${changes.length > 1 ? `${changes.slice(0, -1).join(', ')} and ${changes.at(-1)}` : changes[0]}.` : 'Counted. This is already the easiest version, so it stays as it is.');
    } else if (f === 'easy' && s.eased[i]) {
      s.eased[i] = false; s.min[i] = Math.max(s.min[i], L.min);
      lines.push(`Back to the full ${w}.`);
    } else if (f === 'easy') {
      if (wasLit) lines.push(longer() ? 'Five minutes longer next time.' : 'Counted.');
      else if (L.lvl === 2 && s.done[i] < EXPERT_MIN) lines.push('Counted. Expert stars take two sessions, so one more.');
      else light = true;
    } else {
      lines.push(longer() ? 'Counted. Five minutes longer next time.' : 'Counted.');
    }
    if (!wasLit && (light || s.done[i] >= NEED)) {
      s.lit[i] = true;
      const nx = now();
      if (nx < 0) lines.push('Every star is lit.');
      else {
        s.sel = nx;
        if (s.eased[i] && !s.done[nx]) { s.eased[nx] = true; s.min[nx] = Math.max(STEP, LADDER[nx].min - STEP); lines.push(`${w} is lit. ${word(nx)} opens, eased to start.`); }
        else lines.push(`${w} is lit. ${word(nx)} opens.`);
      }
    }
    save();
    return lines.join(' ');
  }

  /* ───────── the program at the top of the setup screen ─────────
     Trial (2026-11-27): three quiet looks, each opening to show all twelve stars when tapped.
       pip: one star, its word and three dots; the framed sky drops down under it.
       hairline: twelve dots in a thin line; the climb opens as a night sky with every name.
       porthole: a small round window, the twelve stars as ticks round its rim; it opens
         into a large ring of stars with the chosen one named in the middle.
     The look is switched with the small letters at the bottom left, or ?look=pip|hairline|porthole. */
  const LOOKS = { pip: 'Pip', hairline: 'Hairline', porthole: 'Porthole' };
  const looks = Spa.store('program-look');
  const W = 360, H = 96;
  const WOB = [6, -6, 4, -4, 6, -6, 4, -4, 6, -6, 4, -4];
  const POS = LADDER.map((L, i) => [20 + i * 27 + L.lvl * 11, 72 - i * 4.6 + WOB[i]]);
  const SPECKS = Array.from({ length: 24 }, (_, k) => [(k * 97) % W, (k * 53) % H, (k % 3) * 0.25 + 0.3, 0.06 + (k % 4) * 0.03]);
  const cls = (i, active) => ['prog-star', s.lit[i] && 'lit', i === now() && 'now', active && i === s.sel && 'sel', s.eased[i] && 'eased', !isOpen(i) && 'shut'].filter(Boolean).join(' ');
  const attrs = (i, active) => isOpen(i)
    ? `data-i="${i}" role="radio" tabindex="0" aria-checked="${active && i === s.sel}" aria-label="${word(i)}, ${LEVELS[LADDER[i].lvl]}"`
    : `data-shut="${i}" aria-label="${word(i)}, not open yet"`;
  const pips = (i, x, y, gap = 7, r = 2) => {
    let h = '';
    for (let k = 0; k < NEED; k++) h += `<circle class="prog-pip${s.lit[i] || k < s.done[i] ? ' done' : ''}" cx="${x - gap + k * gap}" cy="${y}" r="${r}"/>`;
    return h;
  };
  const status = (i) => s.eased[i] ? 'eased' : s.lit[i] ? 'lit' : isOpen(i) ? `${s.done[i]} of ${NEED}` : 'not open yet';

  // The framed row of stars (the first version), used by Pip.
  function rowSky(active) {
    let h = SPECKS.map(([x, y, r, o]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" opacity="${o}"/>`).join('');
    for (let i = 0; i < N - 1; i++) {
      const [a, b] = [POS[i], POS[i + 1]];
      h += `<line class="prog-link${s.lit[i] ? '' : ' dim'}" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}"/>`;
    }
    LADDER.forEach((L, i) => {
      const [x, y] = POS[i], open = isOpen(i);
      h += `<g class="${cls(i, active)}" ${attrs(i, active)}>
        <circle class="prog-halo" cx="${x}" cy="${y}" r="13"/><circle class="prog-core" cx="${x}" cy="${y}" r="${open ? 4 : 2.6}"/>${(i === now() || (active && i === s.sel)) ? pips(i, x, y + 13) : ''}
        <circle cx="${x}" cy="${y}" r="14" fill="transparent"/></g>`;
    });
    return h;
  }

  // Hairline's sheet: a trail from Beginner to Expert, every name shown by its star.
  // Shape: a soft wave straight up the middle (Gentle, chosen 2026-11-27 over Serpentine,
  // wide loops across the sky, and Spiral, winding inward). Names go on the outer side.
  // Each star is [x, y, where its name goes: l left, r right].
  const CW = 360, CH = 630;
  const GENTLE = LADDER.map((L, i) => {
    const x = 180 + 52 * Math.sin(i * 0.9), y = 585 - i * 47 - L.lvl * 6;
    return [x, y, x >= 179 ? 'r' : 'l'];
  });
  const CPOS = GENTLE;
  const CSPECKS = Array.from({ length: 70 }, (_, k) => [(k * 97) % CW, (k * 211) % CH, (k % 3) * 0.3 + 0.3, 0.1 + (k % 5) * 0.05]);
  // A smooth line through the stars (Catmull-Rom), from star a to star b.
  function trail(a, b) {
    const P = (i) => CPOS[Math.max(0, Math.min(N - 1, i))];
    let d = `M${P(a)[0]} ${P(a)[1]}`;
    for (let i = a; i < b; i++) {
      const [p0, p1, p2, p3] = [P(i - 1), P(i), P(i + 1), P(i + 2)];
      d += ` C${p1[0] + (p2[0] - p0[0]) / 6} ${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6} ${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]} ${p2[1]}`;
    }
    return d;
  }
  // Points along that line, every `step` units, each with the index of the star it has passed.
  function trailPoints(step = 5) {
    const P = (i) => CPOS[Math.max(0, Math.min(N - 1, i))], out = [];
    for (let i = 0; i < N - 1; i++) {
      const [p0, p1, p2, p3] = [P(i - 1), P(i), P(i + 1), P(i + 2)];
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), n = Math.max(2, Math.round(len / step));
      for (let k = 0; k < n; k++) {
        const t = k / n, u = 1 - t;
        const x = u * u * u * p1[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p2[0];
        const y = u * u * u * p1[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p2[1];
        // direction, for scattering sideways
        const dx = 3 * u * u * (c1[0] - p1[0]) + 6 * u * t * (c2[0] - c1[0]) + 3 * t * t * (p2[0] - c2[0]);
        const dy = 3 * u * u * (c1[1] - p1[1]) + 6 * u * t * (c2[1] - c1[1]) + 3 * t * t * (p2[1] - c2[1]);
        const d = Math.hypot(dx, dy) || 1;
        out.push({ x, y, nx: -dy / d, ny: dx / d, seg: i + t });
      }
    }
    out.push({ x: CPOS[N - 1][0], y: CPOS[N - 1][1], nx: 0, ny: 0, seg: N - 1 });
    return out;
  }
  const rand = (seed) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

  /* Trail looks (trial, 2026-11-27), reached with ?trail=line|milky|dust|comet (line is the default):
       milky: a soft river of light the stars sit along; the stretch you've walked glows warmer.
       dust: no line, a scatter of twinkling specks along the way; walked specks are bright.
       comet: the walked stretch is a comet's tail that tapers back from the current star;
         the stars ahead stand alone. */
  const TRAILS = { line: 'Line', milky: 'Milky Way', dust: 'Stardust', comet: 'Comet' };
  function drawTrail(kind, reach) {
    if (kind === 'line') return `<path class="climb-path dim" d="${trail(0, N - 1)}"/>${reach > 0 ? `<path class="climb-path" d="${trail(0, reach)}"/>` : ''}`;
    if (kind === 'milky') {
      return `<defs><filter id="tr-blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="9"/></filter>
          <filter id="tr-soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.5"/></filter></defs>
        <path class="mw-wide" d="${trail(0, N - 1)}" filter="url(#tr-blur)"/>
        <path class="mw-mid" d="${trail(0, N - 1)}" filter="url(#tr-soft)"/>
        ${reach > 0 ? `<path class="mw-done-wide" d="${trail(0, reach)}" filter="url(#tr-blur)"/><path class="mw-done" d="${trail(0, reach)}" filter="url(#tr-soft)"/><path class="mw-core" d="${trail(0, reach)}"/>` : ''}`;
    }
    const pts = trailPoints(kind === 'dust' ? 2.2 : 3);
    if (kind === 'dust') {
      const r = rand(7);
      return pts.map((p, k) => {
        const off = (r() + r() + r() - 1.5) * 9, done = p.seg <= reach;
        const rad = 0.35 + r() * (done ? 1.2 : 0.9), tw = r() < 0.25 ? ` tw" style="animation-delay:${(r() * 5).toFixed(2)}s` : '';
        return `<circle class="sd${done ? ' done' : ''}${tw}" cx="${(p.x + p.nx * off).toFixed(1)}" cy="${(p.y + p.ny * off).toFixed(1)}" r="${rad.toFixed(2)}" opacity="${(0.35 + r() * 0.65).toFixed(2)}"/>`;
      }).join('');
    }
    // comet: a lead-in from the bottom left corner, then the walked stretch, tapering back.
    const lead = Array.from({ length: 30 }, (_, k) => ({ x: 0 + (CPOS[0][0] - 0) * k / 30, y: CH + 10 + (CPOS[0][1] - CH - 10) * k / 30, seg: -1 + k / 30 }));
    const tail = [...lead, ...pts.filter((p) => p.seg <= reach)];
    let h = '';
    const L = tail.length;
    for (let k = 1; k < L; k++) {
      const f = k / (L - 1), a = tail[k - 1], b = tail[k];
      h += `<line class="cm" x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke-width="${(0.3 + f * f * 7).toFixed(2)}" opacity="${(f * f * 0.55).toFixed(3)}"/>`;
    }
    for (let k = 1; k < L; k++) {
      const f = k / (L - 1), a = tail[k - 1], b = tail[k];
      h += `<line class="cm-core" x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke-width="${(0.2 + f * 1.6).toFixed(2)}" opacity="${(f * 0.9).toFixed(3)}"/>`;
    }
    return h;
  }

  function climbSky(active, kind) {
    let h = CSPECKS.map(([x, y, r, o]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" opacity="${o}"/>`).join('');
    LEVELS.forEach((lv, k) => {
      const ys = CPOS.filter((_, i) => LADDER[i].lvl === k).map((p) => p[1]), y = (Math.min(...ys) + Math.max(...ys)) / 2;
      h += `<text class="climb-band" x="18" y="${y}" text-anchor="middle" transform="rotate(-90 18 ${y})">${lv}</text>`;
    });
    const n = now(), reach = n < 0 ? N - 1 : n;
    h += drawTrail(kind, reach);
    LADDER.forEach((L, i) => {
      const [x, y] = CPOS[i], open = isOpen(i);
      h += `<g class="${cls(i, active)}" ${attrs(i, active)} style="--d:${i * 70}ms">
        <circle class="prog-halo" cx="${x}" cy="${y}" r="16"/><circle class="prog-core" cx="${x}" cy="${y}" r="${open ? 4.2 : 2.6}"/>
        ${nameAt(CPOS[i], word(i))}
        ${open && !s.lit[i] ? pips(i, x, y + 15, 8, 2.2) : ''}
        <circle cx="${x}" cy="${y}" r="24" fill="transparent"/></g>`;
    });
    return h;
  }
  function nameAt([x, y, at], w) {
    const [tx, ty, anchor] = at === 'a' ? [x, y - 13, 'middle'] : at === 'b' ? [x, y + 36, 'middle'] : at === 'l' ? [x - 14, y + 6, 'end'] : [x + 14, y + 6, 'start'];
    return `<text class="climb-name" x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="${anchor}">${w}</text>`;
  }

  // Porthole's ring: the twelve stars round a circle, starting at the top and going clockwise.
  const R = 120, RC = 160;
  const RPOS = LADDER.map((L, i) => { const a = -Math.PI / 2 + (i + 0.5) * (Math.PI * 2 / N); return [RC + R * Math.cos(a), RC + R * Math.sin(a), a]; });
  const arc = (a0, a1, r) => `M${RC + r * Math.cos(a0)} ${RC + r * Math.sin(a0)} A${r} ${r} 0 0 1 ${RC + r * Math.cos(a1)} ${RC + r * Math.sin(a1)}`;
  // For text: the bottom arc runs the other way so its words read upright.
  const textArc = (a0, a1, r) => (Math.sin((a0 + a1) / 2) > 0.5
    ? `M${RC + r * Math.cos(a1)} ${RC + r * Math.sin(a1)} A${r} ${r} 0 0 0 ${RC + r * Math.cos(a0)} ${RC + r * Math.sin(a0)}` : arc(a0, a1, r));
  function ringSky(active, shown) {
    const step = Math.PI * 2 / N;
    let h = `<defs>${LEVELS.map((_, k) => `<path id="ring-lv${k}" d="${textArc(-Math.PI / 2 + k * 4 * step + 0.08, -Math.PI / 2 + (k + 1) * 4 * step - 0.08, Math.sin((k * 4 + 2) * step - Math.PI / 2) > 0.5 ? R + 32 : R + 26)}"/>`).join('')}</defs>`;
    h += `<circle class="ring-track" cx="${RC}" cy="${RC}" r="${R}"/>`;
    LEVELS.forEach((lv, k) => {
      h += `<path class="ring-lv" d="${arc(-Math.PI / 2 + k * 4 * step + 0.08, -Math.PI / 2 + (k + 1) * 4 * step - 0.08, R + 20)}"/>
        <text class="ring-lv-name"><textPath href="#ring-lv${k}" startOffset="50%" text-anchor="middle">${lv}</textPath></text>`;
    });
    for (let i = 0; i < N; i++) if (s.lit[i]) h += `<path class="ring-done" d="${arc(RPOS[i][2] - step / 2, RPOS[i][2] + step / 2, R)}"/>`;
    LADDER.forEach((L, i) => {
      const [x, y] = RPOS[i], open = isOpen(i);
      h += `<g class="${cls(i, active)}${i === shown ? ' shown' : ''}" ${attrs(i, active)} style="--d:${i * 50}ms">
        <circle class="prog-halo" cx="${x}" cy="${y}" r="15"/><circle class="prog-core" cx="${x}" cy="${y}" r="${open ? 5 : 3}"/>
        <circle cx="${x}" cy="${y}" r="20" fill="transparent"/></g>`;
    });
    const S = star(shown), open = isOpen(shown);
    h += `<text class="ring-k" x="${RC}" y="${RC - 34}" text-anchor="middle">${S.level} · ${shown + 1} of ${N}</text>
      <text class="ring-w${open ? '' : ' shut'}" x="${RC}" y="${RC + 8}" text-anchor="middle">${S.T.word}</text>
      <text class="ring-c" x="${RC}" y="${RC + 34}" text-anchor="middle">${status(shown)}</text>
      ${open && !S.lit ? pips(shown, RC, RC + 52, 9, 2.6) : ''}`;
    return h;
  }

  function mount(host, onPick) {
    const fromUrl = new URLSearchParams(location.search).get('look');
    let look = LOOKS[fromUrl] ? fromUrl : LOOKS[looks.get('look')] ? looks.get('look') : 'hairline';
    let active = false, shown = s.sel, closeT = 0;
    const trailUrl = new URLSearchParams(location.search).get('trail');
    let trailKind = TRAILS[trailUrl] ? trailUrl : 'line';

    const box = document.createElement('div');
    host.prepend(box);
    // Hairline and Porthole open over the whole screen, so their sheet lives on the body.
    const sheet = document.createElement('div');
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-label', 'The program');
    document.body.append(sheet);

    /* The closed line of dots sits in a pill with a small arrow, like a button (Capsule, chosen
       2026-11-27 over Caption and Glint). Tapping it runs a light along the dots and sends a ring
       from the current one (Glint's animation, once), then the trail opens. */
    let glintT = 0;
    const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
    function glintThenOpen() {
      if (glintT) return;
      if (still()) { open(); return; }
      box.classList.add('glinting');
      box.querySelector('.hl-sweep')?.beginElement();
      glintT = setTimeout(() => { glintT = 0; open(); box.classList.remove('glinting'); }, 650);
    }

    // Copy the room's sound buttons (and which one is chosen) into the sheet.
    function syncSounds() {
      const row = sheet.querySelector('.sh-sounds');
      if (!row) return;
      const src = [...document.querySelectorAll('.sounds:not(.sh-sounds) [data-sound]')];
      if (!src.length) { row.textContent = 'No sounds found on this page'; return; }
      if (row.children.length !== src.length) row.innerHTML = src.map((b) => `<button type="button" role="radio" data-mirror="${b.dataset.sound}">${b.textContent.trim()}</button>`).join('');
      src.forEach((b) => row.querySelector(`[data-mirror="${b.dataset.sound}"]`)?.setAttribute('aria-checked', b.getAttribute('aria-checked') || 'false'));
    }

    function build() {
      box.className = `prog look-${look}`;
      sheet.className = `prog-sheet look-${look}`;
      if (look === 'pip') {
        box.innerHTML = `<button type="button" class="prog-face" aria-expanded="false" aria-label="Program, show all twelve stars">
            <svg class="pf-star" viewBox="-12 -12 24 24" aria-hidden="true"><circle class="prog-halo" r="10"/><circle class="prog-core" r="3.2"/></svg>
            <span class="pf-word"></span><span class="pf-pips" aria-hidden="true"></span></button>
          <div class="prog-drop"><svg class="prog-sky" viewBox="0 0 ${W} ${H}" role="radiogroup" aria-label="Program"></svg>
            <p class="prog-line"><span class="prog-k"></span><span class="prog-c"></span></p></div>`;
        sheet.innerHTML = '';
      } else if (look === 'hairline') {
        const chev = (d) => `<svg class="hl-chev" viewBox="0 0 12 12" aria-hidden="true"><path d="${d}"/></svg>`;
        box.innerHTML = `<button type="button" class="prog-face hl-face face-capsule" aria-expanded="false" aria-label="Program, show all twelve stars">
          <span class="hl-row"><svg class="hl" viewBox="0 0 150 16" aria-hidden="true"></svg>${chev('M4.5 2.5 8 6l-3.5 3.5')}</span></button>`;
        sheet.innerHTML = `<div class="sh-in"><p class="sh-k">The program</p>
          <svg class="prog-sky" viewBox="0 0 ${CW} ${CH}" role="radiogroup" aria-label="Program"></svg>
          <div class="sh-go"><p class="sh-pick"></p><button type="button" class="begin sh-begin"></button>
            <div class="sounds sh-sounds" role="radiogroup" aria-label="Ambience"></div></div>
          <button type="button" class="sh-x" aria-label="Close">&times;</button></div>`;
      } else {
        box.innerHTML = `<button type="button" class="prog-face" aria-expanded="false" aria-label="Program, show all twelve stars">
          <svg class="ph" viewBox="0 0 44 44" aria-hidden="true"></svg></button>`;
        sheet.innerHTML = `<div class="sh-in"><svg class="prog-sky" viewBox="-20 -20 ${RC * 2 + 40} ${RC * 2 + 40}" role="radiogroup" aria-label="Program"></svg>
          <p class="sh-hint"></p><button type="button" class="sh-x" aria-label="Close">&times;</button></div>`;
      }
    }

    const isOpenNow = () => box.classList.contains('open');
    function open() {
      clearTimeout(closeT);
      shown = s.sel;
      box.classList.add('open'); sheet.classList.add('open', 'rise');
      box.querySelector('.prog-face').setAttribute('aria-expanded', 'true');
      if (look === 'porthole') {
        const r = box.querySelector('.prog-face').getBoundingClientRect();
        sheet.style.setProperty('--ox', `${r.left + r.width / 2}px`);
        sheet.style.setProperty('--oy', `${r.top + r.height / 2}px`);
      }
      if (look === 'hairline') {
        const r = box.querySelector('.prog-face').getBoundingClientRect();
        sheet.style.setProperty('--oy', `${r.top + r.height / 2}px`);
      }
      render(active);
      setTimeout(() => sheet.classList.remove('rise'), 1400);
      (sheet.querySelector('.sh-x') || box.querySelector('[data-i]'))?.focus({ preventScroll: true });
    }
    function close(now) {
      clearTimeout(closeT);
      if (!isOpenNow()) return;
      box.classList.remove('open'); sheet.classList.remove('open', 'rise');
      box.querySelector('.prog-face')?.setAttribute('aria-expanded', 'false');
      if (!now) box.querySelector('.prog-face')?.focus({ preventScroll: true });
    }
    const pick = (i) => {
      shown = i;
      onPick(i);
      if (look === 'hairline') return; // stays open: Begin at the bottom starts it
      // Let the chosen star show for a moment, then fold the stars away.
      clearTimeout(closeT);
      closeT = setTimeout(close, look === 'pip' ? 700 : 900);
    };

    function onTap(e) {
      if (e.target.closest('.prog-face')) { isOpenNow() ? close() : look === 'hairline' ? glintThenOpen() : open(); return; }
      if (e.target.closest('.sh-x')) { close(); return; }
      // The sounds under Begin pass the tap on to the room's own sound buttons.
      const sm = e.target.closest('[data-mirror]');
      if (sm) { document.querySelector(`.sounds:not(.sh-sounds) [data-sound="${sm.dataset.mirror}"]`)?.click(); syncSounds(); return; }
      if (e.target.closest('.sh-begin')) {
        const go = document.getElementById('begin');
        if (!go) { e.target.textContent = 'Begin is missing on this page'; return; }
        onPick(s.sel); close(true); go.click(); return;
      }
      const g = e.target.closest('[data-i]');
      if (g) { pick(+g.dataset.i); return; }
      const shut = e.target.closest('[data-shut]');
      if (shut && look === 'porthole') { shown = +shut.dataset.shut; render(active); return; }
      if (e.target === sheet || e.target.classList.contains('sh-in')) close();
    }
    box.addEventListener('click', onTap);
    sheet.addEventListener('click', onTap);
    const onKey = (e) => {
      if (e.key === 'Escape' && isOpenNow()) { close(); return; }
      const g = e.target.closest?.('[data-i]');
      if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); pick(+g.dataset.i); }
    };
    box.addEventListener('keydown', onKey);
    sheet.addEventListener('keydown', onKey);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    document.addEventListener('pointerdown', (e) => { if (look === 'pip' && isOpenNow() && !box.contains(e.target)) close(true); });

    function render(a) {
      active = a;
      const S = star(), n = now();
      box.classList.toggle('on', active);
      if (look === 'pip') {
        const face = box.querySelector('.prog-face');
        face.classList.toggle('now', !S.lit);
        box.querySelector('.pf-word').textContent = S.T.word;
        box.querySelector('.pf-pips').innerHTML = S.lit ? '' : Array.from({ length: NEED }, (_, k) => `<i class="${k < S.done ? 'done' : ''}"></i>`).join('');
        box.querySelector('.prog-sky').innerHTML = rowSky(active);
        box.querySelector('.prog-k').textContent = `${S.level} · star ${S.i + 1} of ${N}`;
        box.querySelector('.prog-c').textContent = n < 0 ? 'all lit' : status(S.i);
      } else if (look === 'hairline') {
        let h = '';
        LADDER.forEach((L, i) => {
          const x = 8 + i * 11 + L.lvl * 6, c = ['hl-dot', s.lit[i] && 'lit', i === n && 'now', active && i === s.sel && 'sel'].filter(Boolean).join(' ');
          h += `<circle class="${c}" cx="${x}" cy="8" r="${i === n || (active && i === s.sel) ? 2.6 : 1.7}"/>`;
        });
        // The light that runs along the dots when the pill is tapped, and the ring from the current dot.
        const g = `<defs><linearGradient id="hl-g" gradientUnits="userSpaceOnUse" x1="-40" y1="0" x2="0" y2="0">
            <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.5" stop-color="#fff" stop-opacity="1"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
            <animateTransform class="hl-sweep" attributeName="gradientTransform" type="translate" from="-10 0" to="200 0" dur="0.6s" begin="indefinite" fill="freeze"/></linearGradient></defs>`;
        const top = h.replace(/class="hl-dot[^"]*"/g, 'class="hl-shine" fill="url(#hl-g)"');
        const cur = n < 0 ? null : 8 + n * 11 + LADDER[n].lvl * 6;
        h = g + h + top + (cur == null ? '' : `<circle class="hl-ping" cx="${cur}" cy="8" r="3"/>`);
        box.querySelector('.hl').innerHTML = h;
        sheet.querySelector('.prog-sky').innerHTML = climbSky(active, trailKind);
        syncSounds();
        sheet.querySelector('.sh-pick').textContent = `${S.T.word} · ${S.level} · ${S.min} minutes${S.eased ? ' · eased' : ''}`;
        sheet.querySelector('.sh-begin').textContent = document.getElementById('begin')?.textContent || 'Begin';
      } else {
        const step = 360 / N;
        let h = `<circle class="ph-rim" cx="22" cy="22" r="13"/>`;
        LADDER.forEach((_, i) => {
          const a = (-90 + (i + 0.5) * step) * Math.PI / 180, r0 = 16.5, r1 = 20;
          const c = ['ph-tick', s.lit[i] && 'lit', i === n && 'now', active && i === s.sel && 'sel'].filter(Boolean).join(' ');
          h += `<line class="${c}" x1="${22 + r0 * Math.cos(a)}" y1="${22 + r0 * Math.sin(a)}" x2="${22 + r1 * Math.cos(a)}" y2="${22 + r1 * Math.sin(a)}"/>`;
        });
        h += `<circle class="ph-glow" cx="22" cy="22" r="7"/><circle class="ph-core" cx="22" cy="22" r="2.4"/>`;
        box.querySelector('.ph').innerHTML = h;
        sheet.querySelector('.prog-sky').innerHTML = ringSky(active, shown);
        sheet.querySelector('.sh-hint').textContent = isOpen(shown) ? `${Spa.technique(LADDER[shown].id).sub || ''}` : 'Opens as the stars before it light.';
      }
    }

    build();
    return { render };
  }

  Spa.program = { LADDER, LEVELS, NEED, star, select, answer, mount, now, reset() { s = fresh(); save(); } };
})();
