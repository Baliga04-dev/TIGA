# Tiga Bridge (Edge extension)

Lets Tiga list, switch, read and close your Edge tabs. It talks only to Tiga at `ws://127.0.0.1:8000`, and only with the token from `tiga/.env` (`TIGA_BRIDGE_TOKEN`). Closing tabs and anything after Tiga reads a page needs your Confirm click in Tiga.

Install once:
1. Copy this `bridge` folder somewhere Windows can see it, for example `C:\Users\<you>\tiga-bridge` (Edge can't load from `\\wsl$` reliably).
2. Edge: open `edge://extensions`, turn on **Developer mode**, click **Load unpacked**, pick the folder.
3. Click the Tiga Bridge icon, paste the token from Tiga's Settings page, **Save and connect**.
