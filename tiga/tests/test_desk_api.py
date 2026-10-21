import config
import services


def test_report_preview_does_not_send_or_claim_the_day(client, google):
    out = client.get("/api/reports/preview").json()
    assert out["ok"] and "OUTREACH" in out["body"] and out["subject"].startswith("[")
    assert google.sent == []
    assert services.get_store().list_reports() == []


def test_archive_lists_sent_reports_newest_first(client):
    store = services.get_store()
    for day in ("2026-10-20", "2026-10-21"):
        rid = store.save_report("daily", day, f"s{day}", "body", "me@work.io")
        store.mark_report_sent(rid)
    items = client.get("/api/reports").json()["items"]
    assert [r["report_date"] for r in items] == ["2026-10-21", "2026-10-20"]


def test_issue_board_and_user_decisions(client):
    store = services.get_store()
    issue = store.open_issue("improvement", "Faster inbox", dedupe_key="k", source="manager")
    store.transition_issue(issue["id"], "triaged", actor="manager")
    listed = client.get("/api/issues").json()["items"]
    assert listed[0]["title"] == "Faster inbox"
    ok = client.post(f"/api/issues/{issue['id']}/transition", json={"status": "approved"}).json()
    assert ok["ok"] and ok["issue"]["status"] == "approved"
    bad = client.post(f"/api/issues/{issue['id']}/transition", json={"status": "done"}).json()
    assert bad["ok"] is False and "not allowed" in bad["error"]
    assert client.post("/api/issues/999/transition", json={"status": "approved"}).json()["ok"] is False


def test_audit_trail_records_the_users_decision(client):
    store = services.get_store()
    issue = store.open_issue("bug", "x", dedupe_key="k", source="tester")
    client.post(f"/api/issues/{issue['id']}/transition", json={"status": "rejected"})
    log = client.get("/api/audit").json()["items"]
    assert any(e["actor"] == "user" and e["action"] == "issue.transition" for e in log)


def test_run_daily_now_reports_why_it_cannot_send(client, monkeypatch):
    monkeypatch.setattr(config, "GMAIL_USER_EMAIL", "")
    monkeypatch.setattr(config, "ADMIN_REPORT_EMAIL", "")
    out = client.post("/api/reports/daily/run").json()
    assert out["ok"] is False and "not configured" in out["error"]
