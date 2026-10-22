import json
import subprocess

import pytest

import ai
import claude_cli
import config
import services

real_complete_meta = claude_cli.complete_meta  # captured before conftest's guard replaces it


def fake_meta(text="ok", **kw):
    return lambda system, user, model="": {"text": text, "input_tokens": 900, "output_tokens": 40,
                                           "cost_usd": 0.0021, "duration_ms": 1500, "model": model or "sonnet", **kw}


def test_cli_reports_tokens_cost_and_time():
    out = json.dumps({"type": "result", "is_error": False, "result": "hi", "total_cost_usd": 0.0018, "duration_ms": 1200,
                      "usage": {"input_tokens": 2, "cache_creation_input_tokens": 887, "cache_read_input_tokens": 10,
                                "output_tokens": 4}})
    run = lambda args, **kw: subprocess.CompletedProcess(args, 0, stdout=out, stderr="")
    meta = real_complete_meta("s", "u", model="haiku", run=run)
    assert meta == {"text": "hi", "input_tokens": 899, "output_tokens": 4, "cost_usd": 0.0018,
                    "duration_ms": 1200, "model": "haiku"}


def test_every_call_is_logged_with_its_agent_prompt_and_reply(monkeypatch):
    monkeypatch.setattr(claude_cli, "complete_meta", fake_meta("Hello Ravi"))
    with ai.using("email writer"):
        assert ai.claude_complete("Write emails.", "Lead: Sri Bakery") == "Hello Ravi"
    call = services.get_store().list_ai_calls()[0]
    assert (call["feature"], call["system"], call["prompt"], call["reply"]) == ("email writer", "Write emails.", "Lead: Sri Bakery", "Hello Ravi")
    assert call["input_tokens"] == 900 and call["output_tokens"] == 40 and call["ok"] == 1


def test_failures_are_logged_too(monkeypatch):
    def boom(system, user, model=""):
        raise RuntimeError("usage limit reached")

    monkeypatch.setattr(claude_cli, "complete_meta", boom)
    with pytest.raises(RuntimeError):
        ai.claude_complete("s", "u")
    call = services.get_store().list_ai_calls()[0]
    assert call["ok"] == 0 and "usage limit" in call["error"] and call["feature"] == "other"


def test_usage_report_by_agent_and_day(client, monkeypatch):
    monkeypatch.setattr(claude_cli, "complete_meta", fake_meta())
    for feature in ("chat", "chat", "email writer"):
        with ai.using(feature):
            ai.claude_complete("s", "u")
    report = client.get("/api/ai/usage").json()
    assert report["today"]["calls"] == 3 and report["today"]["cap"] == config.AI_DAILY_CALLS
    by = {f["feature"]: f for f in report["by_feature"]}
    assert by["chat"]["calls"] == 2 and by["chat"]["input_tokens"] == 1800 and by["email writer"]["calls"] == 1
    assert report["by_day"][0]["calls"] == 3
    calls = client.get("/api/ai/calls", params={"feature": "email writer"}).json()["items"]
    assert len(calls) == 1 and calls[0]["prompt"] == "u"


def test_chat_turns_are_kept_as_history(client):
    client.post("/api/chat", json={"text": "what time is it"})
    history = client.get("/api/chat/history").json()["items"]
    assert history[0]["user_text"] == "what time is it" and history[0]["reply"] and history[0]["mode"] == "builtin"


def test_claude_chat_and_drafts_are_labelled_by_agent(client, monkeypatch):
    monkeypatch.setattr(config, "AI_PROVIDER", "claude")
    monkeypatch.setattr(claude_cli, "complete_meta", fake_meta('{"reply": "Hi."}'))
    client.post("/api/chat", json={"text": "hello"})
    monkeypatch.setattr(claude_cli, "complete_meta", fake_meta('{"subject": "A quick idea", "body": "' + "word " * 60 + '"}'))
    services.write_draft({"company": "Sri Bakery", "problems": ["no_https"]})
    assert [c["feature"] for c in services.get_store().list_ai_calls()] == ["email writer", "chat"]
