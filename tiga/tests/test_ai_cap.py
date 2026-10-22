import pytest

import ai
import claude_cli
import config


def test_claude_calls_stop_at_the_daily_cap(monkeypatch):
    calls = []
    monkeypatch.setattr(claude_cli, "complete_meta", lambda s, u, model="": calls.append(1) or {"text": "ok", "input_tokens": 1, "output_tokens": 1, "cost_usd": 0, "duration_ms": 1, "model": model})
    monkeypatch.setattr(config, "AI_DAILY_CALLS", 2)
    assert ai.claude_complete("s", "u") == "ok"
    assert ai.claude_complete("s", "u") == "ok"
    with pytest.raises(RuntimeError, match="daily AI limit"):
        ai.claude_complete("s", "u")
    assert len(calls) == 2
    assert ai.usage_today() == {"used": 2, "cap": 2}


def test_a_failed_call_still_counts_so_retries_cannot_loop_forever(monkeypatch):
    def boom(s, u, model=""):
        raise RuntimeError("down")

    monkeypatch.setattr(claude_cli, "complete_meta", boom)
    monkeypatch.setattr(config, "AI_DAILY_CALLS", 1)
    with pytest.raises(RuntimeError, match="down"):
        ai.claude_complete("s", "u")
    with pytest.raises(RuntimeError, match="daily AI limit"):
        ai.claude_complete("s", "u")
