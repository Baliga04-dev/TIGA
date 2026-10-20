"""Built-in (no LLM key) chat routing, observed through POST /api/chat."""
from fakes import raw_message


def chat(client, text):
    r = client.post("/api/chat", json={"text": text, "history": []})
    assert r.status_code == 200
    return r.json()


def test_drafting_a_template_never_sends_an_email(client, google):
    body = chat(client, "draft a cold email template for Acme")
    assert google.sent == []
    assert "subject" in body["reply"].lower()


def test_asking_for_email_summary_reports_counts(client, google):
    google.messages_by_id = {
        m["id"]: m
        for m in [
            raw_message("1", "Re: proposal", "Sounds great, let's talk this week."),
            raw_message("2", "Hello", "Just checking in."),
        ]
    }
    body = chat(client, "give me an email summary")
    assert "2" in body["reply"]
    assert body["actions"][0]["ok"] is True


def test_check_my_emails_fetches_the_inbox(client, google):
    google.messages_by_id = {"1": raw_message("1", "Hello", "Just checking in.")}
    body = chat(client, "check my emails")
    assert body["actions"][0]["tool"] in {"fetch_recent_emails", "get_email_summary"}
    assert body["actions"][0]["ok"] is True


def test_summary_over_several_days_uses_that_period(client, google):
    body = chat(client, "email summary for the last 3 days")
    assert body["actions"][0]["result"]["period_days"] == 3
