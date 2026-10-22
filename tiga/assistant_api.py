"""The owner's controls over the assistant: confirm or cancel a waiting action, pause or resume."""
from fastapi import APIRouter
from pydantic import BaseModel

import executor

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
