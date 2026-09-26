const $ = (id) => document.getElementById(id);

const fmt = (ms) => {
  const t = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};
const clock = (ts) => new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

let s = null;
function render() {
  if (!s) return;
  const now = Date.now();
  const paused = s.enabled && s.pausedUntil > now;
  const mode = !s.enabled ? 'off' : paused ? 'paused' : 'on';
  $('card').dataset.state = mode;
  $('toggle').checked = s.enabled;
  $('toggleText').textContent = s.enabled ? 'Reminders ON' : 'Reminders OFF';
  if (mode === 'off') {
    $('status').textContent = 'Reminders are off';
    $('count').textContent = '--:--:--';
    $('sub').textContent = 'Turn the switch on to get a reminder every 2 hours.';
  } else if (mode === 'paused') {
    $('status').textContent = 'Paused (meeting mode)';
    $('count').textContent = fmt(s.pausedUntil - now);
    $('sub').textContent = `Reminders come back on at ${clock(s.pausedUntil)}.`;
  } else {
    $('status').textContent = 'Next reminder in';
    $('count').textContent = fmt(s.nextAt - now);
    $('sub').textContent = `Around ${clock(s.nextAt)}.`;
  }
  $('pause').hidden = paused;
  $('pause').disabled = !s.enabled;
  $('pause').textContent = s.test ? '⏸ Pause (30 sec, test mode)' : '⏸ Pause 1 hour (meeting mode)';
  $('resume').hidden = !paused;
  $('drank').disabled = mode !== 'on';
  $('login').checked = s.openAtLogin;
}

window.h2o.onState((state) => { s = state; render(); });
window.h2o.getState().then((state) => { s = state; render(); });
setInterval(render, 1000);

$('toggle').addEventListener('change', (e) => window.h2o.action(e.target.checked ? 'on' : 'off'));
$('pause').addEventListener('click', () => window.h2o.action('pause'));
$('resume').addEventListener('click', () => window.h2o.action('resume'));
$('drank').addEventListener('click', () => window.h2o.action('drank'));
$('preview').addEventListener('click', () => window.h2o.action('preview'));
$('login').addEventListener('change', (e) => window.h2o.action(e.target.checked ? 'login-on' : 'login-off'));
