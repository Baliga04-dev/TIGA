import subprocess

import pc
import tools

# conftest replaces pc.run_powershell for every test; these exercise the real script builders and runner.
run_powershell = pc.run_powershell


class Recorder:
    def __init__(self, code=0):
        self.calls, self.code = [], code

    def __call__(self, args, **kw):
        self.calls.append((args, kw))
        return subprocess.CompletedProcess(args, self.code, "", "")


def test_key_scripts_press_only_known_virtual_keys():
    script = pc.key_script(["volume_up"] * 3)
    assert "@(175,175,175)" in script and "keybd_event" in script


def test_set_volume_goes_to_zero_then_up_in_two_percent_steps():
    script = pc.volume_script("set", 30)
    assert "@(" + ",".join(["174"] * 50 + ["175"] * 15) + ")" in script


def test_volume_rejects_nonsense():
    for bad in [("set", 150), ("set", -1), ("louder", 0)]:
        try:
            pc.volume_script(*bad)
        except ValueError:
            continue
        raise AssertionError(f"{bad} should be rejected")


def test_apps_come_only_from_the_allowlist():
    assert pc.app_command("VS Code") == "code"
    assert pc.app_command("spotify") == "spotify:"
    assert pc.app_command("calc.exe; rm -rf /") is None


def test_runner_uses_windows_powershell_from_a_windows_folder():
    rec = Recorder()
    assert run_powershell("Write-Output 1", run=rec)
    args, kw = rec.calls[0]
    assert args[:3] == ["powershell.exe", "-NoProfile", "-NonInteractive"] and kw["cwd"] == "/mnt/c"


async def test_tools_build_the_right_script(ran):
    assert (await tools.media("next"))["ok"]
    assert (await tools.volume("mute"))["ok"]
    assert (await tools.open_app("notepad"))["ok"]
    assert "176" in ran[0] and "173" in ran[1] and "Start-Process 'notepad'" in ran[2]
    assert (await tools.open_app("hacker tool"))["ok"] is False and len(ran) == 3


def test_chat_controls_the_pc(client, ran):
    for text, needle in [("volume up", "175"), ("mute", "173"), ("pause the music", "179"),
                         ("next song", "176"), ("set volume to 40", "@(174"), ("open spotify", "spotify:")]:
        body = client.post("/api/chat", json={"text": text}).json()
        assert body["actions"] and body["actions"][0]["ok"], text
        assert needle in ran[-1], text


def test_lock_screen_needs_a_click(client, ran):
    body = client.post("/api/chat", json={"text": "lock my screen"}).json()
    assert body["actions"][0]["status"] == "needs_confirmation" and ran == []
