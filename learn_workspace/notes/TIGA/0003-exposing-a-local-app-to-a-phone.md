---
title: Exposing a local app to a phone, safely
kind: decision
date: 2026-11-09
summary: How Tiga's phone remote opens one page on the home Wi-Fi without opening the rest of Tiga (docs/adr/0007)
---
## What it is
Tiga is a local-first app: its API controls email drafts, the PC's volume, browser tabs. The phone remote needs some of that from another device. The design keeps everything closed by default and opens one narrow door: the `/phone` page and `/api/phone/*`, and only to a phone holding a pairing code.

## Why we picked it
Alternatives weighed: a Telegram or ntfy bot (works away from home, but every command and reply would pass through a third party, against local-first); HTTPS with a self-signed certificate (warnings on every phone, only to unlock the browser's own speech API, and the phone keyboard's dictation already works on plain http); Tailscale (good for later, but needs an account and an app on both devices). LAN plus a pairing code needs no accounts and keeps data on the PC. The cost: it only works at home, on the same Wi-Fi.

## How it works here
- `TIGA_PHONE=on` makes uvicorn listen on `0.0.0.0`; otherwise it stays on `127.0.0.1`
- `main.only_the_phone_from_the_network`: a request whose client address isn't loopback gets 403 unless the path is `/phone`, `/phone/<asset>` or `/api/phone/...`. The extension's websocket refuses such clients too.
- `uvicorn.run(..., proxy_headers=False)`: the client address is the socket's, so no `X-Forwarded-For` header can make a request look local
- `/api/phone/*` needs the header `X-Tiga-Phone` matching the pairing code, compared with `hmac.compare_digest`. The code comes from a QR on Settings as `/phone#k=CODE`; the fragment is never sent to the server, and the page moves it into its own storage and strips it from the address bar.
- The page is plain static files with a strict Content-Security-Policy (`script-src 'self'`, no inline script or style, `frame-ancestors 'none'`)
- Commands go through `brain.respond` and buttons through `executor.execute`, so the confirm-by-click rules still apply; a tap on the phone confirms, a voice command never does
- Tests pretend to be the phone with `TestClient(main.app, client=("192.168.0.50", 51000))`

## What bit us
- The existing cross-site guard refused the phone's own POSTs: their `Origin` is `http://192.168.0.102:8000`, not localhost. Fix: also allow an origin equal to the request's own host.
- Starlette's TestClient reports the client host as `"testclient"`, not loopback, so a guard that always blocked non-loopback clients would have failed every existing test. The guard only applies when Tiga is listening beyond loopback.
- In `phone.js` a local `var history = []` hid `window.history`, so `history.replaceState` would have crashed. Renamed it to `turns`.
- The browser's speech recognition and `getUserMedia` need a secure context (HTTPS or localhost), so on `http://192.168.x.x` the page relies on the keyboard's microphone instead.
- `navigator.vibrate` is blocked until the user has tapped the page; the first alert check now only fills the list.

## Say it in an interview
I added a phone remote to my local assistant so I could control it while music drowned out the PC's microphone. The risk is that binding to the network exposes the whole API, so I made it opt-in and put a middleware in front that gives other devices only the phone's routes. The phone also needs a pairing code that travels in the URL fragment, so it never reaches server logs. I turned off proxy-header trust so nothing can spoof a local address, and I test it by giving the test client a LAN IP.

## What interviewers ask
**Q: Why put the pairing code in the URL fragment instead of a query string?**
Browsers never send the fragment to the server, so it doesn't land in server logs, proxies or Referer headers. The page reads it once, saves it and removes it from the address bar.

**Q: Why turn off uvicorn's proxy headers?**
By default uvicorn trusts `X-Forwarded-For` from 127.0.0.1 and ::1 (`FORWARDED_ALLOW_IPS`), so a request through a local proxy could claim to come from another address, or the other way round. With no reverse proxy in front, the socket address is the truth, so trusting headers only adds a way to lie.

**Q: Is a shared secret over plain HTTP safe on a home network?**
It's acceptable for a home LAN, where an attacker would already need to be on the Wi-Fi. Anyone sniffing the Wi-Fi could read it, which is why the routes it unlocks are limited, everything risky still needs a tap, and a new code locks out the old phone. Leaving home would need HTTPS, for example through Tailscale.

**Q: What does the Content-Security-Policy protect against?**
If any text Tiga shows were ever injected as markup, the browser would still refuse to run inline or third-party scripts and refuse to be framed by another site.

## Go deeper
- MDN, Secure contexts: https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts
- MDN, URI fragment: https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Fragment
- MDN, Content-Security-Policy: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy
- Uvicorn settings (proxy headers): https://www.uvicorn.org/settings/
