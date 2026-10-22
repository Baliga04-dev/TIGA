import asyncio
from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

import executor
import routines
import services

IST = ZoneInfo("Asia/Kolkata")
MON_8 = datetime(2026, 10, 19, 8, 0, tzinfo=IST)  # a Monday


@pytest.mark.parametrize("text,days,hour,minute", [
    ("every day at 9am", [0, 1, 2, 3, 4, 5, 6], 9, 0),
    ("every weekday at 6:30pm", [0, 1, 2, 3, 4], 18, 30),
    ("every monday at 10", [0], 10, 0),
    ("every mon and thu 9am", [0, 3], 9, 0),
    ("every morning", [0, 1, 2, 3, 4, 5, 6], 9, 0),
    ("every evening", [0, 1, 2, 3, 4, 5, 6], 18, 0),
    ("every weekend at 11am", [5, 6], 11, 0),
])
def test_parse_rule_days(text, days, hour, minute):
    rule = routines.parse_rule(text)
    assert rule == {"days": days, "hour": hour, "minute": minute}


def test_parse_rule_interval_and_floor():
    assert routines.parse_rule("every 2 hours") == {"every_minutes": 120}
    assert routines.parse_rule("every hour") == {"every_minutes": 60}
    assert routines.parse_rule("every 5 minutes") == {"every_minutes": routines.MIN_INTERVAL}
    assert routines.parse_rule("sometimes") is None
    assert routines.parse_rule("every blursday") is None


def test_next_after():
    assert routines.next_after({"days": [0], "hour": 9, "minute": 0}, MON_8) == MON_8.replace(hour=9)
    assert routines.next_after({"days": [0], "hour": 7, "minute": 0}, MON_8) == datetime(2026, 10, 26, 7, 0, tzinfo=IST)
    assert routines.next_after({"days": [3], "hour": 9, "minute": 0}, MON_8) == datetime(2026, 10, 22, 9, 0, tzinfo=IST)
    assert routines.next_after({"every_minutes": 120}, MON_8) == MON_8.replace(hour=10)


def test_describe():
    assert routines.describe({"days": [0, 3], "hour": 18, "minute": 30}) == "every Monday and Thursday at 6:30 pm"
    assert routines.describe({"days": [0, 1, 2, 3, 4, 5, 6], "hour": 9, "minute": 0}) == "every day at 9 am"
    assert routines.describe({"every_minutes": 90}) == "every 90 minutes"


@pytest.mark.parametrize("text,rule,command", [
    ("every monday at 9am, check who is waiting on me", "every monday at 9am", "check who is waiting on me"),
    ("every monday at 9am check who is waiting on me", "every monday at 9am", "check who is waiting on me"),
    ("every weekday 6pm play lofi", "every weekday 6pm", "play lofi"),
    ("every 2 hours take a note stretch", "every 2 hours", "take a note stretch"),
])
def test_split(text, rule, command):
    assert routines.split(text) == (rule, command)


def test_split_rejects_non_routines():
    assert routines.split("play lofi every day") is None
    assert routines.split("every day") is None  # nothing to do


def _routines():
    return routines.Routines(services.get_store())


def test_add_list_pause_delete():
    r = _routines()
    made = r.add("check who is waiting on me", "every monday at 9am", MON_8)
    assert made["ok"] and made["routine"]["next_at"] == MON_8.replace(hour=9).isoformat()
    assert made["routine"]["when"] == "every Monday at 9 am"
    assert not r.add("x", "whenever", MON_8)["ok"]
    rid = made["routine"]["id"]
    assert r.set_active(rid, False)
    assert r.list()[0]["active"] == 0
    assert r.delete(rid) and r.list() == []


def test_run_due_runs_advances_and_logs():
    r = _routines()
    rid = r.add("check who is waiting on me", "every day at 9am", MON_8)["routine"]["id"]
    seen = []

    async def respond(text):
        seen.append(text)
        return {"reply": "Two people are waiting.", "actions": []}

    assert asyncio.run(r.run_due(MON_8, respond)) == []          # not due yet
    ran = asyncio.run(r.run_due(MON_8.replace(hour=9, minute=1), respond))
    assert seen == ["check who is waiting on me"] and ran[0]["reply"] == "Two people are waiting."
    row = r.list()[0]
    assert row["runs"] == 1 and row["last_result"] == "Two people are waiting."
    assert row["next_at"] == datetime(2026, 10, 20, 9, 0, tzinfo=IST).isoformat()
    log = services.get_store().list_chats(limit=5)
    assert log[0]["mode"] == "routine" and log[0]["user_text"] == "check who is waiting on me"


def test_run_due_never_leaves_actions_waiting(monkeypatch):
    r = _routines()
    r.add("close all my tabs", "every day at 9am", MON_8)
    cancelled = []
    monkeypatch.setattr(executor, "cancel", lambda pid: cancelled.append(pid) or True)

    async def respond(text):
        return {"reply": "Close 5 tabs?", "actions": [{"status": "needs_confirmation", "pending_id": "p1", "summary": "close 5 tabs"}]}

    ran = asyncio.run(r.run_due(MON_8.replace(hour=9, minute=1), respond))
    assert cancelled == ["p1"]
    assert "needs you" in ran[0]["reply"]


def test_run_due_skips_when_paused_and_respects_cap(monkeypatch):
    r = _routines()
    for i in range(3):
        r.add(f"task {i}", "every 30 minutes", MON_8)
    calls = []

    async def respond(text):
        calls.append(text)
        return {"reply": "ok", "actions": []}

    monkeypatch.setattr(executor, "is_paused", lambda: True)
    assert asyncio.run(r.run_due(MON_8.replace(hour=9), respond)) == [] and calls == []
    monkeypatch.setattr(executor, "is_paused", lambda: False)
    monkeypatch.setattr(routines, "DAILY_RUNS", 2)
    asyncio.run(r.run_due(MON_8.replace(hour=9), respond))
    assert len(calls) == 2


def test_recurring_reminder_needs_no_model():
    r = _routines()
    r.add("remind me to pay the shop rent", "every monday at 9am", MON_8)

    async def respond(text):
        raise AssertionError("a reminder routine should not go through the assistant")

    asyncio.run(r.run_due(MON_8.replace(hour=9), respond))
    items = services.get_store().list_reminders("pending")
    assert [i["text"] for i in items] == ["pay the shop rent"]


def test_chat_sets_up_a_routine():
    import brain

    out = asyncio.run(brain.respond("every Monday at 9am, check who is waiting on me", []))
    assert out["reply"].startswith("Done. Every Monday at 9 am, I'll check who is waiting on me.")
    row = _routines().list()[0]
    assert row["command"] == "check who is waiting on me" and row["rule"] == {"days": [0], "hour": 9, "minute": 0}


@pytest.mark.parametrize("text", ["remind me every weekday at 10am to drink water",
                                  "Tiga, remind me to drink water every weekday at 10am"])
def test_chat_recurring_reminder(text):
    import brain

    out = asyncio.run(brain.respond(text, []))
    assert out["reply"].startswith("Done. Every weekday at 10 am")
    assert _routines().list()[0]["command"] == "remind me to drink water"


def test_one_off_reminder_still_works():
    import brain

    out = asyncio.run(brain.respond("remind me at 5 to call Ravi", []))
    assert out["reply"].startswith("Okay, I'll remind you") and _routines().list() == []


def test_routines_api():
    from fastapi.testclient import TestClient

    import main

    client = TestClient(main.app)
    bad = client.post("/api/routines", json={"command": "check mail", "when": "now and then"}).json()
    assert not bad["ok"] and "every Monday at 9am" in bad["error"]
    made = client.post("/api/routines", json={"command": "who is waiting", "when": "every day at 6pm"}).json()
    rid = made["routine"]["id"]
    assert made["ok"] and made["routine"]["when"] == "every day at 6 pm"
    assert client.post(f"/api/routines/{rid}", json={"active": False}).json()["ok"]
    assert client.get("/api/routines").json()["items"][0]["active"] == 0
    assert client.post(f"/api/routines/{rid}", json={"active": True}).json()["ok"]
    assert client.delete(f"/api/routines/{rid}").json()["ok"]
    assert client.get("/api/routines").json()["items"] == []
