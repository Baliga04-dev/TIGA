"""The executor is the only way an assistant tool runs: tiers, taint, confirmation, pause, audit."""
from datetime import datetime, timedelta, timezone

import pytest

import executor
import services
from executor import Turn


@pytest.fixture
def calls(monkeypatch):
    seen = []

    async def fake_tool(name, args):
        seen.append((name, args))
        return {"tool": name, "args": args, "result": {"ok": True}, "ok": True, "ms": 0}

    monkeypatch.setattr(executor, "run_tool", fake_tool)
    return seen


async def test_reads_and_local_actions_run_straight_away(calls):
    turn = Turn()
    assert (await executor.execute("get_metrics", {}, turn))["ok"]
    assert (await executor.execute("open_tab", {"url": "https://x.io"}, turn))["ok"]
    assert [c[0] for c in calls] == ["get_metrics", "open_tab"]


async def test_outbound_actions_wait_for_a_click_and_run_once_confirmed(calls):
    action = await executor.execute("book_call", {"name": "Jo"}, Turn())
    assert action["status"] == "needs_confirmation" and action["ok"] is False and calls == []
    assert "book_call" in action["summary"] or "call" in action["summary"].lower()
    done = await executor.confirm(action["pending_id"])
    assert done["ok"] and calls == [("book_call", {"name": "Jo"})]


async def test_a_confirmation_works_only_once(calls):
    action = await executor.execute("book_call", {}, Turn())
    await executor.confirm(action["pending_id"])
    with pytest.raises(executor.ConfirmationError):
        await executor.confirm(action["pending_id"])
    assert len(calls) == 1


async def test_cancelled_and_expired_confirmations_never_run(calls, monkeypatch):
    a = await executor.execute("book_call", {}, Turn())
    executor.cancel(a["pending_id"])
    with pytest.raises(executor.ConfirmationError):
        await executor.confirm(a["pending_id"])
    b = await executor.execute("book_call", {}, Turn())
    later = datetime.now(timezone.utc) + timedelta(minutes=11)
    monkeypatch.setattr(executor, "_now", lambda: later)
    with pytest.raises(executor.ConfirmationError, match="expired"):
        await executor.confirm(b["pending_id"])
    assert calls == []


async def test_after_reading_untrusted_content_even_local_actions_need_a_click(calls):
    turn = Turn()
    await executor.execute("fetch_recent_emails", {}, turn)
    action = await executor.execute("open_tab", {"url": "https://evil.example"}, turn)
    assert action["status"] == "needs_confirmation"
    assert [c[0] for c in calls] == ["fetch_recent_emails"]
    # a fresh turn is clean again
    assert (await executor.execute("open_tab", {"url": "https://ok.example"}, Turn()))["ok"]


async def test_forbidden_and_unknown_tools_never_run(calls, monkeypatch):
    monkeypatch.setitem(executor.TIERS, "pay_invoice", executor.FORBIDDEN)
    assert (await executor.execute("pay_invoice", {}, Turn()))["ok"] is False
    assert (await executor.execute("rm_rf", {}, Turn()))["ok"] is False
    assert calls == []


async def test_pause_stops_everything_until_resumed(calls):
    executor.set_paused(True)
    action = await executor.execute("open_tab", {"url": "https://x.io"}, Turn())
    assert action["ok"] is False and "paused" in action["result"]["error"]
    executor.set_paused(False)
    assert (await executor.execute("open_tab", {"url": "https://x.io"}, Turn()))["ok"]


async def test_every_call_is_audited_including_refusals(calls):
    await executor.execute("get_metrics", {}, Turn())
    await executor.execute("book_call", {}, Turn())
    actions = [e["action"] for e in services.get_store().audit_log()]
    assert "tool.run" in actions and "tool.pending" in actions


def test_chat_stop_pauses_and_resume_restores(client):
    assert "Stopped" in client.post("/api/chat", json={"text": "Tiga stop"}).json()["reply"]
    assert client.get("/api/assistant").json()["paused"] is True
    body = client.post("/api/chat", json={"text": "open youtube.com"}).json()
    assert body["actions"][0]["ok"] is False and "paused" in body["actions"][0]["result"]["error"]
    client.post("/api/chat", json={"text": "resume"})
    assert client.get("/api/assistant").json()["paused"] is False


def test_confirm_and_cancel_routes(client):
    body = client.post("/api/chat", json={"text": "book a call about pricing"}).json()
    pid = body["actions"][0]["pending_id"]
    assert client.post(f"/api/actions/{pid}/cancel").json() == {"ok": True}
    out = client.post(f"/api/actions/{pid}/confirm").json()
    assert out["ok"] is False and "already handled" in out["error"]
