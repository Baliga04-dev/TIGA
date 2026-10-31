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


# --- follow-ups after a visit ----------------------------------------------------------------------
def visit_with(store, n, consent, *, when=NOON, outcome="interested", name="Suresh Rao", phone=None):
    p = prospect(store, n=n, category="bakery")
    return marketing.log_visit(store, p["id"], outcome=outcome, name=name, phone=phone or f"98860 4{n:04d}",
                               consent=consent, notice=True, note="", dnc=False, now=when)


def test_follow_ups_are_owed_to_owners_who_agreed_to_whatsapp(store):
    yes = visit_with(store, 1, ["whatsapp"])
    visit_with(store, 2, [])                                            # agreed to nothing: never listed
    visit_with(store, 3, ["whatsapp"], when=NOON - timedelta(days=9))   # too long ago to count as a follow-up
    out = marketing.followups(store, NOON + timedelta(hours=3))
    assert [f["contact"]["id"] for f in out["items"]] == [yes["id"]]
    first = out["items"][0]
    assert not first["overdue"] and first["text"].startswith("Hi Suresh") and "/demos/malnad-table/" in first["text"]
    assert marketing.followups(store, NOON + timedelta(hours=49))["items"][0]["overdue"]


def test_a_follow_up_sent_after_the_visit_clears_it_and_counts_toward_the_week(store):
    c = visit_with(store, 1, ["whatsapp"])
    later = NOON + timedelta(hours=2)
    marketing.record_touch(store, c["id"], channel="whatsapp", direction="out", kind="message", now=later)
    out = marketing.followups(store, later + timedelta(minutes=5))
    assert out["items"] == [] and out["sent_this_week"] == 1 and out["weekly_cap"] == 10


def test_a_follow_up_without_a_known_name_says_hello_without_one(store):
    c = visit_with(store, 1, ["whatsapp"], name="")
    text = marketing.followups(store, NOON + timedelta(hours=1))["items"][0]["text"]
    assert text.startswith("Hi, this is") and "(owner)" not in text and c["business"] in text


# --- commission maths for restaurants -------------------------------------------------------------
def test_commission_maths_shows_what_moving_regulars_to_direct_orders_saves():
    out = marketing.commission_maths(orders=600, average=350, commission=25, direct_share=20, site_price=15000)
    assert out["app_sales"] == 210000 and out["commission"] == 52500
    assert out["saved_monthly"] == 10500 and out["saved_yearly"] == 126000 and out["payback_months"] == 2
    none = marketing.commission_maths(orders=600, average=350, commission=25, direct_share=0, site_price=15000)
    assert none["saved_monthly"] == 0 and none["payback_months"] is None


def test_commission_maths_refuses_impossible_numbers():
    with pytest.raises(marketing.MarketingError):
        marketing.commission_maths(orders=600, average=350, commission=80, direct_share=20, site_price=15000)
    with pytest.raises(marketing.MarketingError):
        marketing.commission_maths(orders=-1, average=350, commission=25, direct_share=20, site_price=15000)


def test_the_commission_sheet_is_honest_about_the_apps():
    out = marketing.commission_maths(orders=600, average=350, commission=25, direct_share=20, site_price=15000)
    page = marketing.commission_sheet_html("Udupi <Tiffins>", out, today=NOON.date())
    assert "Udupi &lt;Tiffins&gt;" in page and "₹52,500" in page and "₹10,500" in page
    assert "keep" in page.lower() and "new customers" in page   # the apps still bring new customers


# --- owner interviews and the price ladder -----------------------------------------------------------
def ladder(cheap, bargain, expensive, too):
    return {"too_cheap": cheap, "bargain": bargain, "expensive": expensive, "too_expensive": too}


def test_an_interview_keeps_answers_and_a_rising_price_ladder(store):
    row = marketing.add_interview(store, {"business": "Sri Ganesh Bakery", "category": "bakery",
                                          "answers": {"find_you": "Word of mouth and Swiggy"},
                                          "prices": {"basic_site": ladder(2000, 5000, 9000, 15000)}}, NOON)
    assert row["prices"]["basic_site"]["bargain"] == 5000
    with pytest.raises(marketing.MarketingError):
        marketing.add_interview(store, {"business": "X", "category": "bakery", "answers": {},
                                        "prices": {"basic_site": ladder(9000, 5000, 4000, 1000)}}, NOON)
    with pytest.raises(marketing.MarketingError):
        marketing.add_interview(store, {"business": "X", "category": "bakery", "answers": {}, "prices": {"yacht": ladder(1, 2, 3, 4)}}, NOON)


def test_the_interview_summary_gives_each_offer_a_price_range_and_counts_kinds_of_shop(store):
    for bargain, expensive, cat in ((4000, 9000, "bakery"), (6000, 12000, "salon"), (5000, 10000, "bakery")):
        marketing.add_interview(store, {"business": "Shop", "category": cat, "answers": {},
                                        "prices": {"basic_site": ladder(1000, bargain, expensive, 20000)}}, NOON)
    summary = marketing.interview_summary(store.list_owner_interviews())
    assert summary["count"] == 3 and summary["by_category"] == {"bakery": 2, "salon": 1} and summary["goal"] == 15
    basic = summary["offers"]["basic_site"]
    assert basic["answers"] == 3 and basic["range"] == [5000, 10000]
    assert summary["offers"]["photos"]["answers"] == 0 and summary["offers"]["photos"]["range"] is None


# --- proof: permissions, drafts and the asks owed after a project ---------------------------------
def a_deal(store, **kw):
    d = store.create_deal({"email": "ravi@sribakery.in", "contact": "Ravi Kumar", "company": "Sri Bakery",
                           "phone": "98450 31762", "service": "Business website", "amount": 15000, **kw})
    return d


def test_no_proof_draft_without_permission_or_a_real_number(store):
    d = a_deal(store)
    marketing.save_proof(store, d["id"], permissions={"name": False, "quote": False, "numbers": False},
                         facts={"problem": "No website", "built": "A menu site", "results": "Customers liked it", "quote": ""})
    out = marketing.proof_drafts(store, d["id"], owner="Adithya")
    assert not out["ok"] and "number or a quote" in out["reason"]


def test_proof_drafts_use_only_what_was_allowed_and_fit_google(store):
    d = a_deal(store)
    marketing.save_proof(store, d["id"], permissions={"name": False, "numbers": True, "quote": True},
                         facts={"problem": "Orders only came through apps at 25% commission",
                                "built": "A menu page with WhatsApp ordering. Call 98450 31762 to order",
                                "results": "42 direct orders in the first month",
                                "quote": "Regulars order straight from us now. " * 80})
    out = marketing.proof_drafts(store, d["id"], owner="Adithya")
    assert out["ok"] and "Sri Bakery" not in out["case_study"] and "42 direct orders" in out["case_study"]
    assert len(out["gbp"]) <= 1500 and "98450" not in out["gbp"] and "31762" not in out["gbp"]
    assert len(out["status"]) == 3 and out["linkedin"]


def test_the_name_appears_only_with_permission(store):
    d = a_deal(store)
    marketing.save_proof(store, d["id"], permissions={"name": True, "numbers": True}, facts={"results": "3x more calls"})
    assert "Sri Bakery" in marketing.proof_drafts(store, d["id"], owner="Adithya")["case_study"]


def test_asks_owed_after_payment_a_review_now_and_a_referral_after_two_weeks(store):
    d = a_deal(store)
    for stage in ("proposal_sent", "won", "in_progress", "delivered", "paid"):
        store.move_deal(d["id"], stage, actor="user")
    paid_day = datetime.fromisoformat(store.get_deal(d["id"])["paid_at"]).astimezone(IST)
    now = paid_day + timedelta(hours=1)
    asks = marketing.asks_owed(store, now, review_link="https://g.page/r/abc/review")
    assert [a["kind"] for a in asks] == ["review"]
    assert "https://g.page/r/abc/review" in asks[0]["text"] and asks[0]["contact"]["source"] == "client"
    later = marketing.asks_owed(store, paid_day + timedelta(days=15), review_link="")
    assert sorted(a["kind"] for a in later) == ["referral", "review"]
    marketing.ask_done(store, d["id"], "review", now)
    assert [a["kind"] for a in marketing.asks_owed(store, paid_day + timedelta(days=15), review_link="")] == ["referral"]


def test_a_client_can_be_messaged_in_shop_hours_without_a_separate_permission(store):
    d = a_deal(store)
    c = marketing.client_contact(store, store.get_deal(d["id"]))
    assert c["source"] == "client" and marketing.can_contact(store, c["id"], "whatsapp", NOON)["ok"]
    assert not marketing.can_contact(store, c["id"], "whatsapp", EVENING)["ok"]
    assert marketing.client_contact(store, store.get_deal(d["id"]))["id"] == c["id"]
