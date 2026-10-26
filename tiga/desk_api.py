"""Routes behind the desk pages: report archive/preview/run-now, issue board, audit trail."""
import datetime

from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel

import deals
import devbot
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
        money=deals.money_summary(store.list_deals(), today=datetime.date.today()),
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


class DevRunIn(BaseModel):
    issue_id: int | None = None


@router.get("/dev")
def dev_status() -> dict:
    return {"ok": True, **devbot.DevBot(services.get_store()).status()}


@router.post("/dev/run")
async def dev_run(body: DevRunIn, background: BackgroundTasks) -> dict:
    """Start the Dev bot on an approved issue; it works in the background and the issue shows how it went."""
    bot = devbot.DevBot(services.get_store())
    problem = bot.precheck(body.issue_id)
    if problem:
        return {"ok": False, "error": problem}
    background.add_task(bot.run, body.issue_id)
    return {"ok": True, "started": True}


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
    """Research now (at most twice a day by hand). The report is saved in Tiga and mailed only if Gmail works."""
    import asyncio
    from pathlib import Path

    import config

    to = config.ADMIN_REPORT_EMAIL or config.GMAIL_USER_EMAIL
    gmail_ready = bool(to) and Path(config.GMAIL_CREDENTIALS_FILE).exists()
    today = datetime.date.today()
    return await asyncio.to_thread(
        lambda: rnd.run(services.get_store(), context=jobs.rnd_context(today), guide=jobs.rnd_guide(),
                        research=rnd.default_research(),
                        send=services.send_email if gmail_ready else (lambda *_: {"ok": False, "error": "Gmail is not configured"}),
                        to=to if gmail_ready else "", today=today, manual=True))


@router.get("/rnd/status")
def rnd_status() -> dict:
    return {"ok": True, **rnd.status(services.get_store(), datetime.date.today())}


@router.get("/audit")
def audit_log() -> dict:
    return {"ok": True, "items": services.get_store().audit_log()}
