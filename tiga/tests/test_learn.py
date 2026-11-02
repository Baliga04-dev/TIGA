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


@pytest.fixture
def notes(workspace):
    folder = workspace / "notes" / "finance-app"
    folder.mkdir(parents=True)
    (folder / "0001-expo.md").write_text(
        "---\ntitle: Expo\nkind: tool\ndate: 2026-11-02\nsummary: React Native without a Mac\n---\n"
        "## What it is\nA framework.\n\n## What interviewers ask\n**Q: Why Expo?**\nNo Mac needed.\n")
    (folder / "0002-broken.md").write_text("---\ntitle: header never closed\n## What it is\nStill readable.\n")
    (folder / "not a note.md").write_text("ignored")
    return workspace


def test_build_notes_are_hidden_by_default(client, notes):
    assert client.get("/api/learn/notes").status_code == 404
    assert client.get("/api/learn/notes/finance-app/0001-expo").status_code == 404


def test_build_notes_are_listed_per_project_and_read_in_sections(client, notes, monkeypatch):
    monkeypatch.setattr(config, "LEARN_ENABLED", True)
    items = client.get("/api/learn/notes").json()["items"]
    assert [(n["id"], n["project"], n["title"], n["kind"]) for n in items] == [
        ("finance-app/0001-expo", "finance-app", "Expo", "tool"),
        ("finance-app/0002-broken", "finance-app", "0002-broken", ""),  # a broken header still lists
    ]
    assert "sections" not in items[0]
    note = client.get("/api/learn/notes/finance-app/0001-expo").json()["note"]
    assert (note["date"], note["summary"]) == ("2026-11-02", "React Native without a Mac")
    assert note["sections"] == [{"title": "What it is", "text": "A framework."},
                                {"title": "What interviewers ask", "text": "**Q: Why Expo?**\nNo Mac needed."}]


def test_no_notes_folder_means_no_notes(client, workspace, monkeypatch):
    monkeypatch.setattr(config, "LEARN_ENABLED", True)
    assert client.get("/api/learn/notes").json() == {"ok": True, "items": []}


@pytest.mark.parametrize("path", ["finance-app/nope", "..%2Fsecret/x", "finance-app/..%2F..%2FMISSION", "finance-app/not a note"])
def test_note_paths_cannot_escape_the_notes_folder(client, notes, monkeypatch, path):
    monkeypatch.setattr(config, "LEARN_ENABLED", True)
    assert client.get(f"/api/learn/notes/{path}").status_code in (404, 422)
