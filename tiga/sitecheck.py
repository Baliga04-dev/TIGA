"""Look at a business's own website: published contact emails, and problems worth pitching on.

Interface: `await inspect(url, year=...) -> SiteReport`. Honours robots.txt, reads at most the homepage
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
        return out


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


async def inspect(url: str, *, year: int) -> SiteReport:
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
