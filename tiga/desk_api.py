"""Routes behind the desk pages: report archive/preview/run-now, issue board, audit trail."""
import datetime

from fastapi import APIRouter
from pydantic import BaseModel

import jobs
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
    import config

    if not (config.ADMIN_REPORT_EMAIL or config.GMAIL_USER_EMAIL):
        return {"ok": False, "error": "Gmail is not configured: set GMAIL_USER_EMAIL in tiga/.env"}
    outcome = await jobs.run_configured_daily()
    delivery = outcome["report"]
    return {"ok": bool(delivery.get("ok")), **({"error": delivery["error"]} if not delivery.get("ok") else {}),
            "outcome": outcome}


@router.get("/issues")
def list_issues(status: str = "") -> dict:
    return {"ok": True, "items": services.get_store().list_issues(status or None)}


@router.post("/issues/{issue_id}/transition")
def transition_issue(issue_id: int, body: TransitionIn) -> dict:
    try:
        return {"ok": True, "issue": services.get_store().transition_issue(issue_id, body.status, actor="user")}
    except (TransitionError, KeyError) as exc:
        return {"ok": False, "error": str(exc).strip("'\"")}


@router.get("/audit")
def audit_log() -> dict:
    return {"ok": True, "items": services.get_store().audit_log()}
