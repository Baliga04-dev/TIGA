import json
import subprocess

import pytest

import config
import lab
import services


def done(stdout="", code=0, stderr=""):
    return subprocess.CompletedProcess([], code, stdout, stderr)


class FakeCompose:
    def __init__(self, ps=None):
        self.calls = []
        self.ps = ps or []

    def __call__(self, args):
        self.calls.append(args)
        if args[0] == "ps":
            return done("\n".join(json.dumps(r) for r in self.ps))
        if args[0] == "logs":
            lines = [
                'gateway  | {"service": "gateway", "event": "request", "request_id": "abc", "ms": 12}',
                '{"service": "orders", "event": "request", "request_id": "abc", "ms": 9}',
                '{"service": "menu", "event": "request", "request_id": "zzz", "ms": 3}',
                "not json at all",
            ]
            return done("\n".join(lines))
        return done("ok")


class FakeGateway:
    def __init__(self, routes=None):
        self.calls = []
        self.routes = routes or {}

    def __call__(self, method, path, json_body=None):
        self.calls.append((method, path, json_body))
        for prefix, answer in self.routes.items():
            if path.startswith(prefix):
                return answer(json_body) if callable(answer) else answer
        return 200, {}


def test_status_reads_compose_ps():
    compose = FakeCompose(ps=[{"Service": "gateway", "Name": "shoplab-gateway-1", "State": "running", "Health": "healthy"},
                              {"Service": "orders", "Name": "shoplab-orders-1", "State": "exited", "Health": ""}])
    out = lab.Lab(compose=compose, gateway=FakeGateway()).status()
    assert out["docker"] and out["running"]
    assert out["services"][1] == {"name": "orders", "container": "shoplab-orders-1", "state": "exited", "health": ""}


def test_status_without_docker_explains_how_to_install():
    out = lab.Lab(compose=lambda args: done(code=1), gateway=FakeGateway()).status()
    assert not out["docker"] and "apt install" in out["hint"]


def test_service_operations_are_a_fixed_list():
    compose = FakeCompose()
    lab_ = lab.Lab(compose=compose, gateway=FakeGateway())
    assert lab_.service("scale", "orders", 9)["ok"]
    assert compose.calls[-1] == ["up", "-d", "--no-deps", "--scale", "orders=5", "orders"]   # capped at 5
    assert not lab_.service("stop", "kitchen")["ok"]
    assert not lab_.service("rm -rf", "orders")["ok"]


def test_logs_are_parsed_and_filtered_by_request_id():
    lab_ = lab.Lab(compose=FakeCompose(), gateway=FakeGateway())
    assert [r["service"] for r in lab_.logs(request_id="abc")] == ["gateway", "orders"]
    assert lab_.logs(service="not-a-service") == []


def test_summarize_rates_errors_and_p95():
    prev = lab.parse_metrics('shop_requests_total{service="m",method="GET",route="/x",status="200"} 10\n'
                             'shop_request_seconds_bucket{service="m",route="/x",le="0.1"} 10\n'
                             'shop_request_seconds_bucket{service="m",route="/x",le="1.0"} 10\n'
                             'shop_request_seconds_bucket{service="m",route="/x",le="+Inf"} 10\n')
    cur = lab.parse_metrics('shop_requests_total{service="m",method="GET",route="/x",status="200"} 28\n'
                            'shop_requests_total{service="m",method="GET",route="/x",status="500"} 2\n'
                            'shop_request_seconds_bucket{service="m",route="/x",le="0.1"} 20\n'
                            'shop_request_seconds_bucket{service="m",route="/x",le="1.0"} 30\n'
                            'shop_request_seconds_bucket{service="m",route="/x",le="+Inf"} 30\n')
    assert lab.summarize(prev, cur, 10) == {"rps": 2.0, "error_rate": 0.1, "p95_s": 1.0}


@pytest.mark.parametrize("mission_id", list(lab.MISSIONS))
def test_every_mission_has_the_seven_parts(mission_id):
    m = lab.Lab(compose=FakeCompose(), gateway=FakeGateway()).mission(mission_id)
    titles = [s["title"] for s in m["sections"]]
    assert titles == ["Why you're doing this", "The benefit, and the cost", "Break it", "Watch it",
                      "Fix it: the quick switch", "Fix it: in the code", "What interviewers ask"]
    assert m["title"] and m["topic"] and all(s["text"] for s in m["sections"])
    assert "break" in m["actions"]


def test_incident_rules():
    snap = {"up": True, "health": {"orders": "down", "menu": "up"},
            "customers": {"requests": 40, "failed": 8, "error_rate": 0.2, "p95_s": 4.0},
            "stock": {"oversold": [{"sku": "BAK-001", "name": "Honey cake", "stock": -3}]},
            "ledger": {"charged_more_than_once": [{"order_ref": "12", "times": 2, "amount_paise": 8000}]},
            "queue": {"backlog": 80, "dead": 2}, "orders": {"breaker": "open"}}
    rules = {h["rule"]: h for h in lab.Lab.incidents(snap)}
    assert set(rules) == {"down:orders", "customers:errors", "customers:slow", "oversold:BAK-001", "payments:doubled",
                          "queue:backlog", "queue:dead", "orders:breaker"}
    assert rules["oversold:BAK-001"]["mission"] == "race" and "Honey cake" in rules["oversold:BAK-001"]["title"]
    assert lab.Lab.incidents({"up": True, "customers": {"requests": 3, "error_rate": 1.0}}) == []   # too few to judge


def test_watch_opens_counts_and_resolves_incidents(monkeypatch):
    store = services.get_store()
    snaps = iter([
        {"up": True, "health": {}, "stock": {"oversold": [{"sku": "BAK-001", "name": "Honey cake", "stock": -2}]}},
        {"up": True, "health": {}, "stock": {"oversold": [{"sku": "BAK-001", "name": "Honey cake", "stock": -4}]}},
        {"up": True, "health": {}, "stock": {"oversold": []}},
    ])
    lab_ = lab.Lab(compose=FakeCompose(), gateway=FakeGateway())
    monkeypatch.setattr(lab_, "snapshot", lambda: next(snaps))
    lab_.watch_once(store)
    lab_.watch_once(store)
    open_ = store.list_lab_incidents()
    assert len(open_) == 1 and open_[0]["seen"] == 2 and "(-4 in stock)" in open_[0]["title"] and not open_[0]["resolved_at"]
    lab_.watch_once(store)
    assert store.list_lab_incidents()[0]["resolved_at"]


def test_mission_buttons_send_only_their_own_steps():
    gw = FakeGateway()
    compose = FakeCompose()
    out = lab.Lab(compose=compose, gateway=gw).act("race", "break")
    assert out["ok"]
    assert gw.calls[0] == ("POST", "/admin/knobs/menu", {"atomic_stock": False, "oven": False})
    assert gw.calls[1] == ("POST", "/admin/svc/menu/restock", {"sku": "BAK-001", "stock": 5})
    assert gw.calls[2] == ("POST", "/admin/svc/customers/burst", {"sku": "BAK-001", "n": 40})
    assert not lab.Lab(compose=compose, gateway=gw).act("race", "drop-database")["ok"]
    lab.Lab(compose=compose, gateway=gw).act("index", "fix")
    assert compose.calls[-1][-1] == lab.SQL_ALLOWED["create_index"]


def test_race_check_passes_only_when_stock_stays_at_or_above_zero():
    stock = {"value": -3}
    gw = FakeGateway({"/admin/svc/menu/stock": lambda b: (200, {"items": [{"sku": "BAK-001", "stock": stock["value"]}]})})
    lab_ = lab.Lab(compose=FakeCompose(), gateway=gw)
    assert not lab_.check("race")["ok"]
    stock["value"] = 0
    assert lab_.check("race")["ok"]


def test_find_the_slow_one():
    store = services.get_store()
    gw = FakeGateway()
    lab_ = lab.Lab(compose=FakeCompose(), gateway=gw, store=store)
    lab_.act("find-the-slow-one", "break")
    target = store.get_value("lab.mystery")
    assert ("POST", f"/admin/knobs/{target}", {"latency_ms": 1200}) in gw.calls and target in ("menu", "orders", "payments")
    assert not lab_.check("find-the-slow-one", "kitchen")["ok"]
    assert lab_.check("find-the-slow-one", target.upper())["ok"]


def test_lab_routes_are_hidden_unless_learn_is_on(monkeypatch):
    from fastapi.testclient import TestClient

    import main

    client = TestClient(main.app)
    monkeypatch.setattr(config, "LEARN_ENABLED", False)
    assert client.get("/api/lab/missions").status_code == 404
    monkeypatch.setattr(config, "LEARN_ENABLED", True)
    items = client.get("/api/lab/missions").json()["items"]
    assert [m["id"] for m in items][:3] == ["tour", "index", "race"]
    assert client.get("/api/lab/missions/race").json()["mission"]["topic"].startswith("Concurrency")
    assert client.post("/api/lab/service", json={"op": "explode", "name": "orders"}).status_code == 422
