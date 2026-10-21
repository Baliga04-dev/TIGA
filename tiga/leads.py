"""Find and rank freelance-client leads from public, terms-friendly sources.

Interface: `await find_leads(topics)` -> `LeadResult(leads, errors)`; `score_title`
is the pure scoring rule. Sources (Google News RSS, Hacker News via Algolia,
GDELT) are private adapters. Nothing here scrapes logged-in or private data.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from urllib.parse import quote_plus

import httpx
from defusedxml import ElementTree as SafeElementTree
from xml.etree import ElementTree

HTTP_TIMEOUT = 10.0
USER_AGENT = {"user-agent": "Tiga/1.0 (personal lead research)"}

# (signal name, trigger words, weight)
_SIGNALS = [
    ("redesign", {"redesign", "redesigns", "rebrand", "rebrands", "rebranding", "revamp", "revamps"}, 4),
    ("funding", {"raises", "raised", "funding", "seed", "series"}, 3),
    ("launch", {"launch", "launches", "launched", "launching"}, 3),
]
_HIRING_WORDS = {"hiring", "seeking"}
_HIRING_ROLES = {"developer", "engineer", "designer", "freelancer"}
_COMPETITOR_WORDS = {"agency", "consultancy"}


@dataclass(frozen=True)
class Lead:
    title: str
    url: str
    source: str
    published: str
    score: int
    signals: tuple[str, ...]


@dataclass
class LeadResult:
    leads: list[Lead] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


def _parse_date(value: str) -> datetime | None:
    value = (value or "").strip()
    if not value:
        return None
    for parse in (
        lambda v: datetime.strptime(v, "%Y%m%dT%H%M%SZ"),
        lambda v: datetime.fromisoformat(v.replace("Z", "+00:00")),
        parsedate_to_datetime,
    ):
        try:
            parsed = parse(value)
        except (ValueError, TypeError):
            continue
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    return None


def score_title(title: str, published: str, now: datetime) -> tuple[int, list[str]]:
    """Score how likely a headline is a buyer of web/software work, and say why."""
    words = set(re.findall(r"[a-z0-9]+", title.lower()))
    score, signals = 0, []
    for name, triggers, weight in _SIGNALS:
        if words & triggers:
            score += weight
            signals.append(name)
    if words & _HIRING_WORDS and words & _HIRING_ROLES:
        score += 3
        signals.append("hiring")
    if words & _COMPETITOR_WORDS:
        score -= 3
    when = _parse_date(published)
    if when:
        age_days = (now - when).days
        if age_days <= 7:
            score += 1
        elif age_days > 30:
            score -= 2
    return score, signals


async def _google_news(client: httpx.AsyncClient, topic: str) -> list[tuple[str, str, str]]:
    response = await client.get(f"https://news.google.com/rss/search?q={quote_plus(topic)}", headers=USER_AGENT)
    response.raise_for_status()
    root = SafeElementTree.fromstring(response.text)
    return [
        ((i.findtext("title") or "").strip(), (i.findtext("link") or "").strip(), (i.findtext("pubDate") or ""))
        for i in root.findall(".//item")
    ]


async def _hacker_news(client: httpx.AsyncClient, topic: str) -> list[tuple[str, str, str]]:
    response = await client.get(
        f"https://hn.algolia.com/api/v1/search_by_date?query={quote_plus(topic)}&tags=story&hitsPerPage=50",
        headers=USER_AGENT,
    )
    response.raise_for_status()
    return [(h.get("title") or "", h.get("url") or "", h.get("created_at") or "") for h in response.json()["hits"]]


async def _gdelt(client: httpx.AsyncClient, topic: str) -> list[tuple[str, str, str]]:
    response = await client.get(
        "https://api.gdeltproject.org/api/v2/doc/doc"
        f"?query={quote_plus(topic)}&mode=artlist&format=json&maxrecords=75&timespan=1month",
        headers=USER_AGENT,
    )
    response.raise_for_status()
    return [(a.get("title") or "", a.get("url") or "", a.get("seendate") or "") for a in response.json()["articles"]]


SOURCES = {"Google News": _google_news, "Hacker News": _hacker_news, "GDELT": _gdelt}


async def find_leads(topics: list[str], *, sources: tuple[str, ...] = tuple(SOURCES),
                     limit: int = 30, now: datetime | None = None) -> LeadResult:
    topics = [t.strip() for t in topics if t.strip()]
    if not topics:
        raise ValueError("At least one non-blank topic is required")
    now = now or datetime.now(timezone.utc)
    result, seen = LeadResult(), set()
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT, follow_redirects=True) as client:
        for name in sources:
            for topic in topics:
                try:
                    items = await SOURCES[name](client, topic)
                except (httpx.HTTPError, ElementTree.ParseError, ValueError, KeyError) as exc:
                    result.errors.append(f"{name}: {type(exc).__name__}")
                    break  # the source is down or refusing; don't hammer it for the other topics
                for title, url, published in items:
                    if not (title and url.startswith(("http://", "https://"))) or url in seen:
                        continue
                    score, signals = score_title(title, published, now)
                    if signals:
                        seen.add(url)
                        result.leads.append(Lead(title, url, name, published, score, tuple(signals)))
    result.leads.sort(key=lambda lead: -lead.score)
    del result.leads[max(1, limit):]
    return result
