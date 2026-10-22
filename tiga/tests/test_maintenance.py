"""The optional in-process maintenance loop and its lifecycle."""
import asyncio

import pytest
from fastapi.testclient import TestClient

import config
import main
import crew


async def test_loop_survives_a_failing_cycle_and_keeps_running(monkeypatch):
    calls = []

    async def cycle():
        calls.append(1)
        if len(calls) == 1:
            raise RuntimeError("boom")
        return {"ok": True}

    async def fast_sleep(_seconds):
        if len(calls) >= 2:
            raise asyncio.CancelledError

    monkeypatch.setattr(crew, "run_agent_cycle", cycle)
    monkeypatch.setattr(main, "_sleep", fast_sleep)
    monkeypatch.setattr(config, "GITHUB_TOKEN", "")
    with pytest.raises(asyncio.CancelledError):
        await main._daily_maintenance()
    assert len(calls) == 2


def lifecycle(monkeypatch, *, interval, token):
    started, cancelled = [], []

    async def fake_loop():
        started.append(1)
        try:
            await asyncio.sleep(3600)
        except asyncio.CancelledError:
            cancelled.append(1)
            raise

    monkeypatch.setattr(main, "_daily_maintenance", fake_loop)
    monkeypatch.setattr(config, "GITHUB_SYNC_INTERVAL_MINUTES", interval)
    monkeypatch.setattr(config, "GITHUB_TOKEN", token)
    with TestClient(main.app):
        pass
    return started, cancelled


def test_loop_starts_and_stops_with_the_app_when_enabled(monkeypatch):
    started, cancelled = lifecycle(monkeypatch, interval=5, token="t")
    assert started == [1] and cancelled == [1]


def test_loop_does_not_start_when_disabled(monkeypatch):
    started, _ = lifecycle(monkeypatch, interval=0, token="t")
    assert started == []
