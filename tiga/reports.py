"""The daily report mail: outreach scorecard first, system health second.

Interface: `build_daily_report(...)` is pure (data in, {status, subject, body} out);
`send_daily(store, send, to, report)` sends at most once per day and archives it.
"""
from __future__ import annotations

from datetime import date
from typing import Callable

from store import Store

_TAG = {"red": "[RED]", "amber": "[ACTION]", "green": "[OK]"}


def build_daily_report(*, scorecard: dict, followups_due: int, issues: list[dict], cycle: dict | None,
                       sync: dict | None, today: date) -> dict:
    card = scorecard
    problems = []
    if cycle is not None and not cycle.get("ok", True):
        problems.append("tests failing")
    if sync is not None and not sync.get("ok", True):
        problems.append("GitHub sync failed")
    needs_you = card["awaiting_approval"] > 0 or followups_due > 0
    status = "red" if problems else "amber" if needs_you else "green"

    lines = [
        f"Tiga daily report, {today.isoformat()}",
        f"Status: {status.upper()}" + (f" ({', '.join(problems)})" if problems else ""),
        "",
        "OUTREACH",
        f"Sent today: {card['sent_today']} of {card['daily_cap']} (this week: {card['sent_week']})",
        f"Replies: {card['replies']} ({card['interested']} interested, {card['declined']} declined, "
        f"{card['unsubscribed']} unsubscribed, {card['bounced']} bounced)",
        f"Follow-ups sent: {card['followups_sent']}",
        f"Follow-ups due: {followups_due}",
        f"Waiting for your approval: {card['awaiting_approval']}",
        "Pipeline: " + (", ".join(f"{name} {n}" for name, n in sorted(card["pipeline"].items())) or "empty"),
        "",
        "SYSTEM",
    ]
    if cycle is not None:
        checks = cycle.get("tester", {}).get("checks", [])
        lines.append("Tester: " + ("passed" if cycle.get("ok") else "FAILED"))
        lines += [f"  {'ok ' if c['ok'] else 'FAIL'} {c['name']}: {c['detail']}" for c in checks]
    if sync is not None:
        lines.append("GitHub sync: " + ("ok" if sync.get("ok") else f"FAILED ({sync.get('error', 'unknown')})"))
    open_issues = [i for i in issues if i["status"] not in ("done", "rejected")]
    lines.append(f"Open issues: {len(open_issues)}")
    lines += [f"  #{i['id']} {i['title']} [{i['status']}] x{i['occurrences']}" for i in open_issues]
    return {"status": status, "subject": f"{_TAG[status]} Tiga daily report {today.isoformat()}",
            "body": "\n".join(lines), "date": today.isoformat()}


def send_daily(store: Store, send: Callable[[str, str, str], dict], to: str, report: dict) -> dict:
    """Archive the report (always viewable in the app), then email it once per date.

    A failed or unavailable email never loses the report: it stays in the archive with the reason,
    and the claim is released so the next run retries.
    """
    day = report["date"]
    report_id = store.save_report("daily", day, report["subject"], report["body"], to)
    if not store.claim_job("daily_report", day):
        return {"ok": True, "skipped": f"already sent for {day}", "report_id": report_id}
    try:
        result = send(to, report["subject"], report["body"])
    except Exception as exc:  # the claim must be released whatever the sender raised
        result = {"ok": False, "error": f"{type(exc).__name__}: {exc}"}
    if not result.get("ok"):
        error = result.get("error", "send failed")
        store.mark_report_unsent(report_id, error)
        store.release_job("daily_report", day)
        return {"ok": False, "error": error, "report_id": report_id, "archived": True}
    store.mark_report_sent(report_id)
    return {"ok": True, "report_id": report_id}
