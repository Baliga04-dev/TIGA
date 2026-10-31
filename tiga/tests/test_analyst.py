from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

from analyst import Analyst
from leads import Lead, LeadResult
from mailer import Mailer
from places import Business, PlacesError
from sitecheck import SiteReport
from store import Store

IST = ZoneInfo("Asia/Kolkata")
EVENING = datetime(2026, 10, 21, 18, 0, tzinfo=IST)
LATE = datetime(2026, 10, 22, 1, 30, tzinfo=IST)
MORNING = datetime(2026, 10, 22, 6, 0, tzinfo=IST)
NOON = datetime(2026, 10, 22, 12, 0, tzinfo=IST)


def biz(key, name, website="", email="", phone="", chain=False):
    return Business(key=key, name=name, category="bakery", website=website, email=email, phone=phone,
                    address="Indiranagar", is_chain=chain)


class World:
    def __init__(self):
        self.store = Store(":memory:")
        self.mailer = Mailer(self.store, lambda *a: {"ok": True}, postal_address="x", gap_seconds=lambda: 0)
        self.businesses = {}
        self.sites = {}
        self.fetched = []
        self.inspected = []
        self.leads = LeadResult()

    async def fetch(self, category):
        self.fetched.append(category)
        if category == "boom":
            raise PlacesError("down")
        return self.businesses.get(category, [])

    async def inspect(self, url, *, year):
        self.inspected.append(url)
        return self.sites[url]

    async def find_leads(self, topics, limit=30):
        return self.leads

    def analyst(self, **kw):
        return Analyst(self.store, self.mailer, fetch_businesses=self.fetch, inspect=self.inspect,
                       find_leads=self.find_leads,
                       write_draft=lambda lead: {"subject": f"For {lead['company']}", "body": "hello " * 50},
                       categories=["bakery", "cafe"], **kw)


@pytest.fixture
def w():
    world = World()
    yield world
    world.store.close()


def report(url, **kw):
    return SiteReport(url=url, **{"reachable": True, "https": True, "mobile_ready": True, **kw})


async def test_daytime_writes_once_then_idles_and_never_collects(w):
    a = w.analyst()
    assert (await a.tick(NOON))["phase"] == "write"  # catch-up if the machine was off at 2 am
    assert (await a.tick(NOON.replace(hour=15)))["phase"] == "idle"
    assert w.fetched == []


async def test_evening_collects_one_category_per_tick_and_rotates(w):
    a = w.analyst()
    await a.tick(EVENING)
    await a.tick(LATE)
    await a.tick(LATE)
    assert w.fetched == ["bakery", "cafe", "bakery"]


async def test_businesses_are_sorted_into_ready_needs_contact_and_new(w):
    w.businesses["bakery"] = [
        biz("osm:node/1", "Has Email No Site", email="a@shop.in"),
        biz("osm:node/2", "Phone Only", phone="+91 1"),
        biz("osm:node/3", "Has Site", website="https://site.in"),
        biz("osm:node/4", "Big Chain", website="https://chain.in", chain=True),
        biz("osm:node/5", "Nothing Listed"),
    ]
    w.sites["https://site.in"] = report("https://site.in", https=False, emails=[("hi@site.in", "https://site.in/contact")])
    await w.analyst().tick(EVENING)
    by_name = {p["name"]: p for p in w.store.list_prospects()}
    assert by_name["Has Email No Site"]["status"] == "ready" and by_name["Has Email No Site"]["problems"] == ["no_website"]
    assert by_name["Phone Only"]["status"] == "needs_contact"
    assert by_name["Big Chain"]["status"] == "disqualified"
    assert by_name["Nothing Listed"]["status"] == "no_contact"
    site = by_name["Has Site"]
    assert site["status"] == "ready" and site["email"] == "hi@site.in" and site["email_source"].endswith("/contact")
    assert site["problems"] == ["no_https"]
    assert w.inspected == ["https://site.in"]  # chains are never visited


async def test_modern_sites_and_no_solicitation_are_dropped_and_no_email_needs_contact(w):
    w.businesses["bakery"] = [biz("osm:node/1", "Modern", website="https://m.in"),
                              biz("osm:node/2", "Shy", website="https://s.in"),
                              biz("osm:node/3", "Quiet", website="https://q.in")]
    w.sites["https://m.in"] = report("https://m.in", emails=[("a@m.in", "https://m.in")])
    w.sites["https://s.in"] = report("https://s.in", https=False, no_solicit=True, emails=[("a@s.in", "x")])
    w.sites["https://q.in"] = report("https://q.in", https=False)
    await w.analyst().tick(EVENING)
    status = {p["name"]: p["status"] for p in w.store.list_prospects()}
    assert status == {"Modern": "disqualified", "Shy": "disqualified", "Quiet": "needs_contact"}


async def test_news_leads_are_pulled_once_per_night(w):
    w.leads = LeadResult(leads=[Lead("Acme raises seed", "https://n.example/a", "Google News", "", 7, ("funding",))])
    a = w.analyst()
    await a.tick(EVENING)
    await a.tick(LATE)
    news = [p for p in w.store.list_prospects() if p["source"] == "news"]
    assert len(news) == 1 and news[0]["status"] == "needs_contact" and news[0]["link"] == "https://n.example/a"


async def test_morning_drafts_the_best_ready_prospects_once_into_the_approval_inbox(w):
    w.businesses["bakery"] = [biz(f"osm:node/{i}", f"Shop {i}", email=f"s{i}@shop.in") for i in range(5)]
    a = w.analyst(drafts_per_morning=3)
    await a.tick(EVENING)
    out = await a.tick(MORNING)
    again = await a.tick(MORNING.replace(hour=7))
    assert out["phase"] == "write" and out["drafted"] == 3 and again["drafted"] == 0
    drafts = w.store.list_outreach("drafted")
    assert len(drafts) == 3 and all(d["status"] == "drafted" for d in drafts)
    assert len(w.store.list_prospects("drafted")) == 3 and len(w.store.list_prospects("ready")) == 2
    assert "OpenStreetMap" in drafts[0]["source_note"]


async def test_suppressed_addresses_are_skipped_not_drafted(w):
    w.businesses["bakery"] = [biz("osm:node/1", "Gone", email="gone@shop.in")]
    w.store.suppress("gone@shop.in", reason="unsubscribe")
    a = w.analyst()
    await a.tick(EVENING)
    await a.tick(MORNING)
    assert w.store.list_prospects()[0]["status"] == "skipped" and w.store.list_outreach() == []


async def test_owner_adds_an_email_and_gets_a_draft_immediately(w):
    w.businesses["bakery"] = [biz("osm:node/1", "Phone Only", phone="+91 1")]
    a = w.analyst()
    await a.tick(EVENING)
    pid = w.store.list_prospects()[0]["id"]
    draft = await a.draft_for(pid, email="owner@phoneonly.in")
    assert draft["status"] == "drafted" and draft["email"] == "owner@phoneonly.in"
    assert w.store.get_prospect(pid)["status"] == "drafted"
    assert "added by you" in draft["source_note"]


async def test_a_failing_map_query_is_reported_and_the_tick_continues(w):
    a = w.analyst()
    a.categories = ["boom"]
    out = await a.tick(EVENING)
    assert out["errors"] and out["phase"] == "collect"


async def test_chains_already_on_the_list_are_marked_not_a_fit_once_a_night():
    w = World()
    w.store.upsert_prospect({"key": "osm:node/77", "source": "osm", "name": "Vodafone Store", "status": "needs_contact"})
    w.store.upsert_prospect({"key": "osm:node/78", "source": "osm", "name": "Sri Ganesh Bakery", "status": "needs_contact"})
    w.businesses["bakery"] = []
    await w.analyst().tick(EVENING)
    statuses = {p["name"]: p["status"] for p in w.store.list_prospects()}
    assert statuses == {"Vodafone Store": "disqualified", "Sri Ganesh Bakery": "needs_contact"}
