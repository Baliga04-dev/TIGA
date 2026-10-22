"""Daily code sync: push already-made commits to a dated `tiga/daily-YYYY-MM-DD` branch, never to main.

Refuses when the tree is dirty or the new commits contain a secret or a secret-named file.
Uses git_ops (token passed through git's environment, never argv).
"""
from __future__ import annotations

import re
from datetime import date
from typing import Any

import config
from git_ops import git as _git

SECRET_FILES = re.compile(r"(^|/)(\.env|token\.json|credentials\.json|.*\.pem|id_rsa)$")
SECRET_PATTERNS = [
    re.compile(r"gh[pousr]_[A-Za-z0-9]{30,}"),
    re.compile(r"github_pat_[A-Za-z0-9_]{30,}"),
    re.compile(r"sk-[A-Za-z0-9]{32,}"),
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    re.compile(r"xox[baprs]-[A-Za-z0-9-]{20,}"),
]


async def _scan(base: str) -> str | None:
    """Return a description of the first problem in commits after `base`, never the secret itself."""
    names = (await _git("diff", "--name-only", "--diff-filter=AM", f"{base}..HEAD")).stdout.split()
    for name in names:
        if SECRET_FILES.search(name):
            return f"{name} is a secret file and must not be pushed"
    patch = (await _git("diff", "--unified=0", f"{base}..HEAD")).stdout
    current = ""
    for line in patch.splitlines():
        if line.startswith("+++ b/"):
            current = line[6:]
        elif line.startswith("+") and any(p.search(line) for p in SECRET_PATTERNS):
            return f"{current} contains what looks like a secret; remove it and rewrite that commit first"
    return None


async def push_daily_branch(today: date) -> dict[str, Any]:
    if not config.GITHUB_REPOSITORY or "/" not in config.GITHUB_REPOSITORY:
        return {"ok": False, "error": "GITHUB_REPOSITORY must be set as owner/repository"}
    if not config.GITHUB_TOKEN:
        return {"ok": False, "error": "GITHUB_TOKEN is not configured; no push was attempted"}
    main, target = config.GITHUB_BRANCH, f"tiga/daily-{today.isoformat()}"
    current = (await _git("rev-parse", "--abbrev-ref", "HEAD")).stdout.strip()
    if current != main:
        return {"ok": False, "error": f"The current branch is '{current}'; switch to '{main}' before syncing"}
    if (await _git("status", "--porcelain")).stdout.strip():
        return {"ok": False, "error": "There are uncommitted changes; commit or stash them first. Nothing was pushed."}

    fetch = await _git("fetch", "origin", f"+refs/heads/{main}:refs/remotes/origin/{main}", auth=True)
    if fetch.returncode != 0:
        return {"ok": False, "error": f"Could not reach the remote: {fetch.stderr.strip()[-300:]}"}
    head = (await _git("rev-parse", "HEAD")).stdout.strip()
    if head == (await _git("rev-parse", f"origin/{main}")).stdout.strip():
        return {"ok": True, "pushed": False, "branch": target, "detail": "Nothing new since main"}

    problem = await _scan(f"origin/{main}")
    if problem:
        return {"ok": False, "error": problem}
    push = await _git("push", "origin", f"HEAD:refs/heads/{target}", auth=True)
    return {
        "ok": push.returncode == 0, "pushed": push.returncode == 0, "branch": target,
        "repository": config.GITHUB_REPOSITORY,
        "detail": (push.stdout or push.stderr).strip()[-500:],
    }
