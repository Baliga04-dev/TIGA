"""The front door: the only service your browser (and the customers) talk to, on 127.0.0.1:8080.

It forwards /menu and /orders to the services behind it, gives each request an id, and holds the edge
controls the security and traffic missions switch on: `require_api_key` (X-Api-Key must match SHOP_API_KEY)
and `rate_limit_per_min` (per client address, counted in Redis). `upstream_timeout_s` is how long it waits
for the service behind it. /admin/* is the lab's control panel, used by Tiga's Lab page.

Forwarding is asynchronous: a waiting request holds no thread, so the gateway itself never becomes the
bottleneck (real gateways, from nginx to Envoy, work the same way). The services behind it are ordinary
threaded apps, which is where the timeout and scaling missions find their limits.
"""
from __future__ import annotations

import os
import time

import httpx
from fastapi import Body, FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse, PlainTextResponse

from .common import DEFAULTS, downstream_headers, instrument, redis_client, reset_knobs, set_knobs

app = FastAPI(title="gateway")
knobs, metrics = instrument(app, "gateway")
API_KEY = os.getenv("SHOP_API_KEY", "lab-key")
UP = {name: f"http://{name}:8000" for name in ("menu", "orders", "payments", "notifier", "customers")}
http = httpx.Client(timeout=None)          # health checks and the admin panel
_async: httpx.AsyncClient | None = None


def forwarder() -> httpx.AsyncClient:
    global _async
    if _async is None:
        _async = httpx.AsyncClient(timeout=None, limits=httpx.Limits(max_connections=1000, max_keepalive_connections=200))
    return _async


class RoundRobin:
    """A load balancer in a dozen lines: look up every copy of a service, then take turns.

    Plain DNS is not enough: a client that keeps connections open (all of them do) keeps talking to the copy
    it reached first, so scaling to three copies leaves two of them idle. Every 5 s this re-reads the list
    Docker's DNS gives for the name, so copies that start or stop are picked up.
    """

    def __init__(self, ttl: float = 5.0):
        self.ttl, self._seen, self._turn = ttl, {}, {}

    def url(self, service: str) -> str:
        import socket

        addrs, at = self._seen.get(service, ([], 0.0))
        if time.monotonic() - at > self.ttl:
            try:
                addrs = sorted({a[4][0] for a in socket.getaddrinfo(service, 8000, proto=socket.IPPROTO_TCP)})
            except OSError:
                addrs = addrs or [service]
            self._seen[service] = (addrs, time.monotonic())
        n = self._turn.get(service, 0)
        self._turn[service] = n + 1
        return f"http://{addrs[n % len(addrs)]}:8000"


balancer = RoundRobin()


def _edge(request: Request, api_key: str | None) -> None:
    k = knobs.all()
    if k["require_api_key"] and api_key != API_KEY:
        raise HTTPException(401, "missing or wrong X-Api-Key")
    if k["rate_limit_per_min"]:
        who = request.client.host if request.client else "unknown"
        key = f"rl:{who}:{int(time.time() // 60)}"
        count = redis_client().incr(key)
        redis_client().expire(key, 120)
        if count > k["rate_limit_per_min"]:
            raise HTTPException(429, "too many requests; slow down")


async def _forward(method: str, url: str, **kw) -> JSONResponse:
    timeout = knobs.get("upstream_timeout_s") or None
    try:
        r = await forwarder().request(method, url, timeout=timeout, headers={**downstream_headers(), **kw.pop("headers", {})}, **kw)
    except httpx.TimeoutException:
        raise HTTPException(504, "the service behind the gateway took too long")
    except httpx.TransportError:
        raise HTTPException(502, "the service behind the gateway is not answering")
    try:
        payload = r.json()
    except ValueError:
        payload = {"error": r.text[:300]}
    return JSONResponse(payload, status_code=r.status_code)


@app.get("/menu")
async def menu(request: Request, q: str = "", x_api_key: str | None = Header(default=None)):
    _edge(request, x_api_key)
    return await _forward("GET", f"{balancer.url('menu')}/menu", params={"q": q} if q else None)


@app.post("/orders")
async def place(request: Request, body: dict = Body(...), x_api_key: str | None = Header(default=None),
                idempotency_key: str | None = Header(default=None)):
    _edge(request, x_api_key)
    return await _forward("POST", f"{balancer.url('orders')}/orders", json=body,
                    headers={"idempotency-key": idempotency_key} if idempotency_key else {})


@app.get("/orders/{order_id}")
async def get_order(order_id: int, request: Request, x_api_key: str | None = Header(default=None)):
    _edge(request, x_api_key)
    return await _forward("GET", f"{balancer.url('orders')}/orders/{order_id}")


@app.get("/health")
def health():
    """Every service's own health check, as the gateway sees it."""
    out = {}
    for name, url in UP.items():
        try:
            r = http.get(f"{url}/health", timeout=2)
            out[name] = "up" if r.status_code == 200 else f"unhealthy ({r.status_code})"
        except httpx.HTTPError:
            out[name] = "down"
    return {"ok": all(v == "up" for v in out.values()), "services": out}


# ------------------------------------------------------------------------------- the lab's control panel
@app.get("/admin/all-knobs")
def all_knobs():
    r = redis_client()
    out = {}
    for service, defaults in DEFAULTS.items():
        live = r.hgetall(f"lab:knobs:{service}") or {}
        out[service] = {k: live.get(k, v) for k, v in defaults.items()}
    return out


@app.post("/admin/knobs/{service}")
def change_knobs(service: str, values: dict = Body(...)):
    try:
        return {"ok": True, "set": set_knobs(service, values)}
    except KeyError as exc:
        raise HTTPException(400, str(exc).strip("'\""))


@app.post("/admin/reset")
def reset():
    reset_knobs()
    return {"ok": True}


@app.get("/admin/metrics/{service}", response_class=PlainTextResponse)
def service_metrics(service: str):
    if service == "gateway":
        return metrics.render()
    if service not in UP:
        raise HTTPException(404, "no such service")
    try:
        return http.get(f"{UP[service]}/metrics", timeout=3).text
    except httpx.HTTPError:
        raise HTTPException(502, f"{service} is not answering")


@app.api_route("/admin/svc/{service}/{path:path}", methods=["GET", "POST"])
async def service_admin(service: str, path: str, request: Request):
    """Reach a service's own /admin endpoints (stock report, payment ledger, queue, traffic stats)."""
    if service not in UP:
        raise HTTPException(404, "no such service")
    body = await request.body()
    try:
        async with httpx.AsyncClient(timeout=140) as client:   # a burst of customers takes a while
            r = await client.request(request.method, f"{UP[service]}/admin/{path}", content=body or None,
                                     headers={"content-type": "application/json"})
    except httpx.HTTPError:
        raise HTTPException(502, f"{service} is not answering")
    return JSONResponse(r.json() if r.content else {}, status_code=r.status_code)
