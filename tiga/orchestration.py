"""Tiga's research, prompt, agent, and GitHub orchestration services.

The services are deliberately explicit: a run is requested through the API and
returns a report. This keeps automation observable and avoids making code or
email changes without a user-visible action.
"""

from __future__ import annotations

import asyncio
import base64
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from email.utils import parseaddr
from pathlib import Path
from typing import Any
from urllib.parse import quote_plus
from xml.etree import ElementTree

from defusedxml import ElementTree as SafeElementTree

import httpx

import config

HTTP_TIMEOUT = 12.0
PROJECT_ROOT = Path(__file__).parent.parent


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def research_leads(topic: str, limit: int = 10) -> dict[str, Any]:
    """Find public, recent signals from RSS feeds.

    This intentionally uses public feeds rather than scraping private or
    authenticated Facebook content. A Facebook Page RSS/API integration can be
    added later with an explicit access token and permission.
    """
    query = quote_plus(topic.strip() or "small business technology")
    feeds = [
        ("Google News", f"https://news.google.com/rss/search?q={query}"),
        ("Hacker News", "https://hnrss.org/frontpage"),
    ]
    per_feed: list[list[dict[str, str]]] = []
    errors: list[str] = []
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT, follow_redirects=True) as client:
        for source, url in feeds:
            found: list[dict[str, str]] = []
            try:
                response = await client.get(url, headers={"user-agent": "Tiga/1.0"})
                response.raise_for_status()
                root = SafeElementTree.fromstring(response.text)
                for item in root.findall(".//item"):
                    title = (item.findtext("title") or "").strip()
                    link = (item.findtext("link") or "").strip()
                    published = (item.findtext("pubDate") or "").strip()
                    if title and link:
                        found.append(
                            {
                                "source": source,
                                "title": title,
                                "url": link,
                                "published": published,
                                "client_signal": _signal_for(title),
                            }
                        )
            except (httpx.HTTPError, ElementTree.ParseError, ValueError) as exc:
                errors.append(f"{source}: {type(exc).__name__}")
            per_feed.append(found)

    cap = max(1, min(limit, 50))
    leads: list[dict[str, str]] = []
    seen: set[str] = set()
    for rank in range(max((len(f) for f in per_feed), default=0)):
        for found in per_feed:
            if rank < len(found) and found[rank]["url"] not in seen and len(leads) < cap:
                seen.add(found[rank]["url"])
                leads.append(found[rank])
    return {
        "ok": bool(leads) or not errors,
        "topic": topic,
        "searched_at": _now(),
        "sources": [name for name, _ in feeds],
        "leads": leads,
        "errors": errors,
        "note": "Only public feeds are searched; private Facebook data is not accessed.",
    }


def _signal_for(title: str) -> str:
    text = title.lower()
    if any(word in text for word in ("launch", "funding", "growth", "expanding")):
        return "growth or launch signal"
    if any(word in text for word in ("outage", "broken", "security", "problem")):
        return "possible pain point"
    if any(word in text for word in ("ai", "automation", "software", "app")):
        return "technology demand"
    return "needs manual qualification"


async def generate_prompt(
    idea: str,
    outcome: str,
    audience: str = "",
    stack: str = "",
    constraints: str = "",
    research_topic: str = "",
) -> dict[str, Any]:
    if not idea.strip() or not outcome.strip():
        return {"ok": False, "error": "idea and outcome are required"}
    research = await research_leads(research_topic or idea, limit=6)
    evidence = "\n".join(
        f"- {lead['title']} ({lead['source']}): {lead['url']}"
        for lead in research["leads"]
    )
    prompt = f"""You are a senior product and engineering planner.

Goal: {outcome}
Idea: {idea}
Target audience: {audience or "Ask clarifying questions before implementation"}
Preferred stack: {stack or "Choose a justified, maintainable stack"}
Constraints: {constraints or "State assumptions and risks explicitly"}

Use the research signals below as leads, not as unquestioned facts:
{evidence or "- No public research results were available; say what must be verified."}

Produce:
1. A concise understanding of the problem.
2. Assumptions and five high-value questions.
3. A phased implementation plan with acceptance criteria.
4. Data, security, integration, and testing considerations.
5. The smallest useful first version and the next actions.
Do not invent facts or claim that a source was verified unless its URL is cited."""
    return {
        "ok": True,
        "generated_at": _now(),
        "prompt": prompt,
        "research": research,
        "questions": [
            "Who is the first user and what measurable outcome defines success?",
            "What must be integrated, and which integrations are optional?",
            "What data is sensitive and how long may it be retained?",
            "What is explicitly out of scope for the first version?",
            "How will the result be tested and operated after launch?",
        ],
    }


async def run_agent_cycle() -> dict[str, Any]:
    """Run manager -> dev -> tester and return a single auditable report."""
    manager = _manager_report()
    dev = _dev_report()
    tester = await _tester_report()
    report = {
        "ok": tester["ok"],
        "run_at": _now(),
        "manager": manager,
        "dev": dev,
        "tester": tester,
        "flow": ["manager", "dev", "tester"],
    }
    return report


def _manager_report() -> dict[str, Any]:
    return {
        "agent": "manager",
        "status": "ready",
        "responsibilities": [
            "triage bugs and improvements",
            "coordinate dev and tester",
            "prepare the daily report",
        ],
        "next_actions": [
            "Review tester findings",
            "Approve changes before production sync",
            "Send the daily report when Gmail is configured",
        ],
    }


def _dev_report() -> dict[str, Any]:
    return {
        "agent": "dev",
        "status": "ready",
        "responsibilities": [
            "implement approved changes",
            "keep the working tree and GitHub repository aligned",
            "never push secrets or unreviewed generated changes",
        ],
    }


async def _tester_report() -> dict[str, Any]:
    checks = [await asyncio.to_thread(_run_backend_check)]
    suite = await asyncio.to_thread(_run_test_suite)
    if suite:
        checks.append(suite)
    ok = all(check["ok"] for check in checks)
    return {
        "agent": "tester",
        "ok": ok,
        "status": "passed" if ok else "failed",
        "checks": checks,
    }


def _run_backend_check() -> dict[str, Any]:
    try:
        import main  # noqa: F401

        return {"name": "backend_import", "ok": True, "detail": "FastAPI import succeeded"}
    except Exception as exc:
        return {"name": "backend_import", "ok": False, "detail": f"{type(exc).__name__}: {exc}"}


def _run_test_suite() -> dict[str, Any] | None:
    """Run the backend pytest suite; skipped inside a test run to avoid recursion."""
    backend_dir = Path(__file__).parent
    if os.environ.get("TIGA_TESTER_CHILD") or not (backend_dir / "tests").is_dir():
        return None
    try:
        proc = subprocess.run(
            [sys.executable, "-m", "pytest", "-q", "-x", "--no-header"],
            cwd=backend_dir,
            capture_output=True,
            text=True,
            timeout=300,
            env={**os.environ, "TIGA_TESTER_CHILD": "1"},
            check=False,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        return {"name": "backend_tests", "ok": False, "detail": f"{type(exc).__name__}: {exc}"}
    tail = (proc.stdout or proc.stderr).strip().splitlines()[-1:] or [""]
    return {"name": "backend_tests", "ok": proc.returncode == 0, "detail": tail[0]}


def _git_auth_env() -> dict[str, str]:
    """Pass the token to git through the environment so it never shows in `ps`."""
    token = base64.b64encode(f"x-access-token:{config.GITHUB_TOKEN}".encode()).decode()
    return {
        **os.environ,
        "GIT_TERMINAL_PROMPT": "0",
        "GIT_CONFIG_COUNT": "1",
        "GIT_CONFIG_KEY_0": "http.extraheader",
        "GIT_CONFIG_VALUE_0": f"AUTHORIZATION: basic {token}",
    }


async def _git(*args: str, auth: bool = False) -> subprocess.CompletedProcess:
    return await asyncio.to_thread(
        subprocess.run,
        ["git", "-C", str(PROJECT_ROOT), *args],
        capture_output=True,
        text=True,
        check=False,
        env=_git_auth_env() if auth else None,
    )


async def github_sync_status() -> dict[str, Any]:
    """Report GitHub sync state; pushing remains an explicit operation."""
    result: dict[str, Any] = {
        "repository": config.GITHUB_REPOSITORY,
        "configured": bool(config.GITHUB_REPOSITORY),
        "token_configured": bool(config.GITHUB_TOKEN),
        "branch": config.GITHUB_BRANCH,
        "working_tree": "unknown",
    }
    try:
        status = await _git("status", "--short")
        result["working_tree"] = status.stdout.strip() or "clean"
    except OSError as exc:
        result["working_tree"] = f"git unavailable: {exc}"
    return result


async def github_sync_push() -> dict[str, Any]:
    """Push commits that already exist. Never stages, commits, or rewrites the remote."""
    if not config.GITHUB_REPOSITORY:
        return {"ok": False, "error": "GITHUB_REPOSITORY is not configured"}
    if not config.GITHUB_TOKEN:
        return {"ok": False, "error": "GITHUB_TOKEN is not configured; no push was attempted"}
    if "/" not in config.GITHUB_REPOSITORY:
        return {"ok": False, "error": "GITHUB_REPOSITORY must be owner/repository"}

    branch = config.GITHUB_BRANCH
    try:
        if (await _git("rev-parse", "--is-inside-work-tree")).returncode != 0:
            return {"ok": False, "error": "The project folder is not a git repository"}
        current = (await _git("rev-parse", "--abbrev-ref", "HEAD")).stdout.strip()
        if current != branch:
            return {"ok": False, "error": f"The current branch is '{current}'; switch to '{branch}' before syncing"}
        if (await _git("remote", "get-url", "origin")).returncode != 0:
            return {"ok": False, "error": "No 'origin' remote is set; add one with git remote add origin <url>"}
        dirty = (await _git("status", "--porcelain")).stdout.strip()
        if dirty:
            return {"ok": False, "error": "There are uncommitted changes; commit or stash them first. Nothing was pushed."}

        fetch = await _git("fetch", "origin", f"+refs/heads/{branch}:refs/remotes/origin/{branch}", auth=True)
        remote_has_branch = fetch.returncode == 0
        if not remote_has_branch and "couldn't find remote ref" not in fetch.stderr:
            return {"ok": False, "error": f"Could not reach the remote: {fetch.stderr.strip()[-300:]}"}

        ahead, behind = 0, 0
        if remote_has_branch:
            counts = (await _git("rev-list", "--left-right", "--count", f"HEAD...origin/{branch}")).stdout.split()
            ahead, behind = int(counts[0]), int(counts[1])
        else:
            ahead = int((await _git("rev-list", "--count", "HEAD")).stdout.strip() or 0)
        if behind:
            return {"ok": False, "error": f"The local branch is {behind} commit(s) behind origin/{branch}; pull or rebase first"}
        if not ahead:
            return {"ok": True, "pushed": False, "repository": config.GITHUB_REPOSITORY, "branch": branch, "detail": "Nothing to push"}

        push = await _git("push", "origin", f"HEAD:refs/heads/{branch}", auth=True)
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


async def send_daily_report(report: dict[str, Any]) -> dict[str, Any]:
    if not Path(config.GMAIL_CREDENTIALS_FILE).exists():
        return {"ok": False, "error": "Gmail is not configured"}
    import gmail_service

    recipient = config.ADMIN_REPORT_EMAIL or config.GMAIL_USER_EMAIL
    body = json.dumps(report, indent=2, default=str)
    try:
        result = await asyncio.to_thread(
            gmail_service.gmail_service.send_email,
            recipient,
            f"Tiga daily systems report - {datetime.now().date()}",
            body,
        )
        return {"ok": bool(result.get("ok")), "recipient": parseaddr(recipient)[1], "result": result}
    except Exception as exc:
        return {"ok": False, "error": f"{type(exc).__name__}: {exc}"}
