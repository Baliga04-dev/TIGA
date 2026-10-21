"""R&D bot: reads the outreach numbers and the issue board, files improvement proposals, mails a weekly report.

Rule-based on purpose: every proposal cites the number that triggered it. It proposes; it never changes code or skills.
"""
from __future__ import annotations

from datetime import date
from typing import Callable

from store import Store

MAX_PROPOSALS = 5


def analyze(card: dict, issues: list[dict]) -> list[dict]:
    sent = card["sent_week"]
    proposals = []

    def add(key: str, title: str, body: str):
        proposals.append({"key": f"rnd:{key}", "title": title, "body": body})

    if sent == 0:
        add("idle", "No mail went out this week",
            "Find leads, draft and approve emails; check the daily cap and the approval backlog.")
    if sent >= 10 and card["replies"] / sent < 0.10:
        add("reply-rate", f"Reply rate is {card['replies'] / sent:.0%} ({card['replies']} of {sent})",
            "Test shorter subjects and a more specific first line; compare which drafts get replies.")
    if sent and card["bounced"] / sent >= 0.03:
        add("bounces", f"Bounce rate is {card['bounced'] / sent:.0%}",
            "Verify addresses on the company's own site before drafting. Pause sending above 2%.")
    if sent and card["unsubscribed"] / sent >= 0.05:
        add("unsubscribes", f"{card['unsubscribed']} unsubscribe replies from {sent} sends",
            "Review who is being targeted and whether the opening feels relevant; tighten lead scoring.")
    if card["awaiting_approval"] >= 10:
        add("backlog", f"Approval backlog: {card['awaiting_approval']} drafts waiting",
            "Approve or reject drafts, or reduce how many leads are drafted per day.")
    for issue in issues:
        if issue["status"] not in ("done", "rejected") and issue["occurrences"] >= 3:
            add(f"issue-{issue['id']}", f"Stabilise: {issue['title']} (seen {issue['occurrences']} times)",
                "Repeating failure. Investigate the root cause rather than the symptom.")
    return proposals[:MAX_PROPOSALS]


def run_weekly(store: Store, card: dict, send: Callable[[str, str, str], dict], to: str, today: date) -> dict:
    """File proposals and send the weekly report, once per ISO week."""
    year, week, _ = today.isocalendar()
    key = f"{year}-W{week:02d}"
    if not store.claim_job("rnd_weekly", key):
        return {"ok": True, "skipped": f"already ran for {key}"}
    proposals = analyze(card, store.list_issues())
    for p in proposals:
        store.open_issue("improvement", p["title"], dedupe_key=p["key"], source="rnd", body=p["body"])
    lines = [f"Tiga weekly R&D report, {key}", "",
             f"Sent this week: {card['sent_week']}; replies {card['replies']} "
             f"({card['interested']} interested, {card['declined']} declined, "
             f"{card['unsubscribed']} unsubscribed, {card['bounced']} bounced)", "", "PROPOSALS"]
    lines += [f"- {p['title']}: {p['body']}" for p in proposals] or ["- None: the numbers look healthy."]
    subject, body = f"Tiga weekly R&D report {key}", "\n".join(lines)
    report_id = store.save_report("weekly", key, subject, body, to)
    result = send(to, subject, body)
    if not result.get("ok"):
        store.delete_report(report_id)
        store.release_job("rnd_weekly", key)
        return {"ok": False, "error": result.get("error", "send failed")}
    store.mark_report_sent(report_id)
    return {"ok": True, "proposals": len(proposals)}
