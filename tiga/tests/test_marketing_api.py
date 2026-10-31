from datetime import datetime, timedelta, timezone

import pytest

import marketing
import services

IST = timezone(timedelta(hours=5, minutes=30))


@pytest.fixture(autouse=True)
def shop_hours(monkeypatch):
    """The API reads marketing.now(); pin it to a weekday noon in Bengaluru."""
    monkeypatch.setattr(marketing, "now", lambda: datetime(2026, 10, 27, 12, 0, tzinfo=IST))


def add(client, **kw):
    body = {"name": "Kavya Rao", "phone": "99001 27458", "source": "warm", "source_detail": "college friend", **kw}
    return client.post("/api/marketing/contacts", json=body).json()


def test_contacts_list_carries_what_the_gate_says(client):
    friend = add(client)["contact"]
    shop = add(client, name="Ramesh", phone="98450 31762", source="map", business="Sri Ganesh Bakery")["contact"]
    items = {c["id"]: c for c in client.get("/api/marketing/contacts").json()["items"]}
    assert items[friend["id"]]["gates"]["whatsapp"]["ok"] and not items[shop["id"]]["gates"]["whatsapp"]["ok"]
    assert "permission" in items[shop["id"]]["gates"]["whatsapp"]["reason"] and items[shop["id"]]["email"] == ""


def test_bad_contacts_are_refused_readably(client):
    out = add(client, name="", phone="")
    assert out["ok"] is False and "name" in out["error"]
    add(client)
    assert "already" in add(client)["error"]


def test_whatsapp_needs_the_gate_then_a_mark_sent_records_the_touch(client):
    shop = add(client, name="Ramesh", phone="98450 31762", source="map")["contact"]
    refused = client.post(f"/api/marketing/contacts/{shop['id']}/whatsapp", json={"text": "Hello"}).json()
    assert refused["ok"] is False and "permission" in refused["error"]
    client.post(f"/api/marketing/contacts/{shop['id']}/consent", json={"channel": "whatsapp", "how": "asked in person", "notice": True})
    link = client.post(f"/api/marketing/contacts/{shop['id']}/whatsapp", json={"text": "Hello"}).json()
    assert link["ok"] and link["url"].startswith("https://wa.me/919845031762")
    sent = client.post(f"/api/marketing/contacts/{shop['id']}/touches", json={"channel": "whatsapp", "direction": "out", "kind": "message"}).json()
    assert sent["ok"] and client.get(f"/api/marketing/contacts/{shop['id']}/touches").json()["items"][0]["kind"] == "message"
    listed = client.get("/api/marketing/contacts").json()["items"][0]
    assert listed["last_out_at"].startswith("2026-10-27") and listed["last_in_at"] == ""


def test_the_warm_draft_and_do_not_contact(client):
    friend = add(client)["contact"]
    draft = client.get(f"/api/marketing/contacts/{friend['id']}/draft").json()
    assert draft["ok"] and draft["text"].startswith("Hi Kavya") and "/demos/" in draft["text"]
    out = client.post(f"/api/marketing/contacts/{friend['id']}/dnc", json={"reason": "asked me to stop"}).json()
    assert out["contact"]["dnc"]
    assert client.delete(f"/api/marketing/contacts/{friend['id']}").json()["ok"]
    assert add(client)["contact"]["dnc"]


def test_walk_ins_route_visit_and_inbound(client):
    store = services.get_store()
    lat, lon = marketing.LOCALITIES["Jayanagar"]
    p, _ = store.upsert_prospect({"key": "osm:node/1", "source": "osm", "name": "Sri Ganesh Bakery", "category": "bakery",
                                  "status": "no_contact", "lat": lat + 0.002, "lon": lon})
    localities = client.get("/api/marketing/localities").json()["items"]
    assert "Jayanagar" in localities
    route = client.get("/api/marketing/route", params={"locality": "Jayanagar", "category": "bakery", "radius_km": 1}).json()
    assert [s["name"] for s in route["stops"]] == ["Sri Ganesh Bakery"]
    visit = client.post("/api/marketing/visits", json={"prospect_id": p["id"], "outcome": "interested", "name": "Suresh",
                                                       "phone": "98860 44217", "consent": ["whatsapp"], "notice": True}).json()
    assert visit["ok"] and visit["contact"]["consent"]["whatsapp"]
    again = client.get("/api/marketing/route", params={"locality": "Jayanagar", "category": "all", "radius_km": 1}).json()
    assert again["stops"] == []   # visited this week
    found = client.post("/api/marketing/inbound", json={"ref": f"Ref T{p['id']}", "phone": "98860 44217"}).json()
    assert found["ok"] and found["contact"]["id"] == visit["contact"]["id"]
    assert client.post("/api/marketing/inbound", json={"ref": "hello"}).json()["ok"] is False


def test_printables_are_static_pages(client):
    store = services.get_store()
    lat, lon = marketing.LOCALITIES["Jayanagar"]
    p, _ = store.upsert_prospect({"key": "osm:node/2", "source": "osm", "name": "Udupi Tiffins", "category": "restaurant",
                                  "status": "no_contact", "lat": lat, "lon": lon + 0.001})
    sheet = client.get(f"/api/marketing/print/audit/{p['id']}")
    assert sheet.status_code == 200 and "default-src 'none'" in sheet.headers["content-security-policy"]
    assert f"Ref T{p['id']}" in sheet.text and "<script" not in sheet.text
    walk = client.get("/api/marketing/print/route", params={"locality": "Jayanagar", "category": "all", "radius_km": 1})
    assert walk.status_code == 200 and "Udupi Tiffins" in walk.text
    assert client.get("/api/marketing/print/audit/99999").status_code == 404


def test_scorecard(client):
    friend = add(client)["contact"]
    client.post(f"/api/marketing/contacts/{friend['id']}/touches", json={"channel": "whatsapp", "direction": "out", "kind": "message"})
    card = client.get("/api/marketing/scorecard").json()
    assert card["ok"] and card["weeks"][0]["warm_sent"] == 1 and card["enough_data"] is False


def test_follow_ups_owed_after_a_visit(client):
    store = services.get_store()
    lat, lon = marketing.LOCALITIES["Jayanagar"]
    p, _ = store.upsert_prospect({"key": "osm:node/3", "source": "osm", "name": "Sri Ganesh Bakery", "category": "bakery",
                                  "status": "no_contact", "lat": lat, "lon": lon})
    client.post("/api/marketing/visits", json={"prospect_id": p["id"], "outcome": "interested", "name": "Suresh",
                                               "phone": "98860 44217", "consent": ["whatsapp"], "notice": True})
    out = client.get("/api/marketing/followups").json()
    assert out["ok"] and out["weekly_cap"] == 10
    item = out["items"][0]
    assert item["contact"]["gates"]["whatsapp"]["ok"] and "Sri Ganesh Bakery" in item["text"] and not item["overdue"]


def test_commission_maths_uses_the_rate_card_and_prints(client):
    out = client.get("/api/marketing/commission", params={"orders": 600, "average": 350}).json()
    assert out["ok"] and out["commission"] == 52500 and out["site_price"] == 15000 and out["payback_months"] == 2
    assert client.get("/api/marketing/commission", params={"orders": 600, "average": 350, "commission": 90}).json()["ok"] is False
    sheet = client.get("/api/marketing/print/commission", params={"orders": 600, "average": 350, "shop": "Udupi Tiffins"})
    assert sheet.status_code == 200 and "Udupi Tiffins" in sheet.text and "default-src 'none'" in sheet.headers["content-security-policy"]


def test_owner_interviews_over_http(client):
    out = client.post("/api/marketing/interviews", json={"business": "Sri Ganesh Bakery", "category": "bakery",
                                                         "answers": {"find_you": "Word of mouth"},
                                                         "prices": {"basic_site": {"too_cheap": 2000, "bargain": 5000, "expensive": 9000, "too_expensive": None}}}).json()
    assert out["ok"] and out["interview"]["prices"]["basic_site"] == {"too_cheap": 2000, "bargain": 5000, "expensive": 9000}
    listing = client.get("/api/marketing/interviews").json()
    assert listing["summary"]["count"] == 1 and listing["summary"]["offers"]["basic_site"]["range"] == [5000, 9000]
    assert [g["id"] for g in listing["guide"]][0] == "find_you" and len(listing["offers"]) == 4
    assert client.post("/api/marketing/interviews", json={"business": "X"}).json()["ok"] is False


def paid_deal(client, phone="98450 31762"):
    d = client.post("/api/deals", json={"email": "ravi@sribakery.in", "contact": "Ravi Kumar", "company": "Sri Bakery",
                                        "phone": phone, "service": "Business website", "amount": 15000}).json()["deal"]
    for stage in ("proposal_sent", "won", "in_progress", "delivered", "paid"):
        client.post(f"/api/deals/{d['id']}/move", json={"stage": stage})
    return d


def test_proof_permissions_and_drafts_over_http(client):
    d = paid_deal(client)
    empty = client.get(f"/api/marketing/proof/{d['id']}").json()
    assert empty["ok"] and empty["drafts"]["ok"] is False and "quote" in empty["items"]
    out = client.put(f"/api/marketing/proof/{d['id']}", json={"permissions": {"numbers": True, "name": True},
                                                              "facts": {"results": "42 direct orders in a month"}}).json()
    assert out["drafts"]["ok"] and "Sri Bakery" in out["drafts"]["case_study"] and out["proof"]["permissions"]["numbers"]
    assert client.get("/api/marketing/proof/999").json()["ok"] is False


def test_asks_owed_and_marking_one_done(client, monkeypatch):
    d = paid_deal(client)   # paid at the real time, so the asks clock must be real too
    monkeypatch.setattr(marketing, "now", lambda: datetime.now(timezone.utc) + timedelta(hours=1))
    asks = client.get("/api/marketing/asks").json()
    assert asks["ok"] and asks["review_link"] is False
    review = next(a for a in asks["items"] if a["kind"] == "review")
    assert review["contact"]["source"] == "client" and "Google review" in review["text"]
    assert client.post(f"/api/marketing/asks/{d['id']}/review/done").json()["ok"]
    assert not any(a["kind"] == "review" for a in client.get("/api/marketing/asks").json()["items"])
    assert client.post(f"/api/marketing/asks/{d['id']}/party/done").json()["ok"] is False
