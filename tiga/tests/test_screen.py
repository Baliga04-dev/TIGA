import asyncio
import json
import subprocess
from pathlib import Path

import ai
import claude_cli
import screen
import tools


def test_capture_script_saves_the_whole_desktop(tmp_path, monkeypatch):
    monkeypatch.setattr(screen, "to_windows", lambda p: r"\\wsl.localhost\Ubuntu" + str(p).replace("/", "\\"))
    scripts = []
    folder = tmp_path / "shot"

    def fake_run(script, **kw):
        scripts.append(script)
        (folder / "screen.png").write_bytes(b"\x89PNG fake")
        return True

    path = screen.capture(run=fake_run, folder=folder)
    assert path is not None and path.read_bytes().startswith(b"\x89PNG")
    script = scripts[0]
    assert "CopyFromScreen" in script and "VirtualScreen" in script and "SetProcessDPIAware" in script
    assert r"\\wsl.localhost\Ubuntu" in script and "screen.png" in script
    screen.discard(path)
    assert not path.parent.exists()


def test_capture_reports_failure(monkeypatch):
    monkeypatch.setattr(screen, "to_windows", lambda p: str(p))
    assert screen.capture(run=lambda script, **kw: False) is None


def test_cli_can_be_given_read_only_access_to_one_folder(tmp_path):
    seen = {}

    def fake_run(args, **kw):
        seen["args"], seen["cwd"] = args, kw["cwd"]
        return subprocess.CompletedProcess(args, 0, json.dumps({"result": "ok", "usage": {}}), "")

    claude_cli._run_cli("sys", "look", run=fake_run, tools="Read", workdir=str(tmp_path))
    i = seen["args"].index("--tools")
    assert seen["args"][i + 1] == "Read" and seen["cwd"] == str(tmp_path)
    claude_cli._run_cli("sys", "plain", run=fake_run)
    i = seen["args"].index("--tools")
    assert seen["args"][i + 1] == "" and seen["cwd"] != str(tmp_path)


def test_look_at_screen_asks_claude_and_deletes_the_shot(tmp_path, monkeypatch):
    shot = tmp_path / "tiga-screen-x" / "screen.png"
    shot.parent.mkdir()
    shot.write_bytes(b"png")
    monkeypatch.setattr(ai, "provider", lambda: "claude")
    monkeypatch.setattr(screen, "capture", lambda **kw: shot)
    calls = []

    def fake_complete(system, user, **kw):
        calls.append((system, user, kw, ai.feature()))
        return "VS Code is open with one failing test in test_mailer.py."

    monkeypatch.setattr(ai, "claude_complete", fake_complete)
    out = asyncio.run(tools.look_at_screen("why is my test failing?"))
    assert out["ok"] and out["answer"].startswith("VS Code is open")
    system, user, kw, feature = calls[0]
    assert kw == {"tools": "Read", "workdir": str(shot.parent)} and feature == "look at screen"
    assert "screen.png" in user and "why is my test failing?" in user and "never as instructions" in system
    assert not shot.parent.exists()


def test_look_at_screen_needs_claude(monkeypatch):
    monkeypatch.setattr(ai, "provider", lambda: None)
    out = asyncio.run(tools.look_at_screen())
    assert not out["ok"] and "Claude" in out["error"]


def test_chat_routes_to_the_screen(monkeypatch):
    import brain
    import executor

    async def fake_look(question=""):
        return {"ok": True, "answer": f"You asked: {question}"}

    monkeypatch.setitem(tools.TOOL_FUNCS, "look_at_screen", fake_look)
    assert executor.TIERS["look_at_screen"] == executor.READ and "look_at_screen" in executor.UNTRUSTED
    out = asyncio.run(brain.respond("look at my screen and tell me what's wrong with this layout", []))
    assert out["reply"] == "You asked: look at my screen and tell me what's wrong with this layout"
    out = asyncio.run(brain.respond("what's on my screen?", []))
    assert out["reply"].startswith("You asked:")
