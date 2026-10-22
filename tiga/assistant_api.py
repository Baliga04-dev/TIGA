"""The owner's controls over the assistant: confirm or cancel a waiting action, pause or resume."""
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter
from pydantic import BaseModel, Field

import briefing
import config
import executor
import routines
import services
from when import parse_when

router = APIRouter(prefix="/api")


class PauseIn(BaseModel):
    paused: bool


@router.post("/actions/{pending_id}/confirm")
async def confirm(pending_id: str) -> dict:
    try:
        action = await executor.confirm(pending_id)
    except executor.ConfirmationError as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": action["ok"], "action": action, **({} if action["ok"] else {"error": action["result"].get("error", "failed")})}


@router.post("/actions/{pending_id}/cancel")
def cancel(pending_id: str) -> dict:
    return {"ok": executor.cancel(pending_id)}


@router.get("/assistant")
def state() -> dict:
    return {"ok": True, "paused": executor.is_paused()}


@router.post("/assistant")
def set_state(body: PauseIn) -> dict:
    executor.set_paused(body.paused)
    return {"ok": True, "paused": body.paused}


class ReminderIn(BaseModel):
    text: str = Field(min_length=1, max_length=500)
    when: str = Field(min_length=1, max_length=100)


class RoutineIn(BaseModel):
    command: str = Field(min_length=1, max_length=500)
    when: str = Field(min_length=1, max_length=100)


class RoutineState(BaseModel):
    active: bool


def _now():
    return datetime.now(ZoneInfo(config.TIMEZONE))


@router.get("/routines")
def list_routines() -> dict:
    return {"ok": True, "items": routines.Routines(services.get_store()).list()}


@router.post("/routines")
def add_routine(body: RoutineIn) -> dict:
    return routines.Routines(services.get_store()).add(body.command, body.when, _now())


@router.post("/routines/{routine_id}")
def set_routine(routine_id: int, body: RoutineState) -> dict:
    return {"ok": routines.Routines(services.get_store()).set_active(routine_id, body.active, _now())}


@router.delete("/routines/{routine_id}")
def delete_routine(routine_id: int) -> dict:
    return {"ok": routines.Routines(services.get_store()).delete(routine_id)}


class NoteIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


@router.get("/reminders")
def reminders() -> dict:
    return {"ok": True, "items": services.get_store().list_reminders("pending")}


@router.get("/reminders/due")
def due_reminders() -> dict:
    now = datetime.now(timezone.utc).astimezone(ZoneInfo(config.TIMEZONE)).isoformat()
    return {"ok": True, "items": services.get_store().list_reminders("pending", due_before=now)}


@router.post("/reminders")
def add_reminder(body: ReminderIn) -> dict:
    due = parse_when(body.when, datetime.now(ZoneInfo(config.TIMEZONE)))
    if due is None:
        return {"ok": False, "error": f"I couldn't tell when '{body.when}' is; try 'at 5pm' or 'in 30 minutes'"}
    return {"ok": True, "reminder": services.get_store().add_reminder(body.text, due.isoformat())}


@router.post("/reminders/{reminder_id}/{outcome}")
def close_reminder(reminder_id: int, outcome: str) -> dict:
    if outcome not in ("done", "dismissed"):
        return {"ok": False, "error": "outcome must be done or dismissed"}
    return {"ok": services.get_store().close_reminder(reminder_id, outcome)}


@router.get("/notes")
def notes() -> dict:
    return {"ok": True, "items": services.get_store().list_notes()}


@router.post("/notes")
def add_note(body: NoteIn) -> dict:
    return {"ok": True, "note": services.get_store().add_note(body.text)}


@router.delete("/notes/{note_id}")
def delete_note(note_id: int) -> dict:
    return {"ok": services.get_store().delete_note(note_id)}


@router.get("/briefing")
async def get_briefing() -> dict:
    out = await briefing.build(services.get_store(), services.get_mailer(), datetime.now(ZoneInfo(config.TIMEZONE)))
    return {"ok": True, **out}
