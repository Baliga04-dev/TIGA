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
    "GMAIL_CREDENTIALS_FILE": os.path.join(tempfile.gettempdir(), "tiga-tests-no-credentials.json"),
    "GMAIL_TOKEN_FILE": os.path.join(tempfile.gettempdir(), "tiga-tests-no-token.json"),
}
os.environ.update(_ISOLATED_ENV)

import pytest
from fastapi.testclient import TestClient

import main


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
