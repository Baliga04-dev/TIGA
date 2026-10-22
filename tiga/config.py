import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).parent


def resolve_path(value: str) -> str:
    """Relative file settings are anchored to the backend folder, not the cwd."""
    path = Path(value)
    return str(path if path.is_absolute() else BASE_DIR / path)


ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "").strip()
ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "onwK4e9ZLuTAKqWW03F9")
ELEVENLABS_MODEL = os.getenv("ELEVENLABS_MODEL", "eleven_turbo_v2_5")

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

METRICS_ENDPOINT = os.getenv("METRICS_ENDPOINT", "").strip()
BOOKING_WEBHOOK = os.getenv("BOOKING_WEBHOOK", "").strip()

# Gmail API Configuration
GMAIL_CREDENTIALS_FILE = resolve_path(os.getenv("GMAIL_CREDENTIALS_FILE", "credentials.json"))
GMAIL_TOKEN_FILE = resolve_path(os.getenv("GMAIL_TOKEN_FILE", "token.json"))
GMAIL_USER_EMAIL = os.getenv("GMAIL_USER_EMAIL", "").strip()
ADMIN_REPORT_EMAIL = os.getenv("ADMIN_REPORT_EMAIL", GMAIL_USER_EMAIL).strip()

GITHUB_REPOSITORY = os.getenv("GITHUB_REPOSITORY", "").strip()
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "").strip()
GITHUB_BRANCH = os.getenv("GITHUB_BRANCH", "main").strip()
GITHUB_SYNC_INTERVAL_MINUTES = int(os.getenv("GITHUB_SYNC_INTERVAL_MINUTES", "1440"))

HOST = os.getenv("HOST", "127.0.0.1")
PORT = int(os.getenv("PORT", "8000"))

# Extra browser origins allowed to call state-changing API routes (comma separated).
ALLOWED_ORIGINS = [o.strip().rstrip("/") for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]

# SQLite file for issues, outreach, suppressions and the audit log.
DB_PATH = resolve_path(os.getenv("TIGA_DB_PATH", "tiga.db"))

# The Learn service is private to you: off unless explicitly enabled in your own .env.
LEARN_ENABLED = os.getenv("TIGA_LEARN_ENABLED", "").strip().lower() in {"1", "true", "yes", "on"}
LEARN_DIR = resolve_path(os.getenv("TIGA_LEARN_DIR", "../learn_workspace"))

# Cold-email compliance and pacing (CAN-SPAM needs a real postal address in every mail).
POSTAL_ADDRESS = os.getenv("TIGA_POSTAL_ADDRESS", "").strip()
OUTREACH_DAILY_CAP = int(os.getenv("TIGA_OUTREACH_DAILY_CAP", "25"))

# Per-bot instructions (SKILL.md files) that the UI can edit.
SKILLS_DIR = resolve_path(os.getenv("TIGA_SKILLS_DIR", "skills"))

# Who the drafts are signed by and what they offer (the bot writes the drafts; you approve them).
SENDER_NAME = os.getenv("TIGA_SENDER_NAME", "").strip()
OFFER = os.getenv("TIGA_OFFER", "websites and custom software for small businesses").strip()

# The overnight Analyst (16:00-02:00 collect, morning drafts). 0 minutes turns the schedule off.
ANALYST_TICK_MINUTES = int(os.getenv("TIGA_ANALYST_TICK_MINUTES", "20"))
ANALYST_DRAFTS_PER_MORNING = int(os.getenv("TIGA_ANALYST_DRAFTS_PER_MORNING", "15"))
TIMEZONE = os.getenv("TIGA_TIMEZONE", "Asia/Kolkata")

# Which AI Tiga uses: auto (your Claude subscription via the claude CLI if installed, else an OpenAI-compatible
# key, else the free built-in rules), claude, openai, or off.
AI_PROVIDER = os.getenv("TIGA_AI_PROVIDER", "auto").strip().lower()
CLAUDE_MODEL = os.getenv("TIGA_CLAUDE_MODEL", "sonnet").strip()
# Hard daily ceiling on Claude calls (chat, drafts, briefings); over it Tiga uses its built-in rules.
AI_DAILY_CALLS = int(os.getenv("TIGA_AI_DAILY_CALLS", "150"))
