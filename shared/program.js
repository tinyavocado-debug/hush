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

  /* ───────── the row of stars ───────── */
  // Stars climb from bottom left (beginner) to top right (expert), with a gap between levels.
  const W = 360, H = 96;
  const WOB = [6, -6, 4, -4, 6, -6, 4, -4, 6, -6, 4, -4];
  const POS = LADDER.map((L, i) => [20 + i * 27 + L.lvl * 11, 72 - i * 4.6 + WOB[i]]);
  const SPECKS = Array.from({ length: 24 }, (_, k) => [(k * 97) % W, (k * 53) % H, (k % 3) * 0.25 + 0.3, 0.06 + (k % 4) * 0.03]);

  function mount(host, onPick) {
    const box = document.createElement('div');
    box.className = 'prog';
    box.innerHTML = `<svg class="prog-sky" viewBox="0 0 ${W} ${H}" role="radiogroup" aria-label="Program"></svg>
      <p class="prog-line"><span class="prog-k"></span><span class="prog-w"></span><span class="prog-c"></span></p>`;
    host.prepend(box);
    const svg = box.querySelector('svg');
    svg.addEventListener('click', (e) => {
      const g = e.target.closest('[data-i]');
      if (g) onPick(+g.dataset.i);
    });
    svg.addEventListener('keydown', (e) => {
      const g = e.target.closest('[data-i]');
      if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onPick(+g.dataset.i); }
    });
    box.querySelector('.prog-line').addEventListener('click', () => onPick(s.sel));

    function render(active) {
      const n = now();
      box.classList.toggle('on', active);
      let h = SPECKS.map(([x, y, r, o]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" opacity="${o}"/>`).join('');
      for (let i = 0; i < N - 1; i++) {
        const [a, b] = [POS[i], POS[i + 1]];
        h += `<line class="prog-link${s.lit[i] ? '' : ' dim'}" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}"/>`;
      }
      LADDER.forEach((L, i) => {
        const [x, y] = POS[i], open = isOpen(i), sel = active && i === s.sel;
        const cls = ['prog-star', s.lit[i] && 'lit', i === n && 'now', sel && 'sel', s.eased[i] && 'eased'].filter(Boolean).join(' ');
        let pips = '';
        if (i === n || sel) for (let k = 0; k < NEED; k++) pips += `<circle class="prog-pip${s.lit[i] || k < s.done[i] ? ' done' : ''}" cx="${x - 7 + k * 7}" cy="${y + 13}" r="2"/>`;
        h += `<g class="${cls}" ${open ? `data-i="${i}" role="radio" tabindex="0" aria-checked="${sel}" aria-label="${word(i)}, ${LEVELS[L.lvl]}"` : 'aria-hidden="true"'}>
          <circle class="prog-halo" cx="${x}" cy="${y}" r="13"/><circle class="prog-core" cx="${x}" cy="${y}" r="${open ? 4 : 2.6}"/>${pips}
          <circle cx="${x}" cy="${y}" r="14" fill="transparent"/></g>`;
      });
      svg.innerHTML = h;
      const S = star();
      box.querySelector('.prog-k').textContent = active ? `${S.level} · star ${S.i + 1} of ${N}` : 'Program';
      box.querySelector('.prog-w').textContent = S.T.word;
      box.querySelector('.prog-c').textContent = active
        ? (S.eased ? 'eased' : S.lit ? 'lit' : `${S.done} of ${NEED}`)
        : (n < 0 ? 'all lit' : 'tap to start');
    }
    return { render };
  }

  Spa.program = { LADDER, LEVELS, NEED, star, select, answer, mount, now, reset() { s = fresh(); save(); } };
})();
