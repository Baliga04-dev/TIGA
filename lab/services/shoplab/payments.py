"""A pretend UPI gateway. It keeps a ledger of every charge it made.

Knobs: latency_ms and error_rate (a slow or flaky provider), crash (provider down), and fail_after_charge:
the share of charges that succeed but answer 504 anyway, the way a real gateway times out after taking the
money. A caller that retries without an idempotency key then charges the customer twice; with the same
`idem_key` on every try, this service returns the first charge instead of making a new one.
"""
from __future__ import annotations

import random

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from .common import instrument, log, pool, wait_for

app = FastAPI(title="payments")
knobs, metrics = instrument(app, "payments")


def _ping() -> None:
    with pool().connection() as conn:
        conn.execute("SELECT 1")


@app.on_event("startup")
def _startup() -> None:
    wait_for(_ping, "postgres")
    with pool().connection() as conn:
        conn.execute("""CREATE TABLE IF NOT EXISTS charges (
            id BIGSERIAL PRIMARY KEY, order_ref TEXT NOT NULL, amount_paise INTEGER NOT NULL,
            idem_key TEXT UNIQUE, created_at TIMESTAMPTZ NOT NULL DEFAULT now())""")


@app.get("/health")
def health():
    _ping()
    return {"ok": True}


class Charge(BaseModel):
    order_ref: str
    amount_paise: int = Field(gt=0)
    idem_key: str | None = None


@app.post("/charge")
def charge(body: Charge):
    with pool().connection() as conn:
        if body.idem_key:
            seen = conn.execute("SELECT id FROM charges WHERE idem_key = %s", (body.idem_key,)).fetchone()
            if seen:
                log("charge.replayed", order_ref=body.order_ref, charge_id=seen[0])
                return {"ok": True, "charge_id": seen[0], "replayed": True}
        row = conn.execute("INSERT INTO charges (order_ref, amount_paise, idem_key) VALUES (%s, %s, %s) RETURNING id",
                           (body.order_ref, body.amount_paise, body.idem_key)).fetchone()
    log("charge.taken", order_ref=body.order_ref, charge_id=row[0], amount_paise=body.amount_paise)
    if random.random() < knobs.get("fail_after_charge"):
        # the money is taken, but the caller is told it timed out
        return JSONResponse({"error": "gateway timeout"}, status_code=504)
    return {"ok": True, "charge_id": row[0], "replayed": False}


@app.get("/admin/ledger")
def ledger():
    with pool().connection() as conn:
        total = conn.execute("SELECT count(*), coalesce(sum(amount_paise), 0) FROM charges").fetchone()
        doubled = conn.execute("""SELECT order_ref, count(*), sum(amount_paise) FROM charges
            GROUP BY order_ref HAVING count(*) > 1 ORDER BY count(*) DESC LIMIT 20""").fetchall()
    return {"charges": total[0], "amount_paise": total[1],
            "charged_more_than_once": [{"order_ref": d[0], "times": d[1], "amount_paise": d[2]} for d in doubled]}
