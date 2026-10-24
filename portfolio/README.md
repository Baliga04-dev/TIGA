# Portfolio

Static site (no build step) for https://baliga04-dev.github.io: ThreeUI's "Kage" night temple, drawn live in WebGL, with the camera walking up to the hall as you scroll. Preview through any local server (`python3 -m http.server`).

- `street.js` is Kage's engine by Meng To ([ThreeUI](https://github.com/MengTo/threeui), MIT) with three changes: the wordmark reads ADITHYA, the hall's plaque shows the shop name a visitor types into the contact form (`drawPlaque`), and reduced motion holds the scene still. `assets/kage/` holds Kage's pictures (MIT, licence copied there).
- `page.css` is Kage's stylesheet with this page's additions at the end (the foreground cut-outs stand behind the page here, so they never hide content).
- `app.js` runs the demo phone (bakery, salon, clinic) and the WhatsApp links. Set your number in `site.config.js`.
- `?shot=N` renders scroll position N still (for screenshots); `?nogl=1` shows the no-WebGL fallback. `assets/poster.webp` is the link-preview image.
- Prices are not shown on the site; they go into each client's proposal from Tiga's Settings, "Your prices".
- Fonts are bundled under `fonts/` (SIL Open Font License; licences included). three.js is in `vendor/` (MIT).
