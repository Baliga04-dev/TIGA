# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Tiga is a local-first assistant and email-outreach dashboard: a FastAPI backend (`tiga/`) plus a React/TypeScript/Vite/Tailwind frontend (`frontend/`). It is developed in WSL; `start_dev.ps1` is the legacy Windows launcher. `README.md` has setup and safety notes.

## Commands

```bash
./start_dev.sh --install        # first time: tiga/.venv via uv, then npm ci
./start_dev.sh                  # API :8000 + web :3000
```

Backend (from `tiga/`):

```bash
.venv/bin/pytest -q                        # all backend tests (isolated env, no network)
.venv/bin/pytest tests/test_x.py::test_y   # a single test
.venv/bin/python gmail_auth.py             # one-time Gmail OAuth (the server never does this)
```

Frontend (from `frontend/`, Node via nvm):

```bash
npm run lint && npx tsc --noEmit           # both must be clean
npm test                                   # Vitest + Testing Library + msw
npx vitest run src/pages/Chat.test.tsx     # a single file
npm run e2e                                # Playwright; starts its own servers on :8765/:3100
npm run build
```

Playwright needs Chromium's system libraries; see README.md ("Browser tests").

## Architecture

**Two UIs, one API.** The React app is the product. `tiga/static/` is an older standalone HUD that `main.py` also serves at `/`; it only uses `/api/status`, `/api/chat` and `/api/tts`.

**Backend modules use flat imports** (`import config`, `import tools`), so `tiga/` must be on `sys.path` (pytest.ini sets it). `main.py` holds request models, routes, a cross-origin write guard and the lifespan-managed maintenance loop; everything else is delegated.

**Chat flow** (`brain.py` + `tools.py`): `brain.respond()` uses an OpenAI-compatible tool loop when `OPENAI_API_KEY` is set, otherwise (or if the model fails before doing anything) the regex router `_builtin_respond`. Both reach `brain.run_tool()`, which looks the tool up in `tools.TOOL_FUNCS` and coerces arguments to the function's type annotations. Adding a tool means `TOOL_FUNCS`, `TOOL_SPECS` and the builtin router; if it reads mailbox content add it to `READS_UNTRUSTED`, if it acts on the outside world add it to `ACTS_ON_WORLD`: after a read in a turn, world-acting tools are refused (prompt-injection guard). Router branch order matters (template before send, booking before metrics).

**Gmail** is a module-level singleton, `gmail_service.gmail_service`, read by `tools.py` at call time. Its parsing helpers are pure. `authenticate()` is non-interactive by default; tools call Gmail through `asyncio.to_thread`.

**Orchestration** (`orchestration.py`): RSS lead research (interleaves feeds, dedupes URLs, `defusedxml`), prompt generation, the manager→dev→tester cycle (tester runs the pytest suite unless `TIGA_TESTER_CHILD` is set), daily report, and `github_sync_push`, which only pushes commits that already exist (never stages/commits, never edits `origin`, refuses on a dirty tree, wrong branch, or when behind; the token goes through git's environment, not argv). `PROJECT_ROOT` is the repo root, not `tiga/`.

**Error convention:** most routes return HTTP 200 with `{ok: false, error}`; validation errors are 422 with `detail`; a cross-origin write is 403 with `detail`. `frontend/src/services/api.ts` turns all of these into `ApiError` with one readable message (an `ok:false` body with no `error` string, such as a research result with `errors[]`, is a normal result).

**Frontend:** five routes under one `Layout` (`<Outlet/>`), pages in `src/pages` (EmailBot's dialogs live in `src/pages/email/`), all network calls through `src/services/api.ts`. Hooks: `useApi.ts` (data loading, chat), `useAction.ts` (user-triggered calls with pending/error/result; always calls the latest handler), `useSpeech.ts`. Shared primitives (Modal, Field, Notice, Card, CopyButton, Toast, StatusRow) are in `src/components/ui.tsx`. Styling is Tailwind 3 with semantic tokens (`paper`, `sheet`, `ink`, `pen`, `ledger`, `flag`, `mark`) defined as RGB channels in `src/index.css` and mapped in `tailwind.config.js`; fonts are bundled locally. Dialogs must use `Modal` (focus trap, Escape, focus return).

## Outreach desk and bots (deep modules, flat imports)

`store.py` (SQLite: job claims, issue state machine, outreach, suppressions, reports, interviews, audit) is the only place statuses change. `leads.py` finds and scores leads from Google News / Hacker News / GDELT. `mailer.py` is the only thing that sends cold mail: drafts need `approve`, then `send_next` enforces suppression, the postal-address footer, weekday hours, a ramping daily cap and gaps; `check_replies` classifies replies, `due_followups` drafts (never sends) follow-ups. `reports.py` builds the daily mail (outreach scorecard first); `jobs.py` runs each daily step in isolation; `rnd.py` files improvement proposals and the weekly report; `codesync.py` pushes a dated `tiga/daily-DATE` branch (never main) after a secret scan; `interview.py` is the prompt-interview state machine; `learn.py` serves `learn_workspace/` only when `TIGA_LEARN_ENABLED` is set. Routes: `outreach_api.py`, `desk_api.py`, `prompt_api.py`. `services.py` holds the lazy store/mailer singletons (tests reset them in an autouse fixture). Bot instructions live in `tiga/skills/<bot>/SKILL.md`, editable on the Crew page. `places.py` (OpenStreetMap, Bengaluru), `sitecheck.py` (published emails + site problems, honours robots.txt) and `analyst.py` (one `tick(now)`: 16:00-02:00 collect, after 02:00 draft once) feed the Prospects page via `analyst_api.py`. AI goes through `ai.py`: `auto` uses the owner's Claude subscription via `claude_cli.py` (`claude -p`, API-key env vars stripped, never `--bare`, Claude's own tools off), else an OpenAI key, else rules; tests force `TIGA_AI_PROVIDER=off`. `desktop.open_url` opens links on the Windows side from WSL (cmd.exe, `&` caret-escaped); tests replace it with a recorder (autouse `opened` fixture) so they never launch real tabs. Not built yet: the autonomous Dev bot (worktree + draft PR).

## Gotchas

- Never add a path that sends mail without going through `Mailer.approve` -> `send_next`.

- `config.py` calls `load_dotenv()` at import. `tests/conftest.py` sets safe env vars before importing anything; keep new test modules importing through it. Override later with `monkeypatch.setattr(config, ...)`.
- Relative file settings (`GMAIL_CREDENTIALS_FILE`, `GMAIL_TOKEN_FILE`) resolve next to `config.py`, not the cwd.
- `tiga/.env`, `credentials.json` and `token.json` are git-ignored, but `.env.example` is tracked and must keep secret values empty.
- Vitest does not process CSS: a broken Tailwind config only shows up in `npm run build` or the dev server (restart Vite after editing `tailwind.config.js`).
- `TIGA_PROJECT_HANDOFF.md` (outside the repo) predates the push-only sync and `/api/env-example`; where it disagrees with this file, this file is right.
