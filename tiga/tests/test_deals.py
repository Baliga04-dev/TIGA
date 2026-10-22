from datetime import date

import pytest

import deals
from store import Store, TransitionError


@pytest.fixture
def store():
    s = Store(":memory:")
    yield s
    s.close()


def new(store, email="owner@sri.in", **kw):
    return store.create_deal({"email": email, "company": "Sri Bakery", "contact": "Ravi", **kw})


def test_a_deal_starts_interested_and_one_per_active_client(store):
    d = new(store)
    assert d["stage"] == "interested" and d["amount"] == 0
    assert new(store, email="OWNER@sri.in")["id"] == d["id"]  # same client, same open deal
    store.move_deal(d["id"], "lost", actor="user")
    assert new(store)["id"] != d["id"]  # a lost deal can be followed by a fresh one


def test_stages_follow_the_money_path_and_are_audited(store):
    d = new(store)
    for stage in ("call_booked", "proposal_sent", "won", "in_progress", "delivered", "paid"):
        d = store.move_deal(d["id"], stage, actor="user")
    assert d["stage"] == "paid"
    assert sum(1 for e in store.audit_log() if e["action"] == "deal.move") == 6


def test_skipping_ahead_is_refused(store):
    d = new(store)
    with pytest.raises(TransitionError):
        store.move_deal(d["id"], "paid", actor="user")


def test_details_and_payments_update_without_touching_the_stage(store):
    d = new(store)
    d = store.update_deal(d["id"], amount=20000, service="5-page website", notes="wants blue")
    assert (d["amount"], d["service"], d["stage"]) == (20000, "5-page website", "interested")
    with pytest.raises(ValueError):
        store.update_deal(d["id"], stage="paid")


def test_recording_the_balance_on_a_delivered_job_marks_it_paid(store):
    d = new(store, amount=20000)
    for stage in ("proposal_sent", "won", "in_progress", "delivered"):
        store.move_deal(d["id"], stage, actor="user")
    d = deals.record_payment(store, d["id"], kind="advance", amount=10000)
    assert d["stage"] == "delivered" and d["advance_paid"] == 10000
    d = deals.record_payment(store, d["id"], kind="balance", amount=10000)
    assert d["stage"] == "paid" and d["balance_paid"] == 10000


def test_payments_must_be_positive_and_known(store):
    d = new(store, amount=1000)
    with pytest.raises(ValueError):
        deals.record_payment(store, d["id"], kind="advance", amount=0)
    with pytest.raises(ValueError):
        deals.record_payment(store, d["id"], kind="tip", amount=10)


def test_money_summary_for_the_report():
    rows = [
        {"stage": "proposal_sent", "amount": 15000, "advance_paid": 0, "balance_paid": 0, "paid_at": ""},
        {"stage": "in_progress", "amount": 20000, "advance_paid": 0, "balance_paid": 0, "paid_at": ""},
        {"stage": "delivered", "amount": 10000, "advance_paid": 5000, "balance_paid": 0, "paid_at": ""},
        {"stage": "paid", "amount": 8000, "advance_paid": 4000, "balance_paid": 4000, "paid_at": "2026-10-05T10:00:00+00:00"},
        {"stage": "paid", "amount": 9000, "advance_paid": 4500, "balance_paid": 4500, "paid_at": "2026-09-05T10:00:00+00:00"},
        {"stage": "lost", "amount": 50000, "advance_paid": 0, "balance_paid": 0, "paid_at": ""},
    ]
    m = deals.money_summary(rows, today=date(2026, 10, 22))
    assert m == {"pipeline_value": 45000, "advance_due": 10000, "balance_due": 5000, "paid_this_month": 8000,
                 "open_deals": 3}
