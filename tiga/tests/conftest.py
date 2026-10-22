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
    "TIGA_ROUTINE_TICK_SECONDS": "0",
    "TIGA_LEARN_ENABLED": "",
    "TIGA_POSTAL_ADDRESS": "",
    "TIGA_SENDER_NAME": "",
    "TIGA_UPI_ID": "",
    "TIGA_BRIDGE_TOKEN": "",
    "TIGA_BUSINESS_NAME": "",
    "TIGA_PORTFOLIO_URL": "",
    "GMAIL_USER_EMAIL": "",
    "ADMIN_REPORT_EMAIL": "",
    "GITHUB_REPOSITORY": "",
    "TIGA_DB_PATH": os.path.join(tempfile.gettempdir(), "tiga-tests.db"),
    "TIGA_AI_PROVIDER": "off",  # never spend the owner's Claude limits from tests
    "GMAIL_CREDENTIALS_FILE": os.path.join(tempfile.gettempdir(), "tiga-tests-no-credentials.json"),
    "GMAIL_TOKEN_FILE": os.path.join(tempfile.gettempdir(), "tiga-tests-no-token.json"),
    "TIGA_TESTER_CHILD": "1",  # the tester agent must not recursively run this suite
}
os.environ.update(_ISOLATED_ENV)

import pytest
from fastapi.testclient import TestClient

import main


@pytest.fixture(autouse=True)
def opened(monkeypatch):
    """No test may open a real browser (in WSL that would launch Windows tabs). Records URLs instead."""
    import desktop

    urls = []
    monkeypatch.setattr(desktop, "open_url", lambda url, **kw: urls.append(url) or True)
    return urls


@pytest.fixture(autouse=True)
def no_real_claude(monkeypatch):
    """No test may spend the owner's Claude plan. Tests that need Claude replace complete_meta themselves."""
    import claude_cli

    def refuse(*args, **kwargs):
        raise AssertionError("a test tried to call the real Claude CLI")

    monkeypatch.setattr(claude_cli, "complete_meta", refuse)


@pytest.fixture(autouse=True)
def ran(monkeypatch):
    """No test may run real PowerShell (volume, media keys, apps). Records the scripts instead."""
    import pc

    scripts = []
    monkeypatch.setattr(pc, "run_powershell", lambda script, **kw: scripts.append(script) or True)
    return scripts


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
