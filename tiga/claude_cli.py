"""Use the owner's Claude subscription as Tiga's AI by running the official `claude` CLI headless.

Interface: `complete(system, user) -> str` (raises RuntimeError on any failure) and `available()`.
Billing safety: the API-key variables are removed from the child's environment and `--bare` is never
used, because either would switch the call to paid API billing. All of Claude's own tools are turned
off (`--tools ""`): Tiga executes its own tools, so the model can only answer.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
from typing import Callable

_BILLING_VARS = ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX")
_WORKDIR = tempfile.mkdtemp(prefix="tiga-claude-")  # an empty folder: no project files or CLAUDE.md to pick up


def available() -> bool:
    return shutil.which("claude") is not None


def complete(system: str, user: str, *, model: str = "sonnet", timeout: int = 120,
             run: Callable[..., subprocess.CompletedProcess] = subprocess.run) -> str:
    env = {k: v for k, v in os.environ.items() if k not in _BILLING_VARS}
    args = ["claude", "-p", "--output-format", "json", "--model", model, "--tools", "",
            "--strict-mcp-config", "--setting-sources", "", "--no-session-persistence", "--system-prompt", system]
    try:
        proc = run(args, input=user, capture_output=True, text=True, timeout=timeout, env=env, cwd=_WORKDIR)
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(f"Claude timed out after {timeout}s") from exc
    except OSError as exc:
        raise RuntimeError(f"Could not run the claude CLI: {exc}") from exc
    if proc.returncode != 0 and not proc.stdout:
        raise RuntimeError(f"claude exited with {proc.returncode}: {(proc.stderr or '').strip()[-200:]}")
    try:
        data = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError("claude returned something that is not JSON") from exc
    if data.get("is_error"):
        raise RuntimeError(f"Claude refused or failed: {str(data.get('result', ''))[:200]}")
    return str(data.get("result", ""))
