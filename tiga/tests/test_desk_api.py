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


def test_without_gmail_the_report_is_still_made_and_shown_in_the_app(client, monkeypatch):
    monkeypatch.setattr(config, "GMAIL_USER_EMAIL", "")
    monkeypatch.setattr(config, "ADMIN_REPORT_EMAIL", "")
    out = client.post("/api/reports/daily/run").json()
    assert out["ok"] is True and out["emailed"] is False and "not configured" in out["email_error"]
    items = {r["kind"]: r for r in client.get("/api/reports").json()["items"]}
    daily = items["daily"]
    assert "OUTREACH" in daily["body"] and "not configured" in daily["delivery_error"]
    assert "weekly" in items   # the R&D bot no longer waits for Gmail either
    assert "ONE EXPERIMENT" in items["marketing"]["body"]   # nor does the weekly marketing report


def test_skills_can_be_listed_read_and_edited_from_the_ui(client, tmp_path, monkeypatch):
    (tmp_path / "mailer").mkdir()
    (tmp_path / "mailer" / "SKILL.md").write_text("---\nname: mailer\n---\nold")
    monkeypatch.setattr(config, "SKILLS_DIR", str(tmp_path))
    assert client.get("/api/skills").json()["items"] == ["mailer"]
    assert client.get("/api/skills/mailer").json()["text"].endswith("old")
    assert client.put("/api/skills/mailer", json={"text": "new"}).json() == {"ok": True}
    assert (tmp_path / "mailer" / "SKILL.md").read_text() == "new"
    assert client.put("/api/skills/ghost", json={"text": "x"}).json()["ok"] is False
    assert any(e["action"] == "skill.edit" for e in client.get("/api/audit").json()["items"])


def test_rnd_runs_without_a_mailbox_and_keeps_the_report_in_tiga(client, monkeypatch):
    monkeypatch.setattr(config, "GMAIL_USER_EMAIL", "")
    monkeypatch.setattr(config, "ADMIN_REPORT_EMAIL", "")
    out = client.post("/api/rnd/run").json()
    assert out["ok"] is True and "Claude is not available" in out["research_error"]
    assert client.get("/api/reports").json()["items"][0]["kind"] == "research"
