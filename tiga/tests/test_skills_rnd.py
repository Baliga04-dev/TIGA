from datetime import date

import pytest

import rnd
from skills import Skills
from store import Store

BASE = {"sent_today": 0, "sent_week": 20, "replies": 4, "interested": 1, "declined": 1, "unsubscribed": 0,
        "bounced": 0, "followups_sent": 0, "awaiting_approval": 0, "daily_cap": 10, "pipeline": {}}


# --- skills ---------------------------------------------------------------
@pytest.fixture
def skills(tmp_path):
    (tmp_path / "mailer").mkdir()
    (tmp_path / "mailer" / "SKILL.md").write_text("# Mailer\n")
    return Skills(str(tmp_path))


def test_lists_and_reads_known_skills(skills):
    assert skills.names() == ["mailer"]
    assert skills.read("mailer").startswith("# Mailer")


def test_edits_are_saved_but_only_for_existing_skills(skills):
    skills.write("mailer", "# Mailer v2\n")
    assert skills.read("mailer") == "# Mailer v2\n"
    with pytest.raises(KeyError):
        skills.write("../../etc/passwd", "x")
    with pytest.raises(KeyError):
        skills.write("brand-new", "x")


def test_skill_size_is_bounded(skills):
    with pytest.raises(ValueError):
        skills.write("mailer", "x" * 30000)


def test_the_shipped_skills_all_parse():
    import config
    shipped = Skills(str(__import__("pathlib").Path(config.BASE_DIR) / "skills"))
    assert {"prospector", "mailer", "manager", "dev", "tester", "rnd"} <= set(shipped.names())
    for name in shipped.names():
        assert shipped.read(name).startswith("---\nname: " + name)


# --- R&D ---------------------------------------------------------------------
def titles(card, issues=()):
    return [p["title"] for p in rnd.analyze(card, list(issues))]


def test_healthy_numbers_propose_nothing():
    assert titles(BASE) == []


def test_low_reply_rate_proposes_message_tests():
    assert any("reply rate" in t.lower() for t in titles({**BASE, "replies": 0}))


def test_bounces_and_unsubscribes_are_flagged():
    t = titles({**BASE, "bounced": 2, "unsubscribed": 2})
    assert any("bounce" in x.lower() for x in t) and any("unsubscribe" in x.lower() for x in t)


def test_idle_pipeline_and_backlog_are_flagged():
    assert any("no mail" in x.lower() for x in titles({**BASE, "sent_week": 0, "replies": 0}))
    assert any("backlog" in x.lower() for x in titles({**BASE, "awaiting_approval": 12}))


def test_repeating_failures_are_flagged_and_capped_at_five():
    issues = [{"id": i, "title": f"bug {i}", "status": "triaged", "occurrences": 4} for i in range(8)]
    out = titles({**BASE, "replies": 0, "bounced": 3, "unsubscribed": 3, "awaiting_approval": 20}, issues)
    assert len(out) == 5


class Sink:
    def __init__(self):
        self.sent = []

    def __call__(self, to, subject, body):
        self.sent.append((to, subject, body))
        return {"ok": True}


def test_weekly_run_files_proposals_once_and_mails_once():
    store, sink = Store(":memory:"), Sink()
    card = {**BASE, "replies": 0}
    first = rnd.run_weekly(store, card, sink, "me@work.io", date(2026, 10, 21))
    again = rnd.run_weekly(store, card, sink, "me@work.io", date(2026, 10, 22))  # same ISO week
    assert first["ok"] and again["skipped"]
    assert len(sink.sent) == 1 and sink.sent[0][1].startswith("Tiga weekly R&D report")
    proposals = [i for i in store.list_issues() if i["source"] == "rnd"]
    assert proposals and all(i["kind"] == "improvement" for i in proposals)
    assert store.list_reports("weekly")
