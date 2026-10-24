"""Sends the "order confirmed" WhatsApp message (pretend: it waits `send_ms`, the way the real API is slow).

Two ways in: POST /notify, which makes the caller wait for the send, and the `notifications` Redis stream,
which a worker thread here drains in the background (consumer group `notifier`). A message that fails three
times goes to `notifications:dead`, the dead-letter queue, instead of blocking the line. `poison_rate` makes
some messages fail every time, which is how a dead-letter queue earns its keep.
"""
from __future__ import annotations

import os
import random
import socket
import threading
import time

from fastapi import FastAPI
from pydantic import BaseModel

from .common import instrument, log, redis_client, wait_for

app = FastAPI(title="notifier")
knobs, metrics = instrument(app, "notifier")
STREAM, GROUP, DEAD = "notifications", "notifier", "notifications:dead"
CONSUMER = f"{socket.gethostname()}-{os.getpid()}"
MAX_TRIES = 3


class Message(BaseModel):
    order_id: int
    customer: str
    text: str


def send(msg: dict) -> None:
    time.sleep(knobs.get("send_ms") / 1000)
    if random.random() < knobs.get("poison_rate"):
        raise ValueError("WhatsApp rejected the message: the number is not on WhatsApp")
    log("whatsapp.sent", order_id=msg.get("order_id"), customer=msg.get("customer"))


@app.get("/health")
def health():
    redis_client().ping()
    return {"ok": True}


@app.post("/notify")
def notify(body: Message):
    send(body.model_dump())
    return {"ok": True}


def worker() -> None:
    import redis

    from .common import REDIS_URL

    # its own connection: a blocking read waits up to 2 s, longer than the shared client's 2 s socket limit
    r = redis.Redis.from_url(REDIS_URL, decode_responses=True, socket_timeout=15, socket_connect_timeout=2)
    wait_for(r.ping, "redis")
    try:
        r.xgroup_create(STREAM, GROUP, id="0", mkstream=True)
    except Exception:
        pass   # the group already exists
    while True:
        try:
            # first anything this consumer was given but never finished, then new messages
            got = r.xautoclaim(STREAM, GROUP, CONSUMER, min_idle_time=15_000, count=5)
            batch = [(STREAM, got[1])] if got and got[1] else r.xreadgroup(GROUP, CONSUMER, {STREAM: ">"}, count=5, block=2000)
            for _, entries in batch or []:
                for msg_id, fields in entries:
                    try:
                        send(fields)
                        r.xack(STREAM, GROUP, msg_id)
                    except Exception as exc:
                        tries = r.hincrby("notifications:tries", msg_id, 1)
                        log("whatsapp.failed", order_id=fields.get("order_id"), tries=tries, error=str(exc))
                        if tries >= MAX_TRIES:
                            r.xadd(DEAD, {**fields, "error": str(exc)}, maxlen=10_000)
                            r.xack(STREAM, GROUP, msg_id)
                            r.hdel("notifications:tries", msg_id)
            metrics.gauge("shop_queue_backlog", queue_info()["backlog"])
        except Exception as exc:
            log("worker.error", error=f"{type(exc).__name__}: {exc}")
            time.sleep(1)


def queue_info() -> dict:
    r = redis_client()
    try:
        groups = {g["name"]: g for g in r.xinfo_groups(STREAM)}
        g = groups.get(GROUP, {})
        backlog = int(g.get("lag") or 0) + int(g.get("pending") or 0)
        return {"length": r.xlen(STREAM), "backlog": backlog, "pending": int(g.get("pending") or 0),
                "dead": r.xlen(DEAD), "consumers": int(g.get("consumers") or 0)}
    except Exception:
        return {"length": 0, "backlog": 0, "pending": 0, "dead": 0, "consumers": 0}


@app.on_event("startup")
def _startup() -> None:
    threading.Thread(target=worker, daemon=True, name="notifier-worker").start()


@app.get("/admin/queue")
def queue():
    return queue_info()
