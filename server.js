// H2O server: hosts the website and sends a push reminder to each subscriber every 2 hours,
// so reminders arrive even when the H2O tab is closed (the browser just needs to be running).
// Runs as a normal Node server (files in data/, own timer) or on Vercel (Redis, timer calls /api/tick).
const express = require('express');
const webpush = require('web-push');
const { Redis } = require('@upstash/redis');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ON_VERCEL = !!process.env.VERCEL;
const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const SUBS_FILE = path.join(DATA_DIR, 'subscriptions.json');
const VAPID_FILE = path.join(DATA_DIR, 'vapid.json');

const HOUR = 60 * 60 * 1000;
const TIMING = {
  normal: { interval: 2 * HOUR, pause: HOUR },
  test: { interval: 60 * 1000, pause: 30 * 1000 }, // ?test=1 on the website
};

// ---- VAPID keys: from env, else generated once and saved ----
let vapid = null;
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  vapid = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
} else if (ON_VERCEL) {
  throw new Error('Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY (Vercel has no disk to save generated keys)');
} else {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  try { vapid = JSON.parse(fs.readFileSync(VAPID_FILE, 'utf8')); } catch (_) { /* first start */ }
  if (!vapid) {
    vapid = webpush.generateVAPIDKeys();
    fs.writeFileSync(VAPID_FILE, JSON.stringify(vapid));
  }
}
webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:h2o@example.com', vapid.publicKey, vapid.privateKey);

// ---- subscriptions: { [id]: { subscription, test, enabled, nextAt, pausedUntil } } ----
function fileStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  let subs = {};
  try { subs = JSON.parse(fs.readFileSync(SUBS_FILE, 'utf8')); } catch (_) { /* none yet */ }
  const persist = () => {
    const tmp = SUBS_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(subs));
    fs.renameSync(tmp, SUBS_FILE);
  };
  return {
    get: async (id) => subs[id] || null,
    set: async (id, s) => { subs[id] = s; persist(); },
    del: async (id) => { delete subs[id]; persist(); },
    all: async () => Object.entries(subs),
  };
}
function redisStore() {
  const redis = new Redis({ url: REDIS_URL, token: REDIS_TOKEN });
  const KEY = 'h2o:subs'; // one hash, a field per subscriber
  return {
    get: (id) => redis.hget(KEY, id),
    set: (id, s) => redis.hset(KEY, { [id]: s }),
    del: (id) => redis.hdel(KEY, id),
    all: async () => Object.entries((await redis.hgetall(KEY)) || {}),
  };
}
if (ON_VERCEL && !REDIS_URL) throw new Error('Connect a Redis database (KV_REST_API_URL / KV_REST_API_TOKEN)');
const store = REDIS_URL ? redisStore() : fileStore();

const idFor = (endpoint) => crypto.createHash('sha256').update(endpoint).digest('hex').slice(0, 32);
const timing = (s) => (s.test ? TIMING.test : TIMING.normal);
const view = (id, s) => ({ id, enabled: s.enabled, nextAt: s.nextAt, pausedUntil: s.pausedUntil, now: Date.now() });

function applyAction(s, action) {
  const now = Date.now();
  const t = timing(s);
  switch (action) {
    case 'on': s.enabled = true; s.pausedUntil = 0; s.nextAt = now + t.interval; break;
    case 'off': s.enabled = false; s.pausedUntil = 0; break;
    case 'pause': if (s.enabled) s.pausedUntil = now + t.pause; break;
    case 'resume':
    case 'drank': if (s.enabled) { s.pausedUntil = 0; s.nextAt = now + t.interval; } break;
    default: return false;
  }
  return true;
}

// ---- web app ----
const app = express();
app.use(express.json({ limit: '10kb' }));
app.use('/api', (req, _res, next) => { console.log(new Date().toLocaleTimeString(), req.headers.host, req.method, req.path); next(); });

// Browsers report problems here so they show up in the server log.
app.post('/api/log', (req, res) => {
  console.log('client:', String((req.body && req.body.msg) || '').slice(0, 300));
  res.json({ ok: true });
});

app.get('/api/vapid', (_req, res) => res.json({ publicKey: vapid.publicKey }));

// Short link to the Windows installer. It is too big to deploy (106 MB), so it lives in Vercel Blob storage.
app.get('/download', (_req, res) => res.redirect(302, 'https://tfzpcdotlf2tau9y.public.blob.vercel-storage.com/H2O-Setup-oDwgjzq6HCNDboKK2HNahD4mjJP2f9.exe'));

// Register (or re-register) a browser. Turns reminders on.
app.post('/api/subscribe', async (req, res) => {
  const sub = req.body && req.body.subscription;
  if (!sub || typeof sub.endpoint !== 'string' || !/^https:\/\//.test(sub.endpoint) || !sub.keys ||
      typeof sub.keys.p256dh !== 'string' || typeof sub.keys.auth !== 'string') {
    return res.status(400).json({ error: 'bad subscription' });
  }
  const id = idFor(sub.endpoint);
  const s = (await store.get(id)) || { enabled: false, nextAt: 0, pausedUntil: 0 };
  s.subscription = { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } };
  s.test = !!req.body.test;
  applyAction(s, 'on');
  await store.set(id, s);
  res.json(view(id, s));
});

app.get('/api/state/:id', async (req, res) => {
  const s = await store.get(req.params.id);
  if (!s) return res.status(404).json({ error: 'not found' });
  res.json(view(req.params.id, s));
});

app.post('/api/action', async (req, res) => {
  const { id, action } = req.body || {};
  const s = typeof id === 'string' ? await store.get(id) : null;
  if (!s) return res.status(404).json({ error: 'not found' });
  if (!applyAction(s, action)) return res.status(400).json({ error: 'bad action' });
  await store.set(id, s);
  res.json(view(id, s));
});

// On Vercel nothing runs between requests, so an outside timer calls this every few minutes.
app.all('/api/tick', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'unauthorized' });
  res.json({ sent: await tick() });
});

app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, file) => { if (file.endsWith('sw.js')) res.setHeader('Cache-Control', 'no-cache'); },
}));

// ---- scheduler ----
let sending = false;
async function tick() {
  if (sending) return 0;
  sending = true;
  const now = Date.now();
  let sent = 0;
  try {
    for (const [id, s] of await store.all()) {
      if (!s.enabled) continue;
      const t = timing(s);
      if (s.pausedUntil) {
        if (now >= s.pausedUntil) { s.pausedUntil = 0; s.nextAt = now + t.interval; await store.set(id, s); }
        continue;
      }
      if (now < s.nextAt) continue;
      // Skip missed cycles (e.g. server was down) so only one reminder goes out.
      while (s.nextAt <= now) s.nextAt += t.interval;
      await store.set(id, s);
      const payload = JSON.stringify({ id, test: !!s.test, title: 'Time to drink water 💧', body: 'Grab a glass of water and stay hydrated!' });
      try {
        await webpush.sendNotification(s.subscription, payload, { TTL: 30 * 60, urgency: 'high', topic: 'h2o' });
        sent++;
        console.log(new Date().toLocaleTimeString(), 'reminder sent to', id.slice(0, 6));
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) await store.del(id); // browser unsubscribed
        else console.error('push failed', id.slice(0, 8), err.statusCode || err.message);
      }
    }
  } catch (err) {
    console.error('tick failed', err.message);
  } finally {
    sending = false;
  }
  return sent;
}

if (!ON_VERCEL) {
  setInterval(tick, 10 * 1000);
  app.listen(PORT, () => console.log(`H2O running on http://localhost:${PORT}`));
}

module.exports = app;
