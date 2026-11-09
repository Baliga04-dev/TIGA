"""The phone remote: when music drowns out the PC's microphone, the owner talks to Tiga from their phone.

Off unless TIGA_PHONE is set, which makes Tiga listen on the home Wi-Fi. `main.py` then lets other devices reach only
the routes here; everything below `/api/phone/` needs the pairing code (header `X-Tiga-Phone`), which the PC shows as
a QR code on the Settings page. Commands go through `brain.respond` and buttons through `executor.execute`, so tiers,
confirmations, the pause switch and the audit log apply exactly as in Chat.

Interface: `router`, `token(store)`, `new_token(store)`, `pairing(store)`.
"""
from __future__ import annotations

import hmac
import secrets
import socket
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

import billing
import brain
import config
import executor
import services
from store import Store

PAGE_DIR = Path(__file__).parent / "static" / "phone"
ASSETS = {"phone.js": "text/javascript", "phone.css": "text/css", "manifest.webmanifest": "application/manifest+json",
          "icon.svg": "image/svg+xml"}
CSP = ("default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; "
       "manifest-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
BUTTONS: dict[str, tuple[str, dict]] = {
    "play_pause": ("media", {"action": "play_pause"}), "previous": ("media", {"action": "previous"}),
    "next": ("media", {"action": "next"}), "volume_down": ("volume", {"action": "down"}),
    "volume_up": ("volume", {"action": "up"}), "mute": ("volume", {"action": "mute"}),
}
HOW = ("Add TIGA_PHONE=on to tiga/.env, run phone_setup.ps1 once in an administrator PowerShell (it lets your Wi-Fi "
       "reach Tiga), restart WSL, then start Tiga again.")
_KEY = "phone.token"

router = APIRouter()


def token(store: Store) -> str:
    saved = store.get_value(_KEY, "")
    return saved or new_token(store)


def new_token(store: Store) -> str:
    """A new pairing code; a phone paired with the old one is locked out."""
    code = secrets.token_urlsafe(24)
    store.set_value(_KEY, code)
    store.audit("user", "phone.pair", "phone", "-", "new pairing code")
    return code


def lan_address() -> str:
    """This machine's address on the local network (no packet is sent), or '' when there is no network."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        return s.getsockname()[0]
    except OSError:
        return ""
    finally:
        s.close()


def _wsl_nat(address: str) -> bool:
    """WSL's default network mode hides it behind a private 172.16-31.x address the phone can't reach."""
    try:
        wsl = "microsoft" in Path("/proc/version").read_text().lower()
    except OSError:
        wsl = False
    parts = address.split(".")
    return wsl and len(parts) == 4 and parts[0] == "172" and 16 <= int(parts[1]) <= 31


def pairing(store: Store) -> dict:
    if not config.PHONE_ENABLED:
        return {"ok": True, "enabled": False, "how": HOW}
    address = lan_address()
    code = token(store)
    url = f"http://{address or 'localhost'}:{config.PORT}/phone#k={code}"
    hint = ("WSL is in its default network mode, so your phone can't reach this address yet: run phone_setup.ps1 "
            "once as administrator, then restart WSL." if _wsl_nat(address) else
            "Your phone must be on the same Wi-Fi. If the page doesn't open, run phone_setup.ps1 once as administrator.")
    return {"ok": True, "enabled": True, "url": url, "token": code, "address": address, "hint": hint,
            "qr_svg": billing.qr_svg(url)}


def _enabled() -> None:
    if not config.PHONE_ENABLED:
        raise HTTPException(status_code=404, detail="The phone remote is off")


def _paired(x_tiga_phone: str = Header(default="")) -> None:
    _enabled()
    if not x_tiga_phone or not hmac.compare_digest(x_tiga_phone, token(services.get_store())):
        raise HTTPException(status_code=401, detail="This phone isn't paired: scan the QR code on Tiga's Settings page")


# --- the page --------------------------------------------------------------------------------------
@router.get("/phone", dependencies=[Depends(_enabled)])
def page() -> FileResponse:
    return FileResponse(PAGE_DIR / "index.html", media_type="text/html",
                        headers={"Content-Security-Policy": CSP, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer"})


@router.get("/phone/{name}", dependencies=[Depends(_enabled)])
def asset(name: str) -> FileResponse:
    if name not in ASSETS:
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(PAGE_DIR / name, media_type=ASSETS[name])


# --- what the phone can do -----------------------------------------------------------------------------
class CommandIn(BaseModel):
    text: str = Field(min_length=1, max_length=500)
    history: list = Field(default_factory=list, max_length=12)


class PressIn(BaseModel):
    button: Literal["play_pause", "previous", "next", "volume_down", "volume_up", "mute"]


def _action(a: dict) -> dict:
    return {"tool": a["tool"], "ok": a["ok"], "status": a.get("status", ""), "pending_id": a.get("pending_id", ""),
            "summary": a.get("summary", ""), "error": "" if a["ok"] else str(a.get("result", {}).get("error", ""))}


@router.post("/api/phone/command", dependencies=[Depends(_paired)])
async def command(body: CommandIn) -> dict:
    text = body.text.strip()
    result = await brain.respond(text, body.history)
    actions = [_action(a) for a in result["actions"]]
    services.get_store().add_chat(text, result["reply"], result["mode"],
                                  [{"tool": a["tool"], "ok": a["ok"], "status": a["status"], "from": "phone"} for a in actions])
    return {"ok": True, "reply": result["reply"], "mode": result["mode"], "actions": actions}


@router.post("/api/phone/press", dependencies=[Depends(_paired)])
async def press(body: PressIn) -> dict:
    tool, args = BUTTONS[body.button]
    action = await executor.execute(tool, args)
    return {"ok": action["ok"], **({} if action["ok"] else {"error": action["result"].get("error", "That didn't work")})}


@router.post("/api/phone/actions/{pending_id}/confirm", dependencies=[Depends(_paired)])
async def confirm(pending_id: str) -> dict:
    try:
        action = await executor.confirm(pending_id)
    except executor.ConfirmationError as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": action["ok"], **({} if action["ok"] else {"error": action["result"].get("error", "failed")})}


@router.post("/api/phone/actions/{pending_id}/cancel", dependencies=[Depends(_paired)])
def cancel(pending_id: str) -> dict:
    return {"ok": executor.cancel(pending_id)}


@router.get("/api/phone/state", dependencies=[Depends(_paired)])
def state() -> dict:
    """Whether the assistant is paused, and the reminders that are due (a warm reply, a call to make)."""
    now = datetime.now(timezone.utc).astimezone(ZoneInfo(config.TIMEZONE)).isoformat()
    due = services.get_store().list_reminders("pending", due_before=now)
    return {"ok": True, "paused": executor.is_paused(), "reminders": [{"id": r["id"], "text": r["text"]} for r in due]}


@router.post("/api/phone/reminders/{reminder_id}/done", dependencies=[Depends(_paired)])
def reminder_done(reminder_id: int) -> dict:
    return {"ok": services.get_store().close_reminder(reminder_id, "done")}


# --- on the PC: pairing ------------------------------------------------------------------------------
@router.get("/api/settings/phone")
def settings() -> dict:
    return pairing(services.get_store())


@router.post("/api/settings/phone/new-code", dependencies=[Depends(_enabled)])
def settings_new_code() -> dict:
    new_token(services.get_store())
    return pairing(services.get_store())
