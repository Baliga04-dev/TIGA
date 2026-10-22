from datetime import date

import pytest

import reports
from store import Store

CARD = {
    "sent_today": 3, "sent_week": 9, "replies": 4, "interested": 2, "declined": 1, "unsubscribed": 1,
    "bounced": 0, "followups_sent": 2, "awaiting_approval": 5, "daily_cap": 10,
    "pipeline": {"drafted": 5, "sent": 4, "interested": 2, "declined": 1, "unsubscribed": 1},
}
TODAY = date(2026, 10, 21)


def build(**kw):
    args = dict(scorecard=CARD, followups_due=2, issues=[], cycle=None, sync=None, today=TODAY)
    return reports.build_daily_report(**{**args, **kw})


def test_outreach_numbers_come_first():
    body = build()["body"]
    assert body.index("OUTREACH") < body.index("SYSTEM")
    assert "Sent today: 3 of 10" in body
    assert "Replies: 4 (2 interested, 1 declined, 1 unsubscribed, 0 bounced)" in body
    assert "Follow-ups due: 2" in body
    assert "Waiting for your approval: 5" in body


def test_status_line_is_red_when_tests_or_sync_fail():
    cycle = {"ok": False, "tester": {"checks": [{"name": "backend_tests", "ok": False, "detail": "2 failed"}]}}
    out = build(cycle=cycle)
    assert out["status"] == "red" and out["subject"].startswith("[RED]")
    assert "backend_tests" in out["body"] and "2 failed" in out["body"]
    assert build(sync={"ok": False, "error": "behind origin"})["status"] == "red"


def test_amber_when_you_have_something_to_approve_and_green_when_clear():
    assert build()["status"] == "amber"
    clear = build(scorecard={**CARD, "awaiting_approval": 0}, followups_due=0)
    assert clear["status"] == "green" and clear["subject"].startswith("[OK]")


def test_open_issues_are_listed_with_counts():
    issues = [{"id": 7, "title": "Login flaky", "status": "triaged", "occurrences": 3, "kind": "bug"}]
    body = build(issues=issues)["body"]
    assert "#7 Login flaky" in body and "x3" in body


class Sink:
    def __init__(self, ok=True):
        self.sent, self.ok = [], ok

    def __call__(self, to, subject, body):
        self.sent.append((to, subject, body))
        return {"ok": self.ok, "error": "" if self.ok else "invalid_grant"}


@pytest.fixture
def store():
    s = Store(":memory:")
    yield s
    s.close()


def test_daily_report_is_sent_once_per_day(store):
    sink = Sink()
    first = reports.send_daily(store, sink, "me@work.io", build())
    again = reports.send_daily(store, sink, "me@work.io", build())
    assert first["ok"] and again["skipped"] == "already sent for 2026-10-21"
    assert len(sink.sent) == 1


def test_failed_email_still_archives_the_report_with_the_reason_then_retries(store):
    bad = Sink(ok=False)
    out = reports.send_daily(store, bad, "me@work.io", build())
    assert out["ok"] is False and "invalid_grant" in out["error"] and out["archived"]
    row = store.list_reports()[0]
    assert row["sent_at"] == "" and "invalid_grant" in row["delivery_error"] and "OUTREACH" in row["body"]
    good = Sink()
    assert reports.send_daily(store, good, "me@work.io", build())["ok"]
    archive = store.list_reports()
    assert len(archive) == 1 and archive[0]["sent_at"] and archive[0]["delivery_error"] == ""


def test_archive_keeps_the_text_for_the_ui(store):
    reports.send_daily(store, Sink(), "me@work.io", build())
    row = store.list_reports()[0]
    assert row["report_date"] == "2026-10-21" and "OUTREACH" in row["body"] and row["kind"] == "daily"


def test_money_section_sits_between_outreach_and_system():
    money = {"open_deals": 3, "pipeline_value": 45000, "advance_due": 10000, "balance_due": 5000, "paid_this_month": 8000}
    body = build(money=money)["body"]
    assert body.index("OUTREACH") < body.index("MONEY") < body.index("SYSTEM")
    assert "Open deals: 3 worth Rs 45,000" in body and "Balances to collect: Rs 5,000" in body
