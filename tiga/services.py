"""Process-wide singletons (store, mailer) built lazily from config, resettable for tests."""
import threading

import config
import gmail_service
from mailer import Mailer
from store import Store

_lock = threading.Lock()
_store: Store | None = None
_mailer: Mailer | None = None


def _send(to: str, subject: str, body: str) -> dict:
    return gmail_service.gmail_service.send_email(to, subject, body)


def fetch_thread(thread_id: str) -> list[dict]:
    return gmail_service.gmail_service.thread_messages(thread_id)


def get_store() -> Store:
    global _store
    with _lock:
        if _store is None:
            _store = Store(config.DB_PATH)
        return _store


def get_mailer() -> Mailer:
    global _mailer
    store = get_store()
    with _lock:
        if _mailer is None:
            _mailer = Mailer(store, _send, postal_address=config.POSTAL_ADDRESS, hard_cap=config.OUTREACH_DAILY_CAP)
        return _mailer


def reset() -> None:
    global _store, _mailer
    with _lock:
        if _store is not None:
            _store.close()
        _store = _mailer = None
