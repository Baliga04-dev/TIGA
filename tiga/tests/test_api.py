"""HTTP contract of main.py routes, through the FastAPI TestClient."""
import pytest

from fakes import raw_message, rss


def test_status_reports_identity_and_unconfigured_integrations(client):
    body = client.get("/api/status").json()
    assert body["name"] == "Tiga"
    assert body["brain"] == "builtin"
    assert body["gmail_configured"] is False
    assert body["agents"] == ["manager", "dev", "tester"]


def test_tts_without_a_key_asks_the_browser_to_speak(client):
    r = client.post("/api/tts", json={"text": "hello"})
    assert r.status_code == 501
    assert r.json()["fallback"] == "browser"


def test_email_template_route_returns_subject_and_body(client):
    body = client.post("/api/email/template", json={"service_type": "web_development", "recipient_name": "Sam"}).json()
    assert body["ok"] is True
    assert "Sam" in body["template"]["body"]
    assert body["template"]["subject"]


@pytest.mark.parametrize(
    "path,payload",
    [
        ("/api/email/send", {"to": "x", "subject": "s", "body": "b"}),
        ("/api/email/send", {"to": "bob@example.com", "subject": "", "body": "b"}),
        ("/api/email/fetch", {"max_results": 0}),
        ("/api/email/fetch", {"max_results": 1000}),
        ("/api/email/fetch", {"days_back": -1}),
        ("/api/email/summary", {"days": 0}),
        ("/api/email/summary", {"days": 400}),
        ("/api/prompt/generate", {"idea": "   ", "outcome": "something"}),
        ("/api/research/leads", {"topic": "   "}),
    ],
)
def test_invalid_input_is_rejected_with_422(client, path, payload):
    assert client.post(path, json=payload).status_code == 422


def test_email_send_goes_out_through_gmail(client, google):
    r = client.post("/api/email/send", json={"to": "bob@example.com", "subject": "Hi", "body": "Hello"})
    assert r.json()["ok"] is True
    assert len(google.sent) == 1


def test_email_fetch_returns_parsed_messages(client, google):
    google.messages_by_id = {"1": raw_message("1", "Hello", "Just checking in.")}
    body = client.post("/api/email/fetch", json={"days_back": 2}).json()
    assert body["count"] == 1
    assert body["emails"][0]["email"]["subject"] == "Hello"
    assert google.list_queries[0].startswith("after:")


def test_email_summary_counts_replies_and_positives(client, google):
    google.messages_by_id = {
        "1": raw_message("1", "Re: proposal", "Sounds great, I'm interested."),
        "2": raw_message("2", "Hello", "Just checking in."),
    }
    body = client.post("/api/email/summary", json={"days": 7}).json()
    assert body["total_emails"] == 2
    assert body["replies_received"] == 1
    assert body["positive_responses"] == 1
    assert body["period_days"] == 7


def test_unauthorised_gmail_fails_fast_without_starting_oauth(client, tmp_path, monkeypatch):
    import config
    import gmail_service

    creds = tmp_path / "credentials.json"
    creds.write_text("{}")
    monkeypatch.setattr(config, "GMAIL_CREDENTIALS_FILE", str(creds))
    monkeypatch.setattr(config, "GMAIL_TOKEN_FILE", str(tmp_path / "token.json"))
    monkeypatch.setattr(gmail_service, "gmail_service", gmail_service.GmailService())

    def no_browser_flow(*a, **k):
        raise AssertionError("OAuth flow must never start inside an HTTP request")

    monkeypatch.setattr(gmail_service.InstalledAppFlow, "from_client_secrets_file", no_browser_flow)
    body = client.post("/api/email/fetch", json={}).json()
    assert body["ok"] is False
    assert "authorize" in body["error"].lower()


def test_research_leads_merges_both_feeds_fairly_and_dedupes(client, http):
    http.add("news.google.com", text=rss(*[(f"G{i}", f"https://g.example/{i}") for i in range(5)]))
    http.add("hnrss.org", text=rss(("H0", "https://h.example/0"), ("G0", "https://g.example/0")))
    body = client.post("/api/research/leads", json={"topic": "ai startups", "limit": 4}).json()
    assert body["ok"] is True
    urls = [l["url"] for l in body["leads"]]
    assert len(urls) == len(set(urls))
    assert {l["source"] for l in body["leads"]} == {"Google News", "Hacker News"}
    assert len(body["leads"]) <= 4


def test_research_reports_a_failing_feed_but_keeps_the_other(client, http):
    import httpx

    http.add("news.google.com", exc=httpx.ConnectError("boom"))
    http.add("hnrss.org", text=rss(("H0", "https://h.example/0")))
    body = client.post("/api/research/leads", json={"topic": "ai startups"}).json()
    assert [l["title"] for l in body["leads"]] == ["H0"]
    assert body["errors"]


def test_prompt_generation_includes_research_urls(client, http):
    http.add("news.google.com", text=rss(("G0", "https://g.example/0")))
    http.add("hnrss.org", text=rss())
    body = client.post("/api/prompt/generate", json={"idea": "invoice tool", "outcome": "get paid faster"}).json()
    assert body["ok"] is True
    assert "https://g.example/0" in body["prompt"]
    assert len(body["questions"]) == 5


def test_metrics_endpoint_returning_a_list_does_not_break_chat(client, http, monkeypatch):
    import config

    monkeypatch.setattr(config, "METRICS_ENDPOINT", "https://metrics.example/api")
    http.add("metrics.example", json=[1, 2, 3])
    r = client.post("/api/chat", json={"text": "show me the metrics", "history": []})
    assert r.status_code == 200


def test_booking_webhook_returning_a_list_still_counts_as_booked(client, http, monkeypatch):
    import config

    monkeypatch.setattr(config, "BOOKING_WEBHOOK", "https://hook.example/book")
    http.add("hook.example", json=["ok"])
    r = client.post("/api/chat", json={"text": "book a call about pricing", "history": []}).json()
    assert r["actions"][0]["ok"] is True


@pytest.mark.parametrize(
    "title,signal",
    [
        ("Startup announces funding round", "growth or launch signal"),
        ("Major outage hits payments provider", "possible pain point"),
        ("New AI automation tool", "technology demand"),
        ("The mayor said it was a happy day", "needs manual qualification"),
    ],
)
def test_client_signal_labels_use_whole_words(client, http, title, signal):
    http.add("news.google.com", text=rss((title, "https://g.example/1")))
    http.add("hnrss.org", text=rss())
    lead = client.post("/api/research/leads", json={"topic": "anything"}).json()["leads"][0]
    assert lead["client_signal"] == signal
