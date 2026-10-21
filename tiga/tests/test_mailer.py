from datetime import datetime, timedelta, timezone

import pytest

from mailer import Mailer, MailerError
from store import Store

T0 = datetime(2026, 10, 21, 10, 0, tzinfo=timezone.utc)  # a Wednesday
ADDRESS = "Jo Dev, PO Box 12, Bengaluru 560001"


class FakeSender:
    def __init__(self):
        self.sent = []

    def __call__(self, to, subject, body):
        self.sent.append((to, subject, body))
        return {"ok": True, "message_id": f"m{len(self.sent)}", "thread_id": f"t{len(self.sent)}"}


@pytest.fixture
def store():
    s = Store(":memory:")
    yield s
    s.close()


@pytest.fixture
def sender():
    return FakeSender()


@pytest.fixture
def mailer(store, sender):
    return Mailer(store, sender, postal_address=ADDRESS, hard_cap=20, gap_seconds=lambda: 0)


def draft(mailer, email="owner@acme.io", **kw):
    return mailer.draft(email=email, company="Acme", lead_url="https://news.example/a",
                        source_note="company contact page", subject="Quick idea for Acme",
                        body="Hi, I noticed your launch.", **kw)


def test_nothing_is_sent_until_approved(mailer, sender):
    d = draft(mailer)
    assert d["status"] == "drafted"
    assert mailer.send_next(now=T0) is None
    assert sender.sent == []


def test_approved_mail_gets_the_compliance_footer(mailer, sender):
    d = draft(mailer)
    mailer.approve(d["id"])
    sent = mailer.send_next(now=T0)
    assert sent["status"] == "sent" and sent["thread_id"] == "t1"
    _, _, body = sender.sent[0]
    assert "reply STOP" in body and ADDRESS in body and body.startswith("Hi, I noticed")


def test_sending_refuses_without_a_postal_address(store, sender):
    m = Mailer(store, sender, postal_address="", gap_seconds=lambda: 0)
    d = draft(m)
    m.approve(d["id"])
    with pytest.raises(MailerError, match="postal address"):
        m.send_next(now=T0)
    assert sender.sent == []


def test_suppressed_recipients_cannot_be_drafted(mailer, store):
    store.suppress("owner@acme.io", reason="unsubscribe")
    with pytest.raises(MailerError, match="suppressed"):
        draft(mailer)


def test_address_suppressed_after_approval_is_not_sent(mailer, store, sender):
    d = draft(mailer)
    mailer.approve(d["id"])
    store.suppress("owner@acme.io", reason="complaint")
    assert mailer.send_next(now=T0) is None
    assert mailer.get(d["id"])["status"] == "rejected"
    assert sender.sent == []


def test_week_one_cap_is_five_then_it_ramps(mailer, sender):
    for i in range(8):
        mailer.approve(draft(mailer, email=f"p{i}@c{i}.io")["id"])
    sent_today = [mailer.send_next(now=T0 + timedelta(minutes=11 * i)) for i in range(8)]
    assert sum(1 for s in sent_today if s) == 5
    assert mailer.daily_cap(T0) == 5
    assert mailer.daily_cap(T0 + timedelta(days=8)) == 10
    assert mailer.daily_cap(T0 + timedelta(days=400)) == 20  # never above the hard cap


def test_gap_between_sends_is_enforced(store, sender):
    m = Mailer(store, sender, postal_address=ADDRESS, gap_seconds=lambda: 300)
    for i in range(2):
        m.approve(draft(m, email=f"p{i}@c{i}.io")["id"])
    assert m.send_next(now=T0)
    assert m.send_next(now=T0 + timedelta(seconds=60)) is None
    assert m.send_next(now=T0 + timedelta(seconds=301))


def test_only_business_hours_on_weekdays(mailer, sender):
    mailer.approve(draft(mailer)["id"])
    saturday = datetime(2026, 10, 24, 10, 0, tzinfo=timezone.utc)
    night = datetime(2026, 10, 21, 2, 0, tzinfo=timezone.utc)
    assert mailer.send_next(now=saturday) is None
    assert mailer.send_next(now=night) is None
    assert mailer.send_next(now=T0)


def test_failed_send_keeps_the_draft_approved_and_records_the_error(store):
    m = Mailer(store, lambda *a: {"ok": False, "error": "quota"}, postal_address=ADDRESS, gap_seconds=lambda: 0)
    d = draft(m)
    m.approve(d["id"])
    assert m.send_next(now=T0) is None
    row = m.get(d["id"])
    assert row["status"] == "approved" and "quota" in row["last_error"]


def test_strict_regions_are_flagged_for_review(mailer):
    assert "review" in draft(mailer, email="hans@firma.de")["warnings"]
    assert "review" in draft(mailer, email="a@shop.co.uk", region="uk-sole-trader")["warnings"]
    assert draft(mailer, email="x@plain.io")["warnings"] == ""


def test_one_open_draft_per_recipient(mailer):
    draft(mailer)
    with pytest.raises(MailerError, match="already"):
        draft(mailer)
