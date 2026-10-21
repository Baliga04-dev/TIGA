import config
import services


def seed():
    store = services.get_store()
    a, _ = store.upsert_prospect({"key": "osm:node/1", "source": "osm", "name": "Phone Only", "category": "bakery",
                                  "phone": "+91 1", "status": "needs_contact", "problems": ["no_website"]})
    b, _ = store.upsert_prospect({"key": "osm:node/2", "source": "osm", "name": "Ready Shop", "category": "cafe",
                                  "email": "hi@ready.in", "email_source": "https://ready.in/contact",
                                  "status": "ready", "problems": ["no_https"]})
    return a, b


def test_lists_prospects_with_counts(client):
    seed()
    out = client.get("/api/prospects", params={"status": "needs_contact"}).json()
    assert [p["name"] for p in out["items"]] == ["Phone Only"]
    assert out["counts"] == {"needs_contact": 1, "ready": 1}


def test_adding_an_email_drafts_it_for_approval(client, monkeypatch):
    monkeypatch.setattr(config, "SENDER_NAME", "Adithya")
    a, _ = seed()
    out = client.post(f"/api/prospects/{a['id']}/contact", json={"email": "owner@phoneonly.in"}).json()
    assert out["ok"] and out["draft"]["status"] == "drafted" and "Phone Only" in out["draft"]["body"]
    assert client.post(f"/api/prospects/{a['id']}/contact", json={"email": "nope"}).status_code == 422


def test_skip_and_unknown_ids(client):
    a, _ = seed()
    assert client.post(f"/api/prospects/{a['id']}/skip").json()["prospect"]["status"] == "skipped"
    assert client.post("/api/prospects/999/skip").json()["ok"] is False


def test_run_write_now_drafts_ready_prospects_and_status_reports_it(client, monkeypatch):
    monkeypatch.setattr(config, "SENDER_NAME", "Adithya")
    seed()
    out = client.post("/api/analyst/run", json={"phase": "write"}).json()
    assert out["ok"] and out["result"]["drafted"] == 1
    status = client.get("/api/analyst/status").json()
    assert status["last"]["phase"] == "write" and status["counts"]["drafted"] == 1
    assert client.post("/api/analyst/run", json={"phase": "explode"}).status_code == 422
