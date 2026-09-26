# H2O — Water Reminder

A cute reminder to drink water **every 2 hours**. When it's time, a Windows pop-up appears on top of whatever app you're using. On the H2O page, a chibi boy in a water-drop hoodie walks in with his bottle and holds up a sign: “Time to drink water!”

- **ON/OFF switch:** OFF stays off until you switch it back ON.
- **Pause 1 hour** (meeting mode): no pop-ups while you screen-share. Reminders come back on by themselves.
- **Turn off reminders** button right on the reminder.
- Each person's settings are saved in their own browser, so share the link and everyone gets their own reminders.

## How friends use it
1. Open the link → switch reminders **ON** → click **Allow** for notifications.
   In Edge, if no popup appears, click the **🔔 bell** at the right end of the address bar → **Allow**.
2. Keep the H2O tab or window open (minimized is fine). **Install it** (the install icon in the address bar) so it runs in its own window.
3. Before a meeting: **Pause 1 hour**, or switch **OFF**.

## Put it online (GitHub Pages, free)
1. Sign in at https://github.com and create a new **public** repository named `h2o` at https://github.com/new (leave “Add a README” unticked).
2. In this folder, run:
   ```
   git remote add origin https://github.com/<your-username>/h2o.git
   git push -u origin main
   ```
3. On the repo page: **Settings → Pages → Source: Deploy from a branch → Branch: `main`, folder `/ (root)` → Save**.
4. After 1–2 minutes your link is **`https://<your-username>.github.io/h2o/`**. Send it to your friends.

To publish changes later: `git add -A && git commit -m "update" && git push`.

## Run locally
```
python -m http.server 3000
```
Open http://localhost:3000. Add `?test=1` for a 1-minute interval and a 30-second pause.

## Desktop app (`desktop/`, work in progress)
An Electron tray app that shows the animated boy **over any app**, with an H2O control window (ON/OFF, pause, start with Windows). It works when run from source:
```
cd desktop
npm install
npm start            # add -- --test for 1-minute reminders
```
Windows **Smart App Control** blocks unsigned programs, so the installer (`npm run dist`) needs to be **code-signed** (e.g. Azure Trusted Signing) before friends can install it.
