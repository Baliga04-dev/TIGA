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
