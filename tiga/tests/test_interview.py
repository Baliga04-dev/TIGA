import pytest

from interview import MAX_QUESTIONS, Interviewer
from store import Store


@pytest.fixture
def store():
    s = Store(":memory:")
    yield s
    s.close()


@pytest.fixture
def iv(store):
    return Interviewer(store)


def test_slots_found_in_the_idea_are_not_asked_again(iv):
    state = iv.start("A React and FastAPI web app for freelance designers to track invoices")
    assert state["slots"]["stack"] == "React, FastAPI"
    assert state["slots"]["user"] == "freelance designers"
    assert state["slots"]["platform"] == "web app"
    assert state["question"]["slot"] not in ("stack", "user")


def test_questions_follow_priority_one_at_a_time_and_end(iv):
    state = iv.start("an app")
    asked = []
    while state["status"] == "asking":
        asked.append(state["question"]["slot"])
        state = iv.answer(state["id"], "something specific")
    assert state["status"] == "ready"
    assert len(asked) == len(set(asked)) <= MAX_QUESTIONS
    assert asked[0] == "user"


def test_skip_marks_the_slot_as_an_assumption_not_a_blank(iv):
    state = iv.start("an app")
    state = iv.answer(state["id"], "skip")
    assert state["slots"]["user"] == "(you decide)"
    out = iv.generate(state["id"])
    assert "<open_questions>" in out["prompt"] and "user" in out["prompt"].split("<open_questions>")[1]


def test_generate_now_works_at_any_point_and_has_every_section(iv):
    state = iv.start("A CLI tool in Python to rename photos by date")
    prompt = iv.generate(state["id"])["prompt"]
    for tag in ("goal", "users_and_context", "requirements", "non_goals", "constraints",
                "acceptance_criteria", "open_questions"):
        assert f"<{tag}>" in prompt and f"</{tag}>" in prompt
    assert "rename photos by date" in prompt.split("<goal>")[1].split("</goal>")[0]


def test_state_survives_a_restart(store):
    first = Interviewer(store).start("an app")
    resumed = Interviewer(store).answer(first["id"], "small bakeries")
    assert resumed["slots"]["user"] == "small bakeries"


def test_only_cited_sources_appear_as_references(iv):
    state = iv.start("an app")
    iv.add_sources(state["id"], [
        {"url": "https://docs.example/a", "title": "Official docs", "excerpt": "Rate limit is 100/min"},
        {"url": "ftp://bad.example", "title": "x", "excerpt": "ignore me"},
    ])
    prompt = iv.generate(state["id"])["prompt"]
    assert "[1] Official docs https://docs.example/a" in prompt
    assert "bad.example" not in prompt
    assert "Rate limit is 100/min" in prompt


def test_unknown_interview_is_a_clear_error(iv):
    with pytest.raises(KeyError):
        iv.answer("nope", "x")


def test_answers_are_bounded(iv):
    state = iv.start("an app")
    with pytest.raises(ValueError):
        iv.answer(state["id"], "x" * 5000)
    with pytest.raises(ValueError):
        iv.start("  ")
