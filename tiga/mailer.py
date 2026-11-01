"""Cold-email drafting and guarded sending.

Interface: `Mailer(store, sender, postal_address=...)`. `sender(to, subject, body)`
is the seam: Gmail in production, a fake in tests. Nothing is sent without an
explicit `approve`, and every send passes the same checks: suppression list,
compliance footer, weekday business hours, a ramping daily cap and a gap.
"""
from __future__ import annotations

import random
import re
from datetime import datetime, timedelta, timezone
from typing import Callable

from store import Store

STRICT_TLDS = {"de", "at"}  # opt-in countries for B2B cold email
STRICT_REGIONS = {"uk-sole-trader", "ca", "au"}
OPEN_STATUSES = ("drafted", "approved")
BUSINESS_HOURS = (9, 17)


class MailerError(RuntimeError):
    pass


def _random_gap() -> int:
    return random.randint(120, 600)


class Mailer:
    def __init__(self, store: Store, sender: Callable[[str, str, str], dict], *, postal_address: str,
                 hard_cap: int = 25, gap_seconds: Callable[[], int] = _random_gap):
        self.store, self.sender = store, sender
        self.postal_address, self.hard_cap, self.gap_seconds = postal_address.strip(), hard_cap, gap_seconds

    # --- drafting and approval -------------------------------------------
    def draft(self, *, email: str, subject: str, body: str, company: str = "", lead_url: str = "",
              source_note: str = "", region: str = "", parent_id: int | None = None, followup_n: int = 0) -> dict:
        if self.store.is_suppressed(email):
            raise MailerError(f"{email} is suppressed")
        if self.store.list_outreach(*OPEN_STATUSES, email=email):
            raise MailerError(f"{email} already has an open draft")
        tld = email.rpartition(".")[2].lower()
        warnings = "review: strict-consent region, get consent or skip" if (
            tld in STRICT_TLDS or region in STRICT_REGIONS) else ""
        return self.store.add_outreach(
            email, subject, body, company=company, lead_url=lead_url, source_note=source_note,
            region=region, warnings=warnings, parent_id=parent_id, followup_n=followup_n,
        )

    def get(self, outreach_id: int) -> dict:
        return self.store.get_outreach(outreach_id)

    def approve(self, outreach_id: int) -> dict:
        row = self.get(outreach_id)
        if row["status"] != "drafted":
            raise MailerError(f"only drafts can be approved (this one is {row['status']})")
        return self.store.update_outreach(outreach_id, actor="user", status="approved")

    def reject(self, outreach_id: int) -> dict:
        return self.store.update_outreach(outreach_id, actor="user", status="rejected")

    # --- limits -------------------------------------------------------------
    def daily_cap(self, now: datetime) -> int:
        """5 a day in week one, +5 each week since the first send, never above the hard cap."""
        first = min((_ts(r["sent_at"]) for r in self.store.list_outreach() if r["sent_at"]), default=now)
        weeks = max(0, (now - first).days) // 7
        return min(self.hard_cap, 5 + 5 * weeks)

    def sent_today(self, now: datetime) -> int:
        return sum(1 for r in self.store.list_outreach() if r["sent_at"] and _ts(r["sent_at"]).date() == now.date())

    # --- sending ------------------------------------------------------------
    def send_next(self, *, now: datetime | None = None) -> dict | None:
        """Send at most one approved mail if every limit allows it; otherwise do nothing."""
        now = now or datetime.now(timezone.utc)
        due = self.next_due(now=now)
        if not due:
            return None
        return self.record_send(due["id"], self.sender(due["to"], due["subject"], due["body"]), now=now)

    def next_due(self, *, now: datetime | None = None) -> dict | None:
        """The one approved mail every limit allows right now, footer added, or None. Sends nothing.

        `send_next` uses it with the Gmail sender; `relay.py` hands it to Claude's Gmail
        connector and reports back through `record_send`, so both paths share these checks.
        """
        now = now or datetime.now(timezone.utc)
        if now.weekday() >= 5 or not BUSINESS_HOURS[0] <= now.hour < BUSINESS_HOURS[1]:
            return None
        if self.sent_today(now) >= self.daily_cap(now):
            return None
        last = max((_ts(r["sent_at"]) for r in self.store.list_outreach() if r["sent_at"]), default=None)
        if last and now - last < timedelta(seconds=self.gap_seconds()):
            return None
        for row in self.store.list_outreach("approved"):
            if self.store.is_suppressed(row["email"]):
                self.store.update_outreach(row["id"], status="rejected", last_error="suppressed after approval")
                continue
            if not self.postal_address:
                raise MailerError("Set a postal address (SETTINGS) before sending: CAN-SPAM requires one")
            return {"id": row["id"], "to": row["email"], "subject": row["subject"], "body": self._with_footer(row["body"])}
        return None

    def record_send(self, outreach_id: int, result: dict, *, now: datetime | None = None) -> dict | None:
        """Store the outcome of sending a mail `next_due` picked: sent, or approved with the error."""
        now = now or datetime.now(timezone.utc)
        if self.get(outreach_id)["status"] != "approved":
            raise MailerError("only an approved mail picked by next_due can be recorded as sent")
        if not result.get("ok"):
            self.store.update_outreach(outreach_id, last_error=str(result.get("error", "send failed")))
            return None
        return self.store.update_outreach(
            outreach_id, actor="mailer", status="sent", sent_at=now.isoformat(timespec="seconds"),
            message_id=result.get("message_id") or "", thread_id=result.get("thread_id") or "", last_error="",
        )

    # --- replies and follow-ups ----------------------------------------------
    def check_replies(self, fetch_thread: Callable[[str], list[dict]], *, now: datetime | None = None,
                      own_address: str = "") -> int:
        """Classify the first real reply on every sent thread; returns how many changed."""
        now, changed = now or datetime.now(timezone.utc), 0
        for row in self.store.list_outreach("sent"):
            if self.get(row["id"])["status"] != "sent":
                continue  # already settled through a sibling thread
            status = None
            for message in fetch_thread(row["thread_id"]):
                if own_address and own_address.lower() in message["from"].lower():
                    continue
                status = _classify(message["from"], message["body"])
                if status:
                    break
            if not status:
                continue
            for sibling in self.store.list_outreach("sent", email=row["email"]):
                self.store.update_outreach(sibling["id"], actor="mailer", status=status,
                                           replied_at=now.isoformat(timespec="seconds"))
                changed += 1
            if status in ("unsubscribed", "declined", "bounced"):
                self.store.suppress(row["email"], reason=status)
            if status == "interested":  # a warm reply becomes a deal on the Pipeline page
                self.store.create_deal({"email": row["email"], "company": row["company"], "outreach_id": row["id"]})
        return changed

    def due_followups(self, *, now: datetime | None = None) -> list[dict]:
        """Draft (never send) a follow-up for quiet prospects: after 5 days, at most 2 per prospect."""
        now, created = now or datetime.now(timezone.utc), []
        rows = self.store.list_outreach()
        for row in self.store.list_outreach("sent"):
            if row["followup_n"] >= MAX_FOLLOWUPS or now - _ts(row["sent_at"]) < FOLLOWUP_AFTER:
                continue
            if any(other["parent_id"] == row["id"] for other in rows):
                continue
            body = _FOLLOWUP_BODY[row["followup_n"]].format(for_company=f" for {row['company']}" if row["company"] else "")
            subject = row["subject"] if row["subject"].lower().startswith("re:") else f"Re: {row['subject']}"
            try:
                created.append(self.draft(
                    email=row["email"], subject=subject, body=body, company=row["company"],
                    lead_url=row["lead_url"], source_note=row["source_note"], region=row["region"],
                    parent_id=row["id"], followup_n=row["followup_n"] + 1,
                ))
            except MailerError:
                continue  # suppressed since, or a draft is already open
        return created

    def scorecard(self, *, now: datetime | None = None) -> dict:
        """The outreach numbers the daily report leads with."""
        now = now or datetime.now(timezone.utc)
        rows = self.store.list_outreach()
        pipeline: dict[str, int] = {}
        for row in rows:
            pipeline[row["status"]] = pipeline.get(row["status"], 0) + 1
        week_ago = now - timedelta(days=7)
        sent = [r for r in rows if r["sent_at"]]
        return {
            "sent_today": self.sent_today(now),
            "sent_week": sum(1 for r in sent if _ts(r["sent_at"]) > week_ago),
            "replies": sum(1 for r in rows if r["replied_at"]),
            "interested": pipeline.get("interested", 0),
            "declined": pipeline.get("declined", 0),
            "unsubscribed": pipeline.get("unsubscribed", 0),
            "bounced": pipeline.get("bounced", 0),
            "followups_sent": sum(1 for r in sent if r["followup_n"]),
            "awaiting_approval": pipeline.get("drafted", 0),
            "daily_cap": self.daily_cap(now),
            "pipeline": pipeline,
        }

    def _with_footer(self, body: str) -> str:
        return (f"{body.rstrip()}\n\n--\n{self.postal_address}\n"
                "If you'd rather not hear from me, just reply STOP and I won't email you again.")


_AUTO = re.compile(r"out of office|automatic reply|auto-?reply|away from (my )?(email|desk)", re.I)
_STOP = re.compile(r"\bstop\b|unsubscribe|remove me|take me off|do not (contact|email)|don't (contact|email)", re.I)
_NO = re.compile(r"not interested|no thanks|no thank you|not now|don't need|do not need", re.I)
_YES = re.compile(r"interested|schedule|\bcall\b|sounds good|let's talk|tell me more|send (me )?(a |the )?(quote|proposal|details)|\byes\b", re.I)
_QUOTE_START = re.compile(r"^(>|On .{0,80}wrote:?\s*$)", re.I)
FOLLOWUP_AFTER = timedelta(days=5)
MAX_FOLLOWUPS = 1   # one follow-up per contact: more reads as pressure and invites spam reports
_FOLLOWUP_BODY = (
    "Hi, following up once on my note below in case it got buried. Happy to share a plan{for_company} if useful; "
    "if not, no problem, and I won't write again.",
)


def _fresh_text(body: str) -> str:
    """The reply itself, without quoted history (which contains our own STOP footer)."""
    lines = []
    for line in body.splitlines():
        if _QUOTE_START.match(line.strip()):
            break
        lines.append(line)
    return "\n".join(lines)


def _classify(sender: str, body: str) -> str | None:
    """bounced / unsubscribed / declined / interested / replied, or None for auto-replies."""
    if re.search(r"mailer-daemon|postmaster", sender, re.I):
        return "bounced"
    text = _fresh_text(body)
    if _AUTO.search(text):
        return None
    for pattern, status in ((_STOP, "unsubscribed"), (_NO, "declined"), (_YES, "interested")):
        if pattern.search(text):
            return status
    return "replied"


def _ts(value: str) -> datetime:
    return datetime.fromisoformat(value)
