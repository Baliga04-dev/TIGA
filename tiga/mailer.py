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

from drafter import DEMO_LINE
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
                 hard_cap: int = 25, gap_seconds: Callable[[], int] = _random_gap, privacy_url: str = "",
                 sender_name: str = ""):
        self.store, self.sender, self.privacy_url, self.sender_name = store, sender, privacy_url, sender_name
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

    # --- niche batches: approve one kind of shop at a time, and see which kind replies ----------------
    def _niche_of(self) -> Callable[[dict], str]:
        niches, rows = self.store.outreach_niches(), {r["id"]: r for r in self.store.list_outreach()}

        def niche(row: dict) -> str:   # a follow-up belongs to its first mail's batch
            while row["parent_id"] and row["parent_id"] in rows:
                row = rows[row["parent_id"]]
            return niches.get(row["id"], "")
        return niche

    def batches(self) -> list[dict]:
        """Per kind of shop ('' = news leads): drafts waiting, approved, sent and how the sent ones answered."""
        import marketing   # only for the shop-owner wording of the niche

        niche, out = self._niche_of(), {}
        for row in self.store.list_outreach():
            b = out.setdefault(niche(row), {**{k: 0 for k in ("drafted", "approved", "sent", "replies", "interested",
                                                               "declined", "unsubscribed", "bounced")}, "draft_ids": []})
            if row["status"] in ("drafted", "approved"):
                b[row["status"]] += 1
            if row["status"] == "drafted":
                b["draft_ids"].append(row["id"])
            if row["sent_at"]:
                b["sent"] += 1
            if row["replied_at"]:
                b["replies"] += 1
            if row["status"] in ("interested", "declined", "unsubscribed", "bounced"):
                b[row["status"]] += 1
        rows = [{"niche": k, "label": marketing.niche_label(k), **v} for k, v in out.items()]
        return sorted(rows, key=lambda b: (-b["drafted"], -b["sent"], b["label"]))

    def _each_draft_in(self, niche: str, act: Callable[[int], dict]) -> int:
        of = self._niche_of()
        rows = [r for r in self.store.list_outreach("drafted") if of(r) == niche]
        for row in rows:
            act(row["id"])
        return len(rows)

    def approve_batch(self, niche: str) -> int:
        return self._each_draft_in(niche, self.approve)

    def reject_batch(self, niche: str) -> int:
        return self._each_draft_in(niche, self.reject)

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
            for waiting in self.store.list_outreach(*OPEN_STATUSES, email=row["email"]):
                if waiting["followup_n"]:   # they answered: a "closing the loop" note must not go out
                    self.store.update_outreach(waiting["id"], actor="mailer", status="rejected")
            if status in ("unsubscribed", "declined", "bounced"):
                self.store.suppress(row["email"], reason=status)
            who = row["company"] or row["email"]
            if status == "interested":  # a warm reply becomes a deal on the Pipeline page, and gets an answer fast
                self.store.create_deal({"email": row["email"], "company": row["company"], "outreach_id": row["id"]})
                self._draft_answer(row)
                self.store.add_reminder(f"{who} replied: interested. Answer within the hour: a reply is drafted on "
                                        "the Outreach page for you to approve.", now.isoformat(timespec="seconds"))
            elif status == "replied":
                self.store.add_reminder(f"{who} replied to your email. Read it in Gmail and answer today.",
                                        now.isoformat(timespec="seconds"))
        return changed

    def _draft_answer(self, row: dict) -> None:
        demo = re.search(re.escape(DEMO_LINE) + r"\s*(\S+)", row["body"])
        body = ("Hi,\n\nThanks for getting back to me. Would a 15-minute call this week suit you? I can show you what "
                f"a site for {row['company'] or 'you'} could look like"
                + (f", starting from the one I built for a shop like yours: {demo.group(1)}" if demo else "")
                + ".\n\nJust tell me a day and time that works.\n\nBest," + (f"\n{self.sender_name}" if self.sender_name else ""))
        subject = row["subject"] if row["subject"].lower().startswith("re:") else f"Re: {row['subject']}"
        try:
            self.draft(email=row["email"], subject=subject, body=body, company=row["company"], lead_url=row["lead_url"],
                       source_note=row["source_note"], region=row["region"], parent_id=row["id"])
        except MailerError:
            pass   # a draft is already open for them

    def due_followups(self, *, now: datetime | None = None) -> list[dict]:
        """Draft (never send) one short last note for quiet prospects, after FOLLOWUP_AFTER."""
        now, created = now or datetime.now(timezone.utc), []
        rows = self.store.list_outreach()
        for row in self.store.list_outreach("sent"):
            if row["followup_n"] >= MAX_FOLLOWUPS or now - _ts(row["sent_at"]) < FOLLOWUP_AFTER:
                continue
            if any(other["parent_id"] == row["id"] for other in rows):
                continue
            body = _LAST_NOTE[DEMO_LINE in row["body"]]
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
            "by_niche": self.batches(),
        }

    def _with_footer(self, body: str) -> str:
        notice = f"How I handle your details, and how to have them deleted: {self.privacy_url}\n" if self.privacy_url else ""
        return (f"{body.rstrip()}\n\n--\n{self.postal_address}\n{notice}"
                "If you'd rather not hear from me, just reply STOP and I won't email you again.")


_AUTO = re.compile(r"out of office|automatic reply|auto-?reply|away from (my )?(email|desk)", re.I)
_STOP = re.compile(r"\bstop\b|unsubscribe|remove me|take me off|do not (contact|email)|don't (contact|email)", re.I)
_NO = re.compile(r"not interested|no thanks|no thank you|not now|don't need|do not need", re.I)
_YES = re.compile(r"interested|schedule|\bcall\b|sounds good|let's talk|tell me more|send (me )?(a |the )?(quote|proposal|details)|\byes\b", re.I)
_QUOTE_START = re.compile(r"^(>|On .{0,80}wrote:?\s*$)", re.I)
FOLLOWUP_AFTER = timedelta(days=4)   # day 4-5 replies best; under 48 hours roughly halves replies
MAX_FOLLOWUPS = 1   # one follow-up per contact: more reads as pressure and invites spam reports
_LAST_NOTE = {   # keyed by whether the first mail carried a demo link
    True: "Hi, just closing the loop on my note below. The demo site is linked there if you'd like a look; "
          "no reply needed, and I won't write again.",
    False: "Hi, just closing the loop on my note below. Happy to share a short plan if it's useful; "
           "no reply needed, and I won't write again.",
}


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
