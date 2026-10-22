# Portfolio

Static site (no build step) for https://baliga04-dev.github.io: a Bengaluru shop street at night, drawn live in WebGL, that the camera walks down as you scroll. Open `index.html` through any local server to preview (`python3 -m http.server`).

- `street.js` is the scene and the page wiring, adapted from "Kage" in [ThreeUI](https://github.com/MengTo/threeui) by Meng To (MIT). The street itself (shops and their Kannada and English boards, the Rajyotsava arch, sodium lamps, autos, gulmohar petals, the board at the end of the street that shows the visitor's shop name) is in `SHOPS`, `buildShopAt`, `buildArch`, `buildLamp`, `buildAuto` and the `JOBS` list.
- `app.js` runs the demo phone (bakery, salon, clinic) and the WhatsApp links. Set your number in `site.config.js`.
- `page.css` is Kage's stylesheet re-themed, with this page's additions at the end.
- `?shot=N` renders scroll position N still (for screenshots); `?nogl=1` shows the no-WebGL fallback, which uses `assets/street-poster.webp`.
- Prices are not shown on the site; they go into each client's proposal from Tiga's Settings, "Your prices".
- Fonts are bundled under `fonts/` (SIL Open Font License; licences included). three.js is in `vendor/` (MIT).
