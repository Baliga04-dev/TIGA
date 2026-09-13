# Tiga — Local Voice Assistant

A local Iron-Man style voice assistant: FastAPI backend with tool-calling into your
business data, ElevenLabs British voice output, browser Web Speech input, and a dark
HUD with a glowing reactive orb, waveform, and intel cards.

**Runs out of the box on demo data** — no API keys required. Wire things up when ready.

## Quick start

```
cd tiga
python -m venv .venv
.venv\Scripts\activate          (Windows)   |   source .venv/bin/activate   (macOS/Linux)
pip install -r requirements.txt
python main.py
```

Open **http://127.0.0.1:8000**, hit **INITIALIZE**, allow the mic, then say or type:

- "What are today's metrics?"
- "Open YouTube" / "Pull up github.com/yourrepo"
- "Book a call about pricing for Tuesday 3pm"
- "Status report"

## Wiring it up

Copy `.env.example` to `.env` and fill in any of these (all optional):

| Variable | Purpose |
|---|---|
| `ELEVENLABS_API_KEY` | Enables ElevenLabs TTS. Without it, falls back to the browser's built-in `speechSynthesis` |
| `ELEVENLABS_VOICE_ID` | Defaults to **Daniel** (`onwK4e9ZLuTAKqWW03F9`) — deep British male. Swap for any voice from your ElevenLabs library |
| `OPENAI_API_KEY` | Enables real LLM tool-calling. Without it, a built-in rule-based brain handles the three tools offline |
| `OPENAI_BASE_URL` / `OPENAI_MODEL` | Point at any OpenAI-compatible endpoint (e.g. Ollama at `http://localhost:11434/v1`, model `llama3.2`) |
| `METRICS_ENDPOINT` | Your GET endpoint returning JSON metrics. On failure → demo data |
| `BOOKING_WEBHOOK` | Your POST webhook receiving `{name, email, topic, preferred_time}` JSON |
| `ADMIN_REPORT_EMAIL` | Recipient for the daily Tiga systems report |
| `GITHUB_REPOSITORY` | GitHub repository in `owner/repository` form |
| `GITHUB_TOKEN` | Optional token used for authenticated GitHub operations |
| `GITHUB_BRANCH` | Branch to monitor, default `main` |

Restart after editing `.env`.

## Tools

| Tool | Live mode | Demo fallback |
|---|---|---|
| `get_metrics` | GETs `METRICS_ENDPOINT` | Static demo dataset |
| `open_tab` | Opens URL in your default browser (`webbrowser`) | n/a — always live |
| `book_call` | POSTs to `BOOKING_WEBHOOK` | Generates a fake confirmation ref |

## Architecture

- `main.py` — FastAPI app: `/api/chat` (brain + tools), `/api/tts` (ElevenLabs), `/api/status`
- `brain.py` — OpenAI function-calling loop, plus keyword-intent fallback so it works keyless
- `tools.py` — the three tools + demo fallbacks + URL safety validation
- `tts.py` — ElevenLabs client with speech-friendly text cleanup
- `static/` — HUD frontend (Web Speech mic, reactive orb, waveform canvas, intel feed)
- `orchestration.py` — public lead research, prompt generation, manager/dev/tester
  runs, GitHub sync status, and daily report delivery

## Tiga agents

The React UI exposes an **Agents** page and these explicit API actions:

- `POST /api/research/leads` searches public Google News and Hacker News feeds for
  client signals. It does not scrape private Facebook accounts or bypass access
  controls.
- `POST /api/prompt/generate` combines the idea, desired outcome, constraints, and
  cited public research into a build prompt with clarifying questions.
- `POST /api/agents/run` runs the manager -> dev -> tester flow and returns an
  auditable report.
- `POST /api/agents/daily-report` runs the flow and sends the report through Gmail
  when OAuth credentials are configured.
- `GET /api/agents/status` reports repository and working-tree state, and
  `POST /api/github/sync` performs an explicit push when a token is configured.
- When Gmail credentials or a GitHub token are configured,
  `GITHUB_SYNC_INTERVAL_MINUTES` schedules the manager report, daily email, and
  GitHub push maintenance loop. It defaults to 1440 minutes.

## Notes

- Use Chrome or Edge; Web Speech recognition is Chromium-only.
- Mic + audio require the INITIALIZE click (browser autoplay policy).
- The server binds to `127.0.0.1` by default — `open_tab` executes on your machine, so don't expose it publicly.
