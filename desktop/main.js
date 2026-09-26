// H2O desktop: lives in the system tray and shows an animated boy over every app every 2 hours.
const { app, BrowserWindow, Tray, Menu, Notification, ipcMain, screen, nativeImage, powerMonitor } = require('electron');
const path = require('path');
const fs = require('fs');

const TEST = process.argv.includes('--test') || process.env.H2O_TEST === '1';
const INTERVAL = TEST ? 60 * 1000 : 2 * 60 * 60 * 1000; // 2 hours (1 min in test mode)
const PAUSE = TEST ? 30 * 1000 : 60 * 60 * 1000;        // 1 hour (30 s in test mode)
const OVERLAY_HEIGHT = 460;

if (!app.requestSingleInstanceLock()) {
  app.quit();
  return;
}
app.setAppUserModelId('com.h2o.reminder'); // required for Windows notifications

// ---- state (saved in %APPDATA%/H2O) ----
const statePath = () => path.join(app.getPath('userData'), TEST ? 'state-test.json' : 'state.json');
let state = { enabled: true, nextAt: 0, pausedUntil: 0, firstRun: true };

function load() {
  try { Object.assign(state, JSON.parse(fs.readFileSync(statePath(), 'utf8'))); } catch (_) { /* first run */ }
}
function save() {
  try { fs.writeFileSync(statePath(), JSON.stringify(state)); } catch (_) { /* ignore */ }
}

let tray = null;
let overlay = null;

// ---- overlay window ----
function showOverlay() {
  if (overlay) return;
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const wa = display.workArea;
  const height = Math.min(OVERLAY_HEIGHT, wa.height);
  overlay = new BrowserWindow({
    x: wa.x, y: wa.y + wa.height - height, width: wa.width, height,
    transparent: true, frame: false, resizable: false, movable: false,
    minimizable: false, maximizable: false, fullscreenable: false,
    skipTaskbar: true, hasShadow: false, alwaysOnTop: true, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  overlay.setAlwaysOnTop(true, 'screen-saver'); // above full-screen apps too
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlay.setIgnoreMouseEvents(true, { forward: true }); // clicks pass through except on the buttons
  overlay.setContentProtection(true); // hidden from screen-sharing / screenshots
  overlay.loadFile(path.join(__dirname, 'overlay.html'));
  overlay.once('ready-to-show', () => overlay && overlay.showInactive()); // don't steal keyboard focus
  overlay.on('closed', () => { overlay = null; });
}

ipcMain.on('overlay:clickable', (_e, on) => {
  if (overlay) overlay.setIgnoreMouseEvents(!on, { forward: true });
});
ipcMain.on('overlay:choice', (_e, choice) => {
  if (choice === 'drank' && state.enabled) {
    state.nextAt = Date.now() + INTERVAL;
    save();
    refreshTray();
  }
});
ipcMain.on('overlay:close', () => { if (overlay) overlay.close(); });

// ---- reminder timer ----
function remind() {
  showOverlay();
  if (Notification.isSupported()) {
    const n = new Notification({ title: 'Time to drink water 💧', body: 'Grab a glass of water and stay hydrated!', silent: false });
    n.on('click', showOverlay);
    n.show();
  }
}

function tick() {
  const now = Date.now();
  if (state.enabled) {
    if (state.pausedUntil && now >= state.pausedUntil) {
      state.pausedUntil = 0;
      state.nextAt = now + INTERVAL;
      save();
    } else if (!state.pausedUntil && now >= state.nextAt) {
      remind();
      // Skip missed cycles (e.g. PC was asleep) so only one reminder shows.
      while (state.nextAt <= now) state.nextAt += INTERVAL;
      save();
    }
  }
  refreshTray();
}

// ---- actions ----
function setEnabled(on) {
  state.enabled = on;
  state.pausedUntil = 0;
  if (on) state.nextAt = Date.now() + INTERVAL;
  else if (overlay) overlay.close();
  save(); refreshTray();
}
function pause() {
  state.pausedUntil = Date.now() + PAUSE;
  if (overlay) overlay.close();
  save(); refreshTray();
}
function resume() {
  state.pausedUntil = 0;
  state.nextAt = Date.now() + INTERVAL;
  save(); refreshTray();
}
function drank() {
  state.nextAt = Date.now() + INTERVAL;
  save(); refreshTray();
}

// ---- tray ----
const clock = (ts) => new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

function statusText() {
  const now = Date.now();
  if (!state.enabled) return 'Reminders are off';
  if (state.pausedUntil > now) return `Paused until ${clock(state.pausedUntil)}`;
  const mins = Math.max(0, Math.ceil((state.nextAt - now) / 60000));
  return `Next reminder at ${clock(state.nextAt)} (in ${mins} min)`;
}

let lastMenuKey = '';
function refreshTray() {
  if (!tray) return;
  const status = statusText();
  tray.setToolTip(`H2O${TEST ? ' (test)' : ''}: ${status}`);
  const paused = state.enabled && state.pausedUntil > Date.now();
  const openAtLogin = app.getLoginItemSettings().openAtLogin;
  const key = [status, state.enabled, paused, openAtLogin].join('|');
  if (key === lastMenuKey) return;
  lastMenuKey = key;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: status, enabled: false },
    { type: 'separator' },
    { label: 'Reminders on', type: 'checkbox', checked: state.enabled, click: (i) => setEnabled(i.checked) },
    paused
      ? { label: 'Resume now', click: resume }
      : { label: TEST ? 'Pause (30 sec, test)' : 'Pause 1 hour (meeting mode)', enabled: state.enabled, click: pause },
    { label: 'I drank water (restart 2 hours)', enabled: state.enabled && !paused, click: drank },
    { label: 'Show reminder now', click: showOverlay },
    { type: 'separator' },
    { label: 'Start with Windows', type: 'checkbox', checked: openAtLogin,
      click: (i) => { app.setLoginItemSettings({ openAtLogin: i.checked }); refreshTray(); } },
    { label: 'Quit H2O', click: () => app.quit() },
  ]));
}

app.on('second-instance', () => {
  if (Notification.isSupported()) new Notification({ title: 'H2O is already running', body: statusText() }).show();
});

app.whenReady().then(() => {
  load();
  if (state.firstRun) {
    state.firstRun = false;
    state.enabled = true;
    state.nextAt = Date.now() + INTERVAL;
    if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: true });
    save();
  }
  if (!state.nextAt) state.nextAt = Date.now() + INTERVAL;

  const icon = nativeImage.createFromPath(path.join(__dirname, 'icon.png')).resize({ width: 32, height: 32 });
  tray = new Tray(icon);
  tray.on('click', () => tray.popUpContextMenu());
  refreshTray();

  if (Notification.isSupported()) {
    new Notification({ title: 'H2O is running 💧', body: `${statusText()}. Right-click the drop icon near the clock for options.` }).show();
  }

  setInterval(tick, TEST ? 1000 : 5000);
  powerMonitor.on('resume', tick);
});

// Keep running in the tray when the overlay closes.
app.on('window-all-closed', () => {});
