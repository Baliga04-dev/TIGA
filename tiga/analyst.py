"""The Analyst: collects prospects overnight and has the Writer draft emails for the morning.

Interface: `Analyst(store, mailer, fetch_businesses=, inspect=, find_leads=, write_draft=)` with
`await tick(now)` (called every few minutes by the scheduler) and `await draft_for(id, email=)` for an
address the owner found. Time decides the work (Bengaluru time):
  16:00-02:00  fetch the next OpenStreetMap category, site-check a batch, pull news once a night
  02:00-16:00  once a day, draft the best "ready" prospects into the approval inbox (never sends)
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta
from typing import Awaitable, Callable
from zoneinfo import ZoneInfo

import places
from mailer import Mailer, MailerError
from store import Store

NEWS_TOPICS = ["Bengaluru startup launch", "Bengaluru new store opening", "small business website redesign India",
               "hiring web developer Bengaluru"]
OSM_CREDIT = "OpenStreetMap listing (c) OpenStreetMap contributors"


class Analyst:
    def __init__(self, store: Store, mailer: Mailer, *, fetch_businesses: Callable[[str], Awaitable[list]],
                 inspect: Callable[..., Awaitable], find_leads: Callable[..., Awaitable],
                 write_draft: Callable[[dict], dict], categories: list[str] | None = None,
                 drafts_per_morning: int = 15, checks_per_tick: int = 8, tz: str = "Asia/Kolkata"):
        self.store, self.mailer = store, mailer
        self.fetch_businesses, self.inspect, self.find_leads, self.write_draft = (
            fetch_businesses, inspect, find_leads, write_draft)
        self.categories = categories or list(places.CATEGORIES)
        self.drafts_per_morning, self.checks_per_tick, self.tz = drafts_per_morning, checks_per_tick, ZoneInfo(tz)

    # --- the one scheduled entry point -----------------------------------------
    async def tick(self, now: datetime, *, force: str | None = None) -> dict:
        """`force="collect"` or `"write"` runs that phase now regardless of the clock (the Run-now button)."""
        local = now.astimezone(self.tz)
        if force == "collect" or (force is None and (local.hour >= 16 or local.hour < 2)):
            result = await self._collect(local)
        elif force == "write" or (force is None and self.store.claim_job("analyst_write", local.date().isoformat())):
            result = {"phase": "write", "drafted": self._write_morning(), "errors": []}
        else:
            result = {"phase": "idle", "drafted": 0, "errors": []}
        self.store.set_value("analyst.last", json.dumps({**result, "at": local.isoformat(timespec="minutes")}))
        return result

    async def draft_for(self, prospect_id: int, *, email: str) -> dict:
        """The owner found an address themselves: record it and draft right away (still needs approval)."""
        prospect = self.store.update_prospect(prospect_id, email=email.strip().lower(), email_source="added by you",
                                              status="ready")
        return self._draft(prospect)

    # --- collecting ------------------------------------------------------------
    async def _collect(self, local: datetime) -> dict:
        errors, fetched = [], 0
        index = int(self.store.get_value("analyst.category", "0"))
        category = self.categories[index % len(self.categories)]
        self.store.set_value("analyst.category", str(index + 1))
        try:
            for business in await self.fetch_businesses(category):
                fetched += self._record_business(business)
        except places.PlacesError as exc:
            errors.append(str(exc))

        night = (local - timedelta(hours=2)).date().isoformat()  # 16:00-02:00 belongs to one night
        if self.store.claim_job("analyst_news", night):
            try:
                result = await self.find_leads(NEWS_TOPICS, limit=30)
                for lead in result.leads:
                    self.store.upsert_prospect({
                        "key": f"news:{lead.url}", "source": "news", "name": lead.title[:120], "title": lead.title,
                        "link": lead.url, "signals": list(lead.signals), "score": lead.score,
                        "status": "needs_contact", "note": f"{lead.source}: find the company's own site for an email",
                    })
                errors += [f"news {e}" for e in result.errors]
            except Exception as exc:  # news is a bonus; never lose the night over it
                errors.append(f"news failed: {exc}")

        checked = await self._check_sites(local.year)
        return {"phase": "collect", "category": category, "new": fetched, "checked": checked, "errors": errors}

    def _record_business(self, b) -> int:
        base = {"key": b.key, "source": "osm", "name": b.name, "category": b.category, "website": b.website,
                "phone": b.phone, "address": b.address, "lat": getattr(b, "lat", None), "lon": getattr(b, "lon", None)}
        if b.is_chain:
            row, created = self.store.upsert_prospect({**base, "status": "disqualified", "note": "chain or brand"})
        elif b.website:
            row, created = self.store.upsert_prospect({**base, "status": "new"})
        elif b.email:
            row, created = self.store.upsert_prospect({**base, "email": b.email, "email_source": OSM_CREDIT,
                                                        "problems": ["no_website"], "score": 6, "status": "ready"})
        elif b.phone:
            row, created = self.store.upsert_prospect({**base, "problems": ["no_website"], "score": 5,
                                                        "status": "needs_contact",
                                                        "note": "no website or email listed: call or WhatsApp"})
        else:  # most map entries: counted, but kept off the to-do list
            row, created = self.store.upsert_prospect({**base, "status": "no_contact",
                                                        "note": "no website, email or phone on the map"})
        return int(created)

    async def _check_sites(self, year: int) -> int:
        batch = self.store.list_prospects("new", limit=self.checks_per_tick)
        for p in batch:
            report = await self.inspect(p["website"], year=year)
            problems = report.problems
            if report.no_solicit:
                self.store.update_prospect(p["id"], status="disqualified", note="site asks for no solicitation")
            elif report.reachable and not problems:
                self.store.update_prospect(p["id"], status="disqualified", note="site already looks modern")
            elif report.emails:
                email, page = report.emails[0]
                self.store.update_prospect(p["id"], status="ready", email=email, email_source=page,
                                           problems=problems, score=3 + len(problems))
            else:
                note = "site blocks automated visits" if report.robots_blocked else "no email published on the site"
                self.store.update_prospect(p["id"], status="needs_contact", problems=problems,
                                           score=2 + len(problems), note=note)
        return len(batch)

    # --- writing ---------------------------------------------------------------
    def _write_morning(self) -> int:
        drafted = 0
        for prospect in self.store.list_prospects("ready", limit=self.drafts_per_morning):
            if self._draft(prospect):
                drafted += 1
        return drafted

    def _draft(self, p: dict) -> dict | None:
        text = self.write_draft({"company": p["name"], "problems": p["problems"], "signals": p["signals"],
                                 "category": p["category"], "title": p["title"]})
        source = p["email_source"] if p["email_source"] == "added by you" else f"{p['email_source']} ({p['name']})"
        try:
            draft = self.mailer.draft(email=p["email"], subject=text["subject"], body=text["body"], company=p["name"],
                                      lead_url=p["website"] or p["link"], source_note=source)
        except MailerError as exc:
            self.store.update_prospect(p["id"], status="skipped", note=str(exc))
            return None
        self.store.update_prospect(p["id"], status="drafted", outreach_id=draft["id"])
        return draft
