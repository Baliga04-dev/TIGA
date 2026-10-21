import subprocess

import pytest

import desktop
import tools

# conftest fakes desktop.open_url for every test; these tests exercise the real one, captured at import.
open_url = desktop.open_url


class Recorder:
    def __init__(self, code=0):
        self.calls, self.code = [], code

    def __call__(self, args, **kw):
        self.calls.append((args, kw))
        return subprocess.CompletedProcess(args, self.code, "", "")


def test_in_wsl_urls_open_in_the_windows_browser_with_ampersands_escaped():
    run = Recorder()
    assert open_url("https://www.youtube.com/watch?v=abc&t=10", run=run, wsl=True)
    args, kw = run.calls[0]
    assert args[:4] == ["cmd.exe", "/c", "start", '""']
    assert args[4] == "https://www.youtube.com/watch?v=abc^&t=10"
    assert kw["cwd"] == "/mnt/c"  # avoids cmd's UNC-path warning


def test_outside_wsl_the_normal_browser_is_used(monkeypatch):
    opened = []
    monkeypatch.setattr(desktop.webbrowser, "open", lambda url, new=0: opened.append(url) or True)
    assert open_url("https://example.com", wsl=False)
    assert opened == ["https://example.com"]


def test_a_failing_launch_reports_false():
    assert open_url("https://example.com", run=Recorder(code=1), wsl=True) is False


@pytest.mark.parametrize("bad", ["javascript:alert(1)", "file:///etc/passwd", "https://x.com/a b", 'https://x.com/"&calc'])
def test_only_clean_web_urls_are_ever_handed_to_the_shell(bad):
    run = Recorder()
    assert open_url(bad, run=run, wsl=True) is False and run.calls == []


async def test_play_youtube_resolves_a_video_and_opens_its_watch_page(monkeypatch):
    opened = []
    monkeypatch.setattr(tools.desktop, "open_url", lambda url: opened.append(url) or True)
    monkeypatch.setattr(tools, "_youtube_search", lambda q: {"id": "jfKfPfyJRdk", "title": "lofi hip hop radio"})
    out = await tools.play_youtube("lo-fi music")
    assert out["ok"] and out["title"] == "lofi hip hop radio"
    assert opened == ["https://www.youtube.com/watch?v=jfKfPfyJRdk"]


async def test_play_youtube_falls_back_to_search_results_when_it_cannot_resolve(monkeypatch):
    opened = []
    monkeypatch.setattr(tools.desktop, "open_url", lambda url: opened.append(url) or True)
    monkeypatch.setattr(tools, "_youtube_search", lambda q: None)
    out = await tools.play_youtube("lo-fi music & rain")
    assert out["ok"] and out["fallback"]
    assert opened == ["https://www.youtube.com/results?search_query=lo-fi+music+%26+rain"]


async def test_open_tab_now_uses_the_desktop_opener(monkeypatch):
    opened = []
    monkeypatch.setattr(tools.desktop, "open_url", lambda url: opened.append(url) or True)
    assert (await tools.open_tab("youtube.com"))["ok"]
    assert opened == ["https://youtube.com"]


def test_builtin_router_understands_play_requests():
    import brain
    assert brain.RE_PLAY.search("open youtube and play lo-fi music")
    assert brain._play_query("open youtube and play lo-fi music") == "lo-fi music"
    assert brain._play_query("play arijit singh songs on youtube") == "arijit singh songs"
