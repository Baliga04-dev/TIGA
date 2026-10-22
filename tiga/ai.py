"""Which AI answers for Tiga, as one `complete(system, user) -> str` callable (or None for rules only)."""
import contextvars
from contextlib import contextmanager
from typing import Callable

import claude_cli
import config

# Which agent is asking (chat, email writer, page summary...), so the usage report can split by it.
_feature: contextvars.ContextVar[str] = contextvars.ContextVar("tiga_ai_feature", default="other")


@contextmanager
def using(feature: str):
    token = _feature.set(feature)
    try:
        yield
    finally:
        _feature.reset(token)


def feature() -> str:
    """The feature the current AI call is for ("other" when nobody said)."""
    return _feature.get()


def provider() -> str | None:
    choice = config.AI_PROVIDER
    if choice == "off":
        return None
    if choice == "claude" or (choice == "auto" and claude_cli.available()):
        return "claude"
    if choice in ("openai", "auto") and config.OPENAI_API_KEY:
        return "openai"
    return None


def _usage_key() -> str:
    from datetime import date

    return f"ai.calls.{date.today().isoformat()}"


def usage_today() -> dict:
    import services

    return {"used": int(services.get_store().get_value(_usage_key(), "0")), "cap": config.AI_DAILY_CALLS}


def claude_complete(system: str, user: str) -> str:
    """One Claude call, counted against a daily cap (so a loop or a busy night can't drain the plan)."""
    import services

    store, key = services.get_store(), _usage_key()
    used = int(store.get_value(key, "0"))
    if used >= config.AI_DAILY_CALLS:
        raise RuntimeError(f"daily AI limit of {config.AI_DAILY_CALLS} calls reached; using built-in rules")
    store.set_value(key, str(used + 1))
    from datetime import date

    record = {"feature": _feature.get(), "day": date.today().isoformat(), "model": config.CLAUDE_MODEL,
              "system": system, "prompt": user}
    try:
        meta = claude_cli.complete_meta(system, user, model=config.CLAUDE_MODEL)
    except Exception as exc:
        store.add_ai_call(**record, reply="", ok=False, error=str(exc))
        raise
    store.add_ai_call(**record, reply=meta["text"], input_tokens=meta["input_tokens"],
                      output_tokens=meta["output_tokens"], cost_usd=meta["cost_usd"], duration_ms=meta["duration_ms"])
    return meta["text"]


def completer() -> Callable[[str, str], str] | None:
    chosen = provider()
    if chosen == "claude":
        return claude_complete
    if chosen == "openai":
        import services

        return services.openai_complete
    return None
