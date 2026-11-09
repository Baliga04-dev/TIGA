"""The phone remote: a page on the home Wi-Fi that sends commands to Tiga when the PC's mic can't hear them."""
import pytest
from fastapi.testclient import TestClient

import config
import main
import services

PHONE = ("192.168.0.50", 51000)


@pytest.fixture
def exposed(monkeypatch):
    """Tiga listening on the Wi-Fi (TIGA_PHONE=on), as the owner sets it up."""
    monkeypatch.setattr(config, "HOST", "0.0.0.0")
    monkeypatch.setattr(config, "PHONE_ENABLED", True)


@pytest.fixture
def phone(exposed):
    return TestClient(main.app, client=PHONE, base_url="http://192.168.0.102:8000")


@pytest.fixture
def pc(exposed):
    return TestClient(main.app, client=("127.0.0.1", 52000))


def paired(phone, pc):
    token = pc.get("/api/settings/phone").json()["token"]
    phone.headers["X-Tiga-Phone"] = token
    return token


def test_the_phone_gets_only_its_page_and_its_api(phone):
    assert phone.get("/phone").status_code == 200
    assert "Tiga" in phone.get("/phone").text
    for path in ("/api/status", "/api/outreach", "/api/settings/phone", "/docs", "/"):
        assert phone.get(path).status_code == 403, path
    assert phone.post("/api/outreach/1/approve").status_code == 403


def test_the_page_is_served_with_a_strict_content_policy(phone):
    policy = phone.get("/phone").headers["content-security-policy"]
    assert "script-src 'self'" in policy and "frame-ancestors 'none'" in policy and "unsafe-inline" not in policy


def test_without_the_pairing_code_the_phone_api_refuses(phone, pc):
    assert phone.post("/api/phone/command", json={"text": "volume up"}).status_code == 401
    phone.headers["X-Tiga-Phone"] = "wrong"
    assert phone.post("/api/phone/press", json={"button": "play_pause"}).status_code == 401


def test_a_paired_phone_runs_a_command_through_the_assistant(phone, pc, ran):
    paired(phone, pc)
    out = phone.post("/api/phone/command", json={"text": "volume up"}, headers={"Origin": "http://192.168.0.102:8000"})
    assert out.status_code == 200 and out.json()["ok"] and out.json()["reply"]
    assert ran and "175" in ran[0]                      # the volume-up key went to the PC
    assert services.get_store().list_chats()[0]["user_text"] == "volume up"   # it shows in the Chat history too


def test_media_buttons_go_through_the_executor_and_unknown_ones_are_refused(phone, pc, ran):
    paired(phone, pc)
    assert phone.post("/api/phone/press", json={"button": "play_pause"}).json()["ok"]
    assert "179" in ran[-1]
    assert phone.post("/api/phone/press", json={"button": "shutdown"}).status_code == 422


def test_an_action_that_needs_a_click_can_be_confirmed_on_the_phone(phone, pc, ran):
    paired(phone, pc)
    out = phone.post("/api/phone/command", json={"text": "lock the screen"}).json()
    pending = [a for a in out["actions"] if a.get("status") == "needs_confirmation"]
    assert pending and pending[0]["summary"] and not ran       # nothing ran yet
    done = phone.post(f"/api/phone/actions/{pending[0]['pending_id']}/confirm").json()
    assert done["ok"] and ran


def test_the_phone_sees_due_reminders(phone, pc):
    paired(phone, pc)
    services.get_store().add_reminder("Acme replied: interested.", "2000-01-01T00:00:00+00:00")
    state = phone.get("/api/phone/state").json()
    assert state["ok"] and state["reminders"][0]["text"] == "Acme replied: interested."


def test_a_new_pairing_code_locks_out_the_old_one(phone, pc):
    old = paired(phone, pc)
    new = pc.post("/api/settings/phone/new-code").json()["token"]
    assert new != old and phone.get("/api/phone/state").status_code == 401


def test_the_pc_gets_the_pairing_link_and_qr(pc):
    info = pc.get("/api/settings/phone").json()
    assert info["enabled"] and info["url"].endswith(f"/phone#k={info['token']}") and "<svg" in info["qr_svg"]


def test_with_the_phone_remote_off_nothing_is_exposed_and_the_api_says_how_to_turn_it_on(client):
    info = client.get("/api/settings/phone").json()
    assert info["enabled"] is False and "TIGA_PHONE" in info["how"]
    assert client.post("/api/phone/command", json={"text": "hi"}).status_code == 404


def test_nothing_else_leaks_through_the_phone_routes(phone, pc):
    paired(phone, pc)
    for path in ("/phone/main.py", "/phone/..%2Fmain.py", "/phone/.env", "/static/phone/phone.js"):
        assert phone.get(path).status_code in (403, 404), path
    evil = phone.post("/api/phone/command", json={"text": "volume up"}, headers={"Origin": "https://evil.example"})
    assert evil.status_code == 403


def test_the_browser_extension_socket_is_for_this_pc_only(phone, monkeypatch):
    from starlette.websockets import WebSocketDisconnect
    monkeypatch.setattr(config, "BRIDGE_TOKEN", "secret")
    with pytest.raises(WebSocketDisconnect):
        with phone.websocket_connect("/ws/bridge?token=secret") as ws:
            ws.receive_json()
