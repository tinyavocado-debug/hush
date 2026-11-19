/* Feedback on every screen: an entry button plus a small form, sent through hushSend
   (shared/analytics.js) as the GoatCounter event "feedback/<where>/<text>".
   Three trial looks, switchable on localhost (or with ?fb=bubble|quick|edge):
     bubble  a round icon in the corner, opens a centred card
     quick   a "Feedback" pill in the corner, opens a bottom sheet with three one-tap choices
     edge    a slim tab on the right edge, opens a drawer from the side
   In a session the entry only shows with the controls, like the breath button. */
(() => {
  const VARIANTS = { bubble: 'Bubble', quick: 'Quick', edge: 'Edge' };
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  };
  const LOCAL = /(localhost$|^127\.|^10\.|^172\.(1[6-9]|2[0-9]|3[0-1])\.|^192\.168\.|^0\.0\.0\.0$|^\[::1\]$)/;
  const isLocal = location.protocol === 'file:' || LOCAL.test(location.hostname);
  const where = (location.pathname.match(/\/(orbit|ember|pond)\//) || [, 'picker'])[1];
  const param = new URLSearchParams(location.search).get('fb');
  let variant = VARIANTS[param] ? param : VARIANTS[store.get('hush.fb.variant')] ? store.get('hush.fb.variant') : 'bubble';

  const css = `
  .fb-entry { position: fixed; z-index: 6; color: var(--ink, #efe6d8); font-family: var(--sans, system-ui, sans-serif);
    border: 1px solid var(--line, rgba(239,230,216,.18)); background: var(--chip-on, rgba(239,230,216,.1));
    -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); cursor: pointer;
    transition: opacity .6s ease, transform .6s ease; -webkit-tap-highlight-color: transparent; }
  .fb-entry svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }
  .fb-entry:focus-visible { outline: 2px solid var(--ink, #efe6d8); outline-offset: 3px; }
  .fb-corner { top: calc(env(safe-area-inset-top, 0px) + 10px); right: calc(env(safe-area-inset-right, 0px) + 10px); }
  .fb-bubble { width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; color: var(--ink-soft, rgba(239,230,216,.72)); }
  .fb-pill { height: 36px; padding: 0 14px 0 11px; border-radius: 999px; display: flex; align-items: center; gap: 7px;
    font-size: 10.5px; letter-spacing: .22em; text-transform: uppercase; }
  .fb-pill svg { width: 15px; height: 15px; }
  .fb-edge { right: 0; top: 50%; transform: translateY(-50%); padding: 16px 7px; border-right: 0; border-radius: 12px 0 0 12px;
    writing-mode: vertical-rl; font-size: 10px; letter-spacing: .26em; text-transform: uppercase; color: var(--ink-soft, rgba(239,230,216,.72)); }
  .fb-edge span { transform: rotate(180deg); }
  /* In a session: hidden until the controls show; corner entries take the back arrow's spot (top left). */
  body[data-phase="session"] .fb-entry { opacity: 0; pointer-events: none; }
  body[data-phase="session"] main.show-controls ~ .fb-entry { opacity: 1; pointer-events: auto; }
  body[data-phase="session"] .fb-corner { right: auto; left: calc(env(safe-area-inset-left, 0px) + 10px); }

  dialog.fb { color: var(--ink, #efe6d8); font-family: var(--sans, system-ui, sans-serif); font-weight: 300;
    background: rgba(24, 21, 19, .9); -webkit-backdrop-filter: blur(18px); backdrop-filter: blur(18px);
    border: 1px solid rgba(239,230,216,.12); box-shadow: 0 24px 60px rgba(0,0,0,.5); padding: 24px 22px 20px; }
  dialog.fb::backdrop { background: rgba(6, 5, 4, .55); }
  dialog.fb.bubble { width: min(440px, calc(100vw - 32px)); border-radius: 22px; }
  dialog.fb.quick { width: 100%; max-width: 520px; margin: auto auto 0; border-radius: 24px 24px 0 0; border-bottom: 0;
    padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 20px); animation: fb-up .35s ease; }
  dialog.fb.edge { width: min(380px, 88vw); height: 100%; max-height: 100%; margin: 0 0 0 auto; border-radius: 24px 0 0 24px; border-right: 0;
    padding-top: calc(env(safe-area-inset-top, 0px) + 28px); animation: fb-side .35s ease; }
  @keyframes fb-up { from { transform: translateY(40px); opacity: 0; } }
  @keyframes fb-side { from { transform: translateX(40px); opacity: 0; } }
  .fb h2 { margin: 0 0 6px; font: italic 300 30px/1.1 var(--serif, Georgia, serif); }
  .fb p { margin: 0; font-size: 13.5px; line-height: 1.55; color: rgba(239,230,216,.55); }
  .fb textarea { display: block; width: 100%; margin: 16px 0 6px; padding: 12px 14px; resize: vertical; min-height: 120px;
    font: 300 16px/1.5 var(--sans, system-ui, sans-serif); color: inherit; background: rgba(0,0,0,.3);
    border: 1px solid rgba(239,230,216,.16); border-radius: 14px; -webkit-user-select: text; user-select: text; box-sizing: border-box; }
  .fb textarea:focus { outline: none; border-color: rgba(239,230,216,.45); }
  .fb .fb-count { text-align: right; font-size: 11.5px; }
  .fb .fb-status { min-height: 1.55em; margin-top: 6px; color: inherit; }
  .fb .fb-status.bad { color: #e9a58f; }
  .fb .fb-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 12px; }
  .fb button { font: 400 14px var(--sans, system-ui, sans-serif); border-radius: 999px; padding: 10px 20px; cursor: pointer;
    border: 1px solid rgba(239,230,216,.2); background: none; color: inherit; }
  .fb button.fb-send { background: #efe6d8; color: #1a1714; border-color: #efe6d8; }
  .fb button:disabled { opacity: .5; cursor: default; }
  .fb .fb-kinds { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 18px; }
  .fb .fb-kinds button { display: grid; justify-items: center; gap: 8px; padding: 16px 6px 12px; border-radius: 16px; font-size: 13px; }
  .fb .fb-kinds button[aria-pressed="true"] { background: rgba(239,230,216,.12); border-color: rgba(239,230,216,.5); }
  .fb .fb-kinds svg { width: 24px; height: 24px; fill: none; stroke: currentColor; stroke-width: 1.3; stroke-linecap: round; stroke-linejoin: round; }
  .fb.quick .fb-more[hidden] { display: none; }
  .fb.edge form { display: flex; flex-direction: column; height: 100%; }
  .fb.edge textarea { min-height: 200px; }

  .fb-switch { position: fixed; z-index: 7; left: 4px; top: 50%; transform: translateY(-50%);
    display: flex; flex-direction: column; gap: 2px; padding: 3px; border-radius: 12px; background: rgba(0,0,0,.6); border: 1px dashed rgba(239,230,216,.35);
    font: 400 9.5px/1 system-ui, sans-serif; letter-spacing: .04em; }
  .fb-switch b { padding: 4px 4px 2px; text-align: center; color: rgba(239,230,216,.5); font-weight: 400; }
  .fb-switch button { padding: 6px 7px; border: 0; border-radius: 9px; background: none; color: rgba(239,230,216,.75); font: inherit; cursor: pointer; }
  .fb-switch button[aria-pressed="true"] { background: rgba(239,230,216,.9); color: #1a1714; }
  body[data-phase="session"] .fb-switch { display: none; }
  @media (prefers-reduced-motion: reduce) { dialog.fb { animation: none !important; } }
  `;

  const ICON = {
    note: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-8l-4.5 3.5v-3.5H5A1.5 1.5 0 0 1 3.5 15V7A1.5 1.5 0 0 1 5 5.5z"/></svg>',
    love: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7.5-4.6-7.5-10A4.2 4.2 0 0 1 12 7.4 4.2 4.2 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/></svg>',
    off: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5.5"/><path d="M12 16.3v.2"/></svg>',
    idea: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 17.5h6M10 20.5h4M12 3.5a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V17h5v-.6c0-.8.4-1.5 1-2A6 6 0 0 0 12 3.5z"/></svg>',
  };
  const KINDS = {
    love: { label: 'Love it', prefix: 'Love it', hint: 'Anything you\'d like to add? (optional)', optional: true },
    off: { label: 'Something\'s off', prefix: 'Something\'s off', hint: 'What happened, and where?' },
    idea: { label: 'An idea', prefix: 'Idea', hint: 'I wish…' },
  };

  const textBlock = (placeholder) => `
    <textarea class="fb-text" maxlength="500" aria-label="Your note" placeholder="${placeholder}"></textarea>
    <p class="fb-count">0 / 500</p>`;
  const tail = `<p class="fb-status" role="status"></p>
    <div class="fb-actions"><button type="button" class="fb-close">Close</button><button class="fb-send">Send</button></div>`;
  const intro = '<h2>A note for Hush</h2><p>Something you\'d love to see, something that bothered you, or a bug. It\'s sent anonymously, so there\'s no way to reply.</p>';
  const FORMS = {
    bubble: `<form>${intro}${textBlock('I wish…')}${tail}</form>`,
    edge: `<form>${intro}${textBlock('I wish…')}${tail}</form>`,
    quick: `<form><h2>How's Hush for you?</h2><p>Tap one. It's sent anonymously.</p>
      <div class="fb-kinds" role="group" aria-label="Kind of note">${Object.entries(KINDS).map(([k, x]) =>
        `<button type="button" data-kind="${k}" aria-pressed="false">${ICON[k]}<span>${x.label}</span></button>`).join('')}</div>
      <div class="fb-more" hidden>${textBlock('')}</div>${tail}</form>`,
  };
  const ENTRY = {
    bubble: `<button type="button" class="fb-entry fb-corner fb-bubble" aria-label="Send feedback">${ICON.note}</button>`,
    quick: `<button type="button" class="fb-entry fb-corner fb-pill">${ICON.note}<span>Feedback</span></button>`,
    edge: '<button type="button" class="fb-entry fb-edge"><span>Feedback</span></button>',
  };

  let entry, dlg;
  function build() {
    entry?.remove(); dlg?.remove();
    document.body.insertAdjacentHTML('beforeend', ENTRY[variant] + `<dialog class="fb ${variant}" aria-label="Send feedback">${FORMS[variant]}</dialog>`);
    entry = document.querySelector('.fb-entry'); dlg = document.querySelector('dialog.fb');
    const $ = (s) => dlg.querySelector(s), text = $('.fb-text'), status = $('.fb-status'), send = $('.fb-send');
    let kind = null;
    const say = (msg, bad) => { status.textContent = msg; status.classList.toggle('bad', !!bad); };
    const count = () => { $('.fb-count').textContent = `${text.value.length} / 500`; };
    const ready = () => { send.disabled = variant === 'quick' && (!kind || (!KINDS[kind].optional && !text.value.trim())); };

    entry.addEventListener('click', open);
    $('.fb-close').addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); }); // tap outside
    dlg.addEventListener('keydown', (e) => e.stopPropagation()); // Space in the text mustn't pause the session
    text.addEventListener('input', () => { count(); ready(); if (status.textContent) say(''); });
    dlg.querySelectorAll('[data-kind]').forEach((b) => b.addEventListener('click', () => {
      kind = b.dataset.kind;
      dlg.querySelectorAll('[data-kind]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      $('.fb-more').hidden = false; text.placeholder = KINDS[kind].hint; say(''); ready(); text.focus();
    }));
    ready();

    $('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      let note = text.value.trim();
      if (variant === 'quick') { if (!kind) return; note = note ? `${KINDS[kind].prefix}: ${note}` : KINDS[kind].prefix; }
      if (!note) { text.focus(); return; }
      note = note.slice(0, 500);
      send.disabled = true; say('Sending…');
      try {
        if (!window.hushSend) throw new Error('missing');
        await window.hushSend(`feedback/${where}/${note.replace(/\s+/g, ' ')}`, note);
        text.value = ''; count();
        say('Thank you. Your note is on its way.');
        setTimeout(() => dlg.open && dlg.close(), 1800);
      } catch (err) {
        if (err.local) say('Preview: notes aren\'t sent from localhost or your own network. On the live site this sends.');
        else say('Couldn\'t send. An ad or tracker blocker, or being offline, can stop it. Your note is still here.', true);
      } finally { ready(); if (variant !== 'quick') send.disabled = false; }
    });
    dlg.addEventListener('close', () => {
      kind = null; say('');
      dlg.querySelectorAll('[data-kind]').forEach((x) => x.setAttribute('aria-pressed', 'false'));
      if ($('.fb-more')) $('.fb-more').hidden = true;
      ready();
    });
  }
  function open() {
    if (!dlg.open) dlg.showModal();
    if (variant !== 'quick') dlg.querySelector('.fb-text').focus();
  }

  function switcher() {
    if (!isLocal) return;
    const box = document.createElement('div');
    box.className = 'fb-switch'; box.setAttribute('role', 'group'); box.setAttribute('aria-label', 'Feedback trial');
    box.innerHTML = '<b>Note</b>' + Object.entries(VARIANTS).map(([k, n]) => `<button type="button" data-v="${k}">${n}</button>`).join('');
    const mark = () => box.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === variant)));
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-v]'); if (!b) return;
      variant = b.dataset.v; store.set('hush.fb.variant', variant); mark(); build();
    });
    mark(); document.body.appendChild(box);
  }

  function init() {
    const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
    build(); switcher();
    window.hushFeedback = { open: () => open() };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
