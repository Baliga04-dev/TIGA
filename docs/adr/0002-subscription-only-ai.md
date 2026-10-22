# 2. AI runs on the owner's Claude subscription, never an API key

Status: accepted (2026-10-22)

`ai.py` uses the official `claude` CLI headless (`claude -p`) with API-key variables stripped from its environment, never `--bare`, and Claude's own tools turned off. A daily call cap (`TIGA_AI_DAILY_CALLS`) bounds usage; over it, and whenever Claude fails, Tiga falls back to free built-in rules. Tiga never reads or reuses the subscription's login token.

Why: the owner has no budget for metered APIs, and Anthropic's terms allow the unmodified CLI for personal scripts. Policy has changed often in 2026, so the cap and the rules fallback keep Tiga working if access changes.
