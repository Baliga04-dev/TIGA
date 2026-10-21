import json
import subprocess

import pytest

import claude_cli


class FakeRun:
    def __init__(self, result="hi", is_error=False, code=0, stdout=None):
        self.calls = []
        self.out = stdout if stdout is not None else json.dumps({"type": "result", "is_error": is_error, "result": result})
        self.code = code

    def __call__(self, args, **kw):
        self.calls.append((args, kw))
        return subprocess.CompletedProcess(args, self.code, stdout=self.out, stderr="boom" if self.code else "")


def test_runs_the_real_claude_binary_on_the_subscription_with_no_tools(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-should-never-reach-claude")
    run = FakeRun(result='{"reply": "ok"}')
    out = claude_cli.complete("be brief", "hello there", model="sonnet", run=run)
    assert out == '{"reply": "ok"}'
    args, kw = run.calls[0]
    assert args[0] == "claude" and "-p" in args and "--bare" not in args
    assert args[args.index("--tools") + 1] == "" and "--strict-mcp-config" in args
    assert args[args.index("--output-format") + 1] == "json"
    assert args[args.index("--system-prompt") + 1] == "be brief"
    assert kw["input"] == "hello there"  # the prompt goes through stdin, never argv
    assert "ANTHROPIC_API_KEY" not in kw["env"]  # a key would silently switch billing to the paid API


def test_errors_are_raised_as_runtime_errors():
    with pytest.raises(RuntimeError, match="usage limit"):
        claude_cli.complete("s", "u", run=FakeRun(result="usage limit reached", is_error=True))
    with pytest.raises(RuntimeError):
        claude_cli.complete("s", "u", run=FakeRun(code=1, stdout=""))
    with pytest.raises(RuntimeError):
        claude_cli.complete("s", "u", run=FakeRun(stdout="not json"))


def test_timeout_becomes_a_runtime_error():
    def slow(args, **kw):
        raise subprocess.TimeoutExpired(args, 1)

    with pytest.raises(RuntimeError, match="timed out"):
        claude_cli.complete("s", "u", run=slow)
