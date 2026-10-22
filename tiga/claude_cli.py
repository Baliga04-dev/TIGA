"""Use the owner's Claude subscription as Tiga's AI by running the official `claude` CLI headless.

Interface: `complete(system, user) -> str` (raises RuntimeError on any failure) and `available()`.
Billing safety: the API-key variables are removed from the child's environment and `--bare` is never
used, because either would switch the call to paid API billing. All of Claude's own tools are turned
off (`--tools ""`): Tiga executes its own tools, so the model can only answer. The one exception is
`tools="Read"` with `workdir`: Claude may then read files in that one folder (a screenshot Tiga just took).
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
    return _run_cli(system, user, model=model, timeout=timeout, run=run)["text"]


def complete_meta(system: str, user: str, *, model: str = "sonnet", timeout: int = 120,
                  run: Callable[..., subprocess.CompletedProcess] = subprocess.run,
                  tools: str = "", workdir: str | None = None) -> dict:
    """Like `complete`, plus what the call used: tokens in/out, the CLI's cost estimate and duration."""
    return _run_cli(system, user, model=model, timeout=timeout, run=run, tools=tools, workdir=workdir)


def code(prompt: str, workdir: str, *, system: str, model: str = "sonnet", max_turns: int = 60, timeout: int = 1500,
         run: Callable[..., subprocess.CompletedProcess] = subprocess.run) -> dict:
    """An unattended Claude Code session for the Dev bot: file tools only (no shell, no web), edits accepted only
    inside `workdir` (a throwaway worktree), the project's CLAUDE.md as its guide, a turn and time limit."""
    import config

    env = {k: v for k, v in os.environ.items() if k not in _BILLING_VARS}
    args = ["claude", "-p", "--output-format", "json", "--model", model, "--tools", "Read,Edit,Write,Glob,Grep",
            "--permission-mode", "acceptEdits", "--max-turns", str(config.DEV_MAX_TURNS if max_turns == 60 else max_turns),
            "--strict-mcp-config", "--setting-sources", "", "--no-session-persistence", "--append-system-prompt", system]
    try:
        proc = run(args, input=prompt, capture_output=True, text=True, timeout=timeout, env=env, cwd=workdir)
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(f"Claude Code ran past {timeout // 60} minutes and was stopped") from exc
    except OSError as exc:
        raise RuntimeError(f"Could not run the claude CLI: {exc}") from exc
    try:
        data = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"claude exited with {proc.returncode}: {(proc.stderr or '').strip()[-200:]}") from exc
    return {"text": str(data.get("result", "")), "cost_usd": float(data.get("total_cost_usd") or 0),
            "turns": int(data.get("num_turns") or 0), "error": bool(data.get("is_error"))}


def _run_cli(system: str, user: str, *, model: str = "sonnet", timeout: int = 120,
             run: Callable[..., subprocess.CompletedProcess] = subprocess.run,
             tools: str = "", workdir: str | None = None) -> dict:
    if tools not in ("", "Read") or (tools and not workdir):
        raise ValueError("Claude may only be given Read, and only inside one folder")
    env = {k: v for k, v in os.environ.items() if k not in _BILLING_VARS}
    args = ["claude", "-p", "--output-format", "json", "--model", model, "--tools", tools,
            "--strict-mcp-config", "--setting-sources", "", "--no-session-persistence", "--system-prompt", system]
    try:
        proc = run(args, input=user, capture_output=True, text=True, timeout=timeout, env=env,
                   cwd=workdir if tools else _WORKDIR)
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
    usage = data.get("usage") or {}
    return {
        "text": str(data.get("result", "")),
        "input_tokens": sum(int(usage.get(k) or 0) for k in
                            ("input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens")),
        "output_tokens": int(usage.get("output_tokens") or 0),
        "cost_usd": float(data.get("total_cost_usd") or 0),
        "duration_ms": int(data.get("duration_ms") or 0),
        "model": model,
    }
