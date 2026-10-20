"""More built-in chat intents and the open-a-tab safety rules, via POST /api/chat."""
import pytest

import tools


def chat(client, text):
    r = client.post("/api/chat", json={"text": text, "history": []})
    assert r.status_code == 200
    return r.json()


@pytest.fixture
def browser(monkeypatch):
    opened = []
    monkeypatch.setattr(tools.webbrowser, "open", lambda url, new=0: opened.append(url) or True)
    return opened


def test_open_known_site(client, browser):
    chat(client, "open github")
    assert browser == ["https://github.com"]


def test_google_drive_opens_drive_not_google(client, browser):
    chat(client, "open google drive")
    assert browser == ["https://drive.google.com"]


@pytest.mark.parametrize("text", ["show me the time", "show me the status"])
def test_show_me_questions_are_not_open_commands(client, browser, text):
    body = chat(client, text)
    assert browser == []
    assert "which site" not in body["reply"].lower()


def test_sentence_containing_open_is_not_a_command(client, browser):
    body = chat(client, "is the store open today")
    assert browser == []
    assert "which site" not in body["reply"].lower()


@pytest.mark.parametrize("target", ["javascript:alert(1)", "mailto:a@b.com", "file:///etc/passwd", "notes.txt"])
def test_unsafe_or_non_url_targets_are_never_opened(client, browser, target):
    chat(client, f"open {target}")
    assert browser == []


def test_localhost_with_port_can_be_opened(client, browser):
    chat(client, "open http://localhost:3000")
    assert browser == ["http://localhost:3000"]


def test_booking_a_call_about_sales_books_rather_than_reporting_metrics(client):
    body = chat(client, "book a call about sales numbers")
    assert body["actions"][0]["tool"] == "book_call"


def test_booking_parses_topic_and_time_separately(client):
    body = chat(client, "Book a call about pricing for Tuesday 3pm")
    args = body["actions"][0]["args"]
    assert args["topic"] == "pricing"
    assert args["preferred_time"] == "Tuesday 3pm"


def test_template_picks_recipient_company_and_service(client):
    body = chat(client, "draft a cold email template for Sam at Acme Corp about web design")
    args = body["actions"][0]["args"]
    assert args["recipient_name"] == "Sam"
    assert args["company_name"] == "Acme Corp"
    assert args["service_type"] == "web_development"


def test_ordinary_words_do_not_pick_a_service(client):
    body = chat(client, "draft a cold email template for a happy client")
    assert body["actions"][0]["args"]["service_type"] == "general"


def test_sending_needs_an_address_and_content(client, google):
    body = chat(client, "send a cold email")
    assert google.sent == []
    assert body["actions"] == []


def test_sending_without_content_asks_for_it(client, google):
    body = chat(client, "send a cold email to bob@example.com")
    assert google.sent == []
    assert "bob@example.com" in body["reply"]


def test_sending_with_explicit_content_sends_it(client, google):
    chat(client, "send a cold email to bob@example.com saying I build fast websites")
    assert len(google.sent) == 1
