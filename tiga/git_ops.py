"""Git operations shared by both GitHub sync paths.

Interface: `await git(*args, auth=False)`, `await status()`, `await push_current_branch()`.
The token goes through git's environment (never argv, never the remote URL); pushing only ever
sends commits that already exist: nothing is staged, committed or rewritten here.
"""
from __future__ import annotations

import asyncio
import base64
import os
import subprocess
from pathlib import Path
from typing import Any

import config

PROJECT_ROOT = Path(__file__).parent.parent


def auth_env() -> dict[str, str]:
    """Pass the token to git through the environment so it never shows in `ps`."""
    token = base64.b64encode(f"x-access-token:{config.GITHUB_TOKEN}".encode()).decode()
    return {
        **os.environ,
        "GIT_TERMINAL_PROMPT": "0",
        "GIT_CONFIG_COUNT": "1",
        "GIT_CONFIG_KEY_0": "http.extraheader",
        "GIT_CONFIG_VALUE_0": f"AUTHORIZATION: basic {token}",
    }


async def git(*args: str, auth: bool = False) -> subprocess.CompletedProcess:
    return await asyncio.to_thread(
        subprocess.run,
        ["git", "-C", str(PROJECT_ROOT), *args],
        capture_output=True,
        text=True,
        check=False,
        env=auth_env() if auth else None,
    )


async def status() -> dict[str, Any]:
    """Report GitHub sync state; pushing remains an explicit operation."""
    result: dict[str, Any] = {
        "repository": config.GITHUB_REPOSITORY,
        "configured": bool(config.GITHUB_REPOSITORY),
        "token_configured": bool(config.GITHUB_TOKEN),
        "branch": config.GITHUB_BRANCH,
        "working_tree": "unknown",
    }
    try:
        status = await git("status", "--short")
        result["working_tree"] = status.stdout.strip() or "clean"
    except OSError as exc:
        result["working_tree"] = f"git unavailable: {exc}"
    return result


async def push_current_branch() -> dict[str, Any]:
    """Push commits that already exist. Never stages, commits, or rewrites the remote."""
    if not config.GITHUB_REPOSITORY:
        return {"ok": False, "error": "GITHUB_REPOSITORY is not configured"}
    if not config.GITHUB_TOKEN:
        return {"ok": False, "error": "GITHUB_TOKEN is not configured; no push was attempted"}
    if "/" not in config.GITHUB_REPOSITORY:
        return {"ok": False, "error": "GITHUB_REPOSITORY must be owner/repository"}

    branch = config.GITHUB_BRANCH
    try:
        if (await git("rev-parse", "--is-inside-work-tree")).returncode != 0:
            return {"ok": False, "error": "The project folder is not a git repository"}
        current = (await git("rev-parse", "--abbrev-ref", "HEAD")).stdout.strip()
        if current != branch:
            return {"ok": False, "error": f"The current branch is '{current}'; switch to '{branch}' before syncing"}
        if (await git("remote", "get-url", "origin")).returncode != 0:
            return {"ok": False, "error": "No 'origin' remote is set; add one with git remote add origin <url>"}
        dirty = (await git("status", "--porcelain")).stdout.strip()
        if dirty:
            return {"ok": False, "error": "There are uncommitted changes; commit or stash them first. Nothing was pushed."}

        fetch = await git("fetch", "origin", f"+refs/heads/{branch}:refs/remotes/origin/{branch}", auth=True)
        remote_has_branch = fetch.returncode == 0
        if not remote_has_branch and "couldn't find remote ref" not in fetch.stderr:
            return {"ok": False, "error": f"Could not reach the remote: {fetch.stderr.strip()[-300:]}"}

        ahead, behind = 0, 0
        if remote_has_branch:
            counts = (await git("rev-list", "--left-right", "--count", f"HEAD...origin/{branch}")).stdout.split()
            ahead, behind = int(counts[0]), int(counts[1])
        else:
            ahead = int((await git("rev-list", "--count", "HEAD")).stdout.strip() or 0)
        if behind:
            return {"ok": False, "error": f"The local branch is {behind} commit(s) behind origin/{branch}; pull or rebase first"}
        if not ahead:
            return {"ok": True, "pushed": False, "repository": config.GITHUB_REPOSITORY, "branch": branch, "detail": "Nothing to push"}

        push = await git("push", "origin", f"HEAD:refs/heads/{branch}", auth=True)
        return {
            "ok": push.returncode == 0,
            "pushed": push.returncode == 0,
            "commits": ahead,
            "repository": config.GITHUB_REPOSITORY,
            "branch": branch,
            "detail": (push.stdout or push.stderr).strip()[-1000:],
        }
    except (OSError, subprocess.SubprocessError, ValueError, IndexError) as exc:
        return {"ok": False, "error": f"{type(exc).__name__}: {exc}"}
