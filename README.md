# H2O — Water Reminder

A tiny web app that reminds you to drink water **every 2 hours**. When a reminder is due, an animated boy walks in carrying a water bottle and holds up a sign saying “Time to drink water!”. A desktop notification also pops up.

- **On/off switch** so you can turn reminders off completely.
- **Pause 1 hour** (meeting mode): no pop-ups while you screen-share, and reminders come back on by themselves.
- Works for anyone you share the link with. Each person's settings are saved in their own browser.

## How friends use it
1. Open the link → switch on **Enable reminders** → click **Allow** for notifications.
2. Keep the page open (minimized is fine). For best results click **Install app** (or the install icon in the address bar) so it runs in its own window.
3. Before a meeting, tap **Pause 1 hour** or switch reminders off.

> The animation plays inside the H2O window. If the window is hidden when a reminder fires, you get the desktop notification, and the animation plays as soon as you open H2O (e.g. by clicking the notification).

## Run locally
```
npx serve .
```
Open http://localhost:3000. Add `?test=1` (e.g. http://localhost:3000/?test=1) to use a 1-minute interval and a 30-second pause for testing.

## Publish on GitHub Pages (free)
1. Create a new **public** repo named `h2o` on https://github.com/new (don't add a README).
2. In this folder:
   ```
   git remote add origin https://github.com/<your-username>/h2o.git
   git push -u origin main
   ```
3. On GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` / `(root)` → Save**.
4. After a minute your link is `https://<your-username>.github.io/h2o/`. Share it with your friends.
