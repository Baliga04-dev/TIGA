"""Retries with backoff and a circuit breaker: the two patterns the payments missions are about.

Both are written out in full here rather than taken from a library, because the point of the lab is to
read them. `retry(call, attempts, base_delay)` runs `call` until it succeeds or the attempts run out,
waiting base_delay, 2x, 4x... (plus jitter) between tries. `CircuitBreaker` stops calling a service that
keeps failing: after `threshold` failures in a row it opens and fails fast for `cooldown_s`, then lets one
trial call through (half-open); success closes it again.
"""
from __future__ import annotations

import random
import threading
import time
from typing import Callable, TypeVar

T = TypeVar("T")


def retry(call: Callable[[], T], attempts: int, base_delay: float = 0.1, *,
          sleep: Callable[[float], None] = time.sleep, retry_on: tuple[type[Exception], ...] = (Exception,)) -> T:
    if attempts < 1:
        raise ValueError("attempts must be at least 1")
    for n in range(attempts):
        try:
            return call()
        except retry_on:
            if n == attempts - 1:
                raise
            sleep(base_delay * (2 ** n) * (1 + random.random() * 0.2))   # backoff with a little jitter
    raise AssertionError("unreachable")


class CircuitOpen(Exception):
    """The breaker is open: the call was not even attempted."""


class CircuitBreaker:
    def __init__(self, threshold: int = 5, cooldown_s: float = 10.0, clock: Callable[[], float] = time.monotonic):
        self.threshold, self.cooldown_s, self.clock = threshold, cooldown_s, clock
        self.failures = 0
        self.opened_at: float | None = None
        self.trial = False          # true while the one half-open trial call is in flight
        self._lock = threading.Lock()

    @property
    def state(self) -> str:
        if self.opened_at is None:
            return "closed"
        return "half-open" if self.clock() - self.opened_at >= self.cooldown_s else "open"

    def call(self, fn: Callable[[], T]) -> T:
        with self._lock:
            state = self.state
            # open: refuse. half-open: exactly one caller gets to try; everyone else is refused until it answers
            if state == "open" or (state == "half-open" and self.trial):
                raise CircuitOpen("payments are failing; not calling them for a few seconds")
            if state == "half-open":
                self.trial = True
        try:
            result = fn()
        except Exception:
            with self._lock:
                self.trial = False
                self.failures += 1
                if self.failures >= self.threshold or self.opened_at is not None:
                    self.opened_at = self.clock()   # open, or re-open after a failed trial call
            raise
        with self._lock:
            self.failures, self.opened_at, self.trial = 0, None, False
        return result
