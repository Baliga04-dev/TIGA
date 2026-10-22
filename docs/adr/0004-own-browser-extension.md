# 4. Real-tab access goes through our own extension, not remote debugging

Status: accepted (2026-10-22)

Tiga reaches the owner's existing Edge tabs through the Tiga Bridge extension (Manifest V3, loaded unpacked) that connects to Tiga on 127.0.0.1 with a shared secret. Page text it returns is untrusted (taints the Turn); clicks, typing and closing tabs are OUTWARD.

Why: Chromium 136+ refuses `--remote-debugging-port` on the everyday profile (cookie theft), Claude in Chrome is paid and Chrome-only, and an extension keeps every capability in code we test.
