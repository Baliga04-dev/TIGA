"""The only way an assistant tool runs.

Interface: `await execute(name, args, turn=None) -> Action`, `await confirm(pending_id)`, `cancel(pending_id)`,
`set_paused(bool)` / `is_paused()`. Every tool has a tier:
  READ (0)      runs freely
  LOCAL (1)     local and reversible (open a link, play music, write a draft); runs, unless untrusted
                content (mail, web pages) was read earlier in the same turn, then it needs a click
  OUTWARD (2)   reaches other people or can't be undone; always needs a click
  FORBIDDEN (3) never runs (passwords, payments, shell)
A click is a single-use, server-issued pending id that expires; the model can never confirm anything.
Every call, refusal and confirmation is written to the audit log.
"""
from __future__ import annotations

import inspect
import json
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import services
import tools

READ, LOCAL, OUTWARD, FORBIDDEN = 0, 1, 2, 3
TIERS: dict[str, int] = {
    "get_metrics": READ,
    "get_email_summary": READ,
    "fetch_recent_emails": READ,
    "generate_cold_email_template": READ,
    "open_tab": LOCAL,
    "play_youtube": LOCAL,
    "draft_email": LOCAL,
    "volume": LOCAL,
    "media": LOCAL,
    "open_app": LOCAL,
    "lock_screen": OUTWARD,
    "remind_me": LOCAL,
    "take_note": LOCAL,
    "list_reminders": READ,
    "morning_briefing": READ,
    "list_tabs": READ,
    "read_page": READ,
    "summarize_page": READ,
    "switch_tab": LOCAL,
    "close_tabs": OUTWARD,
    "book_call": OUTWARD,
}
# Tools whose results may contain text written by strangers (possible prompt injection).
UNTRUSTED = {"fetch_recent_emails", "get_email_summary", "read_page", "summarize_page"}
CONFIRM_WINDOW = timedelta(minutes=10)
_PAUSE_KEY = "assistant.paused"


class ConfirmationError(RuntimeError):
    pass


@dataclass
class Turn:
    """One user request. Once it has read untrusted content, every non-read action needs a click."""
    read_untrusted: bool = False


def _now() -> datetime:
    return datetime.now(timezone.utc)


def tier(name: str) -> int | None:
    return TIERS.get(name)


def is_outward(name: str) -> bool:
    return (TIERS.get(name) or READ) >= LOCAL


def set_paused(paused: bool) -> None:
    store = services.get_store()
    store.set_value(_PAUSE_KEY, "1" if paused else "")
    store.audit("user", "assistant.pause" if paused else "assistant.resume", "assistant", "-")


def is_paused() -> bool:
    return services.get_store().get_value(_PAUSE_KEY) == "1"


def _refusal(name: str, args: dict, error: str) -> dict:
    return {"tool": name, "args": args or {}, "result": {"ok": False, "error": error}, "ok": False, "ms": 0}


def _summary(name: str, args: dict) -> str:
    shown = ", ".join(f"{k}={str(v)[:60]}" for k, v in (args or {}).items())
    return f"{name.replace('_', ' ')}({shown})"


async def execute(name: str, args: dict, turn: Turn | None = None) -> dict:
    turn = turn or Turn()
    store = services.get_store()
    level = TIERS.get(name)
    if level is None or level == FORBIDDEN:
        store.audit("assistant", "tool.refused", "tool", name, "not allowed")
        return _refusal(name, args, f"'{name}' is not something I'm allowed to do")
    if is_paused():
        store.audit("assistant", "tool.refused", "tool", name, "paused")
        return _refusal(name, args, "I'm paused; say 'resume' first")
    if level == OUTWARD or (level == LOCAL and turn.read_untrusted):
        pending_id = uuid.uuid4().hex
        summary = _summary(name, args)
        store.add_pending(pending_id, name, args or {}, summary, (_now() + CONFIRM_WINDOW).isoformat())
        action = _refusal(name, args, "waiting for your confirmation")
        return {**action, "status": "needs_confirmation", "pending_id": pending_id, "summary": summary}
    action = await run_tool(name, args)
    store.audit("assistant", "tool.run", "tool", name, json.dumps(action["args"], default=str)[:300])
    if name in UNTRUSTED:
        turn.read_untrusted = True
    return action


async def confirm(pending_id: str) -> dict:
    store = services.get_store()
    pending = store.take_pending(pending_id)
    if pending is None:
        raise ConfirmationError("That action was already handled, cancelled or never existed")
    if datetime.fromisoformat(pending["expires_at"]) < _now():
        raise ConfirmationError("That confirmation expired; ask again")
    if is_paused():
        raise ConfirmationError("I'm paused; say 'resume' first")
    action = await run_tool(pending["tool"], pending["args"])
    store.audit("user", "tool.confirmed", "tool", pending["tool"], pending["summary"])
    return action


def cancel(pending_id: str) -> bool:
    return services.get_store().cancel_pending(pending_id)


# --- the raw tool call (no policy); only this module may use it -----------------------------
def _coerce(value, annotation):
    """Convert a tool argument to the type the tool function declares."""
    if annotation is bool:
        if isinstance(value, str):
            return value.strip().lower() in {"1", "true", "yes", "y"}
        return bool(value)
    if annotation is int:
        try:
            return int(value)
        except (TypeError, ValueError):
            return None
    return str(value)[:4000]


async def run_tool(name: str, args: dict) -> dict:
    func = tools.TOOL_FUNCS.get(name)
    if func is None:
        return _refusal(name, args, f"unknown tool '{name}'")
    params = {}
    wanted = inspect.signature(func).parameters
    for key, value in (args or {}).items():
        if key in wanted and value not in (None, ""):
            coerced = _coerce(value, wanted[key].annotation)
            if coerced is not None:
                params[key] = coerced
    try:
        result = await func(**params) if params else await func()
    except Exception as exc:
        result = {"ok": False, "source": "error", "error": f"{type(exc).__name__}: {exc}"}
    return {"tool": name, "args": params, "result": result, "ok": bool(result.get("ok", True)),
            "ms": int(result.get("ms", 0))}
