// H2O — water reminder. All state lives in this browser's localStorage.
(() => {
  const TEST = new URLSearchParams(location.search).has('test');
  const INTERVAL = TEST ? 60 * 1000 : 2 * 60 * 60 * 1000; // 2 hours (1 min in ?test mode)
  const PAUSE = TEST ? 30 * 1000 : 60 * 60 * 1000;        // 1 hour (30 s in ?test mode)
  const KEY = TEST ? 'h2o-state-test' : 'h2o-state';

  const $ = (id) => document.getElementById(id);
  const el = {
    card: $('card'), statusLabel: $('statusLabel'), countdown: $('countdown'), subText: $('subText'),
    toggle: $('toggle'), toggleText: $('toggleText'), pauseBtn: $('pauseBtn'), resumeBtn: $('resumeBtn'),
    drankBtn: $('drankBtn'), permWarn: $('permWarn'), unsupported: $('unsupported'),
    installBtn: $('installBtn'), installHint: $('installHint'), testBtn: $('testBtn'),
    permDefault: $('permDefault'), permDenied: $('permDenied'), allowBtn: $('allowBtn'),
    buddy: $('buddy'), buddyDrank: $('buddyDrank'), buddyLater: $('buddyLater'),
  };

  const supported = 'Notification' in window;
  let swReg = null;

  // ---- state ----
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && typeof s === 'object') return { enabled: !!s.enabled, nextAt: +s.nextAt || 0, pausedUntil: +s.pausedUntil || 0, pending: !!s.pending };
    } catch (_) { /* storage unavailable or corrupt */ }
    return { enabled: false, nextAt: 0, pausedUntil: 0, pending: false };
  }
  let state = load();
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) { /* ignore */ }
  }

  // ---- notifications ----
  async function notify(title, body) {
    if (!supported || Notification.permission !== 'granted') return;
    const opts = { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'h2o', renotify: true };
    try {
      if (swReg) return await swReg.showNotification(title, opts);
    } catch (_) { /* fall back below */ }
    new Notification(title, opts);
  }

  async function ensurePermission() {
    if (!supported) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    return (await Notification.requestPermission()) === 'granted';
  }

  // ---- actions ----
  // Reminders turn on right away; the animated boy works even without notification permission.
  // Desktop pop-ups are requested in the background (Edge often shows only a bell icon for this).
  function enable() {
    state = { enabled: true, nextAt: Date.now() + INTERVAL, pausedUntil: 0, pending: false };
    save(); render();
    ensurePermission().finally(render);
  }
  function disable() {
    state.enabled = false; state.pausedUntil = 0; state.pending = false;
    save(); hideBuddy(); render();
  }
  function pause() {
    state.pausedUntil = Date.now() + PAUSE; state.pending = false;
    save(); hideBuddy(); render();
  }
  function resume() {
    state.pausedUntil = 0;
    state.nextAt = Date.now() + INTERVAL;
    save(); render();
  }
  function drank() {
    state.nextAt = Date.now() + INTERVAL; state.pending = false;
    save(); hideBuddy(); render();
  }

  // ---- animated boy ----
  // Plays when the page is visible; if the reminder fires while the window is hidden,
  // it stays "pending" and plays as soon as the user comes back (e.g. by clicking the notification).
  function showBuddy() {
    if (!el.buddy.hidden) return;
    el.buddy.hidden = false; // re-inserting into layout restarts the CSS animations
    el.buddyDrank.focus({ preventScroll: true });
  }
  function hideBuddy() { el.buddy.hidden = true; }
  function later() {
    state.pending = false; save(); hideBuddy();
  }

  // ---- ticking ----
  function tick() {
    // Another tab may have changed settings.
    state = load();
    const now = Date.now();
    if (state.enabled) {
      if (state.pausedUntil && now >= state.pausedUntil) {
        // Pause finished: restart the 2-hour cycle from now.
        state.pausedUntil = 0;
        state.nextAt = now + INTERVAL;
        save();
      } else if (!state.pausedUntil && now >= state.nextAt) {
        notify('Time to drink water 💧', 'Grab a glass of water and stay hydrated!');
        state.pending = true;
        // Skip missed cycles (e.g. laptop was asleep) so only one reminder shows.
        while (state.nextAt <= now) state.nextAt += INTERVAL;
        save();
      }
    }
    if (state.pending && state.enabled && document.visibilityState === 'visible') showBuddy();
    render();
  }

  // ---- rendering ----
  const fmt = (ms) => {
    const t = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };
  const clock = (ts) => new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  function render() {
    const now = Date.now();
    const paused = state.enabled && state.pausedUntil > now;
    const mode = !state.enabled ? 'off' : paused ? 'paused' : 'on';
    el.card.dataset.state = mode;
    el.toggle.checked = state.enabled;
    el.toggle.setAttribute('aria-checked', String(state.enabled));
    el.toggleText.textContent = state.enabled ? 'Reminders on' : 'Enable reminders';

    if (mode === 'off') {
      el.statusLabel.textContent = 'Reminders are off';
      el.countdown.textContent = '--:--:--';
      el.subText.textContent = 'Turn on to get a nudge to drink water every 2 hours.';
      document.title = 'H2O Reminder';
    } else if (mode === 'paused') {
      el.statusLabel.textContent = 'Paused (meeting mode)';
      el.countdown.textContent = fmt(state.pausedUntil - now);
      el.subText.textContent = `Reminders come back on at ${clock(state.pausedUntil)}.`;
      document.title = `⏸ ${fmt(state.pausedUntil - now)} · H2O`;
    } else {
      el.statusLabel.textContent = 'Next reminder in';
      el.countdown.textContent = fmt(state.nextAt - now);
      el.subText.textContent = `Around ${clock(state.nextAt)}.`;
      document.title = `💧 ${fmt(state.nextAt - now)} · H2O`;
    }

    el.pauseBtn.hidden = mode !== 'on';
    el.resumeBtn.hidden = mode !== 'paused';
    el.drankBtn.disabled = mode !== 'on';
    el.unsupported.hidden = supported;
    const perm = supported ? Notification.permission : 'unsupported';
    el.permWarn.hidden = !state.enabled || perm === 'granted' || perm === 'unsupported';
    el.permDefault.hidden = perm !== 'default';
    el.permDenied.hidden = perm !== 'denied';
  }

  // ---- wiring ----
  el.toggle.addEventListener('change', () => (el.toggle.checked ? enable() : disable()));
  el.allowBtn.addEventListener('click', () => ensurePermission().finally(render));
  el.pauseBtn.addEventListener('click', pause);
  el.resumeBtn.addEventListener('click', resume);
  el.drankBtn.addEventListener('click', drank);
  el.buddyDrank.addEventListener('click', () => (state.enabled ? drank() : hideBuddy()));
  el.buddyLater.addEventListener('click', later);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !el.buddy.hidden) later(); });
  document.addEventListener('visibilitychange', tick);
  el.testBtn.addEventListener('click', async () => {
    showBuddy();
    if (await ensurePermission()) notify('Test reminder 💧', 'Notifications are working!');
    render();
  });
  window.addEventListener('storage', (e) => { if (e.key === KEY) { state = load(); render(); } });

  // Install prompt (Chrome/Edge)
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    el.installBtn.hidden = false;
    el.installHint.hidden = true;
  });
  el.installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    el.installBtn.hidden = true;
  });

  // Desktop app download: on GitHub Pages (user.github.io/repo) link to that repo's latest release.
  (() => {
    const link = document.getElementById('downloadLink');
    const m = location.hostname.match(/^([^.]+)\.github\.io$/);
    const repo = location.pathname.split('/').filter(Boolean)[0];
    if (m && repo) link.href = `https://github.com/${m[1]}/${repo}/releases/latest/download/H2O-Setup.exe`;
    else link.href = 'desktop/dist/H2O-Setup.exe'; // local testing
  })();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then((r) => { swReg = r; }).catch(() => {});
  }

  // Check every second for a live countdown; timestamps (not timer length) decide when to fire,
  // so browser throttling of background tabs or sleep/wake can't make reminders drift.
  tick();
  setInterval(tick, 1000);
})();
