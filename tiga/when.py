"""Turn everyday time phrases into a datetime, in the owner's timezone.

Interface: `parse_when(text, now) -> datetime | None`. Understands "in 20 minutes", "in an hour",
"at 5" (1-7 without am/pm means afternoon), "at 5pm", "at 17:30", "tomorrow 10am", "tonight at 8",
and a bare "tomorrow" (9 am). A clock time already past today means tomorrow. Anything unclear is None.
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta

_IN = re.compile(r"\bin\s+(an?|\d{1,4})\s*(minutes?|mins?|hours?|hrs?)\b")
_AT = re.compile(r"(?:\bat\s+|^|\s)(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?(?=\s|$|[.,!?])")


def parse_when(text: str, now: datetime) -> datetime | None:
    text = text.lower().strip()
    if not text:
        return None
    m = _IN.search(text)
    if m:
        amount = 1 if m.group(1) in ("a", "an") else int(m.group(1))
        unit = timedelta(hours=1) if m.group(2).startswith(("hour", "hr")) else timedelta(minutes=1)
        return (now + amount * unit).replace(second=0, microsecond=0) if amount > 0 else None

    day = now.date()
    tomorrow = "tomorrow" in text
    if tomorrow:
        day = day + timedelta(days=1)
    m = _AT.search(text)
    if not m:
        return datetime(day.year, day.month, day.day, 9, tzinfo=now.tzinfo) if tomorrow else None
    hour, minute, meridiem = int(m.group(1)), int(m.group(2) or 0), (m.group(3) or "").replace(".", "")
    if minute > 59 or hour > 23 or (meridiem and not 1 <= hour <= 12):
        return None
    if meridiem == "pm" and hour != 12:
        hour += 12
    elif meridiem == "am" and hour == 12:
        hour = 0
    elif not meridiem and ("tonight" in text or 1 <= hour <= 7):
        hour = hour + 12 if hour < 12 else hour
    when = datetime(day.year, day.month, day.day, hour, minute, tzinfo=now.tzinfo)
    if not tomorrow and when <= now:
        when += timedelta(days=1)
    return when
