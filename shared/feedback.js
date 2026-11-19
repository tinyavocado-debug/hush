/* A note in every room. The mark in the top corner opens a way to leave a note that
   belongs to the room it's in:
     Star    (Orbit, and the picker)  write a wish, hold, and it flies up into the sky as a star.
                                      Your own stars stay in Orbit's sky as a small constellation.
     Stones  (Pond)                   toss a stone (Love it / Something's off / An idea) into the
                                      water; a lily pad comes up for a few words if you like.
     Smoke   (Ember)                  write a line and let it drift; the letters curl off as smoke.
   Notes go through hushSend (shared/analytics.js) as the GoatCounter event
   "feedback/<where>/<text>" and are listed on the stats page. Nothing is sent from localhost:
   the ceremony still plays and says "Preview". If sending fails, the note stays and says why.
   In a session the mark only shows with the controls, in the top left. */
(() => {
  const where = (location.pathname.match(/\/(orbit|ember|pond)\//) || [, 'picker'])[1];
  const style = { orbit: 'star', picker: 'star', pond: 'stones', ember: 'smoke' }[where];
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DPR = Math.min(2, window.devicePixelRatio || 1);
  const MAX = 300;
  const rand = (a, b) => a + Math.random() * (b - a);
  const clean = (s) => s.trim().replace(/\s+/g, ' ');
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  const SERIF = "'Cormorant Garamond', 'Cormorant', Georgia, serif";

  const css = `
  .fb-entry { position: fixed; z-index: 6; top: calc(env(safe-area-inset-top, 0px) + 10px); right: calc(env(safe-area-inset-right, 0px) + 10px);
    width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; cursor: pointer; padding: 0;
    color: var(--ink, #efe6d8); border: 1px solid var(--line, rgba(239,230,216,.18)); background: var(--chip-on, rgba(239,230,216,.08));
    -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); transition: opacity .6s ease, transform .2s ease; -webkit-tap-highlight-color: transparent; }
  .fb-entry svg { width: 19px; height: 19px; fill: none; stroke: currentColor; stroke-width: 1.3; stroke-linecap: round; stroke-linejoin: round; }
  .fb-entry:active { transform: scale(.94); }
  .fb-entry:focus-visible { outline: 2px solid var(--ink, #efe6d8); outline-offset: 3px; }
  body[data-phase="session"] .fb-entry { opacity: 0; pointer-events: none; left: calc(env(safe-area-inset-left, 0px) + 10px); right: auto; }
  body[data-phase="session"] main.show-controls ~ .fb-entry { opacity: 1; pointer-events: auto; }

  /* While a note is open, the room's own screen steps back and only its scene stays. */
  body.fb-open main, body.fb-open .back, body.fb-open .breath-open, body.fb-open .fb-entry { opacity: 0 !important; pointer-events: none !important; transition: opacity .5s ease; }
  body.fb-open > header, body.fb-open > nav, body.fb-open > footer { visibility: hidden; }

  .fb-fx { position: fixed; inset: 0; width: 100%; height: 100%; z-index: 41; pointer-events: none; }
  .fb-sky { position: fixed; inset: 0; width: 100%; height: 100%; pointer-events: none; transition: opacity .6s ease; }
  body.fb-open .fb-sky { opacity: 0; }
  .fb-layer { position: fixed; inset: 0; z-index: 40; font-family: var(--sans, 'Jost', system-ui, sans-serif); font-weight: 300; color: var(--ink, #efe6d8);
    user-select: none; -webkit-user-select: none; animation: fb-in .5s ease both; }
  .fb-layer[hidden] { display: none; }
  @keyframes fb-in { from { opacity: 0; } }
  .fb-layer textarea, .fb-layer input { -webkit-user-select: text; user-select: text; }
  .fb-layer button { font: inherit; color: inherit; -webkit-tap-highlight-color: transparent; }
  .fb-layer button:focus-visible, .fb-layer textarea:focus-visible, .fb-layer input:focus-visible { outline: 2px solid var(--ink, #efe6d8); outline-offset: 3px; }
  .fb-quiet { background: none; border: 0; padding: 10px 14px; font-size: 11.5px !important; letter-spacing: .22em; text-transform: uppercase; opacity: .5; cursor: pointer; }
  .fb-label { margin: 0; font-size: 10.5px; letter-spacing: .3em; text-transform: uppercase; opacity: .55; padding-left: .3em; }
  .fb-status { margin: 0; min-height: 1.4em; font-size: 13px; line-height: 1.45; max-width: 30ch; text-align: center; color: #f0a890; }
  .fb-toast { position: fixed; z-index: 43; left: 50%; bottom: calc(env(safe-area-inset-bottom, 0px) + 44px); width: max-content; max-width: calc(100vw - 48px);
    transform: translate(-50%, 10px); opacity: 0; pointer-events: none; text-align: center; color: var(--ink, #efe6d8); margin: 0;
    font: italic 300 20px/1.3 ${SERIF}; text-shadow: 0 1px 12px rgba(0,0,0,.6); transition: opacity .8s ease, transform .8s ease; }
  .fb-toast.show { opacity: 1; transform: translate(-50%, 0); }
  .fb-col { position: absolute; left: 0; right: 0; display: grid; justify-items: center; gap: 14px; padding: 0 max(24px, env(safe-area-inset-left, 0px)); text-align: center; }
  .fb-col > * { max-width: 420px; }
  .fb-write { width: 100%; resize: none; border: 0; background: none; text-align: center; color: inherit; padding: 6px 4px;
    font: italic 300 25px/1.28 ${SERIF}; }
  .fb-write::placeholder { color: inherit; opacity: .4; }
  .fb-write:focus { outline: none; }
  .fb-write.nudge { animation: fb-nudge .5s ease; }
  @keyframes fb-nudge { 25% { transform: translateX(-6px); } 75% { transform: translateX(6px); } }

  /* Star */
  .fb-star { background: radial-gradient(120% 70% at 50% 30%, rgba(30, 22, 80, .45), rgba(4, 3, 12, .72)); }
  .fb-star.on-picker { background: radial-gradient(85% 50% at 50% 34%, #3b2a8a 0%, #1a1650 35%, #070618 75%, #04030c 100%); }
  .fb-star .fb-col { top: calc(env(safe-area-inset-top, 0px) + 31vh); }
  .fb-star .fb-write { height: 104px; color: #f6efff; caret-color: #ffe6b0; transform-origin: 50% -50px; }
  .fb-hold { display: flex; align-items: center; gap: 12px; padding: 8px 22px 8px 8px; border-radius: 999px; cursor: pointer; touch-action: none;
    border: 1px solid rgba(255, 236, 200, .3); background: rgba(10, 8, 30, .5); color: #fff1d6 !important; font-size: 13.5px !important; letter-spacing: .08em; }
  .fb-hold svg { width: 38px; height: 38px; transform: rotate(-90deg); }
  .fb-hold circle { fill: none; stroke-width: 2.5; }
  .fb-hold .track { stroke: rgba(255, 236, 200, .2); }
  .fb-hold .fill { stroke: #ffe6b0; stroke-dasharray: 100; stroke-dashoffset: calc(100 - var(--p, 0) * 100); stroke-linecap: round; }
  .fb-star.away .fb-label, .fb-star.away .fb-hold, .fb-star.away .fb-quiet, .fb-star.away .fb-status { opacity: 0; pointer-events: none; transition: opacity .4s ease; }

  /* Stones */
  .fb-stones { background: linear-gradient(180deg, rgba(4, 16, 14, .25), rgba(4, 16, 14, 0) 40%); }
  .fb-shore { position: absolute; left: 0; right: 0; bottom: 0; margin: 0 auto; max-width: 560px; text-align: center;
    padding: 20px 16px calc(env(safe-area-inset-bottom, 0px) + 22px); border-radius: 28px 28px 0 0;
    background: linear-gradient(180deg, rgba(58, 52, 42, .96), rgba(32, 29, 24, .98)); box-shadow: 0 -12px 40px rgba(0,0,0,.35);
    transform: translateY(105%); transition: transform .55s cubic-bezier(.2,.8,.2,1); }
  .fb-shore.up { transform: none; }
  .fb-shore .fb-hint { margin: 0 0 14px; font: italic 300 21px/1.2 ${SERIF}; }
  .fb-stone-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
  .fb-stone-btn { display: grid; justify-items: center; gap: 10px; padding: 8px 2px; border: 0; background: none; cursor: grab; touch-action: none; }
  .fb-stone-btn span { font-size: 11px; letter-spacing: .12em; text-transform: uppercase; opacity: .75; }
  .fb-stone { display: block; width: 58px; height: 46px; filter: drop-shadow(0 6px 6px rgba(0,0,0,.45)); pointer-events: none; }
  .fb-stone.love { border-radius: 52% 48% 50% 50% / 58% 56% 44% 42%; background: radial-gradient(circle at 36% 30%, #f1ece2, #c4bdb0 50%, #7d776c); }
  .fb-stone.off { width: 56px; height: 50px; background: radial-gradient(circle at 35% 30%, #8d9196, #5a5e63 55%, #33363a);
    clip-path: polygon(8% 30%, 26% 6%, 52% 14%, 70% 2%, 94% 24%, 88% 52%, 100% 74%, 72% 96%, 44% 86%, 18% 98%, 2% 70%, 12% 52%); }
  .fb-stone.idea { position: relative; border-radius: 46% 54% 48% 52% / 52% 48% 52% 48%;
    background: radial-gradient(circle at 30% 26%, rgba(255,255,255,.35), transparent 30%),
      radial-gradient(circle at 70% 60%, #3f4a52 0 2px, transparent 3px), radial-gradient(circle at 30% 70%, #3f4a52 0 1.5px, transparent 2.5px),
      radial-gradient(circle at 55% 30%, #3f4a52 0 1.5px, transparent 2.5px), radial-gradient(circle at 40% 40%, #a6b6b9, #6f8287 60%, #44545a); }
  .fb-stone.idea::after { content: ''; position: absolute; left: 18%; right: 22%; top: 48%; height: 2px; border-radius: 2px; transform: rotate(-14deg);
    background: #ffe6a6; box-shadow: 0 0 8px 2px rgba(255,214,120,.8), 0 0 18px 4px rgba(255,214,120,.35); animation: fb-seam 3.2s ease-in-out infinite; }
  @keyframes fb-seam { 50% { opacity: .55; } }
  .fb-flying { position: fixed; z-index: 42; left: 0; top: 0; pointer-events: none; will-change: transform; }
  .fb-leaf-wrap { position: absolute; left: 50%; width: min(300px, calc(100vw - 40px)); display: grid; justify-items: center; gap: 10px; transform: translateX(-50%); }
  .fb-leaf { position: relative; width: 100%; height: 66px; display: flex; align-items: center; padding: 0 26px 0 30px;
    border-radius: 56px 6px 56px 6px; background: radial-gradient(120% 140% at 30% 30%, #77a462, #4f7a43 60%, #3b6234);
    box-shadow: 4px 8px 14px rgba(2,12,10,.45); animation: fb-leaf .9s cubic-bezier(.2,.8,.2,1) both; }
  .fb-leaf::before { content: ''; position: absolute; left: 14px; right: 14px; top: 50%; height: 1px; background: rgba(220,240,200,.22); transform: rotate(-8deg); }
  @keyframes fb-leaf { from { transform: translateY(26px) rotate(-14deg) scale(.6); opacity: 0; } }
  .fb-leaf input { position: relative; width: 100%; border: 0; background: none; color: #f4f8ec; caret-color: #f4f8ec; font: italic 400 19px/1 ${SERIF}; }
  .fb-leaf input::placeholder { color: rgba(244,248,236,.62); }
  .fb-leaf input:focus { outline: none; }
  .fb-leaf-actions { display: flex; gap: 8px; animation: fb-leaf .9s .15s cubic-bezier(.2,.8,.2,1) both; }
  .fb-pill { border-radius: 999px; padding: 10px 17px; font-size: 13.5px !important; cursor: pointer; border: 1px solid rgba(232,239,228,.28); background: rgba(5,20,18,.55); color: #e8efe4 !important; }
  .fb-pill.solid { background: #e8efe4; color: #10302b !important; border-color: #e8efe4; }
  .fb-pill:disabled { opacity: .5; }

  /* Smoke */
  .fb-smoke { background: linear-gradient(180deg, rgba(12, 7, 5, .7), rgba(12, 7, 5, .35) 55%, rgba(12, 7, 5, 0)); }
  .fb-smoke .fb-col { top: calc(env(safe-area-inset-top, 0px) + 12vh); }
  .fb-smoke .fb-write { height: 120px; color: #f1e2cc; caret-color: #ffb066; border-bottom: 1px solid rgba(241,226,204,.25); }
  .fb-smoke .fb-write:focus { border-bottom-color: rgba(255,176,102,.6); }
  .fb-drift { border-radius: 999px; padding: 12px 24px; cursor: pointer; border: 0; color: #2a140b !important; font-size: 14px !important; letter-spacing: .06em;
    background: linear-gradient(180deg, #f0b878, #c8763f); box-shadow: 0 8px 26px rgba(232,130,60,.25); }
  .fb-drift:disabled { opacity: .6; }
  .fb-keys { margin: -6px 0 0; font-size: 11.5px; opacity: .5; }
  .fb-smoke.away .fb-col { opacity: 0; transition: opacity .3s ease; }

  @media (prefers-reduced-motion: reduce) { .fb-layer, .fb-layer *, .fb-layer *::after { animation: none !important; transition-duration: .2s !important; } }
  `;

  const ICON = {
    star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5c.6 4.6 3.9 7.9 8.5 8.5-4.6.6-7.9 3.9-8.5 8.5-.6-4.6-3.9-7.9-8.5-8.5 4.6-.6 7.9-3.9 8.5-8.5z"/></svg>',
    stones: '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="18.2" rx="7.2" ry="3"/><ellipse cx="12" cy="12.4" rx="5" ry="2.4"/><ellipse cx="12" cy="7.4" rx="3" ry="1.9"/></svg>',
    smoke: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21.5v-6"/><path d="M12 13c-2.5-1.6-2.5-3.6 0-5.2s2.5-3.6 0-5.3"/><path d="M15.5 11.5c-1.4-1-1.4-2.2 0-3.2" opacity=".55"/></svg>',
  };
  const LABEL = { star: 'Send a wish to the stars', stones: 'Toss a stone with a note', smoke: 'Write a note to the smoke' };
  const THANKS = { star: 'Your star is in the sky. Thank you.', stones: 'The pond has it. Thank you.', smoke: 'Carried off on the smoke. Thank you.' };
  const PREVIEW = 'Preview: notes aren\'t sent from localhost.';
  const FAILED = 'Couldn\'t send. An ad or tracker blocker, or being offline, can stop it. Your note is still here.';

  /* ───── sending ───── */
  // Resolves 'sent' or 'preview' (localhost); rejects if it couldn't get through.
  async function send(note) {
    note = note.slice(0, MAX);
    if (!window.hushSend) throw new Error('analytics.js missing');
    try {
      await Promise.race([
        window.hushSend(`feedback/${where}/${note.replace(/\s+/g, ' ')}`, note),
        new Promise((_, no) => setTimeout(() => no(new Error('timeout')), 8000)),
      ]);
      return 'sent';
    } catch (e) {
      if (e.local) return 'preview';
      throw e;
    }
  }

  /* ───── the effects canvas: one loop that runs only while something moves ───── */
  let fx, fctx, W = 0, H = 0, sky = null;
  const actors = new Set();
  let running = false, last = 0;
  function fit() {
    W = innerWidth; H = innerHeight;
    for (const c of [fx, sky?.canvas]) {
      if (!c) continue;
      c.width = Math.round(W * DPR); c.height = Math.round(H * DPR);
      c.getContext('2d').setTransform(DPR, 0, 0, DPR, 0, 0);
    }
  }
  function kick() { if (!running) { running = true; last = performance.now(); requestAnimationFrame(loop); } }
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000), t = now / 1000; last = now;
    fctx.clearRect(0, 0, W, H);
    for (const a of actors) if (a(fctx, dt, t) === false) actors.delete(a);
    if (actors.size) requestAnimationFrame(loop); else { running = false; fctx.clearRect(0, 0, W, H); }
  }
  const add = (a) => { actors.add(a); kick(); };

  let toastT;
  function toast(msg) {
    const el = document.querySelector('.fb-toast');
    el.textContent = msg; el.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 3800);
  }

  /* ───── open and close ───── */
  let layer, entry, impl, lastFocus;
  function open() {
    if (!layer.hidden) return;
    lastFocus = document.activeElement;
    document.body.classList.add('fb-open');
    layer.hidden = false; layer.classList.remove('away');
    impl.open();
  }
  function close() {
    if (layer.hidden) return;
    impl.close?.();
    layer.hidden = true;
    document.body.classList.remove('fb-open');
    const back = lastFocus && document.contains(lastFocus) && lastFocus !== document.body ? lastFocus : entry;
    back.focus?.({ preventScroll: true });
  }

  /* ═════════ Star ═════════ */
  function sparkle(ctx, x, y, r, a, glow) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * glow);
    g.addColorStop(0, `rgba(255,236,200,${0.55 * a})`); g.addColorStop(0.4, `rgba(200,180,255,${0.14 * a})`); g.addColorStop(1, 'rgba(200,180,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * glow, 0, 7); ctx.fill();
    ctx.fillStyle = `rgba(255,248,232,${a})`; ctx.beginPath();
    for (let i = 0; i < 8; i++) { const ang = i * Math.PI / 4 - Math.PI / 2, rr = i % 2 ? r * 0.22 : r; ctx.lineTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr); }
    ctx.closePath(); ctx.fill();
  }
  // Your own stars, kept in this browser as fractions of the screen, newest last.
  const SKY_KEY = 'hush.fb.stars';
  const mine = (store.get(SKY_KEY) || []).filter((s) => s && isFinite(s.x) && isFinite(s.y)).slice(-24);
  function drawConstellation(ctx, t) {
    ctx.lineWidth = 0.8;
    for (let i = 1; i < mine.length; i++) {
      const a = mine[i - 1], b = mine[i], k = b.born ? Math.min(1, Math.max(0, (t - b.born - 0.2) / 1.2)) : 1;
      if (k <= 0) continue;
      const ax = a.x * W, ay = a.y * H, bx = b.x * W, by = b.y * H;
      ctx.strokeStyle = 'rgba(255,226,180,.2)'; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + (bx - ax) * k, ay + (by - ay) * k); ctx.stroke();
    }
    for (const s of mine) {
      const flash = s.born ? Math.max(0, 1 - (t - s.born) / 1.6) : 0;
      sparkle(ctx, s.x * W, s.y * H, 3 + flash * 9, 0.7 + 0.3 * Math.sin(t * 0.9 + (s.ph ??= rand(0, 6))), 5 + flash * 3);
    }
  }
  // In Orbit your stars stay in the sky, in front of the room's scene and behind its screen.
  function setupSky() {
    const scene = document.getElementById('scene');
    if (where !== 'orbit' || !scene) return;
    const under = document.querySelector('.vignette') || document.querySelector('.dusk') || scene; // above the room's shading, below its screen
    const canvas = document.createElement('canvas');
    canvas.className = 'fb-sky'; canvas.setAttribute('aria-hidden', 'true');
    under.after(canvas);
    sky = { canvas, ctx: canvas.getContext('2d') };
    const draw = (now) => {
      sky.ctx.clearRect(0, 0, W, H);
      if (mine.length) drawConstellation(sky.ctx, REDUCED ? 0 : now / 1000);
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  }

  function starImpl() {
    const onPicker = where === 'picker';
    layer.classList.add('fb-star'); if (onPicker) layer.classList.add('on-picker');
    layer.innerHTML = `<div class="fb-col" role="dialog" aria-modal="true" aria-label="Make a wish on a star">
      <p class="fb-label">Make a wish on a star</p>
      <textarea class="fb-write" maxlength="${MAX}" placeholder="What would make Hush better?" aria-label="Your wish"></textarea>
      <p class="fb-status" role="status"></p>
      <button class="fb-hold" type="button"><svg viewBox="0 0 40 40" aria-hidden="true"><circle class="track" cx="20" cy="20" r="15.9" pathLength="100"/><circle class="fill" cx="20" cy="20" r="15.9" pathLength="100"/></svg><span>Hold to send it up</span></button>
      <button class="fb-quiet" type="button">Not now</button></div>`;
    const q = (s) => layer.querySelector(s), text = q('.fb-write'), hold = q('.fb-hold'), status = q('.fb-status'), label = q('.fb-label');
    const bg = onPicker ? Array.from({ length: 140 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() < 0.15 ? 2 : 1.2, a: rand(0.25, 0.9), sp: rand(0.4, 1.6), ph: rand(0, 6) })) : [];
    let star = null, trail = [], holdRaf = 0, busy = false;
    const anchor = () => { const r = label.getBoundingClientRect(); return { x: W / 2, y: r.top - 46 }; };
    const setP = (p) => {
      hold.style.setProperty('--p', p);
      if (star) star.charge = p;
      text.style.opacity = 1 - p * 0.95;
      text.style.transform = p ? `translateY(${-p * 70}px) scale(${1 - p * 0.75})` : '';
    };
    // Draws while the note is open, and until a star has landed.
    const actor = (ctx, dt, t) => {
      if (onPicker && !layer.hidden) for (const s of bg) { ctx.fillStyle = `rgba(255,255,255,${s.a * (0.55 + 0.45 * Math.sin(t * s.sp + s.ph))})`; ctx.fillRect(s.x * W, s.y * H, s.r, s.r); }
      if (!layer.hidden || star) drawConstellation(ctx, t);
      trail = trail.filter((p) => (p.life -= dt) > 0);
      for (const p of trail) { ctx.fillStyle = `rgba(255,236,200,${p.life * 0.9})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * p.life * 1.6, 0, 7); ctx.fill(); }
      if (star?.mode === 'wait') {
        const a = anchor(), breath = 0.5 + 0.5 * Math.sin(t * 0.63);
        star.x = a.x; star.y = a.y;
        sparkle(ctx, a.x, a.y, 7 + breath * 1.5 + star.charge * 10, 0.8 + 0.2 * breath, 6 + star.charge * 4);
      } else if (star?.mode === 'fly') {
        const k = Math.min(1, (t - (star.t0 ??= t)) / star.dur), e = 1 - Math.pow(1 - k, 3);
        const tx = star.to.x * W, ty = star.to.y * H, cx = (star.x + tx) / 2 + star.bend, cy = Math.min(star.y, ty) - 40;
        const x = (1 - e) ** 2 * star.x + 2 * (1 - e) * e * cx + e * e * tx, y = (1 - e) ** 2 * star.y + 2 * (1 - e) * e * cy + e * e * ty;
        if (!REDUCED) for (let i = 0; i < 3; i++) trail.push({ x: x + rand(-2, 2), y: y + rand(-2, 2), r: rand(0.8, 2), life: rand(0.4, 0.9) });
        sparkle(ctx, x, y, 17 - 12 * e, 1, 9 - 3 * e);
        if (k >= 1) {
          const done = star.done; star = null;
          mine.push({ ...done.to, born: t }); store.set(SKY_KEY, mine.map(({ x, y }) => ({ x, y })));
          done.fn();
        }
      }
      return !layer.hidden || !!star || trail.length > 0;
    };
    const nudge = () => { text.classList.remove('nudge'); void text.offsetWidth; text.classList.add('nudge'); text.focus(); };
    function nextSpot() { // near your last star so they join up, in the band above the dial
      const lastS = mine.at(-1) || { x: rand(0.25, 0.75), y: 0.14 };
      for (let i = 0; i < 40; i++) {
        const a = rand(0, Math.PI * 2), d = rand(50, 85);
        const x = lastS.x + (Math.cos(a) * d) / W, y = lastS.y + (Math.sin(a) * d * 0.7) / H;
        if (x > 0.08 && x < 0.92 && y > 0.07 && y < 0.24 && mine.every((s) => Math.hypot((s.x - x) * W, (s.y - y) * H) > 40)) return { x, y };
      }
      return { x: rand(0.1, 0.9), y: rand(0.07, 0.24) };
    }
    async function release() {
      cancelAnimationFrame(holdRaf);
      const note = clean(text.value);
      if (!note || busy || !star) return;
      busy = true; setP(1); status.textContent = '';
      let result;
      try { result = await send(note); } catch {
        busy = false; setP(0); status.textContent = FAILED; return;
      }
      text.blur(); layer.classList.add('away');
      const to = nextSpot();
      Object.assign(star, { mode: 'fly', dur: REDUCED ? 0.3 : 1.5, to, bend: rand(-60, 60),
        done: { to, fn: () => { text.value = ''; busy = false; setTimeout(() => { close(); toast(result === 'sent' ? THANKS.star : PREVIEW); }, 500); } } });
      add(actor); // keep drawing past close, until it lands
    }
    function startHold(e) {
      if (busy) return;
      if (!clean(text.value)) { nudge(); return; }
      try { hold.setPointerCapture(e.pointerId); } catch {}
      const t0 = performance.now(), need = REDUCED ? 300 : 1200;
      const step = (now) => { const p = Math.min(1, (now - t0) / need); setP(p); if (p < 1) holdRaf = requestAnimationFrame(step); else release(); };
      holdRaf = requestAnimationFrame(step);
    }
    hold.addEventListener('pointerdown', startHold);
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => hold.addEventListener(ev, () => { cancelAnimationFrame(holdRaf); if (!busy) setP(0); }));
    hold.addEventListener('click', (e) => { if (e.detail === 0) clean(text.value) ? release() : nudge(); }); // keyboard: no need to hold
    q('.fb-quiet').addEventListener('click', close);
    text.addEventListener('input', () => { status.textContent = ''; });
    return {
      open() { star = { mode: 'wait', charge: 0, x: W / 2, y: H * 0.3 }; busy = false; setP(0); status.textContent = ''; add(actor); setTimeout(() => text.focus({ preventScroll: true }), 350); },
      close() { cancelAnimationFrame(holdRaf); if (star?.mode === 'wait') star = null; if (!star) setP(0); },
    };
  }

  /* ═════════ Stones ═════════ */
  function stonesImpl() {
    const KIND = { love: 'Love it', off: 'Something\'s off', idea: 'Idea' };
    const ASK = { love: 'What do you love?', off: 'What went wrong?', idea: 'What\'s your idea?' };
    layer.classList.add('fb-stones');
    layer.innerHTML = `<div class="fb-shore" role="dialog" aria-modal="true" aria-label="Toss a stone into the pond">
      <p class="fb-hint">Toss a stone into the pond</p>
      <div class="fb-stone-row">${Object.entries({ love: 'Love it', off: 'Something\'s off', idea: 'An idea' }).map(([k, n]) =>
        `<button class="fb-stone-btn" type="button" data-kind="${k}"><i class="fb-stone ${k}"></i><span>${n}</span></button>`).join('')}</div>
      <button class="fb-quiet" type="button">Not now</button></div>`;
    const shore = layer.querySelector('.fb-shore');
    let ripples = [], drops = [], busy = false, leafBox = null;
    const actor = (ctx, dt, t) => {
      ripples = ripples.filter((r) => t - (r.t0 ??= t + r.delay) < r.life);
      for (const r of ripples) {
        const age = t - r.t0; if (age < 0) continue;
        const k = age / r.life, rad = 6 + k * r.max;
        ctx.strokeStyle = `rgba(214,236,226,${0.55 * (1 - k)})`; ctx.lineWidth = 1.4 * (1 - k) + 0.4;
        ctx.beginPath(); ctx.ellipse(r.x, r.y, rad, rad * 0.92, 0, 0, 7); ctx.stroke();
      }
      drops = drops.filter((d) => (d.life -= dt) > 0);
      for (const d of drops) {
        d.vy += 420 * dt; d.x += d.vx * dt; d.y += d.vy * dt;
        ctx.fillStyle = `rgba(220,240,232,${Math.min(1, d.life * 2)})`; ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, 7); ctx.fill();
      }
      return ripples.length > 0 || drops.length > 0;
    };
    const tf = (x, y, s) => `translate(${x - 29}px, ${y - 23}px) scale(${s})`;
    const centre = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
    function flyer(src) {
      const c = centre(src), f = src.cloneNode(true);
      f.classList.add('fb-flying'); document.body.appendChild(f);
      f.style.transform = tf(c.x, c.y, 1.12); src.style.opacity = 0;
      return { f, c };
    }
    function toss(f, x0, y0, kind, src) {
      busy = true; shore.classList.remove('up');
      const x1 = W / 2, y1 = H * 0.42;
      const frames = Array.from({ length: 11 }, (_, i) => { const k = i / 10, arc = Math.sin(k * Math.PI) * Math.min(160, H * 0.18); return { transform: tf(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k - arc, 1.12 - 0.3 * k) }; });
      f.animate(frames, { duration: REDUCED ? 150 : 650, easing: 'cubic-bezier(.3,.1,.5,1)', fill: 'forwards' }).onfinish = () => drop(f, x1, y1, kind, src);
    }
    function drop(f, x, y, kind, src) {
      busy = true; shore.classList.remove('up');
      f.animate([{ transform: tf(x, y, 1), opacity: 1 }, { transform: tf(x, y + 6, 0.35), opacity: 0 }], { duration: 260, easing: 'ease-in', fill: 'forwards' }).onfinish = () => {
        f.remove(); src.style.opacity = 1;
        if (layer.hidden) return; // closed mid-throw
        for (let i = 0; i < 4; i++) ripples.push({ x, y, delay: i * 0.32, life: 3, max: 70 + i * 12 });
        if (!REDUCED) for (let i = 0; i < 14; i++) { const a = rand(-Math.PI, 0), v = rand(60, 150); drops.push({ x, y, vx: Math.cos(a) * v * 0.7, vy: Math.sin(a) * v * 1.4, r: rand(1, 2.2), life: rand(0.4, 0.8) }); }
        add(actor);
        setTimeout(() => { if (!layer.hidden) leaf(y, kind); }, REDUCED ? 100 : 650);
      };
    }
    function leaf(y, kind) {
      leafBox = document.createElement('div');
      leafBox.className = 'fb-leaf-wrap';
      leafBox.style.top = `${Math.max(100, Math.min(H - 220, y + 34))}px`;
      leafBox.innerHTML = `<div class="fb-leaf"><input maxlength="${MAX}" placeholder="${ASK[kind]} (optional)" aria-label="Add a few words (optional)"></div>
        <p class="fb-status" role="status"></p>
        <div class="fb-leaf-actions"><button class="fb-pill" type="button" data-a="skip">Just the stone</button><button class="fb-pill solid" type="button" data-a="send">Send</button></div>`;
      layer.appendChild(leafBox);
      const box = leafBox, input = box.querySelector('input'), status = box.querySelector('.fb-status');
      setTimeout(() => input.focus({ preventScroll: true }), 300);
      let sending = false;
      const finish = async (words) => {
        if (sending) return; sending = true;
        box.querySelectorAll('.fb-pill').forEach((b) => (b.disabled = true)); status.textContent = '';
        let result;
        try { result = await send(words ? `${KIND[kind]}: ${words}` : KIND[kind]); } catch {
          status.textContent = FAILED; box.querySelectorAll('.fb-pill').forEach((b) => (b.disabled = false)); sending = false; return;
        }
        box.querySelector('.fb-leaf-actions').remove(); status.remove(); input.blur();
        box.animate([{ transform: 'translateX(-50%)', opacity: 1 }, { transform: 'translate(10%, -40px) rotate(16deg)', opacity: 0 }],
          { duration: REDUCED ? 200 : 1800, easing: 'ease-in', fill: 'forwards' }).onfinish = () => close();
        toast(result === 'sent' ? THANKS.stones : PREVIEW);
      };
      box.addEventListener('click', (e) => { const a = e.target.closest('[data-a]')?.dataset.a; if (a) finish(a === 'send' ? clean(input.value) : ''); });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(clean(input.value)); });
    }
    layer.querySelectorAll('.fb-stone-btn').forEach((btn) => {
      let fly = null, start = null, moved = false;
      const src = btn.querySelector('.fb-stone');
      btn.addEventListener('pointerdown', (e) => {
        if (busy) return;
        try { btn.setPointerCapture(e.pointerId); } catch {}
        start = { x: e.clientX, y: e.clientY }; moved = false; fly = flyer(src);
      });
      btn.addEventListener('pointermove', (e) => {
        if (!fly) return;
        const dx = e.clientX - start.x, dy = e.clientY - start.y;
        if (Math.hypot(dx, dy) > 6) moved = true;
        fly.f.style.transform = tf(fly.c.x + dx, fly.c.y + dy, 1.12);
      });
      const end = (e) => {
        if (!fly) return;
        const { f, c } = fly; fly = null;
        if (e.type === 'pointercancel') { f.remove(); src.style.opacity = 1; return; }
        const x = c.x + (e.clientX - start.x), y = c.y + (e.clientY - start.y);
        if (!moved) toss(f, c.x, c.y, btn.dataset.kind, src); // a tap throws it for you
        else if (y < shore.getBoundingClientRect().top - 10) drop(f, x, y, btn.dataset.kind, src);
        else f.animate([{ transform: f.style.transform }, { transform: tf(c.x, c.y, 1) }], { duration: 250, easing: 'ease-out' }).onfinish = () => { f.remove(); src.style.opacity = 1; };
      };
      btn.addEventListener('pointerup', end); btn.addEventListener('pointercancel', end);
      btn.addEventListener('keydown', (e) => { // keyboard: Enter or Space throws it
        if ((e.key !== 'Enter' && e.key !== ' ') || busy) return;
        e.preventDefault(); const { f, c } = flyer(src); toss(f, c.x, c.y, btn.dataset.kind, src);
      });
    });
    layer.querySelector('.fb-quiet').addEventListener('click', close);
    return {
      open() { busy = false; requestAnimationFrame(() => shore.classList.add('up')); setTimeout(() => layer.querySelector('.fb-stone-btn').focus({ preventScroll: true }), 400); },
      close() { shore.classList.remove('up'); leafBox?.remove(); leafBox = null; busy = false; document.querySelectorAll('.fb-flying').forEach((f) => f.remove()); layer.querySelectorAll('.fb-stone').forEach((s) => (s.style.opacity = 1)); },
    };
  }

  /* ═════════ Smoke ═════════ */
  function smokeImpl() {
    layer.classList.add('fb-smoke');
    layer.innerHTML = `<div class="fb-col" role="dialog" aria-modal="true" aria-label="Say it to the smoke">
      <p class="fb-label">Say it to the smoke</p>
      <textarea class="fb-write" maxlength="${MAX}" placeholder="What would make Hush better?" aria-label="Your note"></textarea>
      <p class="fb-status" role="status"></p>
      <button class="fb-drift" type="button">Let it drift</button>
      <p class="fb-keys">or press Return</p>
      <button class="fb-quiet" type="button">Not now</button></div>`;
    const q = (s) => layer.querySelector(s), text = q('.fb-write'), status = q('.fb-status'), drift = q('.fb-drift');
    let letters = [], puffs = [];
    const FONT = `italic 300 25px ${SERIF}`;
    const actor = (ctx, dt) => {
      puffs = puffs.filter((p) => (p.age += dt) < p.life);
      for (const p of puffs) {
        const k = p.age / p.life, x = p.x + Math.sin(p.age * 1.1 + p.seed) * p.age * 7, y = p.y - p.age * 14, r = 3 + p.age * 6;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r), a = 0.12 * Math.sin(Math.PI * Math.min(1, k * 1.2));
        g.addColorStop(0, `rgba(226,214,200,${a})`); g.addColorStop(1, 'rgba(226,214,200,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
      }
      letters = letters.filter((l) => (l.age += dt) < l.life);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = FONT;
      for (const l of letters) {
        const a0 = Math.max(0, l.age - l.delay), k = a0 / (l.life - l.delay);
        const x = l.x + Math.sin(a0 * 1.3 + l.seed) * a0 * 9 + l.vx * a0, y = l.y - a0 * l.vy - a0 * a0 * 3;
        const alpha = a0 ? Math.max(0, 1 - k * 1.15) : 1, blur = Math.min(16, a0 * 8);
        ctx.save(); ctx.translate(x, y); ctx.rotate(l.rot * a0); ctx.scale(1 + blur * 0.03, 1 + blur * 0.03);
        ctx.shadowColor = `rgba(230,220,205,${alpha})`; ctx.shadowBlur = blur;
        ctx.fillStyle = `rgba(241,226,204,${alpha * (1 - blur / 26)})`; ctx.fillText(l.ch, 0, 0); ctx.restore();
        if (!l.puffed && k > 0.35) { l.puffed = true; puffs.push({ x, y, age: 0, life: 4, seed: l.seed }); }
      }
      return letters.length > 0 || puffs.length > 0;
    };
    async function go() {
      const note = clean(text.value);
      if (!note) { text.classList.remove('nudge'); void text.offsetWidth; text.classList.add('nudge'); text.focus(); return; }
      if (drift.disabled) return;
      drift.disabled = true; status.textContent = '';
      let result;
      try { result = await send(note); } catch { drift.disabled = false; status.textContent = FAILED; return; }
      // lay the words out where the box is, then set each letter loose
      const r = text.getBoundingClientRect(), maxW = r.width - 12;
      fctx.font = FONT;
      const lines = []; let line = '';
      for (const word of note.split(' ')) { const tryL = line ? `${line} ${word}` : word; if (fctx.measureText(tryL).width > maxW && line) { lines.push(line); line = word; } else line = tryL; }
      lines.push(line);
      const shown = lines.slice(0, 7), lh = 32, top = r.top + r.height / 2 - ((shown.length - 1) * lh) / 2;
      let n = 0;
      shown.forEach((ln, li) => {
        let cx = W / 2 - fctx.measureText(ln).width / 2;
        for (const ch of ln) {
          const cw = fctx.measureText(ch).width, d = REDUCED ? 0 : 0.2 + Math.min(n, 120) * 0.03 + rand(0, 0.15);
          if (ch !== ' ') letters.push({ ch, x: cx + cw / 2, y: top + li * lh, age: 0, delay: d, life: d + (REDUCED ? 1 : rand(3.2, 4.4)), seed: rand(0, 6), vx: rand(-6, 6), vy: rand(22, 38), rot: rand(-0.5, 0.5) });
          cx += cw; n++;
        }
      });
      add(actor);
      layer.classList.add('away');
      setTimeout(() => { text.value = ''; drift.disabled = false; close(); }, 300);
      setTimeout(() => toast(result === 'sent' ? THANKS.smoke : PREVIEW), REDUCED ? 200 : 1800);
    }
    drift.addEventListener('click', go);
    text.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); go(); } });
    text.addEventListener('input', () => { status.textContent = ''; });
    q('.fb-quiet').addEventListener('click', close);
    return { open() { status.textContent = ''; setTimeout(() => text.focus({ preventScroll: true }), 250); } };
  }

  /* ───── setup ───── */
  function init() {
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    document.body.insertAdjacentHTML('beforeend',
      `<button type="button" class="fb-entry" aria-label="${LABEL[style]}">${ICON[style]}</button>
       <div class="fb-layer" hidden></div>
       <canvas class="fb-fx" aria-hidden="true"></canvas>
       <p class="fb-toast" role="status" aria-live="polite"></p>`);
    entry = document.querySelector('.fb-entry'); layer = document.querySelector('.fb-layer');
    fx = document.querySelector('.fb-fx'); fctx = fx.getContext('2d');
    setupSky(); fit(); addEventListener('resize', fit);
    impl = { star: starImpl, stones: stonesImpl, smoke: smokeImpl }[style]();
    entry.addEventListener('click', open);
    layer.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') close(); }); // Space in the text mustn't pause a session
    window.hushFeedback = { open };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
