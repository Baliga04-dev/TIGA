from datetime import date

import pytest

import billing
from store import Store

TODAY = date(2026, 10, 22)
BIZ = {"name": "Adithya P Baliga", "email": "ymitigaa@gmail.com", "upi": "adithya@okaxis", "address": "Bengaluru"}


@pytest.fixture
def store():
    s = Store(":memory:")
    yield s
    s.close()


def deal(**kw):
    return {"id": 7, "email": "ravi@sri.in", "contact": "Ravi", "company": "Sri Bakery", "amount": 0,
            "advance_paid": 0, "balance_paid": 0, **kw}


def test_starter_rates_exist_and_can_be_edited(store):
    rates = billing.get_rates(store)
    assert {r["id"] for r in rates} >= {"one_page", "business_site", "redesign", "photo_edit"}
    assert all(r["price"] > 0 for r in rates)
    edited = [{**r, "price": 18000} if r["id"] == "business_site" else r for r in rates]
    billing.set_rates(store, edited)
    assert next(r for r in billing.get_rates(store) if r["id"] == "business_site")["price"] == 18000


def test_bad_rate_cards_are_rejected(store):
    with pytest.raises(ValueError):
        billing.set_rates(store, [{"id": "x", "name": "", "price": 100, "unit": "project", "days": 1}])
    with pytest.raises(ValueError):
        billing.set_rates(store, [{"id": "x", "name": "X", "price": -5, "unit": "project", "days": 1}])


def test_proposal_totals_advance_timeline_and_what_the_client_sends(store):
    p = billing.build_proposal(deal(), [{"rate_id": "business_site", "qty": 1}, {"rate_id": "photo_edit", "qty": 20}],
                               billing.get_rates(store), BIZ, TODAY)
    business = next(r for r in billing.get_rates(store) if r["id"] == "business_site")["price"]
    photo = next(r for r in billing.get_rates(store) if r["id"] == "photo_edit")["price"]
    assert p["total"] == business + 20 * photo
    assert p["advance"] == p["total"] // 2 and p["balance"] == p["total"] - p["advance"]
    assert p["valid_until"] == "2026-11-05" and p["days"] >= 7
    assert any("logo" in r.lower() for r in p["client_provides"])
    text = billing.proposal_text(p)
    assert "Sri Bakery" in text and f"{p['advance']:,}" in text and "50%" in text


def test_proposal_needs_known_items(store):
    with pytest.raises(ValueError):
        billing.build_proposal(deal(), [{"rate_id": "nope", "qty": 1}], billing.get_rates(store), BIZ, TODAY)
    with pytest.raises(ValueError):
        billing.build_proposal(deal(), [], billing.get_rates(store), BIZ, TODAY)


def test_invoices_are_numbered_in_sequence_per_year(store):
    assert billing.next_invoice_number(store, TODAY) == "INV-2026-0001"
    assert billing.next_invoice_number(store, TODAY) == "INV-2026-0002"
    assert billing.next_invoice_number(store, date(2027, 1, 2)) == "INV-2027-0001"


def test_advance_and_balance_invoices_charge_the_right_amount_with_a_upi_link():
    adv = billing.build_invoice(deal(amount=20000), "advance", "INV-2026-0001", BIZ, TODAY)
    assert adv["amount"] == 10000
    assert adv["upi_link"] == "upi://pay?pa=adithya%40okaxis&pn=Adithya+P+Baliga&am=10000.00&cu=INR&tn=INV-2026-0001"
    bal = billing.build_invoice(deal(amount=20000, advance_paid=10000), "balance", "INV-2026-0002", BIZ, TODAY)
    assert bal["amount"] == 10000
    with pytest.raises(ValueError, match="nothing"):
        billing.build_invoice(deal(amount=20000, advance_paid=10000, balance_paid=10000), "balance", "X", BIZ, TODAY)
    with pytest.raises(ValueError, match="UPI"):
        billing.build_invoice(deal(amount=20000), "advance", "X", {**BIZ, "upi": ""}, TODAY)


def test_printable_pages_escape_client_text_and_embed_the_qr():
    nasty = deal(company='<script>alert(1)</script>', amount=20000)
    inv = billing.build_invoice(nasty, "advance", "INV-2026-0001", BIZ, TODAY)
    page = billing.render_html("invoice", inv)
    assert "<script>alert" not in page and "&lt;script&gt;" in page
    assert "<svg" in page and "INV-2026-0001" in page and "10,000" in page


# --- the trust-first quote ------------------------------------------------------------------------
def test_a_proposal_states_every_trust_term_and_the_year_two_renewal(store):
    rates = billing.get_rates(store)
    p = billing.build_proposal(deal(), [{"rate_id": "business_site", "qty": 1}], rates, BIZ, TODAY,
                               terms=billing.get_terms(store))
    text, page = billing.proposal_text(p), billing.render_html("proposal", p)
    for words in ("domain is registered in your name", "No auto-debit", "balance only after the site is live",
                  "Rs 1,200 a year", "one all-in price"):
        assert words.lower() in text.lower(), words
    assert "₹1,200 a year" in page and "registered in your name" in page
    launch = TODAY.toordinal() + p["days"]
    assert p["renewal"]["due"] == date.fromordinal(launch + 365).strftime("%B %Y")


def test_renewal_terms_are_a_setting_with_limits(store):
    assert billing.get_terms(store)["renewal_yearly"] == 1200
    billing.set_terms(store, {"renewal_yearly": 900, "renewal_what": "the .in domain"})
    assert billing.get_terms(store) == {"renewal_yearly": 900, "renewal_what": "the .in domain"}
    with pytest.raises(ValueError):
        billing.set_terms(store, {"renewal_yearly": -1, "renewal_what": "x"})


def test_the_handover_sheet_lists_what_the_client_owns_and_never_asks_for_passwords():
    sheet = billing.build_handover(deal(company="<b>Sri</b> Bakery"), BIZ, {"renewal_yearly": 1200, "renewal_what": "domain"}, TODAY)
    page = billing.render_html("handover", sheet)
    assert "&lt;b&gt;Sri&lt;/b&gt; Bakery" in page and "<b>Sri</b>" not in page
    for row in ("Domain name", "Registered in the name of", "Renews on", "Google Business Profile", "WhatsApp number"):
        assert row in page, row
    assert "password" in page.lower() and "Passwords are not written here" in page
    assert "<input" not in page
