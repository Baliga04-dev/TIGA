"""Look at a business's own website: published contact emails, and problems worth pitching on.

Interface: `await inspect(url, year=..., area=address) -> SiteReport`. Honours robots.txt, reads at most the homepage
and one contact page, never guesses an address, and never raises for an unreachable site.
"""
from __future__ import annotations

import re
import time
from dataclasses import dataclass, field
from urllib.parse import urljoin, urlparse
from urllib.robotparser import RobotFileParser

import httpx
from bs4 import BeautifulSoup

USER_AGENT = "Tiga/1.0 (personal freelance lead research)"
SLOW_SECONDS = 4.0
_EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
_JUNK_DOMAINS = {"example.com", "sentry.io", "wixpress.com", "domain.com", "email.com", "yourdomain.com",
                 "sentry-next.wixpress.com", "godaddy.com"}
_JUNK_SUFFIX = (".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp")
_YEAR = re.compile(r"(?:©|&copy;|\(c\)|copyright)\s*(?:\d{4}\s*[-–]\s*)?((?:19|20)\d{2})", re.I)
_PHONE = re.compile(r"(?:\+91[\s-]?)?(?:\b0?80[\s-]?\d{4}[\s-]?\d{4}\b|\b[6-9]\d{4}[\s-]?\d{5}\b)")
_CITY = ("bengaluru", "bangalore")
_NO_SOLICIT = re.compile(r"no solicitation|no unsolicited|do not (?:email|contact) (?:us )?for (?:marketing|sales)", re.I)


@dataclass
class SiteReport:
    url: str
    reachable: bool = False
    https: bool = False
    mobile_ready: bool = False
    copyright_year: int | None = None
    seconds: float = 0.0
    emails: list[tuple[str, str]] = field(default_factory=list)  # (address, page it was published on)
    no_solicit: bool = False
    robots_blocked: bool = False
    stale_before: int = 0
    # Local search signals: the area in the title or main heading, a phone number, LocalBusiness markup.
    area_in_title: bool = False
    phone_on_site: bool = False
    local_schema: bool = False
    single_page: bool = False   # no link to any other page of its own: nothing for each service to rank with

    @property
    def problems(self) -> list[str]:
        if not self.reachable:
            return [] if self.robots_blocked else ["site_down"]
        out = []
        if not self.https:
            out.append("no_https")
        if not self.mobile_ready:
            out.append("not_mobile")
        if self.copyright_year and self.copyright_year < self.stale_before:
            out.append("outdated")
        if self.seconds > SLOW_SECONDS:
            out.append("slow")
        out += [key for key, ok in (("no_area_in_title", self.area_in_title), ("no_phone_on_site", self.phone_on_site),
                                    ("no_local_schema", self.local_schema)) if not ok]
        if self.single_page:
            out.append("single_page")
        return out


def _own_pages(soup: BeautifulSoup, home: str) -> set[str]:
    """Other pages of the same site the homepage links to (not anchors on itself, not other sites)."""
    base = urlparse(home)
    out = set()
    for a in soup.find_all("a", href=True):
        url = urlparse(urljoin(home, a["href"]))
        if url.scheme in ("http", "https") and url.hostname == base.hostname and url.path.rstrip("/") != base.path.rstrip("/"):
            out.add(url.path)
    return out


def _local_words(area: str) -> list[str]:
    """The places a local page should name: the parts of the map address that are names, and the city."""
    parts = [p.strip().lower() for p in area.split(",")]
    return [p for p in parts if len(p) >= 4 and not any(c.isdigit() for c in p)] + list(_CITY)


def _local_schema(soup: BeautifulSoup) -> bool:
    """LocalBusiness (or one of its kinds, which all carry an address) in JSON-LD or microdata."""
    blocks = " ".join(t.get_text() for t in soup.find_all("script", attrs={"type": "application/ld+json"}))
    items = " ".join(t.get("itemtype", "") for t in soup.find_all(attrs={"itemtype": True}))
    return bool(re.search(r"LocalBusiness|Restaurant|Cafe|Bakery|Store|Salon|Clinic|Hotel|\"address\"", blocks + items))


def _emails(html: str, soup: BeautifulSoup, page: str) -> list[tuple[str, str]]:
    found = [a["href"][7:].split("?")[0] for a in soup.select('a[href^="mailto:"]')]
    found += _EMAIL.findall(soup.get_text(" "))
    out, seen = [], set()
    for email in (e.strip().lower() for e in found):
        domain = email.rpartition("@")[2]
        if email in seen or not _EMAIL.fullmatch(email) or domain in _JUNK_DOMAINS or email.endswith(_JUNK_SUFFIX):
            continue
        seen.add(email)
        out.append((email, page))
    return out


async def _robots(client: httpx.AsyncClient, origin: str) -> RobotFileParser:
    parser = RobotFileParser()
    try:
        response = await client.get(f"{origin}/robots.txt")
        parser.parse(response.text.splitlines() if response.status_code == 200 else [])
    except httpx.HTTPError:
        parser.parse([])
    return parser


async def inspect(url: str, *, year: int, area: str = "") -> SiteReport:
    report = SiteReport(url=url, stale_before=year - 3)
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        return report
    origin = f"{parsed.scheme}://{parsed.netloc}"
    async with httpx.AsyncClient(timeout=15, follow_redirects=True, headers={"user-agent": USER_AGENT}) as client:
        robots = await _robots(client, origin)
        if not robots.can_fetch(USER_AGENT, url):
            report.robots_blocked = True
            return report
        try:
            started = time.monotonic()
            home = await client.get(url)
            report.seconds = time.monotonic() - started
            home.raise_for_status()
        except httpx.HTTPError:
            return report
        report.reachable = True
        report.https = str(home.url).startswith("https://")
        soup = BeautifulSoup(home.text, "lxml")
        report.mobile_ready = soup.find("meta", attrs={"name": "viewport"}) is not None
        years = [int(y) for y in _YEAR.findall(home.text)]
        report.copyright_year = max(years) if years else None
        report.no_solicit = bool(_NO_SOLICIT.search(soup.get_text(" ")))
        report.emails = _emails(home.text, soup, url)
        heads = " ".join([soup.title.get_text() if soup.title else ""] + [h.get_text() for h in soup.find_all("h1")]).lower()
        report.area_in_title = any(w in heads for w in _local_words(area))
        report.phone_on_site = bool(soup.select('a[href^="tel:"]')) or bool(_PHONE.search(soup.get_text(" ")))
        report.local_schema = _local_schema(soup)
        report.single_page = not _own_pages(soup, str(home.url))

        contact = next((a["href"] for a in soup.find_all("a", href=True)
                        if "contact" in a["href"].lower() or "contact" in a.get_text().lower()), None)
        if contact:
            page = urljoin(str(home.url), contact)
            if urlparse(page).hostname == urlparse(str(home.url)).hostname and robots.can_fetch(USER_AGENT, page):
                try:
                    response = await client.get(page)
                    response.raise_for_status()
                    page_soup = BeautifulSoup(response.text, "lxml")
                    report.no_solicit = report.no_solicit or bool(_NO_SOLICIT.search(page_soup.get_text(" ")))
                    known = {e for e, _ in report.emails}
                    report.emails = [e for e in _emails(response.text, page_soup, page) if e[0] not in known] + report.emails
                except httpx.HTTPError:
                    pass
    return report
