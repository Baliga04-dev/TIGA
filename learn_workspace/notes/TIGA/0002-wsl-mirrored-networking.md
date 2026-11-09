---
title: WSL mirrored networking
kind: concept
date: 2026-11-09
summary: How a server inside WSL becomes reachable from a phone on the same Wi-Fi; set up by phone_setup.ps1 for Tiga's phone remote
---
## What it is
WSL 2 runs Linux in a small virtual machine. By default it uses NAT: Linux gets its own private address (here `172.20.157.63`), and Windows forwards only `localhost` to it. Other devices on the Wi-Fi can't reach it. Mirrored mode instead gives WSL the same network interfaces as Windows, so a server in WSL is on the PC's Wi-Fi address (here `192.168.0.102`).

## Why we picked it
The phone remote needs the phone to open Tiga, which runs in WSL. In NAT mode the fix is a `netsh interface portproxy` rule pointing at WSL's address, but that address can change after a restart, so the rule breaks. Mirrored mode is set once in `.wslconfig` and keeps working. The costs: it needs Windows 11 22H2 or later (this PC is build 26200), changing it means `wsl --shutdown`, which stops everything running in WSL, and every firewall step needs an administrator.

## How it works here
- `wslinfo --networking-mode` printed `nat`; `ip -4 addr` showed only `172.x`, so the phone had no way in
- `phone_setup.ps1` (run once as administrator) writes `networkingMode=mirrored` under `[wsl2]` in `%USERPROFILE%\.wslconfig`, backing the file up first
- It adds a Windows Firewall rule for TCP 8000 on the Private profile only, and a Hyper-V firewall rule: `New-NetFirewallHyperVRule ... -VMCreatorId '{40E0AC32-46A5-438A-A0B2-2B479E8F2E90}' -Protocol TCP -LocalPorts 8000`
- It offers to mark the current Wi-Fi as Private, because Windows had it as Public, where the rule doesn't apply
- Tiga listens on `0.0.0.0` only when `TIGA_PHONE=on` (`config.listen_host`)

## What bit us
- After turning the phone remote on, `ss -ltn` still showed `127.0.0.1:8000`. The `.env` template pinned `HOST=127.0.0.1`, which beat the new default. Fix: `listen_host` lets the phone switch override a loopback HOST, and the template's HOST is now empty.
- Since WSL 2.0.9 on Windows 11 22H2+, the Hyper-V firewall is on by default, so a normal Windows Firewall rule alone isn't enough in mirrored mode.
- The script's syntax was checked with PowerShell's parser (`[System.Management.Automation.Language.Parser]::ParseFile`) without running it, because firewall changes need admin rights and shouldn't be tried blindly.

## Say it in an interview
Tiga runs in WSL, and I wanted my phone to control it over the home Wi-Fi. WSL's default NAT network hides it from the LAN, so I wrote a one-time admin script that switches WSL to mirrored networking and opens one port, only for private networks, in both Windows Firewall and WSL's Hyper-V firewall. The app side matters as much: it binds to all interfaces only when the phone feature is on, and then answers other devices with nothing but the phone's page and API.

## What interviewers ask
**Q: Why can't my phone reach a server I started in WSL?**
In NAT mode WSL is behind a private address that only Windows can see; Windows forwards localhost to it, nothing else. Either add a port proxy on Windows to WSL's address, or switch to mirrored networking. The firewall must allow it too.

**Q: Why mirrored rather than a port proxy?**
The port proxy points at WSL's current address, which can change after a restart, so it needs redoing. Mirrored mode is one setting that keeps working, at the cost of needing a recent Windows 11 and a WSL restart.

**Q: What's the difference between binding 127.0.0.1 and 0.0.0.0?**
127.0.0.1 accepts connections only from the same machine. 0.0.0.0 accepts them on every interface, including the Wi-Fi. Bind wide only when you mean to, and then check who is calling.

**Q: Why limit the firewall rule to the Private profile?**
So the port is only open on networks you've marked as trusted, like home Wi-Fi, and stays closed on café or airport Wi-Fi.

## Go deeper
- Microsoft Learn, Accessing network applications with WSL: https://learn.microsoft.com/en-us/windows/wsl/networking
