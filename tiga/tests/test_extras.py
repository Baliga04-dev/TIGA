from datetime import datetime, timedelta, timezone

import pytest

import services
import tools
from sitecheck import SiteReport


def _sent(email, company, days_ago):
    store = services.get_store()
    row = store.add_outreach(email, "Hi", "Body", company=company)
    sent = (datetime.now(timezone.utc) - timedelta(days=days_ago)).isoformat(timespec="seconds")
    return store.update_outreach(row["id"], status="sent", sent_at=sent)


async def test_who_is_waiting_ranks_by_how_long_they_have_waited():
    _sent("a@a.in", "Recent Shop", 2)
    _sent("b@b.in", "Old Shop", 9)
    services.get_store().create_deal({"email": "c@c.in", "company": "Warm Lead"})
    out = await tools.who_is_waiting()
    names = [w["name"] for w in out["waiting"]]
    assert names.index("Warm Lead") < names.index("Old Shop") < names.index("Recent Shop")
    assert out["waiting"][1]["days"] >= 9


def test_chat_asks_who_is_waiting(client):
    _sent("b@b.in", "Old Shop", 9)
    body = client.post("/api/chat", json={"text": "who's waiting on me?"}).json()
    assert body["actions"][0]["tool"] == "who_is_waiting" and "Old Shop" in body["reply"]


async def test_focus_session_pauses_music_sets_an_end_reminder_and_logs_time(ran):
    deal = services.get_store().create_deal({"email": "r@sri.in", "company": "Sri Bakery"})
    out = await tools.focus(50, "sri bakery")
    assert out["ok"] and "179" in ran[-1]  # play/pause key
    reminder = services.get_store().list_reminders()[0]
    assert "Focus session over" in reminder["text"] and "Sri Bakery" in reminder["text"]
    assert services.get_store().get_deal(deal["id"])["minutes_logged"] == 50


def test_chat_starts_a_focus_session(client, ran):
    body = client.post("/api/chat", json={"text": "focus for 25 minutes"}).json()
    assert body["actions"][0]["tool"] == "focus" and "25" in body["reply"]


async def test_prospect_brief_uses_the_site_check_and_rate_card(monkeypatch):
    services.get_store().create_deal({"email": "r@sri.in", "company": "Sri Bakery"})
    services.get_store().upsert_prospect({"key": "osm:1", "source": "osm", "name": "Sri Bakery",
                                          "website": "http://sri.in", "status": "ready"})

    async def fake_inspect(url, *, year):
        return SiteReport(url=url, reachable=True, https=False, mobile_ready=False)

    import sitecheck
    monkeypatch.setattr(sitecheck, "inspect", fake_inspect)
    out = await tools.prospect_brief("sri bakery")
    assert out["ok"] and "no_https" in out["problems"] and "not_mobile" in out["problems"]
    assert "redesign" in out["pitch"].lower() and out["quote"].startswith("₹")


async def test_prospect_brief_for_unknown_names():
    assert (await tools.prospect_brief("nobody at all"))["ok"] is False


def test_notes_are_given_to_claude_as_memory(client, monkeypatch):
    import ai
    import config
    services.get_store().add_note("Glow Salon wants a pink theme")
    seen = {}
    monkeypatch.setattr(config, "AI_PROVIDER", "claude")
    monkeypatch.setattr(ai, "claude_complete", lambda s, u: seen.setdefault("system", s) and '{"reply": "ok"}')
    client.post("/api/chat", json={"text": "what colour does Glow want?"})
    assert "Glow Salon wants a pink theme" in seen["system"] and "<memory>" in seen["system"]
