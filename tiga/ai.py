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


def claude_complete(system: str, user: str) -> str:
    return claude_cli.complete(system, user, model=config.CLAUDE_MODEL)


def completer() -> Callable[[str, str], str] | None:
    chosen = provider()
    if chosen == "claude":
        return claude_complete
    if chosen == "openai":
        import services

        return services.openai_complete
    return None
