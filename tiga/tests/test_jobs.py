from datetime import date, datetime, timedelta, timezone

import pytest

import jobs
from mailer import Mailer
from store import Store

TODAY = date(2026, 10, 21)
T0 = datetime(2026, 10, 21, 10, 0, tzinfo=timezone.utc)


class Sink:
    def __init__(self, ok=True):
        self.sent, self.ok = [], ok

    def __call__(self, to, subject, body):
        self.sent.append((to, subject, body))
        return {"ok": self.ok, "message_id": "m1", "thread_id": "t1", "error": "" if self.ok else "boom"}


@pytest.fixture
def world():
    store = Store(":memory:")
    outbound = Sink()
    mailer = Mailer(store, outbound, postal_address="PO Box 1", gap_seconds=lambda: 0)
    reports = Sink()

    async def cycle():
        return {"ok": True, "tester": {"checks": [{"name": "backend_tests", "ok": True, "detail": "10 passed"}]}}

    yield store, mailer, reports, cycle
    store.close()


async def run(world, **kw):
    store, mailer, reports, cycle = world
    args = dict(store=store, mailer=mailer, fetch_thread=lambda t: [], send=reports, to="me@work.io",
                cycle_fn=cycle, sync_fn=None, today=TODAY)
    return await jobs.run_daily(**{**args, **kw})


async def test_daily_run_sends_one_report_even_if_run_twice(world):
    first = await run(world)
    second = await run(world)
    assert first["report"]["ok"] and second["report"]["skipped"]
    assert len(world[2].sent) == 1


async def test_failed_test_check_becomes_one_deduped_issue(world):
    store = world[0]

    async def failing():
        return {"ok": False, "tester": {"checks": [{"name": "backend_tests", "ok": False, "detail": "2 failed"}]}}

    await run(world, cycle_fn=failing)
    store.release_job("daily_report", "2026-10-21")  # run again the same day
    await run(world, cycle_fn=failing)
    issues = store.list_issues()
    assert len(issues) == 1 and issues[0]["occurrences"] == 2 and issues[0]["source"] == "tester"


async def test_reply_check_and_followups_feed_the_report(world):
    store, mailer, reports, _ = world
    d = mailer.draft(email="a@a.io", subject="Hi", body="x", company="A")
    mailer.approve(d["id"])
    sent = mailer.send_next(now=T0)
    fetch = lambda tid: [{"from": "a@a.io", "body": "Yes, interested!"}]
    out = await run(world, fetch_thread=fetch)
    assert mailer.get(sent["id"])["status"] == "interested"
    assert "1 interested" in reports.sent[0][2]
    assert out["replies_changed"] == 1


async def test_one_broken_step_does_not_stop_the_report(world):
    def broken_fetch(tid):
        raise RuntimeError("gmail down")

    store, mailer, *_ = world
    d = mailer.draft(email="a@a.io", subject="Hi", body="x")
    mailer.approve(d["id"])
    mailer.send_next(now=T0)
    out = await run(world, fetch_thread=broken_fetch)
    assert out["report"]["ok"] and "gmail down" in out["errors"][0]


async def test_sync_result_appears_in_the_report(world):
    async def sync():
        return {"ok": False, "error": "behind origin"}

    out = await run(world, sync_fn=sync)
    assert "behind origin" in world[2].sent[0][2] and out["report"]["ok"]
