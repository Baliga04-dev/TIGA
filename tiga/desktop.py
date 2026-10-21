"""Open things on the owner's desktop. Inside WSL that means the Windows side, via cmd.exe interop.

Interface: `open_url(url) -> bool`. Only plain http(s) URLs with no spaces or quotes are ever handed to
the shell; `&` is caret-escaped for cmd.exe, and cmd runs from /mnt/c to avoid its UNC-path warning.
"""
from __future__ import annotations

import re
import subprocess
import webbrowser
from functools import lru_cache
from pathlib import Path
from typing import Callable

_SAFE_URL = re.compile(r"^https?://[A-Za-z0-9.\-]+(:\d+)?(/[A-Za-z0-9\-._~%!$&'()*+,;=:@/?#\[\]]*)?$")


@lru_cache(maxsize=1)
def in_wsl() -> bool:
    try:
        return "microsoft" in Path("/proc/version").read_text().lower()
    except OSError:
        return False


def open_url(url: str, *, run: Callable[..., subprocess.CompletedProcess] = subprocess.run,
             wsl: bool | None = None) -> bool:
    if not _SAFE_URL.match(url) or '"' in url or "^" in url:
        return False
    if not (in_wsl() if wsl is None else wsl):
        return bool(webbrowser.open(url, new=2))
    try:
        proc = run(["cmd.exe", "/c", "start", '""', url.replace("&", "^&")],
                   cwd="/mnt/c", capture_output=True, text=True, timeout=15)
    except (OSError, subprocess.SubprocessError):
        return False
    return proc.returncode == 0
