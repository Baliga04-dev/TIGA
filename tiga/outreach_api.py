"""HTTP routes for the lead finder and the approval-gated mailer.

Domain refusals (suppressed address, locked draft, missing postal address) come back
as 200 `{ok: false, error}`, matching the rest of the API.
"""
import asyncio

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field

import config
import drafter
import leads
import services
from mailer import MailerError

router = APIRouter(prefix="/api")


class _In(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)


class LeadFindIn(_In):
    topics: list[str] = Field(min_length=1, max_length=10)
    limit: int = Field(default=30, ge=1, le=100)


class DraftIn(_In):
    email: str = Field(min_length=3, max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    subject: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1, max_length=5000)
    company: str = Field(default="", max_length=200)
    lead_url: str = Field(default="", max_length=1000)
    source_note: str = Field(default="", max_length=300)
    region: str = Field(default="", max_length=40)


class AutoDraftIn(_In):
    email: str = Field(min_length=3, max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    lead_title: str = Field(default="", max_length=300)
    lead_url: str = Field(default="", max_length=1000)
    signals: list[str] = Field(default_factory=list, max_length=10)
    company: str = Field(default="", max_length=200)
    source_note: str = Field(default="", max_length=300)
    region: str = Field(default="", max_length=40)


class DraftEditIn(_In):
    subject: str | None = Field(default=None, min_length=1, max_length=200)
    body: str | None = Field(default=None, min_length=1, max_length=5000)


class SuppressIn(_In):
    address: str = Field(min_length=3, max_length=254)
    reason: str = Field(default="manual", max_length=200)


def _guard(fn):
    try:
        return fn()
    except (MailerError, KeyError) as exc:
        return {"ok": False, "error": str(exc).strip("'\"")}


@router.post("/leads/find")
async def find_leads(body: LeadFindIn) -> dict:
    try:
        result = await leads.find_leads(body.topics, limit=body.limit)
    except ValueError as exc:
        return {"ok": False, "error": str(exc)}
    return {
        "ok": bool(result.leads) or not result.errors,
        "leads": [lead.__dict__ | {"signals": list(lead.signals)} for lead in result.leads],
        "errors": result.errors,
    }


@router.post("/outreach/drafts")
def create_draft(body: DraftIn) -> dict:
    return _guard(lambda: {"ok": True, "draft": services.get_mailer().draft(**body.model_dump())})


@router.post("/outreach/auto-draft")
async def auto_draft(body: AutoDraftIn) -> dict:
    """The bot writes the email; it is saved as a draft that still needs your approval."""
    if not config.SENDER_NAME:
        return {"ok": False, "error": "Set TIGA_SENDER_NAME in tiga/.env so drafts can be signed"}
    lead = {"title": body.lead_title, "signals": body.signals, "company": body.company}
    text = await asyncio.to_thread(
        drafter.write_draft, lead, sender_name=config.SENDER_NAME, offer=config.OFFER,
        complete=services.llm_complete(),
    )
    return _guard(lambda: {"ok": True, "draft": services.get_mailer().draft(
        email=body.email, subject=text["subject"], body=text["body"], company=body.company,
        lead_url=body.lead_url, source_note=body.source_note, region=body.region)})


@router.get("/outreach")
def list_outreach(status: str = "") -> dict:
    statuses = [s for s in status.split(",") if s]
    return {"ok": True, "items": services.get_store().list_outreach(*statuses)}


@router.patch("/outreach/{outreach_id}")
def edit_draft(outreach_id: int, body: DraftEditIn) -> dict:
    def edit():
        row = services.get_mailer().get(outreach_id)
        if row["status"] != "drafted":
            raise MailerError(f"a {row['status']} mail can't be edited; only drafts can")
        changes = body.model_dump(exclude_none=True)
        return {"ok": True, "draft": services.get_store().update_outreach(outreach_id, actor="user", **changes)}

    return _guard(edit)


@router.post("/outreach/{outreach_id}/approve")
def approve(outreach_id: int) -> dict:
    return _guard(lambda: {"ok": True, "draft": services.get_mailer().approve(outreach_id)})


@router.post("/outreach/{outreach_id}/reject")
def reject(outreach_id: int) -> dict:
    return _guard(lambda: {"ok": True, "draft": services.get_mailer().reject(outreach_id)})


@router.post("/outreach/send-next")
async def send_next() -> dict:
    try:
        sent = await asyncio.to_thread(services.get_mailer().send_next)
    except (MailerError, RuntimeError) as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "sent": sent}


@router.post("/outreach/check-replies")
async def check_replies() -> dict:
    try:
        changed = await asyncio.to_thread(
            services.get_mailer().check_replies, services.fetch_thread, own_address=config.GMAIL_USER_EMAIL
        )
    except RuntimeError as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "changed": changed}


@router.post("/outreach/followups")
def draft_followups() -> dict:
    return {"ok": True, "drafts": services.get_mailer().due_followups()}


@router.get("/outreach/scorecard")
def scorecard() -> dict:
    return {"ok": True, "scorecard": services.get_mailer().scorecard()}


@router.get("/suppressions")
def list_suppressions() -> dict:
    return {"ok": True, "items": services.get_store().suppressions()}


@router.post("/suppressions")
def add_suppression(body: SuppressIn) -> dict:
    services.get_store().suppress(body.address, reason=body.reason)
    return {"ok": True}
