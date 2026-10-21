import pytest

import config
from fakes import raw_message


@pytest.fixture(autouse=True)
def setup(monkeypatch):
    monkeypatch.setattr(config, "POSTAL_ADDRESS", "Jo Dev, PO Box 12, Bengaluru 560001")


def make_draft(client, email="owner@acme.io", **kw):
    payload = {"email": email, "company": "Acme", "subject": "Idea", "body": "Hi there", "lead_url": "https://n.example/a",
               "source_note": "contact page", **kw}
    return client.post("/api/outreach/drafts", json=payload).json()


def test_draft_edit_approve_listing(client):
    created = make_draft(client)
    assert created["ok"] and created["draft"]["status"] == "drafted"
    did = created["draft"]["id"]
    edited = client.patch(f"/api/outreach/{did}", json={"subject": "Better idea", "body": "New body"}).json()
    assert edited["draft"]["subject"] == "Better idea"
    assert client.post(f"/api/outreach/{did}/approve").json()["draft"]["status"] == "approved"
    listing = client.get("/api/outreach", params={"status": "approved"}).json()
    assert [r["id"] for r in listing["items"]] == [did]


def test_editing_an_approved_draft_is_refused(client):
    did = make_draft(client)["draft"]["id"]
    client.post(f"/api/outreach/{did}/approve")
    out = client.patch(f"/api/outreach/{did}", json={"body": "sneaky change"}).json()
    assert out["ok"] is False and "approved" in out["error"]


def test_suppressed_address_gives_a_readable_error(client):
    client.post("/api/suppressions", json={"address": "owner@acme.io", "reason": "asked to stop"})
    out = make_draft(client)
    assert out["ok"] is False and "suppressed" in out["error"]
    assert client.get("/api/suppressions").json()["items"][0]["address"] == "owner@acme.io"


def test_send_next_uses_gmail_and_reports_when_nothing_is_due(client, google, monkeypatch):
    from datetime import datetime, timezone
    import mailer as mailer_mod
    monkeypatch.setattr(mailer_mod, "BUSINESS_HOURS", (0, 24))
    did = make_draft(client)["draft"]["id"]
    assert client.post("/api/outreach/send-next").json() == {"ok": True, "sent": None}
    client.post(f"/api/outreach/{did}/approve")
    sent = client.post("/api/outreach/send-next").json()
    # weekends are refused: either it sent, or it is the weekend and nothing was due
    if datetime.now(timezone.utc).weekday() < 5:
        assert sent["sent"]["status"] == "sent" and len(google.sent) == 1
    else:
        assert sent["sent"] is None


def test_check_replies_marks_unsubscribe_and_scorecard_reflects_it(client, google, monkeypatch):
    import services
    import mailer as mailer_mod
    from datetime import datetime, timezone
    mailer = services.get_mailer()
    did = make_draft(client)["draft"]["id"]
    mailer.approve(did)
    monkeypatch.setattr(mailer_mod, "BUSINESS_HOURS", (0, 24))
    monkeypatch.setattr(mailer, "gap_seconds", lambda: 0)
    now = datetime(2026, 10, 21, 10, 0, tzinfo=timezone.utc)
    row = mailer.send_next(now=now)
    google.threads_by_id[row["thread_id"]] = [raw_message("r1", "Re: Idea", "STOP", sender="Owner <owner@acme.io>")]
    out = client.post("/api/outreach/check-replies").json()
    assert out["ok"] and out["changed"] == 1
    card = client.get("/api/outreach/scorecard").json()["scorecard"]
    assert card["unsubscribed"] == 1 and card["replies"] == 1


def test_find_leads_endpoint_returns_ranked_leads(client, http):
    from fakes import rss
    http.add("news.google.com", text=rss(("Acme raises seed to launch app", "https://n.example/a")))
    http.add("hn.algolia.com", json={"hits": []})
    http.add("api.gdeltproject.org", json={"articles": []})
    out = client.post("/api/leads/find", json={"topics": ["startups"]}).json()
    assert out["ok"] and out["leads"][0]["url"] == "https://n.example/a" and out["leads"][0]["score"] >= 6


def test_find_leads_validates_topics(client):
    assert client.post("/api/leads/find", json={"topics": []}).status_code == 422


def test_auto_draft_writes_a_draft_that_still_needs_approval(client, monkeypatch):
    monkeypatch.setattr(config, "SENDER_NAME", "Jo")
    out = client.post("/api/outreach/auto-draft", json={
        "email": "owner@acme.io", "lead_title": "Acme raises seed", "signals": ["funding"], "company": "Acme",
        "lead_url": "https://n.example/a", "source_note": "Google News: Acme raises seed"}).json()
    assert out["ok"] and out["draft"]["status"] == "drafted"
    assert "Acme" in out["draft"]["body"] and out["draft"]["body"].rstrip().endswith("Jo")


def test_auto_draft_asks_for_a_sender_name_first(client, monkeypatch):
    monkeypatch.setattr(config, "SENDER_NAME", "")
    out = client.post("/api/outreach/auto-draft", json={"email": "owner@acme.io"}).json()
    assert out["ok"] is False and "TIGA_SENDER_NAME" in out["error"]


def test_auto_draft_respects_the_suppression_list(client, monkeypatch):
    monkeypatch.setattr(config, "SENDER_NAME", "Jo")
    client.post("/api/suppressions", json={"address": "owner@acme.io"})
    out = client.post("/api/outreach/auto-draft", json={"email": "owner@acme.io"}).json()
    assert out["ok"] is False and "suppressed" in out["error"]
