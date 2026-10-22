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

**Chat flow** (`brain.py` + `tools.py`): `brain.respond()` asks `ai.provider()`: Claude (subscription CLI, JSON tool protocol) or an OpenAI-compatible tool loop; otherwise (or if the model fails before doing anything) the regex router `_builtin_respond`. Every path runs tools only through `executor.execute(name, args, turn)` (see `GLOSSARY.md` and `docs/adr/0003`): each tool has a tier in `executor.TIERS` (READ, LOCAL, OUTWARD, FORBIDDEN); OUTWARD tools, and LOCAL ones after an `UNTRUSTED` read in the same Turn, become Pending actions confirmed only by `POST /api/actions/{id}/confirm`. Adding a tool means `tools.TOOL_FUNCS`, `TOOL_SPECS`, a tier in `executor.TIERS` (missing = refused) and, if wanted, a builtin-router branch. `respond()` handles "Tiga stop"/"resume" before any model. Router branch order matters (template before send, booking before metrics).

**Gmail** is a module-level singleton, `gmail_service.gmail_service`, read by `tools.py` at call time. Its parsing helpers are pure. `authenticate()` is non-interactive by default; tools call Gmail through `asyncio.to_thread`.

**Crew and git:** `crew.py` runs the manager→dev→tester cycle (tester runs the pytest suite unless `TIGA_TESTER_CHILD` is set). `git_ops.py` owns git: `status()`, `push_current_branch()` (the manual Push button: pushes existing commits only, never stages/commits or edits `origin`, refuses on a dirty tree, wrong branch, or when behind; token through git's environment, never argv) and `git()`, which `codesync.py` uses for the daily `tiga/daily-DATE` branch. `PROJECT_ROOT` is the repo root, not `tiga/`.

**Error convention:** most routes return HTTP 200 with `{ok: false, error}`; validation errors are 422 with `detail`; a cross-origin write is 403 with `detail`. `frontend/src/services/api.ts` turns all of these into `ApiError` with one readable message (an `ok:false` body with no `error` string, such as a research result with `errors[]`, is a normal result).

**Frontend:** eleven routes under one `Layout` (`<Outlet/>`), pages in `src/pages` (EmailBot's dialogs live in `src/pages/email/`), all network calls through `src/services/api.ts`. Hooks: `useApi.ts` (data loading, chat), `useAction.ts` (user-triggered calls with pending/error/result; always calls the latest handler), `useSpeech.ts`. Shared primitives (Modal, Field, Notice, Card, CopyButton, Toast, StatusRow) are in `src/components/ui.tsx`. Styling is Tailwind 3 with semantic tokens (`paper`, `sheet`, `ink`, `pen`, `ledger`, `flag`, `mark`) defined as RGB channels in `src/index.css` and mapped in `tailwind.config.js`; fonts are bundled locally. Dialogs must use `Modal` (focus trap, Escape, focus return).

## Outreach desk and bots (deep modules, flat imports)

`store.py` (SQLite: job claims, issue state machine, outreach, suppressions, reports, interviews, audit) is the only place statuses change. `leads.py` finds and scores leads from Google News / Hacker News / GDELT. `mailer.py` is the only thing that sends cold mail: drafts need `approve`, then `send_next` enforces suppression, the postal-address footer, weekday hours, a ramping daily cap and gaps; `check_replies` classifies replies, `due_followups` drafts (never sends) follow-ups. `reports.py` builds the daily mail (outreach scorecard first); `jobs.py` runs each daily step in isolation; `rnd.py` files improvement proposals and the weekly report; `codesync.py` pushes a dated `tiga/daily-DATE` branch (never main) after a secret scan; `interview.py` is the prompt-interview state machine; `learn.py` serves `learn_workspace/` only when `TIGA_LEARN_ENABLED` is set. Routes: `outreach_api.py`, `desk_api.py`, `prompt_api.py`. `services.py` holds the lazy store/mailer singletons (tests reset them in an autouse fixture). Bot instructions live in `tiga/skills/<bot>/SKILL.md`, editable on the Crew page. `places.py` (OpenStreetMap, Bengaluru), `sitecheck.py` (published emails + site problems, honours robots.txt) and `analyst.py` (one `tick(now)`: 16:00-02:00 collect, after 02:00 draft once) feed the Prospects page via `analyst_api.py`. AI goes through `ai.py`: `auto` uses the owner's Claude subscription via `claude_cli.py` (`claude -p`, API-key env vars stripped, never `--bare`, Claude's own tools off), else an OpenAI key, else rules; tests force `TIGA_AI_PROVIDER=off`. `desktop.open_url` opens links on the Windows side from WSL (cmd.exe, `&` caret-escaped); tests replace it with a recorder (autouse `opened` fixture) so they never launch real tabs. Money path: `deals.py` + `store` deals (one transition function, audited), `billing.py` (rate card, proposals, numbered UPI invoices with QR, printable pages via `/api/documents/{id}` with a strict CSP), routes in `deals_api.py`; Pipeline page. Assistant abilities (all tiered in `executor.TIERS`): `pc.py` (fixed PowerShell snippets for volume/media/apps/lock; tests replace `pc.run_powershell` via the autouse `ran` fixture), `bridge.py` + `/ws/bridge` + the `bridge/` MV3 Edge extension (token in `TIGA_BRIDGE_TOKEN`; page text is UNTRUSTED), `when.py` (time phrases), reminders/notes in the store (notes are also passed to Claude as `<memory>`), `briefing.py` (morning briefing, Open-Meteo weather), follow-up radar, focus sessions and prospect briefs in `tools.py`. `routines.py`: recurring tasks ("every Monday at 9am, who is waiting on me"); `_routine_loop` in `main.py` runs due ones through `brain.respond`, cancels anything that would wait for a click, caps runs a day; tests set `TIGA_ROUTINE_TICK_SECONDS=0`. `portfolio/` is the public static site (no build step): a WebGL Bengaluru street adapted from ThreeUI's Kage (MIT), see `portfolio/README.md`. `screen.py` + the `look_at_screen` tool (READ, UNTRUSTED): one screenshot on request via PowerShell into a fresh temp folder, Claude reads only that folder (`claude_cli` `tools="Read"`, `workdir`), then it is deleted; tests fake `screen.capture`. Not built yet: the autonomous Dev bot, meeting notes, wake word.

## Gotchas

- Never add a path that sends mail without going through `Mailer.approve` -> `send_next`.

- `config.py` calls `load_dotenv()` at import. `tests/conftest.py` sets safe env vars before importing anything; keep new test modules importing through it. Override later with `monkeypatch.setattr(config, ...)`.
- Relative file settings (`GMAIL_CREDENTIALS_FILE`, `GMAIL_TOKEN_FILE`) resolve next to `config.py`, not the cwd.
- `tiga/.env`, `credentials.json` and `token.json` are git-ignored, but `.env.example` is tracked and must keep secret values empty.
- Vitest does not process CSS: a broken Tailwind config only shows up in `npm run build` or the dev server (restart Vite after editing `tailwind.config.js`).
- `TIGA_PROJECT_HANDOFF.md` (outside the repo) predates the push-only sync and `/api/env-example`; where it disagrees with this file, this file is right.
