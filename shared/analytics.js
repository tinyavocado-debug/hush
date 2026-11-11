/* Usage counts via GoatCounter (goatcounter.com): no cookies, no profiles.
   Unique visitors come from a hash of IP + browser with a salt that rotates daily;
   raw IPs are never stored. Visits from localhost aren't counted.
   Set CODE to the site code chosen at sign-up (https://CODE.goatcounter.com). */
(function () {
  const CODE = 'tinyavocado'; // https://tinyavocado.goatcounter.com

  if (!CODE) {
    console.warn('[hush] analytics off: set CODE in shared/analytics.js');
    window.hushTrack = (name) => console.info('[hush] (not sent)', name);
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
})();
