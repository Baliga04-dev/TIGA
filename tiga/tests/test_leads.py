from datetime import datetime, timezone

import httpx
import pytest

import leads
from fakes import rss

NOW = datetime(2026, 10, 21, 12, 0, tzinfo=timezone.utc)


def test_score_rewards_buying_signals_and_explains_them():
    score, signals = leads.score_title("Acme raises $3M seed round to launch new app", "2026-10-20", NOW)
    assert score >= 6
    assert {"funding", "launch"} <= set(signals)


def test_redesign_beats_a_plain_launch():
    redesign, _ = leads.score_title("Bakery announces website redesign", "2026-10-20", NOW)
    launch, _ = leads.score_title("Bakery launches", "2026-10-20", NOW)
    assert redesign > launch


def test_competitors_and_old_news_score_lower():
    fresh, _ = leads.score_title("Web design agency raises seed", "2026-10-20", NOW)
    plain, _ = leads.score_title("Studio raises seed", "2026-10-20", NOW)
    assert fresh < plain
    old, _ = leads.score_title("Studio raises seed", "2026-08-01", NOW)
    assert old < plain


def test_signal_words_match_whole_words_only():
    assert leads.score_title("Relaunching the seedling nursery", "2026-10-20", NOW)[0] <= 1


@pytest.mark.asyncio
async def test_find_leads_merges_sources_dedupes_and_ranks(http):
    http.add("news.google.com", text=rss(
        ("Acme raises seed to launch app", "https://news.example/a"),
        ("Weather today", "https://news.example/w"),
    ))
    http.add("hn.algolia.com", json={"hits": [
        {"title": "Show HN: Acme raises seed to launch app", "url": "https://news.example/a",
         "created_at": "2026-10-20T08:00:00Z"},
        {"title": "Ask HN: hiring a web developer for our site", "url": "https://shop.io/jobs",
         "created_at": "2026-10-19T08:00:00Z"},
    ]})
    http.add("api.gdeltproject.org", json={"articles": [
        {"title": "Cafe plans website redesign", "url": "https://cafe.example/news", "seendate": "20261020T090000Z"},
    ]})
    result = await leads.find_leads(["web developer"], now=NOW)
    urls = [l.url for l in result.leads]
    assert urls.count("https://news.example/a") == 1
    assert "https://news.example/w" not in urls  # no signal, not a lead
    assert result.leads == sorted(result.leads, key=lambda l: -l.score)
    assert result.errors == []
    assert {l.source for l in result.leads} >= {"Hacker News", "GDELT"}


@pytest.mark.asyncio
async def test_one_failing_source_does_not_lose_the_others(http):
    http.add("news.google.com", exc=httpx.ConnectError("down"))
    http.add("hn.algolia.com", json={"hits": [{"title": "Studio raises seed", "url": "https://s.io/x",
                                              "created_at": "2026-10-20T08:00:00Z"}]})
    http.add("api.gdeltproject.org", status=429, json={})
    result = await leads.find_leads(["x"], now=NOW)
    assert [l.url for l in result.leads] == ["https://s.io/x"]
    assert len(result.errors) == 2


@pytest.mark.asyncio
async def test_blank_topics_are_rejected():
    with pytest.raises(ValueError):
        await leads.find_leads(["  "])
