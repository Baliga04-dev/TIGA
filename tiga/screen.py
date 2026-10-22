"""Take one screenshot of the Windows desktop, on request, for Tiga to look at.

Interface: `capture(run=None, folder=None) -> Path | None` (run defaults to `pc.run_powershell`) saves the whole desktop as
`screen.png` in a fresh private folder (None if Windows could not take it) and `discard(path)` deletes
that folder. Nothing is ever captured in the background; the caller deletes the shot once it is read.
"""
from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Callable

import pc

# DPI-aware (or a scaled display captures only part of itself), every monitor, scaled to at most
# 1600 px wide: Claude reads images at about that size anyway.
_CAPTURE = (
    "Add-Type -AssemblyName System.Windows.Forms,System.Drawing;"
    "Add-Type -MemberDefinition '[DllImport(\"user32.dll\")] public static extern bool SetProcessDPIAware();' "
    "-Name D -Namespace W;[W.D]::SetProcessDPIAware()|Out-Null;"
    "$b=[System.Windows.Forms.SystemInformation]::VirtualScreen;"
    "$full=New-Object System.Drawing.Bitmap $b.Width,$b.Height;"
    "$g=[System.Drawing.Graphics]::FromImage($full);$g.CopyFromScreen($b.Left,$b.Top,0,0,$full.Size);"
    "$k=[Math]::Min([double]1,[double]1600/$b.Width);$w=[int]($b.Width*$k);$h=[int]($b.Height*$k);"
    "$out=New-Object System.Drawing.Bitmap $w,$h;$g2=[System.Drawing.Graphics]::FromImage($out);"
    "$g2.InterpolationMode='HighQualityBicubic';$g2.DrawImage($full,0,0,$w,$h);"
    "$out.Save('{path}',[System.Drawing.Imaging.ImageFormat]::Png)"
)


def to_windows(path: Path) -> str:
    """The Windows path of a WSL file, so PowerShell can write it."""
    proc = subprocess.run(["wslpath", "-w", str(path)], capture_output=True, text=True, timeout=10)
    return proc.stdout.strip() or str(path)


def capture(run: Callable[..., bool] | None = None, folder: Path | None = None) -> Path | None:
    run = run or pc.run_powershell   # looked up per call, so tests' fake PowerShell applies
    folder = folder or Path(tempfile.mkdtemp(prefix="tiga-screen-"))
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / "screen.png"
    try:
        ok = run(_CAPTURE.replace("{path}", to_windows(target).replace("'", "''")))
    except (OSError, subprocess.SubprocessError):
        ok = False
    if ok and target.exists() and target.stat().st_size > 0:
        return target
    discard(target)
    return None


def discard(path: Path) -> None:
    shutil.rmtree(path.parent, ignore_errors=True)
