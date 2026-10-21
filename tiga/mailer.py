"""Cold-email drafting and guarded sending.

Interface: `Mailer(store, sender, postal_address=...)`. `sender(to, subject, body)`
is the seam: Gmail in production, a fake in tests. Nothing is sent without an
explicit `approve`, and every send passes the same checks: suppression list,
compliance footer, weekday business hours, a ramping daily cap and a gap.
"""
from __future__ import annotations

import random
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
            result = self.sender(row["email"], row["subject"], self._with_footer(row["body"]))
            if not result.get("ok"):
                self.store.update_outreach(row["id"], last_error=str(result.get("error", "send failed")))
                return None
            return self.store.update_outreach(
                row["id"], actor="mailer", status="sent", sent_at=now.isoformat(timespec="seconds"),
                message_id=result.get("message_id") or "", thread_id=result.get("thread_id") or "", last_error="",
            )
        return None

    def _with_footer(self, body: str) -> str:
        return (f"{body.rstrip()}\n\n--\n{self.postal_address}\n"
                "If you'd rather not hear from me, just reply STOP and I won't email you again.")


def _ts(value: str) -> datetime:
    return datetime.fromisoformat(value)
