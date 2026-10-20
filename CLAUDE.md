# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Tiga is a local-first assistant and email-outreach dashboard: a FastAPI backend (`tiga/`) plus a React/TypeScript/Vite frontend (`frontend/`). It is developed in WSL; the Windows launcher `start_dev.ps1` is legacy.

## Commands

Backend (run from `tiga/`; the venv is Linux, created with `uv venv --python 3.12 .venv`):

```bash
uv pip install --python .venv/bin/python -r requirements.txt -r requirements-dev.txt
.venv/bin/python main.py                 # serves http://127.0.0.1:8000 (API docs at /docs)
.venv/bin/pytest -q                      # all backend tests
.venv/bin/pytest tests/test_x.py::test_y # a single test
```

Frontend (run from `frontend/`, Node via nvm):

```bash
npm ci
npm run dev        # Vite on :3000, proxies /api to 127.0.0.1:8000
npm run build      # tsc && vite build
npm run lint
```

## Architecture

**Two UIs, one API.** The React app is the product. `tiga/static/` is an older standalone HUD that `main.py` also serves at `/`; it only uses `/api/status`, `/api/chat` and `/api/tts`.

**Backend modules use flat imports** (`import config`, `import tools`), so `tiga/` must be on `sys.path` — run from inside `tiga/` or set pytest `pythonpath`. `main.py` holds the request models and routes and delegates everything else.

**Chat flow** (`brain.py` + `tools.py`): `brain.respond()` uses an OpenAI-compatible tool-calling loop when `OPENAI_API_KEY` is set, otherwise (or on error) a regex router, `_builtin_respond`. Both end up in `brain.run_tool()`, which looks up the function in `tools.TOOL_FUNCS`. Tool specs for the LLM live in `tools.TOOL_SPECS`, so adding a tool means touching `TOOL_FUNCS`, `TOOL_SPECS` and the builtin router.

**Gmail** is a module-level singleton, `gmail_service.gmail_service`, that `tools.py` reads at call time (patch that attribute to fake Gmail). Its parsing helpers (topics, sentiment, contacts, body extraction) are pure and can be tested on a plain `GmailService()`.

**Orchestration** (`orchestration.py`): public RSS lead research (Google News + Hacker News), prompt generation, the manager→dev→tester "agent cycle", daily report email, and the GitHub push. `PROJECT_ROOT` is the repo root, not `tiga/`. The optional maintenance loop is an in-process asyncio task started on app startup; it only runs if `GITHUB_SYNC_INTERVAL_MINUTES > 0` and a token or Gmail credentials exist.

**Error convention:** most routes return HTTP 200 with `{ok: false, error}` rather than raising, and FastAPI validation errors are 422 with `detail`. The frontend client (`frontend/src/services/api.ts`) and types (`src/types/index.ts`) must handle both shapes; success-only fields are absent when `ok` is false.

**Frontend** is five routes (Dashboard, EmailBot, Chat, Settings, Agents) sharing a `Layout`, with all backend calls going through `src/services/api.ts` and hooks in `src/hooks/useApi.ts`. Styling uses Tailwind-style utility classes plus CSS variables in `src/index.css`.

## Gotchas

- `config.py` calls `load_dotenv()` at import and reads env into module constants. Anything that imports `config` in tests loads the real `tiga/.env` unless the env vars are set first; override with `monkeypatch.setattr(config, ...)` afterwards.
- Config paths such as `GMAIL_CREDENTIALS_FILE` and `GMAIL_TOKEN_FILE` are relative to the current working directory, so run the backend from `tiga/`.
- `tiga/.env`, `credentials.json` and `token.json` are git-ignored, but `.env.example` is tracked — it must keep `GITHUB_TOKEN` empty.
- GitHub sync (`/api/github/sync`) pushes to `GITHUB_REPOSITORY` / `GITHUB_BRANCH` using `GITHUB_TOKEN`.
- Gmail needs a one-time OAuth flow with `credentials.json` (see `GMAIL_SETUP.md`); without it, email routes return `ok: false`.
- `TIGA_PROJECT_HANDOFF.md` (outside the repo, in `~/projects/`) describes the intended behaviour of each feature.
