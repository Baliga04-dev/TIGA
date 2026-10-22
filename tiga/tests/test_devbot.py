import asyncio
import subprocess
from pathlib import Path

import pytest

import config
import devbot
import git_ops
import services
import claude_cli

REAL_CODE = claude_cli.code   # taken at import, before the autouse guard replaces it for each test


def _git(repo: Path, *args: str) -> str:
    return subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True, check=True).stdout.strip()


@pytest.fixture
def repo(tmp_path, monkeypatch):
    """A small real repository standing in for the project, with main checked out and clean."""
    root = tmp_path / "project"
    (root / "tiga" / ".venv").mkdir(parents=True)
    (root / "frontend" / "node_modules").mkdir(parents=True)
    (root / ".gitignore").write_text(".venv/\nnode_modules/\n")
    (root / "tiga" / "app.py").write_text("GREETING = 'hello'\n")
    (root / "frontend" / "package.json").write_text("{}\n")
    _git(tmp_path, "init", "-q", "-b", "main", str(root))
    _git(root, "-c", "user.name=t", "-c", "user.email=t@example.com", "add", "-A")
    _git(root, "-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-q", "-m", "start")
    monkeypatch.setattr(git_ops, "PROJECT_ROOT", root)
    monkeypatch.setattr(config, "GITHUB_REPOSITORY", "owner/project")
    monkeypatch.setattr(config, "GITHUB_TOKEN", "token-for-tests")
    monkeypatch.setattr(config, "GITHUB_BRANCH", "main")
    return root


def _approved(title="Say namaskara instead of hello", body="The greeting should be Kannada."):
    store = services.get_store()
    issue = store.open_issue("improvement", title, dedupe_key=title, source="rnd", body=body)
    for status in ("triaged", "approved"):
        store.transition_issue(issue["id"], status, actor="user")
    return issue["id"]


def _bot(agent=None, tests=None, published=None, fetch_ok=False):
    async def default_agent(prompt, workdir):
        Path(workdir, "tiga", "app.py").write_text("GREETING = 'namaskara'\n")
        return {"text": "Changed the greeting to namaskara.", "cost_usd": 0.0}

    async def default_tests(workdir, frontend):
        return {"ok": True, "detail": "12 passed"}

    async def publish(branch, title, body):
        published.append({"branch": branch, "title": title, "body": body})
        return {"ok": True, "pr_url": f"https://github.com/owner/project/pull/7", "branch": branch}

    return devbot.DevBot(services.get_store(), agent=agent or default_agent, run_tests=tests or default_tests,
                         publish=publish, fetch=lambda: fetch_ok)


def test_builds_an_approved_issue_into_a_draft_pr(repo):
    iid = _approved()
    published = []
    out = asyncio.run(_bot(published=published).run(iid))
    assert out["ok"] and out["pr_url"].endswith("/pull/7"), out
    branch = published[0]["branch"]
    assert branch.startswith(f"tiga/dev-{iid}-say-namaskara") and published[0]["title"] == "Say namaskara instead of hello"
    assert _git(repo, "show", f"{branch}:tiga/app.py") == "GREETING = 'namaskara'"
    assert "Changed the greeting" in _git(repo, "log", "-1", "--format=%B", branch)
    assert _git(repo, "rev-parse", "--abbrev-ref", "HEAD") == "main"            # the owner's checkout is untouched
    assert (repo / "tiga" / "app.py").read_text() == "GREETING = 'hello'\n"
    assert _git(repo, "worktree", "list").count("\n") == 0                         # the throwaway worktree is gone
    issue = services.get_store().get_issue(iid)
    assert issue["status"] == "pr_open" and issue["pr_url"].endswith("/pull/7")
    assert "-> .venv" not in _git(repo, "show", "--stat", branch) and ".venv" not in _git(repo, "show", "--name-only", branch)


def test_no_change_sends_it_back(repo):
    iid = _approved()

    async def idle(prompt, workdir):
        return {"text": "I could not work out what to change.", "cost_usd": 0.0}

    published = []
    out = asyncio.run(_bot(agent=idle, published=published).run(iid))
    assert not out["ok"] and "no changes" in out["error"]
    issue = services.get_store().get_issue(iid)
    assert issue["status"] == "approved" and "no changes" in issue["dev_note"]
    assert published == [] and "tiga/dev-" not in _git(repo, "branch")


def test_failing_tests_push_nothing(repo):
    iid = _approved()

    async def red(workdir, frontend):
        return {"ok": False, "detail": "1 failed, 11 passed"}

    published = []
    out = asyncio.run(_bot(tests=red, published=published).run(iid))
    assert not out["ok"] and "1 failed" in out["error"]
    assert published == [] and services.get_store().get_issue(iid)["status"] == "approved"
    assert "tiga/dev-" not in _git(repo, "branch")


def test_frontend_tests_run_when_frontend_files_change(repo):
    iid = _approved()
    seen = []

    async def agent(prompt, workdir):
        Path(workdir, "frontend", "App.tsx").write_text("export {}\n")
        return {"text": "Added App.tsx", "cost_usd": 0.0}

    async def tests(workdir, frontend):
        seen.append(frontend)
        return {"ok": True, "detail": "ok"}

    asyncio.run(_bot(agent=agent, tests=tests, published=[]).run(iid))
    assert seen == [True]


def test_a_secret_stops_the_push(repo):
    iid = _approved()

    async def leaky(prompt, workdir):
        Path(workdir, "tiga", "app.py").write_text("TOKEN = 'ghp_" + "a" * 36 + "'\n")
        return {"text": "Added a token", "cost_usd": 0.0}

    published = []
    out = asyncio.run(_bot(agent=leaky, published=published).run(iid))
    assert not out["ok"] and "secret" in out["error"] and published == []
    assert services.get_store().get_issue(iid)["status"] == "approved"


def test_refuses_unapproved_issues_and_respects_the_daily_cap(repo, monkeypatch):
    store = services.get_store()
    fresh = store.open_issue("bug", "Not approved yet", dedupe_key="x", source="tester")
    out = asyncio.run(_bot(published=[]).run(fresh["id"]))
    assert not out["ok"] and "approved" in out["error"]
    monkeypatch.setattr(devbot, "DAILY_RUNS", 1)
    asyncio.run(_bot(published=[]).run(_approved("First")))
    out = asyncio.run(_bot(published=[]).run(_approved("Second")))
    assert not out["ok"] and "limit" in out["error"]


def test_needs_github_settings(repo, monkeypatch):
    monkeypatch.setattr(config, "GITHUB_TOKEN", "")
    out = asyncio.run(_bot(published=[]).run(_approved()))
    assert not out["ok"] and "GITHUB_TOKEN" in out["error"]


def test_picks_the_oldest_approved_issue(repo):
    first, second = _approved("Older issue"), _approved("Newer issue")
    published = []
    asyncio.run(_bot(published=published).run())
    assert published[0]["title"] == "Older issue"
    assert services.get_store().get_issue(second)["status"] == "approved"


def test_agent_is_only_given_file_tools_inside_the_worktree(tmp_path):
    import json

    import claude_cli

    seen = {}

    def fake_run(args, **kw):
        seen["args"], seen["cwd"], seen["env"] = args, kw["cwd"], kw["env"]
        return subprocess.CompletedProcess(args, 0, json.dumps({"result": "done", "usage": {}}), "")

    REAL_CODE("fix it", str(tmp_path), system="be careful", run=fake_run)
    args = seen["args"]
    assert args[args.index("--tools") + 1] == "Read,Edit,Write,Glob,Grep"
    assert args[args.index("--permission-mode") + 1] == "acceptEdits" and "--max-turns" in args
    assert "Bash" not in " ".join(args) and seen["cwd"] == str(tmp_path)
    assert "ANTHROPIC_API_KEY" not in seen["env"]


def test_dev_api_starts_in_the_background_and_explains_refusals(repo, monkeypatch):
    from fastapi.testclient import TestClient

    import main

    calls = []

    async def agent(prompt, workdir):
        calls.append(prompt)
        Path(workdir, "tiga", "app.py").write_text("GREETING = 'namaskara'\n")
        return {"text": "done"}

    async def tests(workdir, frontend):
        return {"ok": True, "detail": "ok"}

    async def publish(branch, title, body):
        return {"ok": True, "pr_url": "https://github.com/owner/project/pull/9"}

    monkeypatch.setattr(devbot, "claude_agent", agent)
    monkeypatch.setattr(devbot, "project_tests", tests)
    monkeypatch.setattr(devbot, "github_publish", publish)
    monkeypatch.setattr(devbot.DevBot, "_fetch_main", lambda self: False)
    client = TestClient(main.app)
    refused = client.post("/api/dev/run", json={}).json()
    assert not refused["ok"] and "approve one" in refused["error"]
    iid = _approved()
    assert client.post("/api/dev/run", json={"issue_id": iid}).json() == {"ok": True, "started": True}
    issue = client.get("/api/issues").json()["items"][0]
    assert issue["status"] == "pr_open" and issue["pr_url"].endswith("/pull/9")
    status = client.get("/api/dev").json()
    assert status["runs_today"] == 1 and status["daily_limit"] == devbot.DAILY_RUNS and not status["busy"]
