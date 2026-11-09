# 7. The phone remote listens on the home Wi-Fi, opt-in, and other devices get only its routes

Status: accepted (2026-11-09)

When music plays, the PC's microphone can't hear "Hey Tiga". The owner talks to Tiga from their phone instead:
`TIGA_PHONE=on` makes Tiga listen on all interfaces, and `phone.py` serves a page at `/phone` with media and
volume buttons, a command box (the phone keyboard's dictation works on any page) and the confirm/cancel taps.

- Off by default; with it off Tiga binds 127.0.0.1 as before.
- From any address other than this PC's loopback, the `only_the_phone_from_the_network` middleware answers
  `/phone`, `/phone/<asset>` and `/api/phone/*` only; everything else is 403, and the extension's websocket is
  refused. uvicorn runs with `proxy_headers` off, so no header can make a request look local.
- `/api/phone/*` needs the pairing code (`X-Tiga-Phone`), a random value in the store shown as a QR code on
  Settings; "New pairing code" locks out the old phone. The code travels in the URL fragment, which browsers
  don't send to servers, and the page then keeps it in its own storage.
- Commands run through `brain.respond` and buttons through `executor.execute`, so tiers, the pause switch,
  confirmations and the audit log are the same as in Chat. A tap on the phone confirms; a voice command never does.
- WSL's default NAT mode hides Tiga from the Wi-Fi. `phone_setup.ps1`, run once as administrator, switches
  WSL to mirrored networking and opens port 8000 for private networks only (Windows Firewall and WSL's
  Hyper-V firewall).

Not chosen: a Telegram or ntfy bot (works away from home, but every command and reply would pass through a
third party, against local-first); HTTPS with a self-signed certificate (warnings on every phone, only to get the
browser's own speech recognition, which the keyboard's dictation already covers); Tailscale (a good later step for
use away from home, but an account and an app on both devices).
