"""The daily run: check replies, draft follow-ups, run the tester, sync, then send the report.

Each step is isolated: a failure is recorded and reported, never allowed to skip the mail.
"""
from __future__ import annotations

import asyncio
from datetime import date
from pathlib import Path
from typing import Awaitable, Callable

import codesync
import config
import crew
import deals
import reports
import rnd
import services
from mailer import Mailer
from store import Store


async def run_daily(*, store: Store, mailer: Mailer, fetch_thread: Callable[[str], list[dict]],
                    send: Callable[[str, str, str], dict], to: str,
                    cycle_fn: Callable[[], Awaitable[dict]], sync_fn: Callable[[], Awaitable[dict]] | None,
                    today: date, own_address: str = "") -> dict:
    errors: list[str] = []

    changed = 0
    try:
        changed = await asyncio.to_thread(mailer.check_replies, fetch_thread, own_address=own_address)
    except Exception as exc:
        errors.append(f"reply check failed: {exc}")

    followups = []
    try:
        followups = mailer.due_followups()
    except Exception as exc:
        errors.append(f"follow-ups failed: {exc}")

    cycle = None
    try:
        cycle = await cycle_fn()
        for check in cycle.get("tester", {}).get("checks", []):
            if not check["ok"]:
                store.open_issue("bug", f"Tester: {check['name']} failing", dedupe_key=f"tester:{check['name']}",
                                 source="tester", body=check["detail"], severity="high")
    except Exception as exc:
        errors.append(f"agent cycle failed: {exc}")

    sync = None
    if sync_fn is not None:
        try:
            sync = await sync_fn()
        except Exception as exc:
            errors.append(f"sync failed: {exc}")
            sync = {"ok": False, "error": str(exc)}

    report = reports.build_daily_report(
        scorecard=mailer.scorecard(), followups_due=len(followups), issues=store.list_issues(),
        cycle=cycle, sync=sync, today=today, money=deals.money_summary(store.list_deals(), today=today),
    )
    if errors:
        report["body"] += "\n\nSTEP ERRORS\n" + "\n".join(errors)
    delivery = await asyncio.to_thread(reports.send_daily, store, send, to, report)
    return {"report": delivery, "replies_changed": changed, "followups": len(followups), "errors": errors}


async def run_configured_daily() -> dict:
    """run_daily wired to the real store, Gmail, tester and GitHub sync from config."""
    import datetime

    to = config.ADMIN_REPORT_EMAIL or config.GMAIL_USER_EMAIL
    gmail_ready = bool(to) and Path(config.GMAIL_CREDENTIALS_FILE).exists()
    outcome = await run_daily(
        store=services.get_store(),
        mailer=services.get_mailer(),
        fetch_thread=services.fetch_thread,
        send=services.send_email if gmail_ready else (lambda *_: {"ok": False, "error": "Gmail is not configured"}),
        to=to,
        cycle_fn=lambda: crew.run_agent_cycle(),
        sync_fn=(lambda: codesync.push_daily_branch(datetime.date.today())) if config.GITHUB_TOKEN else None,
        today=datetime.date.today(),
        own_address=config.GMAIL_USER_EMAIL,
    )
    if gmail_ready:  # idempotent per ISO week: the first daily run of a week sends the R&D report
        try:
            outcome["rnd"] = await asyncio.to_thread(
                rnd.run_weekly, services.get_store(), services.get_mailer().scorecard(), services.send_email, to,
                datetime.date.today(),
            )
        except Exception as exc:
            outcome["errors"].append(f"R&D report failed: {exc}")
    return outcome
