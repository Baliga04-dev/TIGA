"""Routes for the Prospects page: what the Analyst found, adding an email you found, skipping, run-now."""
import datetime
import json

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field

import config
import services
from mailer import MailerError

router = APIRouter(prefix="/api")


class ContactIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    email: str = Field(min_length=3, max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class RunIn(BaseModel):
    phase: str = Field(pattern="^(collect|write)$")


@router.get("/prospects")
def list_prospects(status: str = "", limit: int = 200) -> dict:
    store = services.get_store()
    statuses = [s for s in status.split(",") if s]
    return {"ok": True, "items": store.list_prospects(*statuses, limit=max(1, min(limit, 1000))),
            "counts": store.prospect_counts()}


@router.post("/prospects/{prospect_id}/contact")
async def add_contact(prospect_id: int, body: ContactIn) -> dict:
    try:
        draft = await services.get_analyst().draft_for(prospect_id, email=body.email)
    except (KeyError, MailerError) as exc:
        return {"ok": False, "error": str(exc).strip("'\"")}
    if draft is None:
        return {"ok": False, "error": services.get_store().get_prospect(prospect_id)["note"]}
    return {"ok": True, "draft": draft}


@router.post("/prospects/{prospect_id}/skip")
def skip(prospect_id: int) -> dict:
    try:
        return {"ok": True, "prospect": services.get_store().update_prospect(prospect_id, status="skipped",
                                                                             note="skipped by you")}
    except KeyError as exc:
        return {"ok": False, "error": str(exc).strip("'\"")}


@router.get("/analyst/status")
def status() -> dict:
    store = services.get_store()
    last = store.get_value("analyst.last", "")
    return {"ok": True, "counts": store.prospect_counts(), "last": json.loads(last) if last else None,
            "schedule": "Collects 16:00-02:00, drafts once after 02:00 (Bengaluru time)",
            "enabled": config.ANALYST_TICK_MINUTES > 0}


@router.post("/analyst/run")
async def run_now(body: RunIn) -> dict:
    result = await services.get_analyst().tick(datetime.datetime.now(datetime.timezone.utc), force=body.phase)
    return {"ok": True, "result": result}
