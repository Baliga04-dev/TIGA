"""The tester agent runs the real test suite instead of only importing main."""
import subprocess

import pytest

import crew


@pytest.fixture
def child_runs(monkeypatch):
    monkeypatch.delenv("TIGA_TESTER_CHILD", raising=False)
    calls = []

    def fake_run(cmd, *a, **k):
        calls.append(cmd)
        return subprocess.CompletedProcess(cmd, fake_run.returncode, stdout="3 passed", stderr="")

    fake_run.returncode = 0
    monkeypatch.setattr(crew.subprocess, "run", fake_run)
    return fake_run, calls


async def test_cycle_passes_when_the_suite_passes(child_runs):
    report = await crew.run_agent_cycle()
    names = [c["name"] for c in report["tester"]["checks"]]
    assert "backend_tests" in names
    assert report["ok"] is True


async def test_cycle_fails_when_the_suite_fails(child_runs):
    fake_run, _ = child_runs
    fake_run.returncode = 1
    report = await crew.run_agent_cycle()
    assert report["ok"] is False
    assert report["tester"]["status"] == "failed"


async def test_suite_is_not_started_from_inside_a_test_run(monkeypatch):
    monkeypatch.setenv("TIGA_TESTER_CHILD", "1")
    report = await crew.run_agent_cycle()
    assert "backend_tests" not in [c["name"] for c in report["tester"]["checks"]]
