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


def test_the_footer_says_where_the_privacy_notice_is_when_there_is_one(store, sender):
    m = Mailer(store, sender, postal_address=ADDRESS, gap_seconds=lambda: 0, privacy_url="https://x.io/privacy.html")
    d = m.draft(email="a@b.in", subject="Hi", body="Hello there")
    m.approve(d["id"])
    m.send_next(now=T0)
    body = sender.sent[-1][2]
    assert "How I handle your details, and how to have them deleted: https://x.io/privacy.html" in body


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


def test_next_due_picks_without_sending_and_record_send_marks_it_sent(mailer, sender):
    d = draft(mailer)
    assert mailer.next_due(now=T0) is None
    mailer.approve(d["id"])
    due = mailer.next_due(now=T0)
    assert due["id"] == d["id"] and "reply STOP" in due["body"] and sender.sent == []
    assert mailer.get(d["id"])["status"] == "approved"
    sent = mailer.record_send(d["id"], {"ok": True, "message_id": "m9", "thread_id": "t9"}, now=T0)
    assert sent["status"] == "sent" and sent["thread_id"] == "t9"


def test_record_send_refuses_mail_that_was_not_approved(mailer):
    d = draft(mailer)
    with pytest.raises(MailerError, match="approved"):
        mailer.record_send(d["id"], {"ok": True}, now=T0)


def test_strict_regions_are_flagged_for_review(mailer):
    assert "review" in draft(mailer, email="hans@firma.de")["warnings"]
    assert "review" in draft(mailer, email="a@shop.co.uk", region="uk-sole-trader")["warnings"]
    assert draft(mailer, email="x@plain.io")["warnings"] == ""


def test_one_open_draft_per_recipient(mailer):
    draft(mailer)
    with pytest.raises(MailerError, match="already"):
        draft(mailer)


# --- replies, follow-ups, scorecard ---------------------------------------
def sent_mail(mailer, email="owner@acme.io", now=T0):
    d = draft(mailer, email=email)
    mailer.approve(d["id"])
    return mailer.send_next(now=now)


def threads(**by_thread):
    """A fake `fetch_thread`: thread id -> list of (sender, body)."""
    return lambda thread_id: [{"from": f, "body": b} for f, b in by_thread.get(thread_id, [])]


@pytest.mark.parametrize("reply, status", [
    ("Yes, interested. Can we schedule a call?", "interested"),
    ("No thanks, not interested.", "declined"),
    ("STOP", "unsubscribed"),
    ("Please remove me from your list", "unsubscribed"),
    ("Who are you and where did you get my email?", "replied"),
])
def test_replies_are_classified(mailer, store, reply, status):
    row = sent_mail(mailer)
    mailer.check_replies(threads(**{row["thread_id"]: [("owner@acme.io", reply)]}), now=T0 + timedelta(days=1))
    assert mailer.get(row["id"])["status"] == status


def test_negative_replies_suppress_the_address_permanently(mailer, store):
    row = sent_mail(mailer)
    mailer.check_replies(threads(**{row["thread_id"]: [("owner@acme.io", "unsubscribe")]}), now=T0)
    assert store.is_suppressed("owner@acme.io")


def test_own_messages_and_auto_replies_do_not_count_as_replies(mailer):
    row = sent_mail(mailer)
    fetch = threads(**{row["thread_id"]: [
        ("me@work.io", "my own message"),
        ("owner@acme.io", "I am out of office until Monday"),
    ]})
    mailer.check_replies(fetch, now=T0, own_address="me@work.io")
    assert mailer.get(row["id"])["status"] == "sent"


def test_bounce_suppresses(mailer, store):
    row = sent_mail(mailer)
    mailer.check_replies(threads(**{row["thread_id"]: [("MAILER-DAEMON@googlemail.com", "Delivery Status Notification (Failure)")]}), now=T0)
    assert mailer.get(row["id"])["status"] == "bounced"
    assert store.is_suppressed("owner@acme.io")


def test_followup_drafted_after_four_quiet_days_and_needs_approval(mailer):
    row = sent_mail(mailer)
    assert mailer.due_followups(now=T0 + timedelta(days=3, hours=23)) == []   # never under 4 days
    created = mailer.due_followups(now=T0 + timedelta(days=4))
    assert len(created) == 1 and created[0]["status"] == "drafted"
    assert created[0]["followup_n"] == 1 and created[0]["parent_id"] == row["id"]
    assert mailer.due_followups(now=T0 + timedelta(days=6)) == []  # not drafted twice


def test_at_most_one_followup(mailer):
    sent_mail(mailer)
    follow = mailer.due_followups(now=T0 + timedelta(days=5))[0]
    assert "closing the loop" in follow["body"].lower() and "won't write again" in follow["body"]
    assert "no reply needed" in follow["body"].lower() and len(follow["body"].split("--")[0].split()) <= 40
    mailer.approve(follow["id"])
    mailer.send_next(now=T0 + timedelta(days=5))
    assert mailer.due_followups(now=T0 + timedelta(days=12)) == []
    assert mailer.due_followups(now=T0 + timedelta(days=30)) == []


def test_last_note_mentions_the_demo_only_when_the_first_mail_had_one(mailer):
    sent_mail(mailer)
    assert "demo" not in mailer.due_followups(now=T0 + timedelta(days=4))[0]["body"]
    d = mailer.draft(email="cafe@shop.in", company="Cafe", lead_url="", source_note="", subject="A website",
                     body="Hi.\n\nHere's a website I built for a shop like yours: https://x.io/demos/\n\nBest,\nA")
    mailer.approve(d["id"])
    mailer.send_next(now=T0 + timedelta(minutes=30))
    notes = mailer.due_followups(now=T0 + timedelta(days=5))
    assert any("demo site is linked" in n["body"] for n in notes if n["email"] == "cafe@shop.in")


def test_replied_prospects_get_no_followup(mailer):
    row = sent_mail(mailer)
    mailer.check_replies(threads(**{row["thread_id"]: [("owner@acme.io", "Tell me more")]}), now=T0)
    assert mailer.due_followups(now=T0 + timedelta(days=9)) == []


def test_scorecard_counts_the_pipeline(mailer):
    a = sent_mail(mailer, "a@a.io")
    b = sent_mail(mailer, "b@b.io", now=T0 + timedelta(minutes=15))
    draft(mailer, "c@c.io")
    mailer.check_replies(threads(**{
        a["thread_id"]: [("a@a.io", "Yes interested, call me")],
        b["thread_id"]: [("b@b.io", "no thanks")],
    }), now=T0 + timedelta(days=1))
    card = mailer.scorecard(now=T0 + timedelta(days=1))
    assert card["sent_today"] == 0 and card["sent_week"] == 2
    assert card["replies"] == 2 and card["interested"] == 1 and card["declined"] == 1
    assert card["awaiting_approval"] == 2   # c's first mail, and the drafted answer to a's "yes"
    assert card["pipeline"]["drafted"] == 2


def test_quoted_footer_in_a_reply_is_not_mistaken_for_an_unsubscribe(mailer):
    row = sent_mail(mailer)
    reply = "Sounds good, tell me more.\n\nOn Wed, Oct 21 Jo wrote:\n> reply STOP and I won't email you again."
    mailer.check_replies(threads(**{row["thread_id"]: [("owner@acme.io", reply)]}), now=T0)
    assert mailer.get(row["id"])["status"] == "interested"


def test_an_interested_reply_opens_a_deal_once(mailer, store):
    row = sent_mail(mailer)
    mailer.check_replies(threads(**{row["thread_id"]: [("owner@acme.io", "Yes, interested! Call me")]}), now=T0)
    deals = store.list_deals()
    assert len(deals) == 1 and deals[0]["email"] == "owner@acme.io" and deals[0]["company"] == "Acme"
    assert deals[0]["outreach_id"] == row["id"]


# --- niche batches (R&D #12): approve one kind of shop at a time and see which kind replies ----------------
def shop_draft(mailer, store, email, category):
    d = draft(mailer, email=email)
    store.upsert_prospect({"key": f"osm:{email}", "source": "osm", "name": email, "category": category,
                           "status": "drafted", "outreach_id": d["id"]})
    return d


def test_drafts_are_grouped_by_the_kind_of_shop_with_their_results(mailer, store):
    shop_draft(mailer, store, "a@cafe.in", "cafe")
    shop_draft(mailer, store, "b@cafe.in", "cafe")
    shop_draft(mailer, store, "c@school.in", "school")
    draft(mailer, email="d@news.io")                      # a news lead, not a mapped shop
    batches = {b["niche"]: b for b in mailer.batches()}
    assert batches["cafe"]["drafted"] == 2 and batches["cafe"]["label"] == "Cafés"
    assert len(batches["cafe"]["draft_ids"]) == 2
    assert batches["school"]["drafted"] == 1 and batches[""]["label"] == "News leads"
    assert list(batches)[0] == "cafe"                     # the biggest batch first


def test_a_whole_batch_is_approved_or_rejected_at_once_and_only_its_drafts(mailer, store):
    a = shop_draft(mailer, store, "a@cafe.in", "cafe")
    b = shop_draft(mailer, store, "b@cafe.in", "cafe")
    c = shop_draft(mailer, store, "c@school.in", "school")
    mailer.approve(b["id"])
    assert mailer.approve_batch("cafe") == 1               # b was already approved
    assert mailer.get(a["id"])["status"] == "approved" and mailer.get(c["id"])["status"] == "drafted"
    assert mailer.reject_batch("school") == 1 and mailer.get(c["id"])["status"] == "rejected"


def test_the_scorecard_reports_replies_per_niche(mailer, store):
    d = shop_draft(mailer, store, "a@cafe.in", "cafe")
    mailer.approve(d["id"])
    row = mailer.send_next(now=T0)
    mailer.check_replies(threads(**{row["thread_id"]: [("a@cafe.in", "Tell me more")]}), now=T0)
    cafe = next(b for b in mailer.scorecard(now=T0)["by_niche"] if b["niche"] == "cafe")
    assert cafe["sent"] == 1 and cafe["replies"] == 1 and cafe["interested"] == 1


# --- replies (R&D #15): answer warm replies fast, and never send a "last note" to someone who answered ---------
def test_an_answer_cancels_the_waiting_follow_up(mailer):
    row = sent_mail(mailer)
    follow = mailer.due_followups(now=T0 + timedelta(days=4))[0]
    mailer.approve(follow["id"])
    mailer.check_replies(threads(**{row["thread_id"]: [("owner@acme.io", "Not now, thanks")]}), now=T0 + timedelta(days=4))
    assert mailer.get(follow["id"])["status"] == "rejected"
    assert mailer.next_due(now=T0 + timedelta(days=4, hours=1)) is None


def test_an_interested_reply_gets_a_drafted_answer_and_a_reminder_due_now(mailer, store):
    m = Mailer(store, FakeSender(), postal_address=ADDRESS, gap_seconds=lambda: 0, sender_name="Adithya")
    d = m.draft(email="cafe@shop.in", company="Bean Cafe", subject="A website", lead_url="", source_note="",
                body="Hi.\n\nHere's a website I built for a shop like yours: https://x.io/demos/malnad-table/\n\nBest,\nA")
    m.approve(d["id"])
    row = m.send_next(now=T0)
    m.check_replies(threads(**{row["thread_id"]: [("cafe@shop.in", "Sounds good, tell me more")]}), now=T0)
    answer = next(r for r in store.list_outreach("drafted") if r["email"] == "cafe@shop.in")
    assert answer["subject"] == "Re: A website" and answer["parent_id"] == row["id"]
    assert "15-minute call" in answer["body"] and "https://x.io/demos/malnad-table/" in answer["body"]
    assert answer["body"].rstrip().endswith("Adithya")
    due = store.list_reminders("pending", due_before=(T0 + timedelta(minutes=1)).isoformat())
    assert any("Bean Cafe" in r["text"] and "interested" in r["text"] for r in due)


def test_any_other_reply_is_a_reminder_to_read_it_but_no_draft(mailer, store):
    row = sent_mail(mailer)
    mailer.check_replies(threads(**{row["thread_id"]: [("owner@acme.io", "What would it cost?")]}), now=T0)
    assert store.list_outreach("drafted") == []
    assert any("Acme" in r["text"] for r in store.list_reminders("pending"))
