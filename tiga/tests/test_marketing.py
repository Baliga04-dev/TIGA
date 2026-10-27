from datetime import datetime, timedelta, timezone
from urllib.parse import unquote

import pytest

import marketing
from store import Store

IST = timezone(timedelta(hours=5, minutes=30))
NOON = datetime(2026, 10, 27, 12, 0, tzinfo=IST)          # a Tuesday, inside shop hours
EVENING = datetime(2026, 10, 27, 20, 30, tzinfo=IST)      # after 7pm, before 9pm
LATE = datetime(2026, 10, 27, 22, 0, tzinfo=IST)


@pytest.fixture
def store():
    return Store(":memory:")


def contact(store, **kw):
    data = {"name": "Ramesh Kumar", "business": "Sri Ganesh Bakery", "phone": "98450 31762", "source": "map",
            "source_detail": "OpenStreetMap listing", **kw}
    return marketing.add_contact(store, data)


# --- the ledger ---------------------------------------------------------------------------------
def test_phone_numbers_are_normalised_to_wa_me_form(store):
    assert contact(store, phone="098450 31762")["phone"] == "919845031762"
    assert contact(store, name="B", phone="+91 80 4127 3906")["phone"] == "918041273906"


def test_a_contact_needs_a_name_and_a_known_source(store):
    with pytest.raises(marketing.MarketingError):
        marketing.add_contact(store, {"name": " ", "source": "warm"})
    with pytest.raises(marketing.MarketingError):
        marketing.add_contact(store, {"name": "X", "source": "scraped"})


def test_do_not_contact_survives_deleting_and_adding_the_number_again(store):
    c = contact(store)
    marketing.do_not_contact(store, c["id"], "asked at the shop", NOON)
    marketing.delete_contact(store, c["id"])
    again = contact(store)
    assert again["dnc"] and not marketing.can_contact(store, again["id"], "whatsapp", NOON)["ok"]


# --- the gate -----------------------------------------------------------------------------------
def test_a_number_from_the_map_needs_permission_before_whatsapp(store):
    c = contact(store)
    gate = marketing.can_contact(store, c["id"], "whatsapp", NOON)
    assert not gate["ok"] and "permission" in gate["reason"]
    marketing.give_consent(store, c["id"], "whatsapp", "asked in person", NOON, notice=True)
    assert marketing.can_contact(store, c["id"], "whatsapp", NOON)["ok"]


def test_people_the_owner_knows_need_no_recorded_permission(store):
    friend = contact(store, name="Kavya", business="", source="warm", source_detail="college friend")
    assert marketing.can_contact(store, friend["id"], "whatsapp", NOON)["ok"]


def test_shops_only_between_ten_and_seven_friends_until_nine(store):
    shop = contact(store)
    marketing.give_consent(store, shop["id"], "whatsapp", "asked in person", NOON)
    friend = contact(store, name="Kavya", phone="99001 27458", source="warm")
    gate = marketing.can_contact(store, shop["id"], "whatsapp", EVENING)
    assert not gate["ok"] and "10am" in gate["reason"]
    assert marketing.can_contact(store, friend["id"], "whatsapp", EVENING)["ok"]
    assert not marketing.can_contact(store, friend["id"], "whatsapp", LATE)["ok"]


def test_two_unanswered_messages_in_thirty_days_is_the_limit(store):
    c = contact(store, source="warm")
    for days in (5, 2):
        marketing.record_touch(store, c["id"], channel="whatsapp", direction="out", kind="message", now=NOON - timedelta(days=days))
    gate = marketing.can_contact(store, c["id"], "whatsapp", NOON)
    assert not gate["ok"] and "without a reply" in gate["reason"]
    assert marketing.can_contact(store, c["id"], "whatsapp", NOON + timedelta(days=26))["ok"]   # the older one aged out
    marketing.record_touch(store, c["id"], channel="whatsapp", direction="in", kind="message", now=NOON)
    assert marketing.can_contact(store, c["id"], "whatsapp", NOON + timedelta(hours=1))["ok"]


def test_email_needs_permission_unless_the_owner_published_the_address(store):
    listed = contact(store, email="hello@sriganesh.in", owner_published=True)
    found = contact(store, name="Other", phone="99001 27458", email="owner@gmail.com")
    assert marketing.can_contact(store, listed["id"], "email", NOON)["ok"]
    assert not marketing.can_contact(store, found["id"], "email", NOON)["ok"]


def test_do_not_contact_closes_every_channel(store):
    c = contact(store, source="warm")
    marketing.do_not_contact(store, c["id"], "said no", NOON)
    for channel in ("whatsapp", "call", "email"):
        gate = marketing.can_contact(store, c["id"], channel, NOON)
        assert not gate["ok"] and "not to be contacted" in gate["reason"]


def test_whatsapp_links_exist_only_when_the_gate_allows(store):
    c = contact(store)
    assert not marketing.whatsapp_link(store, c["id"], "Hello", NOON)["ok"]
    marketing.give_consent(store, c["id"], "whatsapp", "asked in person", NOON)
    link = marketing.whatsapp_link(store, c["id"], "Hello & welcome", NOON)
    assert link["ok"] and link["url"].startswith("https://wa.me/919845031762?text=")
    assert unquote(link["url"].split("text=")[1]) == "Hello & welcome"


def test_an_outbound_touch_the_gate_refuses_is_not_recorded(store):
    c = contact(store)
    with pytest.raises(marketing.MarketingError):
        marketing.record_touch(store, c["id"], channel="whatsapp", direction="out", kind="message", now=NOON)
    assert store.list_touches(c["id"]) == []


# --- visits, inbound ------------------------------------------------------------------------------
def prospect(store, n=1, lat=12.9300, lon=77.5830, **kw):
    row, _ = store.upsert_prospect({"key": f"osm:node/{n}", "source": "osm", "name": f"Shop {n}", "category": "bakery",
                                    "phone": "", "status": "no_contact", "lat": lat, "lon": lon, **kw})
    return row


def test_a_visit_creates_the_contact_and_records_what_was_agreed(store):
    p = prospect(store)
    c = marketing.log_visit(store, p["id"], outcome="interested", name="Suresh", phone="98860 44217",
                            consent=["whatsapp"], notice=True, note="wants a menu page", dnc=False, now=NOON)
    assert c["source"] == "walk_in" and c["prospect_id"] == p["id"] and c["business"] == "Shop 1"
    assert c["consent"]["whatsapp"]["how"] == "asked in person" and c["notice_at"]
    assert [t["outcome"] for t in store.list_touches(c["id"])] == ["interested"]
    again = marketing.log_visit(store, p["id"], outcome="come_back", name="", phone="", consent=[], notice=False,
                                note="", dnc=False, now=NOON + timedelta(days=3))
    assert again["id"] == c["id"] and len(store.list_touches(c["id"])) == 2


def test_a_visit_where_they_said_no_marks_do_not_contact(store):
    p = prospect(store)
    c = marketing.log_visit(store, p["id"], outcome="not_interested", name="", phone="98860 44217", consent=[],
                            notice=False, note="", dnc=True, now=NOON)
    assert c["dnc"] and store.is_suppressed("tel:+919886044217")


def test_a_message_with_a_reference_code_records_permission(store):
    p = prospect(store, n=42)
    c = marketing.inbound(store, f"Ref T{p['id']}", name="Latha", phone="97411 50382", note="saw the sheet", now=NOON)
    assert c["source"] == "inbound" and c["prospect_id"] == p["id"]
    assert c["consent"]["whatsapp"]["how"] == "messaged first"
    with pytest.raises(marketing.MarketingError):
        marketing.inbound(store, "T99999", name="", phone="97411 50382", note="", now=NOON)


# --- walk-in routes ---------------------------------------------------------------------------------
def test_a_route_lists_nearby_shops_in_walking_order(store):
    centre = marketing.LOCALITIES["Jayanagar"]
    far = prospect(store, n=1, lat=centre[0] + 0.006, lon=centre[1])          # about 670 m north
    near = prospect(store, n=2, lat=centre[0] + 0.002, lon=centre[1])         # about 220 m
    prospect(store, n=3, lat=centre[0] + 0.1, lon=centre[1])                  # 11 km away
    prospect(store, n=4, lat=centre[0], lon=centre[1] + 0.001, status="disqualified")
    said_no = prospect(store, n=5, lat=centre[0] - 0.001, lon=centre[1])
    marketing.log_visit(store, said_no["id"], outcome="not_interested", name="", phone="", consent=[], notice=False,
                        note="", dnc=True, now=NOON)
    visited = prospect(store, n=6, lat=centre[0] - 0.002, lon=centre[1])
    marketing.log_visit(store, visited["id"], outcome="not_met", name="", phone="", consent=[], notice=False,
                        note="", dnc=False, now=NOON - timedelta(days=10))
    prospect(store, n=7, lat=None, lon=None)
    out = marketing.route(store, "Jayanagar", "all", 1.0, NOON)
    assert [s["id"] for s in out["stops"]] == [near["id"], far["id"]]
    assert out["stops"][0]["walk_m"] < out["stops"][1]["walk_m"] + 1000 and out["without_coordinates"] == 1
    assert out["stops"][0]["ref"] == f"T{near['id']}"


def test_an_unknown_locality_is_refused(store):
    with pytest.raises(marketing.MarketingError):
        marketing.route(store, "Atlantis", "all", 1.0, NOON)


# --- printables ------------------------------------------------------------------------------------
def test_the_audit_sheet_escapes_names_and_carries_the_qr_ref_and_notice(store):
    p = prospect(store, name="<script>x</script> Dosa Corner", category="restaurant", problems=["site_down", "not_mobile"],
                 website="http://dosacorner.in")
    page = marketing.audit_sheet_html(p, owner="Adithya Baliga", whatsapp="917795052550",
                                      demos_url="https://baliga04-dev.github.io/demos/", today=NOON.date())
    assert "<script>x" not in page and "&lt;script&gt;" in page
    assert f"Ref T{p['id']}" in page and "<svg" in page and "malnad-table" in page
    assert "didn't open" in page and "phones" in page
    assert "delete" in page.lower()      # the one-line privacy notice: how to have your number removed


def test_the_route_sheet_lists_every_stop(store):
    centre = marketing.LOCALITIES["Jayanagar"]
    prospect(store, n=1, lat=centre[0] + 0.001, lon=centre[1], name="Annapoorna & Sons")
    stops = marketing.route(store, "Jayanagar", "all", 1.0, NOON)["stops"]
    page = marketing.route_sheet_html("Jayanagar", stops, today=NOON.date())
    assert "Annapoorna &amp; Sons" in page and "Jayanagar" in page


# --- the warm message and the scorecard ------------------------------------------------------------------
def test_the_warm_message_is_personal_short_and_links_the_demos():
    text = marketing.warm_message({"name": "Kavya Rao", "source_detail": "college friend"}, owner="Adithya",
                                  demos_url="https://baliga04-dev.github.io/demos/")
    assert text.startswith("Hi Kavya") and "https://baliga04-dev.github.io/demos/" in text and len(text) < 600


def test_the_scorecard_counts_the_week_and_says_when_there_is_too_little_data(store):
    friend = contact(store, name="Kavya", phone="99001 27458", source="warm")
    marketing.record_touch(store, friend["id"], channel="whatsapp", direction="out", kind="message", now=NOON)
    p = prospect(store)
    marketing.log_visit(store, p["id"], outcome="talked", name="Suresh", phone="98860 44217", consent=["whatsapp"],
                        notice=True, note="", dnc=False, now=NOON)
    marketing.log_visit(store, prospect(store, n=2)["id"], outcome="not_met", name="", phone="", consent=[],
                        notice=False, note="", dnc=False, now=NOON)
    card = marketing.scorecard(store, NOON.date())
    week = card["weeks"][0]
    assert len(card["weeks"]) == 4 and week["start"] == "2026-10-26"
    assert (week["warm_sent"], week["visits"], week["conversations"], week["consents"]) == (1, 2, 1, 1)
    assert not card["enough_data"]


def test_the_audit_sheet_names_the_kind_of_shop_properly(store):
    gadgets = prospect(store, n=8, category="electronics")
    page = marketing.audit_sheet_html(gadgets, owner="Adithya", whatsapp="917795052550",
                                      demos_url="https://baliga04-dev.github.io/demos/", today=NOON.date())
    assert "search for an electronics shop" in page and "a electronics" not in page
    assert "Websites I built for Bengaluru shops" in page     # no demo of this kind yet: the index, said honestly
