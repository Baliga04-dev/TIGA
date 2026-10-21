import pytest

import config


@pytest.fixture
def workspace(tmp_path, monkeypatch):
    (tmp_path / "lessons").mkdir()
    (tmp_path / "lessons" / "01-tcp.html").write_text("<html><title>TCP basics</title><body>hi</body></html>")
    (tmp_path / "lessons" / "02-dns.html").write_text("<html><body>no title</body></html>")
    (tmp_path / "MISSION.md").write_text("# Interview ready\n")
    monkeypatch.setattr(config, "LEARN_DIR", str(tmp_path))
    return tmp_path


def test_learn_is_hidden_by_default(client, workspace):
    assert client.get("/api/learn/lessons").status_code == 404
    assert client.get("/api/features").json() == {"learn": False}


def test_enabled_flag_exposes_lessons(client, workspace, monkeypatch):
    monkeypatch.setattr(config, "LEARN_ENABLED", True)
    assert client.get("/api/features").json() == {"learn": True}
    lessons = client.get("/api/learn/lessons").json()["lessons"]
    assert [(l["name"], l["title"]) for l in lessons] == [("01-tcp", "TCP basics"), ("02-dns", "02-dns")]


def test_lesson_is_served_as_html_and_mission_as_text(client, workspace, monkeypatch):
    monkeypatch.setattr(config, "LEARN_ENABLED", True)
    page = client.get("/api/learn/lessons/01-tcp")
    assert page.status_code == 200 and "text/html" in page.headers["content-type"]
    assert "Content-Security-Policy" in page.headers  # lessons are single-file HTML: sandbox them
    assert client.get("/api/learn/mission").json()["text"].startswith("# Interview ready")


@pytest.mark.parametrize("name", ["..%2Fsecret", "..", "a%2Fb", "nope"])
def test_lesson_names_cannot_escape_the_workspace(client, workspace, monkeypatch, name):
    monkeypatch.setattr(config, "LEARN_ENABLED", True)
    assert client.get(f"/api/learn/lessons/{name}").status_code in (404, 422)
