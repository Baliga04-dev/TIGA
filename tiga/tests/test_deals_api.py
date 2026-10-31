def test_full_deal_lifecycle_over_http(client):
    d = client.post("/api/deals", json={"email": "ravi@sri.in", "company": "Sri Bakery", "amount": 20000}).json()["deal"]
    for stage in ("proposal_sent", "won", "in_progress", "delivered"):
        assert client.post(f"/api/deals/{d['id']}/move", json={"stage": stage}).json()["ok"]
    client.post(f"/api/deals/{d['id']}/payment", json={"kind": "advance", "amount": 10000})
    out = client.post(f"/api/deals/{d['id']}/payment", json={"kind": "balance", "amount": 10000}).json()
    assert out["deal"]["stage"] == "paid"
    listing = client.get("/api/deals").json()
    assert listing["money"]["paid_this_month"] == 20000 and listing["items"][0]["stage"] == "paid"


def test_refusals_are_readable(client):
    d = client.post("/api/deals", json={"email": "a@b.in"}).json()["deal"]
    bad = client.post(f"/api/deals/{d['id']}/move", json={"stage": "paid"}).json()
    assert bad["ok"] is False and "not allowed" in bad["error"]
    assert client.post("/api/deals/999/move", json={"stage": "won"}).json()["ok"] is False
    assert client.post(f"/api/deals/{d['id']}/payment", json={"kind": "advance", "amount": 0}).status_code == 422


def test_edit_details(client):
    d = client.post("/api/deals", json={"email": "a@b.in"}).json()["deal"]
    out = client.patch(f"/api/deals/{d['id']}", json={"amount": 15000, "service": "Website"}).json()
    assert out["deal"]["amount"] == 15000 and out["deal"]["service"] == "Website"


import config
import services


def deal_at(client, stage, amount=20000, email="ravi@sri.in"):
    d = client.post("/api/deals", json={"email": email, "company": "Sri Bakery", "amount": amount}).json()["deal"]
    path = {"proposal_sent": ["proposal_sent"], "won": ["proposal_sent", "won"],
            "delivered": ["proposal_sent", "won", "in_progress", "delivered"]}[stage]
    for s in path:
        client.post(f"/api/deals/{d['id']}/move", json={"stage": s})
    return d


def test_proposal_is_drafted_for_approval_and_printable(client, monkeypatch):
    monkeypatch.setattr(config, "SENDER_NAME", "Adithya")
    d = client.post("/api/deals", json={"email": "ravi@sri.in", "company": "Sri Bakery"}).json()["deal"]
    out = client.post(f"/api/deals/{d['id']}/proposal", json={"items": [{"rate_id": "business_site", "qty": 1}]}).json()
    assert out["ok"] and out["draft"]["status"] == "drafted" and "50%" in out["draft"]["body"]
    assert services.get_store().get_deal(d["id"])["amount"] == out["document"]["total"]  # price filled in
    page = client.get(f"/api/documents/{out['document']['id']}")
    assert page.status_code == 200 and "Proposal for Sri Bakery" in page.text
    assert "default-src 'none'" in page.headers["content-security-policy"]


def test_invoice_needs_a_upi_id_and_then_numbers_and_drafts_it(client, monkeypatch):
    d = deal_at(client, "won")
    monkeypatch.setattr(config, "UPI_ID", "")
    assert "UPI" in client.post(f"/api/deals/{d['id']}/invoice", json={"kind": "advance"}).json()["error"]
    monkeypatch.setattr(config, "UPI_ID", "adithya@okaxis")
    out = client.post(f"/api/deals/{d['id']}/invoice", json={"kind": "advance"}).json()
    assert out["document"]["number"].startswith("INV-") and out["document"]["amount"] == 10000
    assert "upi://pay" in out["draft"]["body"]
    page = client.get(f"/api/documents/{out['document']['id']}").text
    assert "<svg" in page and "10,000" in page
    assert [x["kind"] for x in client.get(f"/api/deals/{d['id']}/documents").json()["items"]] == ["invoice"]


def test_a_refused_invoice_does_not_burn_an_invoice_number(client, monkeypatch):
    monkeypatch.setattr(config, "UPI_ID", "")
    d = deal_at(client, "won")
    client.post(f"/api/deals/{d['id']}/invoice", json={"kind": "advance"})
    monkeypatch.setattr(config, "UPI_ID", "a@upi")
    out = client.post(f"/api/deals/{d['id']}/invoice", json={"kind": "advance"}).json()
    assert out["document"]["number"].endswith("-0001")


def test_getting_paid_drafts_a_thank_you_with_testimonial_and_referral_asks(client, monkeypatch):
    monkeypatch.setattr(config, "PORTFOLIO_URL", "https://baliga04-dev.github.io")
    d = deal_at(client, "delivered")
    out = client.post(f"/api/deals/{d['id']}/move", json={"stage": "paid"}).json()
    body = out["draft"]["body"]
    assert "testimonial" in body and "introduction" in body and "baliga04-dev.github.io" in body


def test_rate_card_round_trip(client):
    rates = client.get("/api/pricing").json()["rates"]
    rates[0]["price"] = 7000
    assert client.put("/api/pricing", json={"rates": rates}).json()["rates"][0]["price"] == 7000
    rates[0]["price"] = -1
    assert client.put("/api/pricing", json={"rates": rates}).json()["ok"] is False
    assert client.get("/api/documents/999").status_code == 404


def test_handover_sheet_and_renewal_terms_over_http(client):
    d = client.post("/api/deals", json={"email": "ravi@sri.in", "company": "Sri Bakery", "amount": 15000}).json()["deal"]
    early = client.post(f"/api/deals/{d['id']}/handover").json()
    assert early["ok"] is False and "delivered" in early["error"]
    for stage in ("proposal_sent", "won", "in_progress", "delivered"):
        client.post(f"/api/deals/{d['id']}/move", json={"stage": stage})
    out = client.post(f"/api/deals/{d['id']}/handover").json()
    assert out["ok"] and out["document"]["kind"] == "handover"
    page = client.get(f"/api/documents/{out['document']['id']}")
    assert page.status_code == 200 and "Sri Bakery" in page.text
    assert client.get("/api/pricing/terms").json()["terms"]["renewal_yearly"] == 1200
    saved = client.put("/api/pricing/terms", json={"renewal_yearly": 1500, "renewal_what": "domain and email"}).json()
    assert saved["ok"] and saved["terms"]["renewal_yearly"] == 1500
