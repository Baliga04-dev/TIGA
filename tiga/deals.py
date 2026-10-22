"""Money logic for client deals: recording payments and the numbers the report and Pipeline page show.

Interface: `record_payment(store, deal_id, kind, amount) -> deal` and `money_summary(deals, today) -> dict`.
Stage changes themselves live in the store (`move_deal`), so every move is audited in one place.
"""
from __future__ import annotations

from datetime import date

from store import Store

OPEN_STAGES = ("interested", "call_booked", "proposal_sent", "won", "in_progress", "delivered")


def record_payment(store: Store, deal_id: int, *, kind: str, amount: int) -> dict:
    """Record the advance or the balance (in rupees). A delivered job whose total is covered becomes paid."""
    if kind not in ("advance", "balance"):
        raise ValueError("payment kind must be 'advance' or 'balance'")
    if amount <= 0:
        raise ValueError("payment amount must be positive")
    deal = store.update_deal(deal_id, **{f"{kind}_paid": amount})
    store.audit("user", "deal.payment", "deal", str(deal_id), f"{kind} {amount}")
    covered = deal["advance_paid"] + deal["balance_paid"]
    if deal["stage"] == "delivered" and deal["amount"] and covered >= deal["amount"]:
        deal = store.move_deal(deal_id, "paid", actor="user")
    return deal


def money_summary(deals: list[dict], *, today: date) -> dict:
    open_deals = [d for d in deals if d["stage"] in OPEN_STAGES]
    month = today.strftime("%Y-%m")
    return {
        "pipeline_value": sum(d["amount"] for d in open_deals),
        "advance_due": sum(max(0, d["amount"] // 2 - d["advance_paid"])
                           for d in open_deals if d["stage"] in ("won", "in_progress")),
        "balance_due": sum(max(0, d["amount"] - d["advance_paid"] - d["balance_paid"])
                           for d in open_deals if d["stage"] == "delivered"),
        "paid_this_month": sum(d["amount"] for d in deals if d["stage"] == "paid" and d["paid_at"].startswith(month)),
        "open_deals": len(open_deals),
    }
