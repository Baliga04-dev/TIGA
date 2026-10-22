"""Recurring tasks: "every Monday at 9am, check who is waiting on me".

Interface: `parse_rule(text) -> rule | None`, `next_after(rule, after) -> datetime`, `describe(rule) -> str`,
`split(text) -> (rule_text, command) | None` for a chat message, and `Routines(store)` with `add`, `list`,
`set_active`, `delete` and `await run_due(now, respond)`.

A rule is either {"days": [0-6, Monday first], "hour", "minute"} or {"every_minutes": n} (never under
MIN_INTERVAL). A routine's command runs through the same assistant path as a chat message (`respond`), so
every tool keeps its tier; anything that would need the owner's click is cancelled on the spot and reported,
because nobody is there to click. "remind me to X" routines just add a reminder, without the assistant.
At most DAILY_RUNS runs a day, and none while the assistant is paused.
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timedelta
from typing import Awaitable, Callable

import ai
import config
import executor

MIN_INTERVAL = 15
DAILY_RUNS = config.ROUTINE_DAILY_RUNS

_DAY_NAMES = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
_DAY = r"(?:mon|tues?|wed(?:nes)?|thu(?:rs?)?|fri|sat(?:ur)?|sun)(?:day)?s?"
_EVERY_DAY = {"day": None, "daily": None, "morning": 9, "evening": 18, "night": 21}
_RULE = re.compile(
    r"^\s*every\s+(?:"
    rf"(?P<days>{_DAY}(?:\s*(?:,|and|&)\s*{_DAY})*)"
    r"|(?P<span>day|weekday|weekend|morning|evening|night)"
    r"|(?P<n>\d{1,3})?\s*(?P<unit>minutes?|mins?|hours?|hrs?)"
    r")"
    r"(?:\s+(?:at\s+)?(?P<hour>\d{1,2})(?::(?P<minute>\d{2}))?\s*(?P<ampm>am|pm|a\.m\.|p\.m\.)?)?"
    r"(?=$|[\s,.;:!?-])",
    re.I,
)


def _day_index(token: str) -> int:
    token = token.lower()
    return next(i for i, name in enumerate(_DAY_NAMES) if name.startswith(token[:3]))


def _clock(m: re.Match, default_hour: int) -> tuple[int, int] | None:
    if not m.group("hour"):
        return default_hour, 0
    hour, minute = int(m.group("hour")), int(m.group("minute") or 0)
    meridiem = (m.group("ampm") or "").replace(".", "").lower()
    if minute > 59 or hour > 23 or (meridiem and not 1 <= hour <= 12):
        return None
    if meridiem == "pm" and hour != 12:
        hour += 12
    elif meridiem == "am" and hour == 12:
        hour = 0
    elif not meridiem and 1 <= hour <= 7:
        hour += 12          # "at 6" in a shop's day means the evening
    return hour, minute


def _match(text: str) -> re.Match | None:
    return _RULE.match(text.strip())


def parse_rule(text: str) -> dict | None:
    m = _match(text)
    if not m or m.end() < len(text.strip().rstrip(".")):
        return None
    return _rule_from(m)


def _rule_from(m: re.Match) -> dict | None:
    if m.group("unit"):
        n = int(m.group("n") or 1)
        minutes = n * 60 if m.group("unit").lower().startswith(("hour", "hr")) else n
        return {"every_minutes": max(MIN_INTERVAL, minutes)}
    span = (m.group("span") or "").lower()
    if m.group("days"):
        days = sorted({_day_index(t) for t in re.findall(_DAY, m.group("days"), re.I)})
    elif span == "weekday":
        days = [0, 1, 2, 3, 4]
    elif span == "weekend":
        days = [5, 6]
    else:
        days = list(range(7))
    clock = _clock(m, _EVERY_DAY.get(span) or 9)
    if clock is None:
        return None
    return {"days": days, "hour": clock[0], "minute": clock[1]}


def next_after(rule: dict, after: datetime) -> datetime:
    if "every_minutes" in rule:
        return (after + timedelta(minutes=rule["every_minutes"])).replace(second=0, microsecond=0)
    for ahead in range(8):
        day = after.date() + timedelta(days=ahead)
        at = datetime(day.year, day.month, day.day, rule["hour"], rule["minute"], tzinfo=after.tzinfo)
        if day.weekday() in rule["days"] and at > after:
            return at
    raise ValueError("a routine needs at least one day")


def describe(rule: dict) -> str:
    if "every_minutes" in rule:
        n = rule["every_minutes"]
        return f"every {n // 60} hours" if n % 60 == 0 and n > 60 else ("every hour" if n == 60 else f"every {n} minutes")
    days = rule["days"]
    if days == list(range(7)):
        when = "every day"
    elif days == [0, 1, 2, 3, 4]:
        when = "every weekday"
    elif days == [5, 6]:
        when = "every weekend"
    else:
        names = [_DAY_NAMES[d].capitalize() for d in days]
        when = "every " + (" and ".join(names) if len(names) < 3 else ", ".join(names[:-1]) + " and " + names[-1])
    hour, minute = rule["hour"], rule["minute"]
    clock = f"{hour % 12 or 12}" + (f":{minute:02d}" if minute else "") + (" am" if hour < 12 else " pm")
    return f"{when} at {clock}"


def split(text: str) -> tuple[str, str] | None:
    """Split a chat message into its schedule and the thing to do, or None if it is not a routine."""
    m = _match(text)
    if not m or not _rule_from(m):
        return None
    command = text.strip()[m.end():].lstrip(" ,.;:-").strip()
    return (text.strip()[:m.end()].strip(), command) if command else None


_REMIND = re.compile(r"^\s*remind me\s+(?:to\s+|about\s+)?(.+)$", re.I | re.S)
Respond = Callable[[str], Awaitable[dict]]


class Routines:
    def __init__(self, store):
        self.store = store

    def add(self, command: str, when: str, now: datetime) -> dict:
        rule = parse_rule(when)
        if not command.strip():
            return {"ok": False, "error": "Tell me what to do each time, for example: check who is waiting on me."}
        if rule is None:
            return {"ok": False, "error": f"I couldn't read '{when}' as a schedule; try 'every Monday at 9am' or 'every 2 hours'."}
        row = self.store.add_routine(command, json.dumps(rule), describe(rule), next_after(rule, now).isoformat())
        self.store.audit("owner", "routine.add", "routine", str(row["id"]), f"{describe(rule)}: {command}")
        return {"ok": True, "routine": self._shape(row)}

    def list(self) -> list[dict]:
        return [self._shape(r) for r in self.store.list_routines()]

    def set_active(self, routine_id: int, active: bool, now: datetime | None = None) -> bool:
        row = next((r for r in self.store.list_routines() if r["id"] == routine_id), None)
        if row is None:
            return False
        # waking a paused routine starts from now, so it does not fire for every run it slept through
        next_at = next_after(json.loads(row["rule"]), now).isoformat() if active and now else None
        return self.store.set_routine(routine_id, active=active, next_at=next_at)

    def delete(self, routine_id: int) -> bool:
        return self.store.delete_routine(routine_id)

    async def run_due(self, now: datetime, respond: Respond) -> list[dict]:
        if executor.is_paused():
            return []
        key = f"routines.runs.{now.date().isoformat()}"
        used = int(self.store.get_value(key, "0") or 0)
        out = []
        for row in self.store.list_routines(due_before=now.isoformat()):
            if used >= DAILY_RUNS:
                break
            reply, actions = await self._run(row["command"], now, respond)
            used += 1
            self.store.set_value(key, str(used))
            self.store.record_routine_run(row["id"], next_after(json.loads(row["rule"]), now).isoformat(), reply)
            self.store.add_chat(row["command"], reply, "routine", actions)
            out.append({"id": row["id"], "command": row["command"], "reply": reply})
        return out

    async def _run(self, command: str, now: datetime, respond: Respond) -> tuple[str, list]:
        remind = _REMIND.match(command)
        if remind:
            self.store.add_reminder(remind.group(1).strip(), now.isoformat())
            return f"Reminder: {remind.group(1).strip()}", []
        try:
            with ai.using("routine"):
                result = await respond(command)
        except Exception as exc:   # one broken routine must not stop the others
            return f"That didn't work: {exc}", []
        actions = result.get("actions") or []
        waiting = [a for a in actions if a.get("status") == "needs_confirmation"]
        for action in waiting:
            executor.cancel(action["pending_id"])
        reply = result.get("reply", "")
        if waiting:
            what = "; ".join(a.get("summary", "an action") for a in waiting)
            reply = f"Skipped: this needs you to confirm ({what}). Ask me in Chat when you're there."
        return reply, actions

    @staticmethod
    def _shape(row: dict) -> dict:
        return {**row, "rule": json.loads(row["rule"]), "when": row["when_text"]}
