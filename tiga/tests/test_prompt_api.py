def test_full_interview_over_http(client):
    started = client.post("/api/interviews", json={"idea": "A web app for bakers to track orders"}).json()
    assert started["ok"]
    iv = started["interview"]
    assert iv["status"] == "asking" and iv["question"]["text"]
    step = client.post(f"/api/interviews/{iv['id']}/answer", json={"text": "skip"}).json()["interview"]
    assert step["slots"][iv["question"]["slot"]] == "(you decide)"
    out = client.post(f"/api/interviews/{iv['id']}/generate").json()
    assert out["ok"] and "<goal>" in out["prompt"]


def test_unknown_interview_is_a_readable_error(client):
    out = client.post("/api/interviews/nope/generate").json()
    assert out["ok"] is False and "no interview" in out["error"]


def test_idea_is_validated(client):
    assert client.post("/api/interviews", json={"idea": ""}).status_code == 422
