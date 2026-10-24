"""Pretend customers: they browse the menu and place orders through the gateway, `rps` times a second.

They are also the lab's truth about the user experience: every request they make is kept for a minute,
and /admin/stats says how many worked, how many failed and how slow the slow ones were (p50, p95). A
backend can look healthy while customers suffer; this is the number that says so.
"""
from __future__ import annotations

import os
import random
import threading
import time
import uuid
from collections import deque
from concurrent.futures import ThreadPoolExecutor

import httpx
from fastapi import Body, FastAPI

from .common import instrument, log

app = FastAPI(title="customers")
knobs, metrics = instrument(app, "customers")
GATEWAY = os.getenv("GATEWAY_URL", "http://gateway:8000")
API_KEY = os.getenv("SHOP_API_KEY", "lab-key")
HOT, OTHERS = "BAK-001", [f"BAK-{i:03d}" for i in range(2, 13)]
CLIENT_TIMEOUT = 10.0
WINDOW = 60.0

_lock = threading.Lock()
_seen: deque[tuple[float, str, int, float]] = deque()   # (when, what, status, seconds); status 0 = no answer
_pool = ThreadPoolExecutor(max_workers=64)
http = httpx.Client(timeout=CLIENT_TIMEOUT, headers={"x-api-key": API_KEY})


def _record(what: str, status: int, seconds: float) -> None:
    now = time.time()
    with _lock:
        _seen.append((now, what, status, seconds))
        while _seen and _seen[0][0] < now - WINDOW:
            _seen.popleft()


def _visit(sku: str | None = None) -> int:
    started = time.perf_counter()
    if sku is None and random.random() < 0.4:
        what, call = "browse", lambda: http.get(f"{GATEWAY}/menu")
    else:
        sku = sku or (HOT if random.random() < knobs.get("hot_item_share") else random.choice(OTHERS))
        what = "order"
        # a well-behaved client sends one key per order and reuses it when it retries
        call = lambda: http.post(f"{GATEWAY}/orders", json={"sku": sku, "qty": 1, "customer": f"cust-{random.randint(1, 500)}"},
                                 headers={"idempotency-key": uuid.uuid4().hex})
    try:
        status = call().status_code
    except httpx.HTTPError:
        status = 0
    _record(what, status, time.perf_counter() - started)
    return status


def _drive() -> None:
    while True:
        rps = knobs.get("rps")
        if rps <= 0:
            time.sleep(1)
            continue
        _pool.submit(_visit)
        time.sleep(1 / rps)


@app.on_event("startup")
def _startup() -> None:
    threading.Thread(target=_drive, daemon=True, name="customers").start()


@app.get("/health")
def health():
    return {"ok": True}


def _pct(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    values = sorted(values)
    return round(values[min(len(values) - 1, int(p * len(values)))], 3)


@app.get("/admin/stats")
def stats():
    with _lock:
        seen = list(_seen)
    done = [s for s in seen if s[2]]
    failed = [s for s in seen if s[2] == 0 or s[2] >= 500]
    sold_out = [s for s in seen if s[2] == 409]
    lat = [s[3] for s in seen]
    return {"window_s": WINDOW, "requests": len(seen), "ok": len([s for s in done if s[2] < 400]),
            "failed": len(failed), "sold_out": len(sold_out), "rejected": len([s for s in seen if s[2] in (401, 429)]),
            "error_rate": round(len(failed) / len(seen), 3) if seen else 0.0,
            "p50_s": _pct(lat, .5), "p95_s": _pct(lat, .95), "rps_target": knobs.get("rps")}


@app.post("/admin/burst")
def burst(body: dict = Body(default={})):
    """Many customers buy the same thing at the same moment (mission: race conditions)."""
    sku, n = body.get("sku", HOT), min(int(body.get("n", 20)), 200)
    statuses = list(_pool.map(lambda _: _visit(sku), range(n)))
    log("burst", sku=sku, n=n)
    return {"sku": sku, "n": n, "placed": statuses.count(201), "sold_out": statuses.count(409),
            "failed": len([s for s in statuses if s == 0 or s >= 500])}
