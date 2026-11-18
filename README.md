# Workout Log

A phone app for logging lifts. It opens from your home screen, works without signal, and syncs your plan and logs with a private GitHub repo and your Tredict account.

## Install on iPhone
1. Open this site in Safari.
2. Tap Share → Add to Home Screen.
3. Open it from the new icon, enter your GitHub repo and token, then your Tredict token in Settings.

After the first sync the app, the whole plan and your logs are saved on the phone. Opening the app, starting a workout and logging sets all work offline. Changes upload the next time you have signal.

## Files
- `index.html`, `style.css`, `app.js` — the app
- `defaults.js` — built-in exercise library and default rules (your data repo overrides these)
- `sw.js` — offline support. Bump `VERSION` whenever the app files change so phones pick up the update.
- `manifest.webmanifest`, `icons/` — home-screen install

No personal data lives in this repo.
