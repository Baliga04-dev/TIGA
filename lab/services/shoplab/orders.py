"""Orders: take stock from the menu, charge through payments, tell the customer on WhatsApp.

The call chain is where most production incidents live, so every fix is a knob (common.DEFAULTS["orders"]):
  payment_timeout_s  stop waiting for payments after this long (0 means wait forever)
  retries            try payments again, with backoff, this many extra times
  idempotency        send the customer's Idempotency-Key to payments, and replay a finished order for it
  circuit_breaker    stop calling payments for a while once it keeps failing
  async_notify       put the WhatsApp message on a queue instead of waiting for it to send
  bad_deploy         the "new version" with a bug in it (mission: health checks and rollback)
"""
from __future__ import annotations

import os

import httpx
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from .common import downstream_headers, instrument, log, pool, redis_client, wait_for
from .resilience import CircuitBreaker, CircuitOpen, retry

app = FastAPI(title="orders")
knobs, metrics = instrument(app, "orders")
MENU = os.getenv("MENU_URL", "http://menu:8000")
PAYMENTS = os.getenv("PAYMENTS_URL", "http://payments:8000")
NOTIFIER = os.getenv("NOTIFIER_URL", "http://notifier:8000")
breaker = CircuitBreaker(threshold=5, cooldown_s=10)
http = httpx.Client(timeout=None)


def _ping() -> None:
    with pool().connection() as conn:
        conn.execute("SELECT 1")


@app.on_event("startup")
def _startup() -> None:
    wait_for(_ping, "postgres")
    with pool().connection() as conn:
        conn.execute("""CREATE TABLE IF NOT EXISTS orders (
            id BIGSERIAL PRIMARY KEY, sku TEXT NOT NULL, qty INTEGER NOT NULL, amount_paise INTEGER NOT NULL,
            customer TEXT NOT NULL, status TEXT NOT NULL, idem_key TEXT UNIQUE, charge_id BIGINT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now())""")


@app.get("/health")
def health():
    if knobs.get("bad_deploy"):
        raise HTTPException(500, "the new version cannot read its settings")
    _ping()
    return {"ok": True}


class NewOrder(BaseModel):
    sku: str
    qty: int = Field(default=1, gt=0, le=10)
    customer: str = Field(default="walk-in", max_length=80)


def _order(r) -> dict:
    return {"id": r[0], "sku": r[1], "qty": r[2], "amount_paise": r[3], "customer": r[4], "status": r[5], "charge_id": r[6]}


def _charge(order_id: int, amount: int, key: str | None) -> int:
    k = knobs.all()
    timeout = httpx.Timeout(k["payment_timeout_s"]) if k["payment_timeout_s"] > 0 else None
    body = {"order_ref": str(order_id), "amount_paise": amount, "idem_key": key if k["idempotency"] else None}

    def once() -> int:
        r = http.post(f"{PAYMENTS}/charge", json=body, timeout=timeout, headers=downstream_headers())
        r.raise_for_status()
        return r.json()["charge_id"]

    attempt = (lambda: breaker.call(once)) if k["circuit_breaker"] else once
    return retry(attempt, attempts=1 + k["retries"], base_delay=0.2,
                 retry_on=(httpx.HTTPError,)) if k["retries"] else attempt()


def _notify(order: dict) -> None:
    text = f"Your order #{order['id']} ({order['qty']} x {order['sku']}) is confirmed."
    if knobs.get("async_notify"):
        redis_client().xadd("notifications", {"order_id": order["id"], "customer": order["customer"], "text": text},
                            maxlen=100_000)
        return
    # waits for WhatsApp to accept the message before the customer sees "order placed"
    http.post(f"{NOTIFIER}/notify", json={"order_id": order["id"], "customer": order["customer"], "text": text},
              headers=downstream_headers(), timeout=30).raise_for_status()


@app.post("/orders", status_code=201)
def place(body: NewOrder, idempotency_key: str | None = Header(default=None)):
    k = knobs.all()
    if k["bad_deploy"]:
        raise RuntimeError("TypeError: 'NoneType' object is not subscriptable (introduced in the new version)")
    if k["idempotency"] and idempotency_key:
        with pool().connection() as conn:
            seen = conn.execute("SELECT id, sku, qty, amount_paise, customer, status, charge_id FROM orders WHERE idem_key = %s",
                                (idempotency_key,)).fetchone()
        if seen:
            return {**_order(seen), "replayed": True}
    item = http.get(f"{MENU}/items/{body.sku}", headers=downstream_headers(), timeout=30)
    if item.status_code == 404:
        raise HTTPException(404, f"no item {body.sku}")
    item.raise_for_status()
    amount = item.json()["price_paise"] * body.qty
    reserved = http.post(f"{MENU}/reserve", json={"sku": body.sku, "qty": body.qty}, headers=downstream_headers(), timeout=30)
    if reserved.status_code == 409:
        raise HTTPException(409, "sold out")
    reserved.raise_for_status()
    with pool().connection() as conn:
        oid = conn.execute("""INSERT INTO orders (sku, qty, amount_paise, customer, status, idem_key)
            VALUES (%s, %s, %s, %s, 'pending', %s) RETURNING id""",
                           (body.sku, body.qty, amount, body.customer, idempotency_key if k["idempotency"] else None)).fetchone()[0]
    try:
        charge_id = _charge(oid, amount, idempotency_key or f"order-{oid}")
    except (httpx.HTTPError, CircuitOpen) as exc:
        with pool().connection() as conn:
            conn.execute("UPDATE orders SET status = 'payment_failed' WHERE id = %s", (oid,))
        http.post(f"{MENU}/release", json={"sku": body.sku, "qty": body.qty}, headers=downstream_headers(), timeout=30)
        log("payment.failed", order_id=oid, error=f"{type(exc).__name__}: {exc}"[:200])
        raise HTTPException(502, "payment did not go through; nothing was charged that we know of")
    with pool().connection() as conn:
        row = conn.execute("""UPDATE orders SET status = 'paid', charge_id = %s WHERE id = %s
            RETURNING id, sku, qty, amount_paise, customer, status, charge_id""", (charge_id, oid)).fetchone()
    order = _order(row)
    _notify(order)
    return order


@app.get("/orders/{order_id}")
def get_order(order_id: int):
    with pool().connection() as conn:
        r = conn.execute("SELECT id, sku, qty, amount_paise, customer, status, charge_id FROM orders WHERE id = %s",
                         (order_id,)).fetchone()
    if r is None:
        raise HTTPException(404, "no such order")
    return _order(r)


@app.get("/admin/stats")
def stats():
    with pool().connection() as conn:
        by_status = dict(conn.execute("SELECT status, count(*) FROM orders GROUP BY status").fetchall())
    return {"by_status": by_status, "breaker": breaker.state}
