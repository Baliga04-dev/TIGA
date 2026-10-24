import pytest

from shoplab import common
from shoplab.resilience import CircuitBreaker, CircuitOpen, retry


class FakeRedis:
    def __init__(self):
        self.h = {}

    def hgetall(self, key):
        return dict(self.h.get(key, {}))

    def hset(self, key, mapping):
        self.h.setdefault(key, {}).update(mapping)

    def delete(self, key):
        self.h.pop(key, None)


def test_knobs_start_at_defaults_and_follow_redis():
    store = FakeRedis()
    knobs = common.Knobs("orders", store=store, ttl=0)
    assert knobs.get("retries") == 0 and knobs.get("idempotency") is False
    common.set_knobs("orders", {"retries": 3, "idempotency": True, "payment_timeout_s": "2.5"}, store=store)
    assert knobs.get("retries") == 3 and knobs.get("idempotency") is True and knobs.get("payment_timeout_s") == 2.5
    common.reset_knobs(store=store)
    assert knobs.get("retries") == 0


def test_unknown_knobs_and_services_are_refused():
    with pytest.raises(KeyError):
        common.set_knobs("orders", {"retry": 3}, store=FakeRedis())
    with pytest.raises(KeyError):
        common.set_knobs("kitchen", {"latency_ms": 1}, store=FakeRedis())


def test_knobs_survive_redis_going_away():
    class Down:
        def hgetall(self, key):
            raise ConnectionError("redis is down")

    knobs = common.Knobs("menu", store=Down(), ttl=0)
    assert knobs.get("cache") is False


def test_metrics_render_prometheus_text():
    m = common.Metrics("orders")
    m.observe("POST", "/orders", 201, 0.04)
    m.observe("POST", "/orders", 502, 3.0)
    m.gauge("shop_queue_backlog", 7)
    text = m.render()
    assert 'shop_requests_total{service="orders",method="POST",route="/orders",status="502"} 1' in text
    assert 'shop_request_seconds_bucket{service="orders",route="/orders",le="0.05"} 1' in text
    assert 'shop_request_seconds_count{service="orders",route="/orders"} 2' in text
    assert 'shop_queue_backlog{service="orders"} 7' in text


def test_retry_backs_off_then_gives_up():
    waits, calls = [], []

    def flaky():
        calls.append(1)
        if len(calls) < 3:
            raise TimeoutError("slow")
        return "paid"

    assert retry(flaky, attempts=3, base_delay=0.1, sleep=waits.append) == "paid"
    assert len(waits) == 2 and waits[1] > waits[0] * 1.6
    with pytest.raises(TimeoutError):
        retry(lambda: (_ for _ in ()).throw(TimeoutError("down")), attempts=2, sleep=lambda s: None)


def test_circuit_breaker_opens_fails_fast_and_recovers():
    now = [0.0]
    cb = CircuitBreaker(threshold=2, cooldown_s=10, clock=lambda: now[0])

    def boom():
        raise ConnectionError("payments down")

    for _ in range(2):
        with pytest.raises(ConnectionError):
            cb.call(boom)
    assert cb.state == "open"
    with pytest.raises(CircuitOpen):
        cb.call(lambda: "never called")
    now[0] = 11
    assert cb.state == "half-open"
    with pytest.raises(ConnectionError):
        cb.call(boom)                       # the trial call fails: open again
    assert cb.state == "open"
    now[0] = 25
    assert cb.call(lambda: "ok") == "ok" and cb.state == "closed"


def test_half_open_lets_exactly_one_trial_call_through():
    now = [0.0]
    cb = CircuitBreaker(threshold=1, cooldown_s=10, clock=lambda: now[0])
    with pytest.raises(ConnectionError):
        cb.call(lambda: (_ for _ in ()).throw(ConnectionError("down")))
    now[0] = 11
    seen = []

    def trial():
        # while the trial is in flight, a second caller must be refused at once
        with pytest.raises(CircuitOpen):
            cb.call(lambda: "second caller")
        seen.append("trial")
        return "ok"

    assert cb.call(trial) == "ok" and seen == ["trial"] and cb.state == "closed"
