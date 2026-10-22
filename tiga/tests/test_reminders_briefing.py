from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

import brain
import briefing
import services

IST = ZoneInfo("Asia/Kolkata")


@pytest.mark.parametrize("rest, what, when", [
    ("at 5 to call Sri Bakery", "call Sri Bakery", "at 5"),
    ("to call Ravi at 5pm", "call Ravi", "at 5pm"),
    ("in 20 minutes to stretch", "stretch", "in 20 minutes"),
    ("tomorrow at 10am to send the invoice", "send the invoice", "tomorrow at 10am"),
    ("to send the proposal tomorrow", "send the proposal", "tomorrow"),
])
def test_reminder_sentences_split_into_what_and_when(rest, what, when):
    assert brain._split_reminder(rest) == (what, when)


def test_chat_sets_a_reminder_and_takes_a_note(client):
    body = client.post("/api/chat", json={"text": "remind me in 20 minutes to call Sri Bakery"}).json()
    assert body["actions"][0]["ok"] and "call Sri Bakery" in body["reply"]
    assert services.get_store().list_reminders()[0]["text"] == "call Sri Bakery"
    body = client.post("/api/chat", json={"text": "note: Glow Salon wants a pink theme"}).json()
    assert body["reply"] == "Noted." and services.get_store().list_notes()[0]["text"] == "Glow Salon wants a pink theme"


def test_unclear_reminders_ask_again(client):
    body = client.post("/api/chat", json={"text": "remind me about stuff"}).json()
    assert body["actions"] == [] and "when" in body["reply"].lower()


def test_due_reminders_api_and_closing(client):
    store = services.get_store()
    past = store.add_reminder("call Ravi", datetime(2020, 1, 1, tzinfo=IST).isoformat())
    store.add_reminder("later thing", datetime(2099, 1, 1, tzinfo=IST).isoformat())
    due = client.get("/api/reminders/due").json()["items"]
    assert [r["text"] for r in due] == ["call Ravi"]
    assert client.post(f"/api/reminders/{past['id']}/done").json()["ok"]
    assert client.get("/api/reminders/due").json()["items"] == []


def test_notes_api(client):
    n = client.post("/api/notes", json={"text": "client prefers WhatsApp"}).json()["note"]
    assert [x["text"] for x in client.get("/api/notes").json()["items"]] == ["client prefers WhatsApp"]
    assert client.delete(f"/api/notes/{n['id']}").json()["ok"]
    assert client.get("/api/notes").json()["items"] == []


async def test_briefing_lists_what_needs_doing_and_survives_no_weather():
    store, mailer = services.get_store(), services.get_mailer()
    mailer.draft(email="a@shop.in", subject="Hi", body="x")
    store.create_deal({"email": "ravi@sri.in", "company": "Sri Bakery"})
    store.add_reminder("call Ravi", datetime(2026, 10, 22, 17, 0, tzinfo=IST).isoformat())
    now = datetime(2026, 10, 22, 8, 0, tzinfo=IST)

    async def no_weather():
        raise RuntimeError("offline")

    out = await briefing.build(store, mailer, now, weather=no_weather)
    todo = out["cards"][0]["lines"]
    assert "1 email draft to approve" in todo and any("Sri Bakery" in t for t in todo)
    assert any(c["title"] == "Reminders" and "call Ravi" in c["lines"][0] for c in out["cards"])
    assert not any(c["title"] == "Bengaluru weather" for c in out["cards"])
    assert out["text"].startswith("Good morning, Adithya.")


async def test_weather_card_from_open_meteo(http):
    http.add("api.open-meteo.com", json={"daily": {"weather_code": [61], "temperature_2m_max": [28.4],
                                                     "temperature_2m_min": [19.6], "precipitation_probability_max": [70]}})
    w = await briefing.fetch_weather()
    assert w == {"summary": "light rain", "high": 28, "low": 20, "rain": 70}


def test_good_morning_in_chat_gives_the_briefing(client, http):
    http.add("api.open-meteo.com", json={"daily": {"weather_code": [0], "temperature_2m_max": [30],
                                                     "temperature_2m_min": [20], "precipitation_probability_max": [5]}})
    body = client.post("/api/chat", json={"text": "good morning tiga"}).json()
    assert body["actions"][0]["tool"] == "morning_briefing" and "Adithya" in body["reply"]
