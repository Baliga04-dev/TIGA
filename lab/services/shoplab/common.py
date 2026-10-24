"""What every ShopLab service shares: knobs, metrics, structured logs, request ids and fault injection.

Knobs are the lab's control panel. Each service has defaults (DEFAULTS) and the live values sit in Redis
(`lab:knobs:<service>`), so Tiga, or you, can turn a fault on or a fix on for every replica at once. A
service reads them at most once a second.

Every request through `instrument(app, service)`:
  - gets an X-Request-ID (taken from the caller, or made here) that is passed on downstream;
  - is timed and counted for /metrics (Prometheus text format);
  - is logged as one JSON line on stdout;
  - suffers the service's faults first: `latency_ms`, `error_rate` (0..1) and `crash` (the process exits).
"""
from __future__ import annotations

import json
import os
import random
import sys
import threading
import time
import uuid
from contextvars import ContextVar

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, PlainTextResponse

SERVICE = os.getenv("SERVICE", "unknown")
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://shop:shop@postgres:5432/shop")

# Every knob, its default and what it teaches. Faults first, then the fixes a mission switches on.
DEFAULTS: dict[str, dict] = {
    "gateway": {"latency_ms": 0, "error_rate": 0.0, "crash": False,
                "upstream_timeout_s": 30.0, "rate_limit_per_min": 0, "require_api_key": False},
    "menu": {"latency_ms": 0, "error_rate": 0.0, "crash": False,
             "cache": False, "atomic_stock": False, "race_window_ms": 60, "safe_search": False},
    "orders": {"latency_ms": 0, "error_rate": 0.0, "crash": False,
               "payment_timeout_s": 0.0, "retries": 0, "idempotency": False, "circuit_breaker": False,
               "async_notify": False, "bad_deploy": False},
    "payments": {"latency_ms": 0, "error_rate": 0.0, "crash": False, "fail_after_charge": 0.0},
    "notifier": {"latency_ms": 0, "error_rate": 0.0, "crash": False, "send_ms": 1500, "poison_rate": 0.0},
    "customers": {"rps": 2.0, "hot_item_share": 0.3},
}

request_id: ContextVar[str] = ContextVar("request_id", default="")


# --------------------------------------------------------------------------------------------- redis
_redis = None


def redis_client():
    global _redis
    if _redis is None:
        import redis

        _redis = redis.Redis.from_url(REDIS_URL, decode_responses=True, socket_timeout=2, socket_connect_timeout=2)
    return _redis


def _coerce(default, raw: str):
    if isinstance(default, bool):
        return raw in ("1", "true", "True", "yes", "on")
    if isinstance(default, int):
        return int(float(raw))
    if isinstance(default, float):
        return float(raw)
    return raw


class Knobs:
    """The live knob values for one service, re-read from Redis at most once a second."""

    def __init__(self, service: str, store=None, ttl: float = 1.0):
        self.service, self.ttl = service, ttl
        self._store = store
        self._values = dict(DEFAULTS.get(service, {}))
        self._read_at = 0.0
        self._lock = threading.Lock()

    def _redis(self):
        return self._store if self._store is not None else redis_client()

    def all(self) -> dict:
        with self._lock:
            if time.monotonic() - self._read_at > self.ttl:
                self._read_at = time.monotonic()
                try:
                    raw = self._redis().hgetall(f"lab:knobs:{self.service}") or {}
                    base = dict(DEFAULTS.get(self.service, {}))
                    for k, v in raw.items():
                        if k in base:
                            base[k] = _coerce(base[k], v)
                    self._values = base
                except Exception:
                    pass   # Redis down: keep the last values; the lab should still serve
            return dict(self._values)

    def get(self, key: str):
        return self.all()[key]


def set_knobs(service: str, values: dict, store=None) -> dict:
    """Validate and store knob values for a service; unknown knobs are refused."""
    base = DEFAULTS.get(service)
    if base is None:
        raise KeyError(f"no service called {service}")
    bad = [k for k in values if k not in base]
    if bad:
        raise KeyError(f"{service} has no knob {', '.join(bad)}")
    store = store if store is not None else redis_client()
    clean = {k: str(_coerce(base[k], str(v))).lower() if isinstance(base[k], bool) else str(_coerce(base[k], str(v)))
             for k, v in values.items()}
    if clean:
        store.hset(f"lab:knobs:{service}", mapping=clean)
    return clean


def reset_knobs(store=None) -> None:
    store = store if store is not None else redis_client()
    for service in DEFAULTS:
        store.delete(f"lab:knobs:{service}")


# ------------------------------------------------------------------------------------------- metrics
BUCKETS = (0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0)


class Metrics:
    """Request counts and a latency histogram, in the Prometheus text format."""

    def __init__(self, service: str):
        self.service = service
        self._lock = threading.Lock()
        self.requests: dict[tuple[str, str, int], int] = {}
        self.hist: dict[str, list[int]] = {}
        self.sum: dict[str, float] = {}
        self.extra: dict[str, float] = {}

    def observe(self, method: str, route: str, status: int, seconds: float) -> None:
        with self._lock:
            key = (method, route, status)
            self.requests[key] = self.requests.get(key, 0) + 1
            h = self.hist.setdefault(route, [0] * (len(BUCKETS) + 1))
            for i, b in enumerate(BUCKETS):
                if seconds <= b:
                    h[i] += 1
            h[-1] += 1
            self.sum[route] = self.sum.get(route, 0.0) + seconds

    def gauge(self, name: str, value: float) -> None:
        with self._lock:
            self.extra[name] = value

    def render(self) -> str:
        s = self.service
        lines = ["# TYPE shop_requests_total counter"]
        with self._lock:
            for (m, r, st), n in sorted(self.requests.items()):
                lines.append(f'shop_requests_total{{service="{s}",method="{m}",route="{r}",status="{st}"}} {n}')
            lines.append("# TYPE shop_request_seconds histogram")
            for route, h in sorted(self.hist.items()):
                for b, n in zip(BUCKETS, h):
                    lines.append(f'shop_request_seconds_bucket{{service="{s}",route="{route}",le="{b}"}} {n}')
                lines.append(f'shop_request_seconds_bucket{{service="{s}",route="{route}",le="+Inf"}} {h[-1]}')
                lines.append(f'shop_request_seconds_sum{{service="{s}",route="{route}"}} {self.sum[route]:.4f}')
                lines.append(f'shop_request_seconds_count{{service="{s}",route="{route}"}} {h[-1]}')
            for name, v in sorted(self.extra.items()):
                lines.append(f'{name}{{service="{s}"}} {v}')
        return "\n".join(lines) + "\n"


def log(event: str, **fields) -> None:
    """One JSON line per event; the request id ties lines from different services together."""
    record = {"ts": round(time.time(), 3), "service": SERVICE, "event": event, "request_id": request_id.get(), **fields}
    sys.stdout.write(json.dumps(record, default=str) + "\n")
    sys.stdout.flush()


class InjectedFault(Exception):
    pass


def instrument(app: FastAPI, service: str, knobs: Knobs | None = None) -> tuple[Knobs, Metrics]:
    knobs = knobs or Knobs(service)
    metrics = Metrics(service)

    @app.middleware("http")
    async def _middleware(request: Request, call_next):
        rid = request.headers.get("x-request-id") or uuid.uuid4().hex[:16]
        token = request_id.set(rid)
        started = time.perf_counter()
        route = request.scope.get("route").path if request.scope.get("route") else request.url.path
        admin = request.url.path.startswith(("/admin", "/metrics", "/health"))
        try:
            if not admin:
                k = knobs.all()
                if k.get("crash"):
                    log("crash", reason="the crash knob is on")
                    os._exit(1)
                if k.get("latency_ms"):
                    import asyncio

                    await asyncio.sleep(k["latency_ms"] / 1000)
                if k.get("error_rate") and random.random() < k["error_rate"]:
                    raise InjectedFault("injected error (the error_rate knob)")
            response = await call_next(request)
        except InjectedFault as exc:
            response = JSONResponse({"error": str(exc)}, status_code=500)
        except Exception as exc:   # an unhandled bug: still a 500 with the request id, never a hang
            log("unhandled", error=f"{type(exc).__name__}: {exc}")
            response = JSONResponse({"error": "internal error", "request_id": rid}, status_code=500)
        seconds = time.perf_counter() - started
        route = request.scope.get("route").path if request.scope.get("route") else route
        if not admin:
            metrics.observe(request.method, route, response.status_code, seconds)
            log("request", method=request.method, route=route, status=response.status_code, ms=round(seconds * 1000, 1))
        response.headers["x-request-id"] = rid
        request_id.reset(token)
        return response

    @app.get("/metrics", response_class=PlainTextResponse)
    def _metrics():
        return metrics.render()

    @app.get("/admin/knobs")
    def _knobs():
        return knobs.all()

    return knobs, metrics


def downstream_headers() -> dict:
    return {"x-request-id": request_id.get()} if request_id.get() else {}


# ---------------------------------------------------------------------------------------- database
_pool = None


def pool():
    global _pool
    if _pool is None:
        from psycopg_pool import ConnectionPool

        _pool = ConnectionPool(DATABASE_URL, min_size=1, max_size=int(os.getenv("DB_POOL", "10")), open=True,
                               kwargs={"autocommit": True})
    return _pool


def wait_for(check, what: str, seconds: int = 60) -> None:
    """Containers start in any order; keep trying until a dependency answers."""
    deadline = time.time() + seconds
    while True:
        try:
            check()
            return
        except Exception as exc:
            if time.time() > deadline:
                raise RuntimeError(f"{what} did not come up: {exc}") from exc
            time.sleep(1)
