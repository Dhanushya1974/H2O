// H2O — water reminder. The server keeps each browser's timer and sends a push notification
// every 2 hours, so reminders arrive even when this tab is closed.
(() => {
  const TEST = new URLSearchParams(location.search).has('test');
  const ID_KEY = TEST ? 'h2o-id-test' : 'h2o-id';

  const $ = (id) => document.getElementById(id);
  const el = {
    card: $('card'), statusLabel: $('statusLabel'), countdown: $('countdown'), subText: $('subText'),
    toggle: $('toggle'), toggleText: $('toggleText'), pauseBtn: $('pauseBtn'), resumeBtn: $('resumeBtn'),
    drankBtn: $('drankBtn'), permWarn: $('permWarn'), unsupported: $('unsupported'), errorMsg: $('errorMsg'),
    installBtn: $('installBtn'), installHint: $('installHint'), testBtn: $('testBtn'),
    permDefault: $('permDefault'), permDenied: $('permDenied'), allowBtn: $('allowBtn'),
    buddy: $('buddy'), buddyDrank: $('buddyDrank'), buddyLater: $('buddyLater'), buddyOff: $('buddyOff'),
  };

  const supported = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
  let swReg = null;
  let state = { enabled: false, nextAt: 0, pausedUntil: 0 };
  let clockSkew = 0;   // server time - local time
  let asking = false;  // waiting for the notification permission answer
  let error = '';

  const storage = {
    get: () => { try { return localStorage.getItem(ID_KEY); } catch (_) { return null; } },
    set: (v) => { try { v ? localStorage.setItem(ID_KEY, v) : localStorage.removeItem(ID_KEY); } catch (_) { /* ignore */ } },
  };
  let id = storage.get();

  // ---- server ----
  async function api(method, url, body) {
    const res = await fetch(url, {
      method, headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) { const e = new Error(`HTTP ${res.status}`); e.status = res.status; throw e; }
    return res.json();
  }
  function accept(s) {
    state = { enabled: s.enabled, nextAt: s.nextAt, pausedUntil: s.pausedUntil };
    clockSkew = s.now - Date.now();
    error = '';
    render();
  }
  function report(msg) {
    fetch('/api/log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ msg }) }).catch(() => {});
  }
  function fail(e) {
    report(`${e && e.name}: ${e && e.message}`);
    error = navigator.onLine === false ? "You're offline. Changes will work again once you're back online."
      : `Couldn't turn on reminders (${(e && e.message) || 'unknown error'}). Please try again.`;
    console.error(e);
    render();
  }

  async function refresh() {
    if (!id) return;
    try { accept(await api('GET', `/api/state/${id}`)); }
    catch (e) {
      if (e.status === 404) { id = null; storage.set(null); state.enabled = false; render(); } // server forgot us
      else fail(e);
    }
  }

  const b64ToBytes = (b64) => {
    const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(s, (c) => c.charCodeAt(0));
  };

  async function subscribe() {
    const reg = swReg || (await navigator.serviceWorker.ready);
    const { publicKey } = await api('GET', '/api/vapid');
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
    const s = await api('POST', '/api/subscribe', { subscription: sub.toJSON(), test: TEST });
    id = s.id; storage.set(id);
    accept(s);
  }

  // ---- actions ----
  async function enable() {
    if (!supported) return;
    asking = true; render();
    let perm = Notification.permission;
    if (perm === 'default') perm = await Notification.requestPermission();
    asking = false;
    report(`permission=${perm}`);
    if (perm !== 'granted') { render(); return; }
    try { await subscribe(); } catch (e) { fail(e); }
  }
  async function act(action) {
    if (!id) return action === 'on' ? enable() : undefined;
    try { accept(await api('POST', '/api/action', { id, action })); } catch (e) { fail(e); }
  }
  const disable = () => { hideBuddy(); return act('off'); };

  // ---- animated boy ----
  function showBuddy() {
    if (!el.buddy.hidden) return;
    el.buddy.hidden = false; // re-inserting into layout restarts the CSS animations
    el.buddyDrank.focus({ preventScroll: true });
  }
  function hideBuddy() { el.buddy.hidden = true; }

  // ---- rendering ----
  const fmt = (ms) => {
    const t = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };
  const clock = (ts) => new Date(ts - clockSkew).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  function render() {
    const now = Date.now() + clockSkew;
    const paused = state.enabled && state.pausedUntil > now;
    const mode = !state.enabled ? 'off' : paused ? 'paused' : 'on';
    el.card.dataset.state = mode;
    el.toggle.checked = state.enabled || asking;
    el.toggle.setAttribute('aria-checked', String(state.enabled));
    el.toggleText.textContent = state.enabled ? 'Reminders ON' : asking ? 'Turning on…' : 'Reminders OFF';

    if (mode === 'off') {
      el.statusLabel.textContent = 'Reminders are off';
      el.countdown.textContent = '--:--:--';
      el.subText.textContent = 'Turn on to get a nudge to drink water every 2 hours, even with this tab closed.';
      document.title = 'H2O Reminder';
    } else if (mode === 'paused') {
      el.statusLabel.textContent = 'Paused (meeting mode)';
      el.countdown.textContent = fmt(state.pausedUntil - now);
      el.subText.textContent = `Reminders come back on at ${clock(state.pausedUntil)}.`;
      document.title = `⏸ ${fmt(state.pausedUntil - now)} · H2O`;
    } else {
      // The server may already have sent this reminder and moved on; refresh shortly after.
      el.statusLabel.textContent = 'Next reminder in';
      el.countdown.textContent = fmt(state.nextAt - now);
      el.subText.textContent = `Around ${clock(state.nextAt)}. You can close this tab.`;
      document.title = `💧 ${fmt(state.nextAt - now)} · H2O`;
    }

    el.pauseBtn.hidden = mode !== 'on';
    el.resumeBtn.hidden = mode !== 'paused';
    el.drankBtn.disabled = mode !== 'on';
    el.unsupported.hidden = supported;
    el.toggle.disabled = !supported;
    const perm = supported ? Notification.permission : 'unsupported';
    el.permWarn.hidden = !(asking || perm === 'denied');
    el.permDefault.hidden = !asking;
    el.permDenied.hidden = perm !== 'denied';
    el.errorMsg.hidden = !error;
    el.errorMsg.textContent = error;
  }

  // ---- wiring ----
  el.toggle.addEventListener('change', () => (el.toggle.checked ? act('on') : disable()));
  el.allowBtn.addEventListener('click', enable);
  el.pauseBtn.addEventListener('click', () => { hideBuddy(); act('pause'); });
  el.resumeBtn.addEventListener('click', () => act('resume'));
  el.drankBtn.addEventListener('click', () => act('drank'));
  el.buddyDrank.addEventListener('click', () => { hideBuddy(); if (state.enabled) act('drank'); });
  el.buddyLater.addEventListener('click', hideBuddy);
  el.buddyOff.addEventListener('click', disable);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideBuddy(); });
  el.testBtn.addEventListener('click', showBuddy);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });

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

  // The service worker tells us when a reminder arrives while this page is open.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then((r) => { swReg = r; }).catch(() => {});
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data && e.data.type === 'reminder') { showBuddy(); refresh(); }
      if (e.data && e.data.type === 'changed') refresh();
    });
  }

  // Opened by clicking a reminder: play the boy.
  if (location.hash === '#reminder') {
    history.replaceState(null, '', location.pathname + location.search);
    showBuddy();
  }

  render();
  refresh();
  setInterval(render, 1000);
  setInterval(refresh, 60 * 1000);
})();
