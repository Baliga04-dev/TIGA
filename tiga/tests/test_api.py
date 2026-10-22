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
    pending = r["actions"][0]
    assert pending["status"] == "needs_confirmation" and "go-ahead" in r["reply"]
    done = client.post(f"/api/actions/{pending['pending_id']}/confirm").json()
    assert done["ok"] is True and done["action"]["ok"] is True
