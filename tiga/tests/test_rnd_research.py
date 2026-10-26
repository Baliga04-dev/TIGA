import json
import subprocess
from datetime import date

import pytest

import claude_cli
import config
import rnd
import services
from store import Store

REAL_RESEARCH = claude_cli.research   # taken at import, before the autouse guard replaces it for each test

CARD = {"sent_today": 0, "sent_week": 0, "replies": 0, "interested": 0, "declined": 0, "unsubscribed": 0,
        "bounced": 0, "followups_sent": 0, "awaiting_approval": 15, "daily_cap": 5, "pipeline": {"drafted": 15}}
CONTEXT = {"card": CARD, "prospects": {"ready": 24, "needs_contact": 1057}, "money": {"open_deals": 0},
           "ai": {"used": 3, "cap": 150}}


def proposal(title="Add a demo-site link to each cold email", kind="improvement", sources=("https://example.org/a",), **kw):
    return {"title": title, "kind": kind, "why": "Prospects reply more when they see work for a shop like theirs.",
            "benefit": "Higher reply rate.", "effort": "S", "first_step": "Map shop categories to demo URLs.",
            "sources": list(sources), **kw}


def answer(*proposals, notes="Looked at cold email benchmarks for 2026."):
    return "Here is what I found:\n```json\n" + json.dumps({"proposals": list(proposals), "notes": notes}) + "\n```\nDone."


# --- parsing ------------------------------------------------------------------------------------
def test_parse_keeps_valid_proposals_from_noisy_text():
    out = rnd.parse_research(answer(proposal(), proposal("Post a Google Business Profile update weekly", kind="idea")), [])
    assert [p["title"] for p in out["proposals"]] == ["Add a demo-site link to each cold email",
                                                      "Post a Google Business Profile update weekly"]
    assert out["proposals"][1]["kind"] == "idea" and out["notes"].startswith("Looked at")


def test_parse_drops_unsourced_badly_sourced_and_unknown_kinds():
    out = rnd.parse_research(answer(
        proposal("No source at all", sources=()),
        proposal("Bad source", sources=("javascript:alert(1)", "ftp://x")),
        proposal("Weird kind", kind="world-domination"),
        proposal("Fine one"),
    ), [])
    assert [p["title"] for p in out["proposals"]] == ["Fine one"]


def test_parse_skips_what_is_already_on_the_board_and_caps_at_five():
    many = [proposal(f"Proposal number {i} about something different {i * 7}") for i in range(9)]
    out = rnd.parse_research(answer(proposal("Add demo site links to every cold email"), *many),
                             ["Add a demo-site link to each cold email"])
    titles = [p["title"] for p in out["proposals"]]
    assert "Add demo site links to every cold email" not in titles and len(titles) == 5


def test_parse_trims_text_and_normalises_effort():
    out = rnd.parse_research(answer(proposal(why="x" * 5000, effort="huge")), [])
    p = out["proposals"][0]
    assert len(p["why"]) <= 600 and p["effort"] == "M"


def test_parse_survives_garbage():
    assert rnd.parse_research("I could not find anything useful.", [])["proposals"] == []
    assert rnd.parse_research('{"proposals": "not a list"}', [])["proposals"] == []


# --- the prompt -----------------------------------------------------------------------------------
def test_prompt_carries_goals_numbers_and_what_the_owner_liked():
    guide = "## Goals\nWin more local-shop clients.\n## Research topics\n- cold email deliverability 2026\n"
    issues = [{"title": "Add WhatsApp follow-ups", "status": "done", "source": "rnd"},
              {"title": "Build a mobile app", "status": "rejected", "source": "rnd"},
              {"title": "Fix flaky report", "status": "open", "source": "tester"}]
    system, prompt = rnd.build_prompt(CONTEXT, guide, issues)
    assert "cold email deliverability 2026" in prompt and "Win more local-shop clients" in prompt
    assert "Add WhatsApp follow-ups" in prompt and "Build a mobile app" in prompt and "Fix flaky report" in prompt
    assert '"awaiting_approval": 15' in prompt
    assert "untrusted" in system.lower() and "json" in system.lower()


# --- running --------------------------------------------------------------------------------------
class Sink:
    def __init__(self, ok=True):
        self.sent, self.ok = [], ok

    def __call__(self, to, subject, body):
        self.sent.append((to, subject, body))
        return {"ok": True} if self.ok else {"ok": False, "error": "Gmail is not authorized yet"}


def research_returning(*proposals):
    calls = []

    def research(system, prompt):
        calls.append((system, prompt))
        return answer(*proposals)

    research.calls = calls
    return research


def test_a_manual_run_files_sourced_proposals_and_saves_the_report():
    store = Store(":memory:")
    out = rnd.run(store, context=CONTEXT, guide="## Goals\nMore clients.", research=research_returning(
        proposal(), proposal("Ask happy clients for a Google review", kind="idea")),
        send=Sink(ok=False), to="", today=date(2026, 10, 26), manual=True)
    assert out["ok"] and out["proposals"] == 4          # "no mail went out" and "backlog" checks, plus two researched
    issues = {i["title"]: i for i in store.list_issues() if i["source"] == "rnd"}
    review = issues["Ask happy clients for a Google review"]
    assert review["kind"] == "idea" and "Sources:\n- https://example.org/a" in review["body"]
    assert issues["Add a demo-site link to each cold email"]["kind"] == "improvement"
    report = store.list_reports("research")[0]
    assert "https://example.org/a" in report["body"] and "Looked at cold email" in report["body"]
    assert store.get_value("rnd.last_run")


def test_manual_runs_are_limited_per_day():
    store = Store(":memory:")
    kw = dict(context=CONTEXT, guide="", research=research_returning(proposal()), send=Sink(), to="",
              today=date(2026, 10, 26), manual=True)
    assert rnd.run(store, **kw)["ok"] and rnd.run(store, **kw)["ok"]
    third = rnd.run(store, **kw)
    assert not third["ok"] and "2 research runs" in third["error"]


def test_weekly_runs_once_per_week_and_never_needs_gmail():
    store = Store(":memory:")
    first = rnd.run_weekly(store, CARD, Sink(ok=False), "", date(2026, 10, 26), context=CONTEXT, guide="",
                           research=research_returning(proposal()))
    again = rnd.run_weekly(store, CARD, Sink(ok=False), "", date(2026, 10, 28), context=CONTEXT, guide="",
                           research=research_returning(proposal()))
    assert first["ok"] and again.get("skipped")
    assert store.list_reports("weekly") and any(i["source"] == "rnd" for i in store.list_issues())


def test_without_claude_it_still_runs_the_number_checks_and_says_why():
    store = Store(":memory:")

    def broken(system, prompt):
        raise RuntimeError("daily AI limit of 150 calls reached")

    out = rnd.run(store, context=CONTEXT, guide="", research=broken, send=Sink(), to="me@work.io",
                  today=date(2026, 10, 26), manual=True)
    assert out["ok"] and out["proposals"] == 2 and "daily AI limit" in out["research_error"]
    assert "Research skipped: daily AI limit" in store.list_reports("research")[0]["body"]


# --- the research call itself ----------------------------------------------------------------------
def test_the_research_session_can_only_search_and_read_the_web(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-should-be-stripped")
    seen = {}

    def fake_run(args, **kw):
        seen["args"], seen["cwd"], seen["env"] = args, kw["cwd"], kw["env"]
        import os
        seen["empty"] = os.listdir(kw["cwd"]) == []
        return subprocess.CompletedProcess(args, 0, json.dumps({"result": "{}", "usage": {}}), "")

    REAL_RESEARCH("sys", "find things", run=fake_run)
    args = seen["args"]
    assert args[args.index("--tools") + 1] == "WebSearch,WebFetch"
    assert "Read" not in args[args.index("--tools") + 1] and "Bash" not in " ".join(args)
    assert seen["empty"] and "ANTHROPIC_API_KEY" not in seen["env"] and "--max-turns" in args


def test_tests_never_reach_the_real_research_call():
    with pytest.raises(AssertionError):
        claude_cli.research("sys", "prompt")


# --- the Dev bot leaves ideas alone -------------------------------------------------------------------
def test_dev_bot_never_picks_an_idea():
    import devbot

    store = services.get_store()
    idea = store.open_issue("idea", "Post on Instagram weekly", dedupe_key="i", source="rnd")
    for status in ("triaged", "approved"):
        store.transition_issue(idea["id"], status, actor="user")
    assert devbot.DevBot(store)._pick(None) is None
    assert devbot.DevBot(store)._pick(idea["id"]) is None


# --- the API ------------------------------------------------------------------------------------------
def test_rnd_api_runs_without_a_mailbox_and_reports_status(monkeypatch):
    from fastapi.testclient import TestClient

    import main

    monkeypatch.setattr(config, "GMAIL_USER_EMAIL", "")
    monkeypatch.setattr(config, "ADMIN_REPORT_EMAIL", "")
    monkeypatch.setattr(rnd, "default_research", lambda: research_returning(proposal()))
    client = TestClient(main.app)
    out = client.post("/api/rnd/run").json()
    assert out["ok"] and out["proposals"] >= 1
    status = client.get("/api/rnd/status").json()
    assert status["ok"] and status["last_run"] and status["manual_left"] == 1
    assert status["latest"]["kind"] == "research"
