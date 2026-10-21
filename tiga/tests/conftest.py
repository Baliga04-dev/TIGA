import os
import tempfile

# Must run before `config` is imported anywhere: config.py calls load_dotenv()
# at import, and load_dotenv() never overrides variables that are already set.
_ISOLATED_ENV = {
    "OPENAI_API_KEY": "",
    "ELEVENLABS_API_KEY": "",
    "METRICS_ENDPOINT": "",
    "BOOKING_WEBHOOK": "",
    "GITHUB_TOKEN": "",
    "GITHUB_SYNC_INTERVAL_MINUTES": "0",
    "TIGA_ANALYST_TICK_MINUTES": "0",
    "GMAIL_CREDENTIALS_FILE": os.path.join(tempfile.gettempdir(), "tiga-tests-no-credentials.json"),
    "GMAIL_TOKEN_FILE": os.path.join(tempfile.gettempdir(), "tiga-tests-no-token.json"),
    "TIGA_TESTER_CHILD": "1",  # the tester agent must not recursively run this suite
}
os.environ.update(_ISOLATED_ENV)

import pytest
from fastapi.testclient import TestClient

import main


@pytest.fixture(autouse=True)
def fresh_services(tmp_path, monkeypatch):
    """Every test gets its own empty database and no leftover store/mailer."""
    import config
    import services

    monkeypatch.setattr(config, "DB_PATH", str(tmp_path / "tiga-test.db"))
    services.reset()
    yield
    services.reset()


@pytest.fixture
def client():
    return TestClient(main.app)


@pytest.fixture
def google():
    """Real GmailService running against a fake Google API client."""
    import gmail_service
    from fakes import FakeGoogleClient

    svc = gmail_service.GmailService()
    svc.service = FakeGoogleClient()
    svc._authenticated = True
    original = gmail_service.gmail_service
    gmail_service.gmail_service = svc
    yield svc.service
    gmail_service.gmail_service = original


class HttpMock:
    """Routes httpx requests by URL substring; anything unmatched fails the test."""

    def __init__(self):
        self.routes = []
        self.requests = []

    def add(self, url_part, *, json=None, text=None, status=200, exc=None, headers=None, content=None):
        self.routes.append((url_part, json, content if content is not None else text, status, exc, headers))

    def add_sequence(self, url_part, responses):
        """Answer successive calls to url_part with successive (status, json) pairs."""
        self.routes.append((url_part, "SEQ", iter(responses), 0, None, None))

    def handler(self, request):
        import httpx

        self.requests.append(request)
        for url_part, json, text, status, exc, headers in self.routes:
            if url_part in str(request.url):
                if exc:
                    raise exc
                if json == "SEQ":
                    status, payload = next(text)
                    return httpx.Response(status, json=payload)
                if json is not None:
                    return httpx.Response(status, json=json)
                if isinstance(text, bytes):
                    return httpx.Response(status, content=text, headers=headers)
                return httpx.Response(status, text=text or "", headers=headers)
        raise AssertionError(f"unexpected network call: {request.method} {request.url}")


@pytest.fixture
def http(monkeypatch):
    import httpx

    mock = HttpMock()
    real = httpx.AsyncClient

    class Patched(real):
        def __init__(self, *args, **kwargs):
            kwargs["transport"] = httpx.MockTransport(mock.handler)
            super().__init__(*args, **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", Patched)
    return mock
