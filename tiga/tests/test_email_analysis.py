"""Email parsing/analysis, observed through fetch + parse on raw Gmail messages."""
import pytest

from fakes import b64, raw_message


def parse(google_client, message):
    google_client.messages_by_id = {message["id"]: message}
    import gmail_service

    svc = gmail_service.gmail_service
    return svc.parse_email_content(svc.fetch_emails()[0])


def test_not_interested_is_negative(google):
    p = parse(google, raw_message("1", "Re: offer", "Thanks, but we are not interested."))
    assert p["sentiment"] == "negative"


def test_enthusiastic_reply_is_positive(google):
    p = parse(google, raw_message("1", "Re: offer", "Sounds great, I'm interested. Let's schedule a call."))
    assert p["sentiment"] == "positive"


def test_plain_email_is_not_tagged_ai(google):
    p = parse(google, raw_message("1", "Lunch", "She said we could email again after the break."))
    assert "ai_ml" not in p["key_topics"]


def test_real_ai_mention_is_tagged(google):
    p = parse(google, raw_message("1", "Project", "We need an AI model and machine learning pipeline."))
    assert "ai_ml" in p["key_topics"]


def test_phone_number_is_extracted_whole(google):
    p = parse(google, raw_message("1", "Hi", "Call me on +1 415-555-0132 anytime."))
    assert any("415" in n and "0132" in n for n in p["contact_info"]["phones"])


def test_sender_address_is_a_clean_email(google):
    p = parse(google, raw_message("1", "Hi", "Hello", sender="Alex Doe <alex@acme.com>"))
    assert "alex@acme.com" in p["contact_info"]["emails"]
    assert not any("<" in e for e in p["contact_info"]["emails"])


@pytest.mark.parametrize("subject", ["RE: hello", "Re : hello", "  re: hello", "Re[2]: hello"])
def test_reply_prefix_variants_are_replies(google, subject):
    p = parse(google, raw_message("1", subject, "Thanks"))
    assert p["is_reply"] is True


def test_html_and_plain_parts_are_not_duplicated(google):
    p = parse(google, raw_message("1", "Hi", "Hello there world", html="<p>Hello there world</p>"))
    assert p["email"]["body"].count("Hello there world") == 1


def test_lowercase_headers_are_read(google):
    msg = raw_message(
        "1", "", "Body text",
        headers=[{"name": "subject", "value": "Lower case"}, {"name": "from", "value": "a@b.com"}],
    )
    p = parse(google, msg)
    assert p["email"]["subject"] == "Lower case"


def test_unpadded_base64_body_is_decoded(google):
    msg = raw_message("1", "Hi", "x")
    msg["payload"]["parts"][0]["body"]["data"] = b64("Hello unpadded body!").rstrip("=")
    p = parse(google, msg)
    assert p["email"]["body"] == "Hello unpadded body!"


def test_cold_email_flag_follows_pitch_content(google):
    pitch = parse(google, raw_message("1", "Web development services for you", "We offer website design services."))
    plain = parse(google, raw_message("2", "Dinner", "Are we still on for dinner tonight?"))
    assert pitch["is_cold_email"] is True
    assert plain["is_cold_email"] is False


def test_email_domains_and_filenames_are_not_websites(google):
    p = parse(google, raw_message("1", "Hi", "Mail me at alex@acme.com, see notes.txt or visit https://acme.com/work."))
    assert p["contact_info"]["websites"] == ["https://acme.com/work"]
