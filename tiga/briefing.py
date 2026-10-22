"""The morning briefing: what needs Adithya today, in one short list (and one spoken paragraph).

Interface: `await build(store, mailer, now, weather=fetch_weather) -> {"cards": [...], "text": str}`.
Every number comes from Tiga's own database; the weather is Open-Meteo (free, no key). A weather
failure only drops the weather card.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Awaitable, Callable

import httpx

import deals
from mailer import Mailer
from store import Store

BENGALURU = (12.97, 77.59)
_WMO = {0: "clear", 1: "mostly clear", 2: "partly cloudy", 3: "cloudy", 45: "foggy", 51: "drizzle", 61: "light rain",
        63: "rain", 65: "heavy rain", 80: "showers", 81: "showers", 82: "heavy showers", 95: "thunderstorms"}


async def fetch_weather() -> dict:
    lat, lon = BENGALURU
    async with httpx.AsyncClient(timeout=8) as client:
        r = await client.get(
            "https://api.open-meteo.com/v1/forecast",
            params={"latitude": lat, "longitude": lon, "daily": "weather_code,temperature_2m_max,temperature_2m_min,"
                    "precipitation_probability_max", "timezone": "Asia/Kolkata", "forecast_days": 1},
        )
        r.raise_for_status()
        d = r.json()["daily"]
    return {"summary": _WMO.get(d["weather_code"][0], "mixed"), "high": round(d["temperature_2m_max"][0]),
            "low": round(d["temperature_2m_min"][0]), "rain": d["precipitation_probability_max"][0]}


async def build(store: Store, mailer: Mailer, now: datetime,
                weather: Callable[[], Awaitable[dict]] | None = fetch_weather) -> dict:
    card = mailer.scorecard(now=now)
    money = deals.money_summary(store.list_deals(), today=now.date())
    end_of_day = now.replace(hour=23, minute=59, second=0, microsecond=0)
    reminders = store.list_reminders("pending", due_before=end_of_day.isoformat())
    interested = [d for d in store.list_deals("interested")]
    needs_contact = store.prospect_counts().get("needs_contact", 0)
    quiet = [r for r in store.list_outreach("sent") if r["sent_at"] and
             datetime.fromisoformat(r["sent_at"]) <= now - timedelta(days=5) and r["followup_n"] < 2]

    cards = []
    todo = []
    if card["awaiting_approval"]:
        todo.append(f"{card['awaiting_approval']} email draft{'s' if card['awaiting_approval'] != 1 else ''} to approve")
    if interested:
        todo.append(f"{len(interested)} interested client{'s' if len(interested) != 1 else ''} to call: "
                    + ", ".join(d["company"] or d["email"] for d in interested[:3]))
    if quiet:
        todo.append(f"{len(quiet)} prospect{'s' if len(quiet) != 1 else ''} quiet for 5+ days: follow-ups due")
    if money["advance_due"] or money["balance_due"]:
        todo.append(f"Rs {money['advance_due'] + money['balance_due']:,} to collect")
    if needs_contact:
        todo.append(f"{needs_contact} prospects need an email or a call")
    cards.append({"title": "To do today", "lines": todo or ["Nothing urgent. A good day to find new leads."]})
    if reminders:
        cards.append({"title": "Reminders", "lines": [f"{datetime.fromisoformat(r['due_at']).astimezone(now.tzinfo):%I:%M %p}: {r['text']}"
                                                      for r in reminders]})
    cards.append({"title": "Yesterday's outreach", "lines": [
        f"Sent this week: {card['sent_week']}", f"Replies: {card['replies']} ({card['interested']} interested)",
        f"Open deals: {money['open_deals']} worth Rs {money['pipeline_value']:,}"]})
    if weather is not None:
        try:
            w = await weather()
            cards.append({"title": "Bengaluru weather", "lines": [
                f"{w['summary'].capitalize()}, {w['low']} to {w['high']} °C, {w['rain']}% chance of rain"]})
        except Exception:
            pass

    hello = "Good morning" if now.hour < 12 else "Good afternoon" if now.hour < 17 else "Good evening"
    spoken = f"{hello}, Adithya. " + ". ".join(todo[:3] or ["Nothing urgent today"]) + "."
    return {"cards": cards, "text": spoken}
