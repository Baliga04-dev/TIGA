"""Routes behind the desk pages: report archive/preview/run-now, issue board, audit trail."""
import datetime

from fastapi import APIRouter
from pydantic import BaseModel

import jobs
import rnd
import reports
import services
from store import TransitionError

router = APIRouter(prefix="/api")


class TransitionIn(BaseModel):
    status: str


@router.get("/reports")
def list_reports() -> dict:
    return {"ok": True, "items": services.get_store().list_reports()}


@router.get("/reports/preview")
def preview_report() -> dict:
    """What today's mail would say right now. Sends nothing and does not use up the day's send."""
    store, mailer = services.get_store(), services.get_mailer()
    report = reports.build_daily_report(
        scorecard=mailer.scorecard(), followups_due=0, issues=store.list_issues(),
        cycle=None, sync=None, today=datetime.date.today(),
    )
    return {"ok": True, **report}


@router.post("/reports/daily/run")
async def run_daily_now() -> dict:
    """Build today's report (always saved in the app) and email it if Gmail is available."""
    outcome = await jobs.run_configured_daily()
    delivery = outcome["report"]
    emailed = bool(delivery.get("ok")) and "skipped" not in delivery
    return {"ok": True, "emailed": emailed, "email_error": delivery.get("error", ""), "outcome": outcome}


@router.get("/issues")
def list_issues(status: str = "") -> dict:
    return {"ok": True, "items": services.get_store().list_issues(status or None)}


@router.post("/issues/{issue_id}/transition")
def transition_issue(issue_id: int, body: TransitionIn) -> dict:
    try:
        return {"ok": True, "issue": services.get_store().transition_issue(issue_id, body.status, actor="user")}
    except (TransitionError, KeyError) as exc:
        return {"ok": False, "error": str(exc).strip("'\"")}


class SkillIn(BaseModel):
    text: str


@router.get("/skills")
def list_skills() -> dict:
    return {"ok": True, "items": services.get_skills().names()}


@router.get("/skills/{name}")
def read_skill(name: str) -> dict:
    try:
        return {"ok": True, "name": name, "text": services.get_skills().read(name)}
    except KeyError as exc:
        return {"ok": False, "error": str(exc).strip("'\"")}


@router.put("/skills/{name}")
def write_skill(name: str, body: SkillIn) -> dict:
    try:
        services.get_skills().write(name, body.text)
    except (KeyError, ValueError) as exc:
        return {"ok": False, "error": str(exc).strip("'\"")}
    services.get_store().audit("user", "skill.edit", "skill", name)
    return {"ok": True}


@router.post("/rnd/run")
async def run_rnd_now() -> dict:
    import asyncio
    import config

    to = config.ADMIN_REPORT_EMAIL or config.GMAIL_USER_EMAIL
    if not to:
        return {"ok": False, "error": "Gmail is not configured: set GMAIL_USER_EMAIL in tiga/.env"}
    return await asyncio.to_thread(
        rnd.run_weekly, services.get_store(), services.get_mailer().scorecard(), services.send_email, to,
        datetime.date.today(),
    )


@router.get("/audit")
def audit_log() -> dict:
    return {"ok": True, "items": services.get_store().audit_log()}
