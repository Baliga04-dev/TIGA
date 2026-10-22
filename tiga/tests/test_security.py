"""State-changing API calls must not be triggerable from other websites."""
import pytest

import config
import crew
import git_ops

POSTS = ["/api/agents/run", "/api/github/sync"]


@pytest.fixture(autouse=True)
def quiet_agents(monkeypatch):
    async def fake_cycle():
        return {"ok": True, "tester": {"ok": True, "checks": []}}

    async def fake_push():
        return {"ok": False, "error": "disabled in tests"}

    monkeypatch.setattr(crew, "run_agent_cycle", fake_cycle)
    monkeypatch.setattr(git_ops, "push_current_branch", fake_push)


@pytest.mark.parametrize("path", POSTS + ["/api/chat"])
@pytest.mark.parametrize("origin", ["https://evil.example", "http://localhost.evil.example", "null"])
def test_cross_site_posts_are_rejected(client, path, origin):
    body = {"text": "hi", "history": []} if path == "/api/chat" else None
    r = client.post(path, json=body, headers={"Origin": origin})
    assert r.status_code == 403


@pytest.mark.parametrize("origin", ["http://localhost:3000", "http://127.0.0.1:5173", "http://[::1]:3000"])
def test_local_origins_are_allowed(client, origin):
    assert client.post("/api/agents/run", headers={"Origin": origin}).status_code == 200


def test_requests_without_an_origin_are_allowed(client):
    assert client.post("/api/agents/run").status_code == 200


def test_extra_origins_can_be_configured(client, monkeypatch):
    monkeypatch.setattr(config, "ALLOWED_ORIGINS", ["http://tiga.lan:3000"])
    assert client.post("/api/agents/run", headers={"Origin": "http://tiga.lan:3000"}).status_code == 200


def test_reads_are_not_blocked_by_origin(client):
    assert client.get("/api/status", headers={"Origin": "https://evil.example"}).status_code == 200


def test_env_example_endpoint_hides_secret_values(client, tmp_path, monkeypatch):
    import main

    sample = tmp_path / ".env.example"
    sample.write_text("# comment\nOPENAI_API_KEY=sk-live-123\nGITHUB_TOKEN=ghp_abc\nHOST=127.0.0.1\n")
    monkeypatch.setattr(main, "ENV_EXAMPLE", sample)
    text = client.get("/api/env-example").text
    assert "sk-live-123" not in text and "ghp_abc" not in text
    assert "OPENAI_API_KEY=" in text and "HOST=127.0.0.1" in text and "# comment" in text
