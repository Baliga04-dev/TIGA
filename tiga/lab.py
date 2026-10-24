"""ShopLab, driven from Tiga: a small online bakery as real microservices (lab/), to learn by breaking it.

Interface: `Lab(compose=None, gateway=None)` with
  status()                     is Docker here, is the lab up, and each container's state and health
  up() / down() / service(op, name, n=None)   docker compose up/down; stop/start/restart/rebuild/scale one service
  logs(service=None, request_id=None, tail=300) -> parsed JSON log lines, newest last
  snapshot()                   what customers see (rolling minute), per-service rates since the last snapshot,
                               stock and oversold items, the payment ledger, the WhatsApp queue, live knobs
  incidents(snap) -> rules hit; watch_once(store) opens new incidents and resolves the ones that cleared
  missions() / mission(id)     the lessons in lab/missions/*.md, split into their sections, with their buttons
  act(mission_id, action)      runs a mission button: break / fix / undo
  check(mission_id)            the mission's own test, against the live system
The two seams are `compose(args) -> CompletedProcess` and `gateway(method, path, json=None) -> (status, body)`,
so tests run without Docker. Every action is from a fixed list in MISSIONS; nothing here runs text it was sent.
"""
from __future__ import annotations

import json
import re
import shutil
import subprocess
import time
from pathlib import Path
from typing import Callable
from urllib.parse import quote

import config

LAB_DIR = Path(__file__).resolve().parent.parent / "lab"
GATEWAY = "http://127.0.0.1:8080"
SERVICES = ["gateway", "menu", "orders", "payments", "notifier", "customers", "postgres", "redis"]
APP_SERVICES = ["gateway", "menu", "orders", "payments", "notifier", "customers"]
SQL_ALLOWED = {
    "create_index": "CREATE INDEX IF NOT EXISTS idx_items_sku ON items (sku)",
    "drop_index": "DROP INDEX IF EXISTS idx_items_sku",
    "explain_lookup": "EXPLAIN ANALYZE SELECT sku, name, price_paise, stock FROM items WHERE sku = 'BAK-007'",
}
HOT = "BAK-001"

Compose = Callable[[list[str]], subprocess.CompletedProcess]
Gateway = Callable[..., tuple[int, object]]


def run_compose(args: list[str], timeout: int = 900) -> subprocess.CompletedProcess:
    return subprocess.run(["docker", "compose", "-f", str(LAB_DIR / "compose.yaml"), *args], cwd=LAB_DIR,
                          capture_output=True, text=True, timeout=timeout, check=False)


def call_gateway(method: str, path: str, json_body=None) -> tuple[int, object]:
    import httpx

    timeout = 150 if path.endswith("/burst") else 15   # a burst waits for 40 customers to finish
    try:
        r = httpx.request(method, GATEWAY + path, json=json_body, timeout=timeout,
                          headers={"x-api-key": "lab-key"})
    except httpx.HTTPError as exc:
        return 0, {"error": f"the lab is not answering ({type(exc).__name__})"}
    try:
        return r.status_code, r.json()
    except ValueError:
        return r.status_code, r.text


# ------------------------------------------------------------------------------------------ metrics maths
_METRIC = re.compile(r'^(\w+)\{([^}]*)\}\s+([0-9.eE+-]+)$')


def parse_metrics(text: str) -> list[tuple[str, dict, float]]:
    out = []
    for line in text.splitlines():
        m = _METRIC.match(line.strip())
        if m:
            labels = dict(re.findall(r'(\w+)="([^"]*)"', m.group(2)))
            out.append((m.group(1), labels, float(m.group(3))))
    return out


def summarize(prev: list, cur: list, seconds: float) -> dict:
    """Requests a second, share of 5xx answers and p95 latency over the time between two scrapes."""
    def table(rows):
        req, buckets = {}, {}
        for name, labels, v in rows:
            if name == "shop_requests_total":
                key = labels.get("status", "")
                req[key] = req.get(key, 0) + v
            elif name == "shop_request_seconds_bucket":
                le = labels["le"]
                buckets[le] = buckets.get(le, 0) + v
        return req, buckets

    (r0, b0), (r1, b1) = table(prev), table(cur)
    total = sum(r1.values()) - sum(r0.values())
    errors = sum(v - r0.get(k, 0) for k, v in r1.items() if k.startswith("5"))
    p95 = 0.0
    count = b1.get("+Inf", 0) - b0.get("+Inf", 0)
    if count > 0:
        for le in sorted((k for k in b1 if k != "+Inf"), key=float):
            if b1[le] - b0.get(le, 0) >= 0.95 * count:
                p95 = float(le)
                break
        else:
            p95 = 10.0   # past the largest bucket
    seconds = max(seconds, 1e-6)
    return {"rps": round(max(total, 0) / seconds, 2), "error_rate": round(errors / total, 3) if total > 0 else 0.0,
            "p95_s": p95 if total > 0 else 0.0}


# ------------------------------------------------------------------------------------------- missions
def parse_mission(text: str) -> dict:
    meta, body = {}, text
    if text.startswith("---"):
        head, body = text[3:].split("\n---", 1)
        for line in head.strip().splitlines():
            if ":" in line:
                k, v = line.split(":", 1)
                meta[k.strip()] = v.strip()
    sections, current = {}, None
    for line in body.strip().splitlines():
        if line.startswith("## "):
            current = line[3:].strip()
            sections[current] = []
        elif current:
            sections[current].append(line)
    return {**meta, "sections": [{"title": t, "text": "\n".join(ls).strip()} for t, ls in sections.items()]}


def _knobs(service: str, **values) -> dict:
    return {"kind": "knobs", "service": service, "values": values}


# The buttons each mission offers, and its check. Text lives in lab/missions/<file>.md.
MISSIONS: dict[str, dict] = {
    "tour": {"file": "00-tour.md", "actions": {
        "break": [{"kind": "order"}]}, "check": "tour"},
    "index": {"file": "01-index.md", "actions": {
        "break": [{"kind": "sql", "name": "drop_index"}, _knobs("customers", rps=6)],
        "plan": [{"kind": "sql", "name": "explain_lookup"}],
        "fix": [{"kind": "sql", "name": "create_index"}],
        "undo": [{"kind": "sql", "name": "drop_index"}, _knobs("customers", rps=2)]}, "check": "index"},
    "race": {"file": "02-race.md", "actions": {
        "break": [_knobs("menu", atomic_stock=False, oven=False), {"kind": "restock", "sku": HOT, "stock": 5}, {"kind": "burst", "sku": HOT, "n": 40}],
        "fix": [_knobs("menu", atomic_stock=True)],
        "undo": [_knobs("menu", atomic_stock=False, oven=True), {"kind": "restock", "sku": HOT, "stock": 25}]}, "check": "race"},
    "timeouts": {"file": "03-timeouts.md", "actions": {
        "break": [_knobs("payments", latency_ms=25000), _knobs("orders", payment_timeout_s=0), _knobs("customers", rps=4)],
        "fix": [_knobs("orders", payment_timeout_s=2), _knobs("gateway", upstream_timeout_s=5)],
        "undo": [_knobs("payments", latency_ms=0), _knobs("orders", payment_timeout_s=0), _knobs("gateway", upstream_timeout_s=30),
                 _knobs("customers", rps=2)]}, "check": "timeouts"},
    "double-charge": {"file": "04-double-charge.md", "actions": {
        "break": [_knobs("payments", fail_after_charge=0.3), _knobs("orders", retries=2, idempotency=False)],
        "fix": [_knobs("orders", idempotency=True)],
        "undo": [_knobs("payments", fail_after_charge=0), _knobs("orders", retries=0, idempotency=False)]}, "check": "double_charge"},
    "circuit-breaker": {"file": "05-circuit-breaker.md", "actions": {
        "break": [_knobs("payments", latency_ms=3000, error_rate=1.0), _knobs("orders", retries=3, payment_timeout_s=5, circuit_breaker=False)],
        "fix": [_knobs("orders", circuit_breaker=True)],
        "undo": [_knobs("payments", latency_ms=0, error_rate=0), _knobs("orders", retries=0, payment_timeout_s=0, circuit_breaker=False)]},
        "check": "breaker"},
    "cache": {"file": "06-cache.md", "actions": {
        "break": [_knobs("menu", cache=False, latency_ms=0), _knobs("customers", rps=10)],
        "fix": [_knobs("menu", cache=True)],
        "stale": [_knobs("menu", cache=True), {"kind": "price", "sku": "BAK-002", "price_paise": 3900}],
        "undo": [_knobs("menu", cache=False), {"kind": "price", "sku": "BAK-002", "price_paise": 3500}, _knobs("customers", rps=2)]},
        "check": "cache"},
    "queue": {"file": "07-queue.md", "actions": {
        "break": [_knobs("orders", async_notify=False), _knobs("notifier", send_ms=1500), _knobs("customers", rps=3)],
        "fix": [_knobs("orders", async_notify=True)],
        "scale": [{"kind": "compose", "op": "scale", "service": "notifier", "n": 3}],
        "poison": [_knobs("notifier", poison_rate=0.2)],
        "undo": [_knobs("orders", async_notify=False), _knobs("notifier", poison_rate=0), _knobs("customers", rps=2),
                 {"kind": "compose", "op": "scale", "service": "notifier", "n": 1}]}, "check": "queue"},
    "find-the-slow-one": {"file": "08-observability.md", "actions": {
        "break": [{"kind": "mystery"}],
        "undo": [{"kind": "mystery_clear"}]}, "check": "mystery"},
    "scaling": {"file": "09-scaling.md", "actions": {
        "break": [{"kind": "sql", "name": "create_index"}, _knobs("payments", latency_ms=1500), _knobs("customers", rps=30)],
        "fix": [{"kind": "compose", "op": "scale", "service": "orders", "n": 3}],
        "undo": [_knobs("payments", latency_ms=0), _knobs("customers", rps=2), {"kind": "compose", "op": "scale", "service": "orders", "n": 1},
                 {"kind": "sql", "name": "drop_index"}]},
        "check": "scaling"},
    "security": {"file": "10-security.md", "actions": {
        "break": [_knobs("menu", safe_search=False), _knobs("gateway", require_api_key=False, rate_limit_per_min=0), {"kind": "inject"}],
        "fix": [_knobs("menu", safe_search=True), _knobs("gateway", require_api_key=True, rate_limit_per_min=600)],
        "undo": [_knobs("menu", safe_search=False), _knobs("gateway", require_api_key=False, rate_limit_per_min=0)]}, "check": "security"},
    "deploys": {"file": "11-deploys.md", "actions": {
        "break": [_knobs("orders", bad_deploy=True)],
        "fix": [_knobs("orders", bad_deploy=False)],
        "undo": [_knobs("orders", bad_deploy=False)]}, "check": "deploys"},
}
INJECTION = "x' OR category = 'catalogue' AND sku LIKE 'CAT-00000%' --"
_MYSTERY_KEY = "lab.mystery"


class Lab:
    def __init__(self, compose: Compose | None = None, gateway: Gateway | None = None, store=None,
                 clock: Callable[[], float] = time.monotonic, sleep: Callable[[float], None] = time.sleep):
        self.compose = compose or run_compose
        self.gateway = gateway or call_gateway
        self.store, self.clock, self.sleep = store, clock, sleep

    # --------------------------------------------------------------------------------- docker
    def docker_ready(self) -> bool:
        if self.compose is run_compose and not shutil.which("docker"):
            return False
        return self.compose(["version"]).returncode == 0

    def status(self) -> dict:
        if not self.docker_ready():
            return {"docker": False, "running": False, "services": [],
                    "hint": "Install Docker in Ubuntu: sudo apt install -y docker.io docker-compose-v2 && sudo usermod -aG docker $USER, then run wsl --shutdown and reopen Ubuntu."}
        ps = self.compose(["ps", "--all", "--format", "json"])
        rows = []
        for line in (ps.stdout or "").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                parsed = json.loads(line)
            except ValueError:
                continue
            rows.extend(parsed if isinstance(parsed, list) else [parsed])
        services = [{"name": r.get("Service"), "container": r.get("Name"), "state": r.get("State"),
                     "health": r.get("Health") or ""} for r in rows]
        running = any(s["name"] == "gateway" and s["state"] == "running" for s in services)
        return {"docker": True, "running": running, "services": services, "gateway": GATEWAY}

    def up(self) -> dict:
        r = self.compose(["up", "-d", "--build", "--wait"])
        return {"ok": r.returncode == 0, "detail": (r.stderr or r.stdout)[-800:]}

    def down(self) -> dict:
        r = self.compose(["down"])
        return {"ok": r.returncode == 0, "detail": (r.stderr or r.stdout)[-400:]}

    def service(self, op: str, name: str, n: int | None = None) -> dict:
        if name not in SERVICES:
            return {"ok": False, "detail": f"no service called {name}"}
        args = {"stop": ["stop", name], "start": ["start", name], "restart": ["restart", name],
                "rebuild": ["up", "-d", "--build", "--no-deps", name],
                "scale": ["up", "-d", "--no-deps", "--scale", f"{name}={max(1, min(int(n or 1), 5))}", name]}.get(op)
        if args is None:
            return {"ok": False, "detail": f"unknown operation {op}"}
        r = self.compose(args)
        return {"ok": r.returncode == 0, "detail": (r.stderr or r.stdout)[-400:]}

    def logs(self, service: str | None = None, request_id: str | None = None, tail: int = 300) -> list[dict]:
        args = ["logs", "--no-color", "--no-log-prefix", f"--tail={max(10, min(tail, 2000))}"]
        if service:
            if service not in SERVICES:
                return []
            args.append(service)
        r = self.compose(args)
        out = []
        for line in (r.stdout or "").splitlines():
            start = line.find("{")
            if start < 0:
                continue
            try:
                rec = json.loads(line[start:])
            except ValueError:
                continue
            if request_id and rec.get("request_id") != request_id:
                continue
            out.append(rec)
        return out[-tail:]

    # ------------------------------------------------------------------------------ what's happening
    _last: dict = {}

    def snapshot(self) -> dict:
        status, health = self.gateway("GET", "/health")
        if status == 0:
            return {"up": False, "error": health.get("error") if isinstance(health, dict) else str(health)}
        now = self.clock()
        services = {}
        for name in APP_SERVICES:
            code, text = self.gateway("GET", f"/admin/metrics/{name}")
            rows = parse_metrics(text) if code == 200 and isinstance(text, str) else []
            prev = Lab._last.get(name)
            services[name] = summarize(prev[1], rows, now - prev[0]) if prev else {"rps": 0.0, "error_rate": 0.0, "p95_s": 0.0}
            if prev:
                routes = sorted({lb.get("route") for n, lb, _ in rows if n == "shop_requests_total"} - {None})
                services[name]["routes"] = {r: summarize([x for x in prev[1] if x[1].get("route") == r],
                                                         [x for x in rows if x[1].get("route") == r], now - prev[0]) for r in routes}
            backlog = next((v for n, _, v in rows if n == "shop_queue_backlog"), None)
            if backlog is not None:
                services[name]["backlog"] = backlog
            queries = next((v for n, _, v in rows if n == "shop_db_queries_total"), None)
            old = next((v for n, _, v in prev[1] if n == "shop_db_queries_total"), None) if prev else None
            if queries is not None and old is not None:
                services[name]["db_qps"] = round(max(queries - old, 0) / max(now - prev[0], 1e-6), 2)
            Lab._last[name] = (now, rows)
        get = lambda path: (lambda r: r[1] if r[0] == 200 else {})(self.gateway("GET", path))
        return {"up": True, "health": health.get("services", {}) if isinstance(health, dict) else {},
                "customers": get("/admin/svc/customers/stats"), "services": services,
                "stock": get("/admin/svc/menu/stock"), "ledger": get("/admin/svc/payments/ledger"),
                "queue": get("/admin/svc/notifier/queue"), "orders": get("/admin/svc/orders/stats"),
                "knobs": get("/admin/all-knobs")}

    @staticmethod
    def incidents(snap: dict) -> list[dict]:
        if not snap.get("up"):
            return []
        hits = []
        for name, state in (snap.get("health") or {}).items():
            if state != "up":
                hits.append({"rule": f"down:{name}", "title": f"{name} is {state}", "mission": "deploys" if name == "orders" else "",
                             "detail": f"The gateway's health check of {name} says {state}. Requests that need it will fail."})
        c = snap.get("customers") or {}
        if c.get("requests", 0) >= 10 and c.get("error_rate", 0) > 0.05:
            hits.append({"rule": "customers:errors", "title": f"Customers are getting errors ({c['error_rate']:.0%} of requests)",
                         "mission": "timeouts", "detail": f"{c.get('failed')} of {c.get('requests')} requests in the last minute failed or got no answer."})
        if c.get("requests", 0) >= 10 and c.get("p95_s", 0) > 3:
            hits.append({"rule": "customers:slow", "title": f"The shop is slow: 1 in 20 customers waits {c['p95_s']}s or more",
                         "mission": "index", "detail": "The slowest 5% of requests in the last minute took longer than 3 seconds."})
        for item in (snap.get("stock") or {}).get("oversold", []):
            hits.append({"rule": f"oversold:{item['sku']}", "title": f"Sold more {item['name']} than we had ({item['stock']} in stock)",
                         "mission": "race", "detail": "Stock went below zero: two orders took the same last items."})
        doubled = (snap.get("ledger") or {}).get("charged_more_than_once", [])
        if doubled:
            hits.append({"rule": "payments:doubled", "title": f"{len(doubled)} order(s) charged more than once", "mission": "double-charge",
                         "detail": "Order " + ", ".join(f"#{d['order_ref']} ({d['times']} times)" for d in doubled[:5]) + "."})
        q = snap.get("queue") or {}
        if q.get("backlog", 0) > 50:
            hits.append({"rule": "queue:backlog", "title": f"{q['backlog']} WhatsApp confirmations are waiting to go out",
                         "mission": "queue", "detail": "Messages arrive faster than the notifier sends them."})
        if q.get("dead", 0) > 0:
            hits.append({"rule": "queue:dead", "title": f"{q['dead']} message(s) in the dead-letter queue", "mission": "queue",
                         "detail": "These failed three times and were set aside so the rest could go out."})
        if (snap.get("orders") or {}).get("breaker") == "open":
            hits.append({"rule": "orders:breaker", "title": "Orders stopped calling payments for now (circuit open)",
                         "mission": "circuit-breaker", "detail": "Payments kept failing, so orders fails fast instead of waiting."})
        return hits

    def watch_once(self, store) -> list[dict]:
        snap = self.snapshot()
        if not snap.get("up"):
            return []
        hits = self.incidents(snap)
        for h in hits:
            store.upsert_lab_incident(h["rule"], h["title"], h["detail"], h["mission"])
        store.resolve_lab_incidents(keep=[h["rule"] for h in hits])
        return hits

    # ------------------------------------------------------------------------------ missions
    def missions(self) -> list[dict]:
        out = []
        for mid, m in MISSIONS.items():
            doc = parse_mission((LAB_DIR / "missions" / m["file"]).read_text(encoding="utf-8"))
            out.append({"id": mid, "title": doc.get("title", mid), "topic": doc.get("topic", ""), "actions": list(m["actions"])})
        return out

    def mission(self, mid: str) -> dict | None:
        m = MISSIONS.get(mid)
        if not m:
            return None
        doc = parse_mission((LAB_DIR / "missions" / m["file"]).read_text(encoding="utf-8"))
        return {"id": mid, **doc, "actions": list(m["actions"])}

    def act(self, mid: str, action: str) -> dict:
        steps = (MISSIONS.get(mid) or {}).get("actions", {}).get(action)
        if steps is None:
            return {"ok": False, "detail": f"no {action} button for this mission"}
        done = []
        for step in steps:
            ok, detail = self._step(step)
            done.append(detail)
            if not ok:
                return {"ok": False, "detail": "; ".join(done)}
        self._settle(steps)
        return {"ok": True, "detail": "; ".join(done)}

    def _settle(self, steps: list[dict]) -> None:
        """Services re-read knobs every quarter second; give them that before anyone measures."""
        if self.gateway is call_gateway and any(s["kind"] == "knobs" for s in steps):
            self.sleep(0.5)

    def _step(self, step: dict) -> tuple[bool, str]:
        kind = step["kind"]
        if kind == "knobs":
            code, body = self.gateway("POST", f"/admin/knobs/{step['service']}", step["values"])
            return code == 200, f"{step['service']}: " + ", ".join(f"{k}={v}" for k, v in step["values"].items())
        if kind == "sql":
            r = self.compose(["exec", "-T", "postgres", "psql", "-U", "shop", "-d", "shop", "-c", SQL_ALLOWED[step["name"]]])
            return r.returncode == 0, (r.stdout or r.stderr).strip()[-600:] or SQL_ALLOWED[step["name"]]
        if kind == "restock":
            code, _ = self.gateway("POST", "/admin/svc/menu/restock", {"sku": step["sku"], "stock": step["stock"]})
            return code == 200, f"{step['sku']} stock set to {step['stock']}"
        if kind == "price":
            code, _ = self.gateway("POST", "/admin/svc/menu/price", {"sku": step["sku"], "price_paise": step["price_paise"]})
            return code == 200, f"{step['sku']} now costs ₹{step['price_paise'] / 100:.0f} in the database"
        if kind == "burst":
            code, body = self.gateway("POST", "/admin/svc/customers/burst", {"sku": step["sku"], "n": step["n"]})
            return code == 200, f"{step['n']} customers tried to buy {step['sku']} at once: {body}"
        if kind == "compose":
            r = self.service(step["op"], step["service"], step.get("n"))
            return r["ok"], f"{step['op']} {step['service']}" + (f" to {step['n']}" if step.get("n") else "")
        if kind == "order":
            code, body = self.gateway("POST", "/orders", {"sku": "BAK-003", "qty": 1, "customer": "you"})
            return code in (200, 201), f"placed an order: {body}"
        if kind == "inject":
            code, body = self.gateway("GET", "/menu?q=" + quote(INJECTION))
            n = len(body.get("items", [])) if isinstance(body, dict) else 0
            return True, f"searched for {INJECTION!r} and got {n} rows back (the menu has 12)"
        if kind == "mystery":
            import random

            target = random.choice(["menu", "orders", "payments"])
            if self.store is not None:
                self.store.set_value(_MYSTERY_KEY, target)
            self.gateway("POST", "/admin/knobs/orders", {"async_notify": True})
            self.gateway("POST", f"/admin/knobs/{target}", {"latency_ms": 1200})
            return True, "one service is now slow. Which one?"
        if kind == "mystery_clear":
            for name in ("menu", "orders", "payments", "notifier"):
                self.gateway("POST", f"/admin/knobs/{name}", {"latency_ms": 0})
            self.gateway("POST", "/admin/knobs/orders", {"async_notify": False})
            if self.store is not None:
                self.store.set_value(_MYSTERY_KEY, "")
            return True, "every service is back to normal speed"
        return False, f"unknown step {kind}"

    # ------------------------------------------------------------------------------ checks
    def check(self, mid: str, answer: str = "") -> dict:
        m = MISSIONS.get(mid)
        if not m:
            return {"ok": False, "detail": "no such mission"}
        return getattr(self, f"_check_{m['check']}")(answer)

    def _check_tour(self, answer: str) -> dict:
        code, body = self.gateway("POST", "/orders", {"sku": "BAK-003", "qty": 1, "customer": "tour"})
        return {"ok": code in (200, 201), "detail": f"The order went through (status {code})." if code in (200, 201)
                else f"The order failed with {code}: {body}. Is every service up?"}

    def _check_index(self, answer: str) -> dict:
        stock = self.gateway("GET", "/admin/svc/menu/stock")[1] or {}
        has = any("sku" in i for i in stock.get("indexes", []))
        return {"ok": has, "detail": "items has an index on sku, so a lookup reads a handful of pages, not 600,000 rows."
                if has else "There is still no index on items(sku). Run the quick fix, or CREATE INDEX yourself in psql."}

    def _check_race(self, answer: str) -> dict:
        self._step({"kind": "restock", "sku": HOT, "stock": 5})
        self._settle([{"kind": "knobs"}])
        ok_b, burst = self._step({"kind": "burst", "sku": HOT, "n": 40})
        stock = self.gateway("GET", "/admin/svc/menu/stock")[1] or {}
        hot = next((i for i in stock.get("items", []) if i["sku"] == HOT), {"stock": None})
        self._step({"kind": "restock", "sku": HOT, "stock": 25})
        fine = hot["stock"] is not None and hot["stock"] >= 0
        return {"ok": fine, "detail": f"40 customers raced for 5 honey cakes; stock ended at {hot['stock']}. "
                + ("Nobody got a cake that did not exist." if fine else "It went below zero: the race is still there.")}

    def _customers(self) -> dict:
        return self.gateway("GET", "/admin/svc/customers/stats")[1] or {}

    def _check_timeouts(self, answer: str) -> dict:
        health = (self.gateway("GET", "/health")[1] or {}).get("services", {})
        c = self._customers()
        ok = health.get("orders") == "up" and c.get("p95_s", 99) <= 6
        return {"ok": ok, "detail": f"Orders is {health.get('orders')}; the slowest customers wait {c.get('p95_s')}s. "
                + ("A slow payment provider now costs a few seconds, not the whole shop." if ok
                   else "Customers still wait too long or orders is stuck. Is the payment timeout on?")}

    def _check_double_charge(self, answer: str) -> dict:
        before = (self.gateway("GET", "/admin/svc/payments/ledger")[1] or {}).get("doubled_ever", 0)
        self.sleep(30)
        after = (self.gateway("GET", "/admin/svc/payments/ledger")[1] or {}).get("doubled_ever", 0)
        ok = after == before
        return {"ok": ok, "detail": f"In 30 seconds of traffic, {after - before} new order(s) were charged twice. "
                + ("Retries are now safe." if ok else "Retries still create new charges. Is idempotency on?")}

    def _check_breaker(self, answer: str) -> dict:
        state = (self.gateway("GET", "/admin/svc/orders/stats")[1] or {}).get("breaker")
        c = self._customers()
        ok = state in ("open", "half-open") and c.get("p95_s", 99) < 2
        return {"ok": ok, "detail": f"The breaker is {state}; the slowest customers wait {c.get('p95_s')}s. "
                + ("Orders fails fast while payments is down." if ok else "Orders still waits on a dead payments service.")}

    def _check_cache(self, answer: str) -> dict:
        self._step(_knobs("menu", cache=True))
        self._settle([{"kind": "knobs"}])
        price_of = lambda menu: next((i["price_paise"] for i in (menu or {}).get("items", []) if i["sku"] == "BAK-002"), 0)
        old = price_of(self.gateway("GET", "/menu")[1])     # this read also fills the cache with the old price
        new = 3900 if old != 3900 else 4300                  # always a price the cache has not seen
        self._step({"kind": "price", "sku": "BAK-002", "price_paise": new})
        price = price_of(self.gateway("GET", "/menu")[1])
        self._step({"kind": "price", "sku": "BAK-002", "price_paise": 3500})
        ok = price == new
        return {"ok": ok, "detail": f"Changed Dil pasand to ₹{new / 100:.0f} with the cache on; the menu then showed ₹{price / 100:.0f}. "
                + ("The cache was cleared when the price changed." if ok
                   else "Customers still see the old price. The fix is in the code: clear menu:list in set_price.")}

    def _check_queue(self, answer: str) -> dict:
        snap = self.snapshot()
        orders, q = snap.get("services", {}).get("orders", {}), snap.get("queue") or {}
        ok = orders.get("p95_s", 99) <= 1 and q.get("backlog", 999) < 20
        return {"ok": ok, "detail": f"Orders answers in {orders.get('p95_s')}s at the 95th percentile; {q.get('backlog')} messages wait. "
                + ("Customers no longer wait for WhatsApp." if ok else "Either orders still waits for WhatsApp, or the queue is backing up.")}

    def _check_mystery(self, answer: str) -> dict:
        target = self.store.get_value(_MYSTERY_KEY, "") if self.store is not None else ""
        if not target:
            return {"ok": False, "detail": "Press Break it first, then tell me which service is slow."}
        if not answer:
            return {"ok": False, "detail": "Type the name of the service you think is slow."}
        ok = answer.strip().lower() == target
        return {"ok": ok, "detail": f"Yes: {target} was the slow one." if ok else f"Not {answer}. Look at each service's p95 and the logs."}

    def _check_scaling(self, answer: str) -> dict:
        replicas = sum(1 for s in self.status()["services"] if s["name"] == "orders" and s["state"] == "running")
        c = self._customers()
        ok = replicas >= 3 and c.get("error_rate", 1) < 0.05
        return {"ok": ok, "detail": f"{replicas} orders container(s) running; {c.get('error_rate', 0):.0%} of requests failing."}

    def _check_security(self, answer: str) -> dict:
        code, body = self.gateway("GET", "/menu?q=" + quote(INJECTION))
        rows = len(body.get("items", [])) if isinstance(body, dict) else 0
        knobs = (self.gateway("GET", "/admin/all-knobs")[1] or {}).get("gateway", {})
        ok = rows == 0 and str(knobs.get("require_api_key")).lower() == "true"
        return {"ok": ok, "detail": f"The injection now returns {rows} rows; API key required: {knobs.get('require_api_key')}."}

    def _check_deploys(self, answer: str) -> dict:
        health = (self.gateway("GET", "/health")[1] or {}).get("services", {})
        ok = health.get("orders") == "up"
        return {"ok": ok, "detail": "Orders passes its health check again." if ok else f"Orders is {health.get('orders')}."}
