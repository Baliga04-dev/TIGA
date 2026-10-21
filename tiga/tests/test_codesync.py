"""The daily sync pushes a dated tiga/ branch, never main, and never a secret."""
from datetime import date

import pytest

import codesync
import config
from test_github_sync import commit_change, git, repo  # noqa: F401  (shared real-git fixture)

DAY = date(2026, 10, 21)
BRANCH = "tiga/daily-2026-10-21"


async def test_pushes_a_dated_branch_and_leaves_main_alone(repo):
    work, remote = repo
    main_before = git(remote, "rev-parse", "main")
    commit_change(work)
    out = await codesync.push_daily_branch(DAY)
    assert out["ok"] and out["pushed"] and out["branch"] == BRANCH
    assert git(remote, "rev-parse", BRANCH) == git(work, "rev-parse", "HEAD")
    assert git(remote, "rev-parse", "main") == main_before


async def test_same_day_second_push_fast_forwards(repo):
    work, remote = repo
    commit_change(work, "print('a')\n")
    await codesync.push_daily_branch(DAY)
    commit_change(work, "print('b')\n")
    assert (await codesync.push_daily_branch(DAY))["pushed"]
    assert git(remote, "rev-parse", BRANCH) == git(work, "rev-parse", "HEAD")


async def test_nothing_new_is_a_no_op(repo):
    out = await codesync.push_daily_branch(DAY)
    assert out["ok"] and out["pushed"] is False


async def test_dirty_tree_is_refused(repo):
    work, _ = repo
    (work / "app.py").write_text("changed but not committed\n")
    out = await codesync.push_daily_branch(DAY)
    assert out["ok"] is False and "uncommitted" in out["error"]


async def test_a_secret_in_the_new_commits_blocks_the_push_without_echoing_it(repo):
    work, remote = repo
    secret = "ghp_" + "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8"
    (work / "notes.txt").write_text(f"token = {secret}\n")
    git(work, "add", "notes.txt")
    git(work, "commit", "-q", "-m", "oops")
    out = await codesync.push_daily_branch(DAY)
    assert out["ok"] is False and "notes.txt" in out["error"] and secret not in out["error"]
    assert BRANCH not in git(remote, "branch", "--list")


@pytest.mark.parametrize("name", [".env", "token.json", "credentials.json", "tiga/.env"])
async def test_secret_files_are_never_pushed(repo, name):
    work, _ = repo
    path = work / name
    path.parent.mkdir(exist_ok=True)
    path.write_text("x=1\n")
    git(work, "add", "-f", name)
    git(work, "commit", "-q", "-m", "add secret file")
    out = await codesync.push_daily_branch(DAY)
    assert out["ok"] is False and name in out["error"]


async def test_env_example_with_empty_values_is_fine(repo):
    work, _ = repo
    (work / ".env.example").write_text("GITHUB_TOKEN=\nOPENAI_API_KEY=\n")
    git(work, "add", ".env.example")
    git(work, "commit", "-q", "-m", "example")
    assert (await codesync.push_daily_branch(DAY))["pushed"]


async def test_requires_token_and_branch(repo, monkeypatch):
    work, _ = repo
    commit_change(work)
    monkeypatch.setattr(config, "GITHUB_TOKEN", "")
    assert "GITHUB_TOKEN" in (await codesync.push_daily_branch(DAY))["error"]
    monkeypatch.setattr(config, "GITHUB_TOKEN", "t")
    git(work, "checkout", "-q", "-b", "wip")
    assert "wip" in (await codesync.push_daily_branch(DAY))["error"]
