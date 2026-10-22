"""Control the Windows PC from WSL: volume, media keys, opening allowlisted apps, locking the screen.

Interface: `key_script(keys)`, `volume_script(action, level)`, `app_command(name)` build PowerShell text from
fixed pieces (only validated integers and allowlisted app names ever enter a script), and
`run_powershell(script)` runs it with Windows PowerShell from /mnt/c.
"""
from __future__ import annotations

import subprocess
from typing import Callable

VK = {"volume_up": 175, "volume_down": 174, "mute": 173, "next": 176, "previous": 177, "play_pause": 179}
APPS = {
    "vs code": "code", "vscode": "code", "code": "code", "visual studio code": "code",
    "spotify": "spotify:", "explorer": "explorer", "file explorer": "explorer", "files": "explorer",
    "edge": "msedge", "browser": "msedge", "calculator": "calc", "calc": "calc", "notepad": "notepad",
    "settings": "ms-settings:", "whatsapp": "whatsapp:", "terminal": "wt", "paint": "mspaint",
}
_KEYBD = ('$s=\'[DllImport("user32.dll")] public static extern void keybd_event(byte v, byte s, uint f, UIntPtr e);\';'
          "$k=Add-Type -MemberDefinition $s -Name K -Namespace W -PassThru;")


def key_script(keys: list[str]) -> str:
    codes = ",".join(str(VK[k]) for k in keys)  # KeyError for anything unknown
    return (_KEYBD + f"foreach($c in @({codes})){{$k::keybd_event($c,0,0,[UIntPtr]::Zero);"
            "$k::keybd_event($c,0,2,[UIntPtr]::Zero);Start-Sleep -Milliseconds 15}")


def volume_script(action: str, level: int | None = None) -> str:
    if action in ("up", "down"):
        return key_script([f"volume_{action}"] * 5)  # about 10%
    if action == "mute":
        return key_script(["mute"])
    if action == "set" and level is not None and 0 <= level <= 100:
        return key_script(["volume_down"] * 50 + ["volume_up"] * round(level / 2))
    raise ValueError("volume action must be up, down, mute, or set with a level from 0 to 100")


def app_command(name: str) -> str | None:
    return APPS.get(name.strip().lower().removesuffix(" app"))


def run_powershell(script: str, *, run: Callable[..., subprocess.CompletedProcess] = subprocess.run) -> bool:
    try:
        proc = run(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script],
                   cwd="/mnt/c", capture_output=True, text=True, timeout=20)
    except (OSError, subprocess.SubprocessError):
        return False
    return proc.returncode == 0
