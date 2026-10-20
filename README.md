# Tiga

A local-first assistant and email-outreach desk for a freelancer: see who replied and what to
do next, send cold email from templates, ask the assistant, and research public leads.

- **Backend** (`tiga/`): FastAPI. Gmail reading and sending, an assistant with tool calls (built-in
  rules, or any OpenAI-compatible model), public-feed lead research, and a manager/dev/tester report.
- **Frontend** (`frontend/`): React, TypeScript, Vite and Tailwind.

Everything works without credentials on demo data; Gmail, GitHub push, an LLM and ElevenLabs speech
are optional and configured in `tiga/.env`.

## Run it (WSL or Linux)

```bash
./start_dev.sh --install   # first time: creates tiga/.venv with uv and installs frontend deps
./start_dev.sh             # API on :8000, web on :3000 (Ctrl+C stops both)
```

Needs [uv](https://docs.astral.sh/uv/) and Node 20+. Copy `tiga/.env.example` to `tiga/.env` to
configure integrations, and follow [GMAIL_SETUP.md](GMAIL_SETUP.md) to connect Gmail.

## Tests

```bash
cd tiga && .venv/bin/pytest -q                 # backend API, chat routing, Gmail parsing, GitHub sync, security
cd frontend && npm run lint && npm test        # ESLint, then component tests (Vitest, Testing Library, msw)
cd frontend && npm run e2e                     # Playwright against real servers, plus accessibility checks
```

The backend suite sets its own environment and fakes Gmail, GitHub and HTTP at their boundaries, so it
never touches your real `.env` or the network. The E2E run starts its own servers on ports 8765 and
3100 with every integration switched off.

### Browser tests need Chromium's system libraries

`npx playwright install chromium` downloads the browser. On a minimal WSL install it also needs
`libnspr4`, `libnss3` and `libasound2t64`:

```bash
sudo apt-get install -y libnspr4 libnss3 libasound2t64
```

Without sudo, unpack them into your home folder instead; the Playwright config picks them up from there:

```bash
mkdir -p ~/.local/chromium-libs/debs && cd ~/.local/chromium-libs/debs
apt-get download libnspr4 libnss3 libasound2t64
for d in *.deb; do dpkg -x "$d" ~/.local/chromium-libs/root; done
```

## Safety defaults

- Secrets live in `tiga/.env`, `credentials.json` and `token.json`, all git-ignored. `.env.example` is
  tracked and must keep secret values empty.
- **GitHub sync only pushes commits you made.** It never stages or commits, never edits `origin`, and
  refuses on a dirty tree, the wrong branch, or when behind the remote.
- State-changing API calls from other websites are refused (see `ALLOWED_ORIGINS`).
- After the assistant reads your mail during a turn, it cannot send mail or open links in that turn, so
  instructions hidden inside an email cannot act on your behalf.

See [CLAUDE.md](CLAUDE.md) for the architecture notes used when working in this repository.
