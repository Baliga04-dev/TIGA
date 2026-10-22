"""Which AI answers for Tiga, as one `complete(system, user) -> str` callable (or None for rules only)."""
from typing import Callable

import claude_cli
import config


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
    return claude_cli.complete(system, user, model=config.CLAUDE_MODEL)


def completer() -> Callable[[str, str], str] | None:
    chosen = provider()
    if chosen == "claude":
        return claude_complete
    if chosen == "openai":
        import services

        return services.openai_complete
    return None
