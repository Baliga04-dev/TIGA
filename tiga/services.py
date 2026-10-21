"""Process-wide singletons (store, mailer) built lazily from config, resettable for tests."""
import threading

import httpx

import config
import gmail_service
import drafter
import leads
import places
import sitecheck
from analyst import Analyst
from mailer import Mailer
from skills import Skills
from store import Store

_lock = threading.Lock()
_store: Store | None = None
_mailer: Mailer | None = None


def send_email(to: str, subject: str, body: str) -> dict:
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
            _mailer = Mailer(store, send_email, postal_address=config.POSTAL_ADDRESS, hard_cap=config.OUTREACH_DAILY_CAP)
        return _mailer


def reset() -> None:
    global _store, _mailer
    with _lock:
        if _store is not None:
            _store.close()
        _store = _mailer = None


def get_skills() -> Skills:
    return Skills(config.SKILLS_DIR)


def llm_complete():
    """A `complete(system, user) -> str` for the drafter when an OpenAI-compatible key is set, else None."""
    if not config.OPENAI_API_KEY:
        return None

    def complete(system: str, user: str) -> str:
        response = httpx.post(
            f"{config.OPENAI_BASE_URL}/chat/completions",
            headers={"Authorization": f"Bearer {config.OPENAI_API_KEY}"},
            json={"model": config.OPENAI_MODEL, "temperature": 0.4,
                  "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]},
            timeout=30,
        )
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"]

    return complete


def write_draft(lead: dict) -> dict:
    return drafter.write_draft(lead, sender_name=config.SENDER_NAME or "Tiga", offer=config.OFFER,
                               complete=llm_complete())


def get_analyst() -> Analyst:
    return Analyst(get_store(), get_mailer(), fetch_businesses=places.fetch_businesses, inspect=sitecheck.inspect,
                   find_leads=leads.find_leads, write_draft=write_draft,
                   drafts_per_morning=config.ANALYST_DRAFTS_PER_MORNING, tz=config.TIMEZONE)
