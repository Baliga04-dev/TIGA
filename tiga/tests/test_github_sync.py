"""GitHub sync only pushes commits you already made. Real git, local bare remote."""
import subprocess

import pytest

import config
import git_ops


def git(cwd, *args):
    return subprocess.run(["git", "-C", str(cwd), *args], capture_output=True, text=True, check=True).stdout.strip()


@pytest.fixture
def repo(tmp_path, monkeypatch):
    remote = tmp_path / "remote.git"
    work = tmp_path / "work"
    subprocess.run(["git", "init", "-q", "--bare", "-b", "main", str(remote)], check=True)
    subprocess.run(["git", "init", "-q", "-b", "main", str(work)], check=True)
    git(work, "config", "user.name", "Tester")
    git(work, "config", "user.email", "t@example.com")
    (work / "app.py").write_text("print('v1')\n")
    git(work, "add", "app.py")
    git(work, "commit", "-q", "-m", "first")
    git(work, "remote", "add", "origin", str(remote))
    git(work, "push", "-q", "origin", "main")
    monkeypatch.setattr(git_ops, "PROJECT_ROOT", work)
    monkeypatch.setattr(config, "GITHUB_TOKEN", "test-token-123")
    monkeypatch.setattr(config, "GITHUB_REPOSITORY", "someone/tiga")
    monkeypatch.setattr(config, "GITHUB_BRANCH", "main")
    return work, remote


def commit_change(work, text="print('v2')\n"):
    (work / "app.py").write_text(text)
    git(work, "commit", "-q", "-am", "change")


async def test_pushes_commits_that_are_ahead(repo):
    work, remote = repo
    commit_change(work)
    result = await git_ops.push_current_branch()
    assert result["ok"] is True and result["pushed"] is True
    assert git(remote, "rev-parse", "main") == git(work, "rev-parse", "HEAD")


async def test_nothing_to_push_is_a_clean_no_op(repo):
    result = await git_ops.push_current_branch()
    assert result["ok"] is True and result["pushed"] is False


async def test_refuses_with_uncommitted_files_and_never_commits_them(repo):
    work, remote = repo
    commit_change(work)
    (work / ".env").write_text("SECRET=1\n")
    head_before = git(work, "rev-parse", "HEAD")
    result = await git_ops.push_current_branch()
    assert result["ok"] is False
    assert git(work, "rev-parse", "HEAD") == head_before
    assert git(remote, "rev-parse", "main") != head_before
    assert ".env" not in git(work, "ls-files")


async def test_refuses_when_behind_remote(repo, tmp_path):
    work, remote = repo
    other = tmp_path / "other"
    subprocess.run(["git", "clone", "-q", str(remote), str(other)], check=True)
    git(other, "config", "user.name", "O")
    git(other, "config", "user.email", "o@example.com")
    (other / "x.txt").write_text("x")
    git(other, "add", "x.txt")
    git(other, "commit", "-q", "-m", "remote work")
    git(other, "push", "-q", "origin", "main")
    commit_change(work)
    result = await git_ops.push_current_branch()
    assert result["ok"] is False
    assert "behind" in result["error"].lower()


async def test_refuses_from_a_different_branch(repo):
    work, _ = repo
    git(work, "checkout", "-q", "-b", "feature")
    commit_change(work)
    result = await git_ops.push_current_branch()
    assert result["ok"] is False
    assert "main" in result["error"]


async def test_requires_a_token_and_attempts_nothing_without_one(repo, monkeypatch):
    work, remote = repo
    commit_change(work)
    monkeypatch.setattr(config, "GITHUB_TOKEN", "")
    result = await git_ops.push_current_branch()
    assert result["ok"] is False
    assert git(remote, "rev-parse", "main") != git(work, "rev-parse", "HEAD")


async def test_leaves_the_origin_url_alone(repo):
    work, remote = repo
    commit_change(work)
    await git_ops.push_current_branch()
    assert git(work, "remote", "get-url", "origin") == str(remote)


async def test_token_never_appears_on_a_command_line(repo, monkeypatch):
    work, _ = repo
    commit_change(work)
    seen = []
    real_run = subprocess.run

    def spy(cmd, *a, **k):
        seen.append(" ".join(map(str, cmd)))
        return real_run(cmd, *a, **k)

    monkeypatch.setattr(git_ops.subprocess, "run", spy)
    await git_ops.push_current_branch()
    assert seen and not any("test-token-123" in c for c in seen)
    import base64

    encoded = base64.b64encode(b"x-access-token:test-token-123").decode()
    assert not any(encoded in c for c in seen)


async def test_status_reports_clean_and_dirty(repo):
    work, _ = repo
    assert (await git_ops.status())["working_tree"] == "clean"
    (work / "new.txt").write_text("n")
    assert "new.txt" in (await git_ops.status())["working_tree"]
