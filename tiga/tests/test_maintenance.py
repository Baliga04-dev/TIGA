"""The optional in-process maintenance loop and its lifecycle."""
import asyncio

import pytest
from fastapi.testclient import TestClient

import config
import main
import crew


def run_loop(monkeypatch, *, hours, outcome=None):
    """Run the daily loop for one check per entry in `hours` (the Bengaluru hour at each check)."""
    from datetime import datetime
    from zoneinfo import ZoneInfo

    calls, clock = [], iter(hours)
    now = {"t": None}

    async def once():
        calls.append(now["t"])
        if outcome:
            return outcome(len(calls))
        return {"report": {"ok": True}, "errors": []}

    async def fake_sleep(_seconds):
        try:
            day, hour = next(clock)
        except StopIteration:
            raise asyncio.CancelledError
        now["t"] = datetime(2026, 11, day, hour, 0, tzinfo=ZoneInfo("Asia/Kolkata"))

    monkeypatch.setattr(main, "_maintenance_once", once)
    monkeypatch.setattr(main, "_sleep", fake_sleep)
    monkeypatch.setattr(main, "_local_now", lambda: now["t"])
    with pytest.raises(asyncio.CancelledError):
        asyncio.run(main._daily_maintenance())
    return calls


def test_the_daily_run_happens_once_a_day_soon_after_start_whatever_the_restarts(monkeypatch):
    calls = run_loop(monkeypatch, hours=[(1, 9), (1, 10), (1, 23), (2, 8), (2, 9)])
    assert [c.day for c in calls] == [1, 2]


def test_it_waits_for_the_morning(monkeypatch):
    calls = run_loop(monkeypatch, hours=[(1, 3), (1, 6), (1, 7)])
    assert [c.hour for c in calls] == [7]


def test_a_run_that_crashes_is_tried_again_at_the_next_check(monkeypatch):
    def outcome(n):
        if n == 1:
            raise RuntimeError("boom")
        return {"report": {"ok": True}, "errors": []}

    calls = run_loop(monkeypatch, hours=[(1, 9), (1, 9), (1, 10)], outcome=outcome)
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
