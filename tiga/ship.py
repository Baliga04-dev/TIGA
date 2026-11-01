"""Ship the current branch with no one watching: test it, push it, open a PR, merge it, sync main.

The owner merges nothing by hand (2026-11-01); this is how Claude lands a finished branch.
It refuses main, a dirty tree, a branch with nothing new, and any failing test, so the
tests are the only gate (the repo has no CI). Merges use a merge commit, like PR #1.
The Dev bot never calls this: its pull requests stay drafts (docs/adr/0005).

    .venv/bin/python ship.py            # from tiga/, on a feature branch
"""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
import urllib.error
import urllib.request

import config
import git_ops

ROOT = git_ops.PROJECT_ROOT
BASE = config.GITHUB_BRANCH or "main"
ATTRIBUTION = "🤖 Generated with [Claude Code](https://claude.com/claude-code)"


class ShipError(RuntimeError):
    pass


def git(*args: str) -> str:
    r = subprocess.run(["git", *args], cwd=ROOT, env=git_ops.auth_env(), capture_output=True, text=True)
    if r.returncode:
        raise ShipError(f"git {' '.join(args)} failed: {(r.stderr or r.stdout).strip()}")
    return r.stdout.strip()


def api(method: str, path: str, body: dict | None = None) -> dict | list:
    request = urllib.request.Request(
        f"https://api.github.com/repos/{config.GITHUB_REPOSITORY}{path}", method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Authorization": f"Bearer {config.GITHUB_TOKEN}", "Accept": "application/vnd.github+json",
                 "X-GitHub-Api-Version": "2022-11-28"},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read()
    except urllib.error.HTTPError as e:
        raise ShipError(f"GitHub {method} {path}: {e.code} {e.read().decode(errors='replace')[:300]}") from None
    return json.loads(raw) if raw else {}


def check(name: str, command: list[str], cwd) -> None:
    print(f"- {name}")
    r = subprocess.run(command, cwd=cwd, capture_output=True, text=True)
    if r.returncode:
        raise ShipError(f"{name} failed, nothing was pushed:\n{(r.stdout + r.stderr).strip()[-2000:]}")


def run_checks(changed: list[str]) -> None:
    check("backend tests", [str(ROOT / "tiga/.venv/bin/pytest"), "-q"], ROOT / "tiga")
    if any(path.startswith("frontend/") for path in changed):
        if not shutil.which("npm"):
            raise ShipError("frontend files changed but npm is not on PATH (load nvm first)")
        for name, command in (("frontend lint", ["npm", "run", "lint"]), ("frontend types", ["npx", "tsc", "--noEmit"]),
                              ("frontend tests", ["npm", "test", "--", "--run"])):
            check(name, command, ROOT / "frontend")


def pull_request(branch: str) -> dict:
    owner = config.GITHUB_REPOSITORY.split("/")[0]
    open_prs = api("GET", f"/pulls?state=open&head={owner}:{branch}")
    if open_prs:
        return open_prs[0]
    subjects = git("log", "--format=%s", f"origin/{BASE}..HEAD").splitlines()
    title = subjects[-1] if len(subjects) == 1 else branch.split("/")[-1].replace("-", " ").capitalize()
    body = git("log", "--reverse", "--format=### %s%n%n%b", f"origin/{BASE}..HEAD")
    body = "\n".join(line for line in body.splitlines() if not line.startswith("Co-Authored-By:")).strip()
    return api("POST", "/pulls", {"title": title, "head": branch, "base": BASE, "body": f"{body}\n\n{ATTRIBUTION}"})


def ship() -> str:
    if not (config.GITHUB_TOKEN and config.GITHUB_REPOSITORY):
        raise ShipError("GITHUB_TOKEN and GITHUB_REPOSITORY must be set in tiga/.env")
    branch = git("rev-parse", "--abbrev-ref", "HEAD")
    if branch in (BASE, "HEAD"):
        raise ShipError(f"switch to a feature branch first (on {branch})")
    if git("status", "--porcelain", "--untracked-files=no"):
        raise ShipError("commit or stash your changes first")
    git("fetch", "origin", "--prune")
    if git("rev-list", "--count", f"origin/{BASE}..HEAD") == "0":
        raise ShipError(f"{branch} has nothing that is not already on {BASE}")
    run_checks(git("diff", "--name-only", f"origin/{BASE}...HEAD").splitlines())
    print(f"- push {branch}")
    git("push", "-u", "origin", branch)
    pr = pull_request(branch)
    print(f"- merge PR #{pr['number']}")
    api("PUT", f"/pulls/{pr['number']}/merge", {"merge_method": "merge"})
    api("DELETE", f"/git/refs/heads/{branch}")
    git("switch", BASE)
    git("pull", "--ff-only", "origin", BASE)
    git("branch", "-D", branch)  # merged on GitHub as a merge commit; local main now contains it
    git("fetch", "origin", "--prune")
    return pr["html_url"]


if __name__ == "__main__":
    try:
        print(f"Merged {ship()}; {BASE} is up to date here.")
    except ShipError as e:
        print(f"Not shipped: {e}", file=sys.stderr)
        raise SystemExit(1)
