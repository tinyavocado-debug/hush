/* Usage counts via GoatCounter (goatcounter.com): no cookies, no profiles.
   Unique visitors come from a hash of IP + browser with a salt that rotates daily;
   raw IPs are never stored. Visits from localhost aren't counted.
   Set CODE to the site code chosen at sign-up (https://CODE.goatcounter.com). */
(function () {
  const CODE = 'tinyavocado'; // https://tinyavocado.goatcounter.com

  if (!CODE) {
    console.warn('[hush] analytics off: set CODE in shared/analytics.js');
    window.hushTrack = (name) => console.info('[hush] (not sent)', name);
    window.hushSend = async () => { throw new Error('analytics off'); };
    return;
  }

  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://gc.zgo.at/count.js';
  s.dataset.goatcounter = `https://${CODE}.goatcounter.com/count`;
  document.head.appendChild(s);

  // An event shows in the dashboard as its own row, e.g. "begin/orbit/float/steady/10m".
  window.hushTrack = (name) => {
    const send = () => window.goatcounter.count({ path: name, title: name, event: true });
    if (window.goatcounter?.count) send();
    else s.addEventListener('load', send, { once: true });
  };

  // Sends one event straight to GoatCounter and rejects if it can't get there (blocked,
  // offline), so the caller can say so. count.js can't tell us that. Used for feedback notes,
  // which show on the stats page. Like count.js, it skips local and LAN addresses.
  const LOCAL = /(localhost$|^127\.|^10\.|^172\.(1[6-9]|2[0-9]|3[0-1])\.|^192\.168\.|^0\.0\.0\.0$|^\[::1\]$)/;
  window.hushSend = async (path, title) => {
    if (location.protocol === 'file:' || LOCAL.test(location.hostname)) throw Object.assign(new Error('local'), { local: true });
    const q = new URLSearchParams({
      p: path, t: title, e: 'true',
      s: [screen.width, screen.height, window.devicePixelRatio || 1].join(','),
      rnd: Math.random().toString(36).slice(2),
    });
    await fetch(`https://${CODE}.goatcounter.com/count?${q}`, { mode: 'no-cors', keepalive: true, credentials: 'omit' });
  };
})();
