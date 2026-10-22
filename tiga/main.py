import logging
import re
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import urlparse

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import brain
import config
import desk_api
import jobs
import learn
import outreach_api
import prompt_api
import analyst_api
import assistant_api
import services
import tts as tts_mod
import ai
import crew
import git_ops
import asyncio

STATIC_DIR = Path(__file__).parent / "static"
ENV_EXAMPLE = Path(__file__).parent / ".env.example"
_LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}
logger = logging.getLogger("tiga")


_sleep = asyncio.sleep


async def _maintenance_once() -> dict:
    return await jobs.run_configured_daily()


async def _daily_maintenance() -> None:
    while True:
        await _sleep(max(60, config.GITHUB_SYNC_INTERVAL_MINUTES * 60))
        try:
            outcome = await _maintenance_once()
            if not outcome["report"].get("ok"):
                logger.warning("Daily report not sent: %s", outcome["report"].get("error"))
            for error in outcome["errors"]:
                logger.warning("Daily run step failed: %s", error)
        except Exception:
            logger.exception("Daily maintenance run failed; will retry next interval")


async def _analyst_loop() -> None:
    """Every few minutes: the Analyst decides by the clock whether to collect, write, or rest."""
    import datetime

    while True:
        await _sleep(config.ANALYST_TICK_MINUTES * 60)
        try:
            result = await services.get_analyst().tick(datetime.datetime.now(datetime.timezone.utc))
            for error in result["errors"]:
                logger.warning("Analyst: %s", error)
        except Exception:
            logger.exception("Analyst tick failed; will retry")


OUTREACH_TICK_SECONDS = 300


async def _outreach_loop() -> None:
    """Send approved mail as limits allow (weekday hours, daily cap, gaps between sends)."""
    while True:
        await _sleep(OUTREACH_TICK_SECONDS)
        try:
            await asyncio.to_thread(services.get_mailer().send_next)
        except Exception:
            logger.exception("Outreach send tick failed; will retry")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    tasks = []
    if config.GITHUB_SYNC_INTERVAL_MINUTES > 0:
        # Reports are archived in the app even with no Gmail or GitHub, so the daily run always starts.
        tasks.append(asyncio.create_task(_daily_maintenance()))
        if Path(config.GMAIL_CREDENTIALS_FILE).exists():
            tasks.append(asyncio.create_task(_outreach_loop()))
    if config.ANALYST_TICK_MINUTES > 0:
        tasks.append(asyncio.create_task(_analyst_loop()))
    yield
    for task in tasks:
        task.cancel()


app = FastAPI(title="Tiga", version="0.2.0", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
app.include_router(learn.router)
app.include_router(outreach_api.router)
app.include_router(desk_api.router)
app.include_router(prompt_api.router)
app.include_router(analyst_api.router)
app.include_router(assistant_api.router)


@app.get("/api/features")
def features() -> dict:
    """Which optional, private services the UI should show."""
    return {"learn": config.LEARN_ENABLED}


def _origin_allowed(origin: str) -> bool:
    parsed = urlparse(origin)
    if parsed.scheme in ("http", "https") and parsed.hostname in _LOCAL_HOSTS:
        return True
    return origin.rstrip("/") in config.ALLOWED_ORIGINS


@app.middleware("http")
async def refuse_cross_site_writes(request: Request, call_next):
    """A page on another site must not be able to trigger state-changing calls."""
    if request.method in ("POST", "PUT", "PATCH", "DELETE") and request.url.path.startswith("/api/"):
        origin = request.headers.get("origin")
        if origin is not None and not _origin_allowed(origin):
            return JSONResponse(status_code=403, content={"detail": "Cross-site request refused"})
    return await call_next(request)


class ChatIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    history: list = Field(default_factory=list)


class TTSIn(BaseModel):
    text: str = Field(min_length=1, max_length=4000)


class EmailSendIn(BaseModel):
    to: str = Field(min_length=3)
    subject: str = Field(min_length=1)
    body: str = Field(min_length=1)
    cc: str = ""
    bcc: str = ""
    is_html: bool = False


class EmailFetchIn(BaseModel):
    query: str = ""
    max_results: int = Field(default=20, ge=1, le=100)
    days_back: int = Field(default=1, ge=0, le=365)


class EmailSummaryIn(BaseModel):
    days: int = Field(default=1, ge=1, le=90)


class TemplateGenIn(BaseModel):
    service_type: str = "general"
    recipient_name: str = ""
    company_name: str = ""
    portfolio_link: str = ""


@app.get("/")
async def index():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/status")
async def status():
    return {
        "brain": ai.provider() or "builtin",
        "ai_usage": ai.usage_today(),
        "tts": "elevenlabs" if config.ELEVENLABS_API_KEY else "browser",
        "metrics_endpoint": bool(config.METRICS_ENDPOINT),
        "booking_webhook": bool(config.BOOKING_WEBHOOK),
        "gmail_configured": Path(config.GMAIL_CREDENTIALS_FILE).exists(),
        "version": app.version,
        "name": "Tiga",
        "github_repository": config.GITHUB_REPOSITORY,
        "agents": ["manager", "dev", "tester"],
    }


@app.get("/api/env-example")
async def env_example():
    if not ENV_EXAMPLE.exists():
        return PlainTextResponse("", status_code=404)
    lines = []
    for line in ENV_EXAMPLE.read_text().splitlines():
        key, sep, _ = line.partition("=")
        if sep and not line.lstrip().startswith("#") and re.search(r"KEY|TOKEN|SECRET|PASSWORD", key.upper()):
            line = f"{key}="
        lines.append(line)
    return PlainTextResponse("\n".join(lines) + "\n")


@app.post("/api/chat")
async def chat(payload: ChatIn):
    result = await brain.respond(payload.text.strip(), payload.history)
    return result


@app.post("/api/tts")
async def tts(payload: TTSIn):
    audio = await tts_mod.synthesize(tts_mod.clean_for_speech(payload.text))
    if audio:
        return Response(content=audio, media_type="audio/mpeg", headers={"Cache-Control": "no-store"})
    return JSONResponse(
        status_code=501,
        content={
            "fallback": "browser",
            "reason": "ELEVENLABS_API_KEY not set (or synthesis failed) — using browser speechSynthesis",
        },
    )


@app.post("/api/email/send")
async def send_email(payload: EmailSendIn):
    from tools import send_email_now
    result = await send_email_now(
        to=payload.to,
        subject=payload.subject,
        body=payload.body,
        cc=payload.cc,
        bcc=payload.bcc,
        is_html=payload.is_html,
    )
    return result


@app.post("/api/email/fetch")
async def fetch_emails(payload: EmailFetchIn):
    from tools import fetch_recent_emails
    result = await fetch_recent_emails(
        query=payload.query,
        max_results=payload.max_results,
        days_back=payload.days_back,
    )
    return result


@app.post("/api/email/summary")
async def email_summary(payload: EmailSummaryIn):
    from tools import get_email_summary
    result = await get_email_summary(days=payload.days)
    return result


@app.post("/api/email/template")
async def generate_template(payload: TemplateGenIn):
    from tools import generate_cold_email_template
    result = await generate_cold_email_template(
        service_type=payload.service_type,
        recipient_name=payload.recipient_name,
        company_name=payload.company_name,
        portfolio_link=payload.portfolio_link,
    )
    return result


@app.get("/api/agents/status")
async def agent_status():
    return {
        "name": "Tiga",
        "agents": [
            {"name": "manager", "role": "triage, coordination, reporting", "status": "ready"},
            {"name": "dev", "role": "implementation and GitHub sync", "status": "ready"},
            {"name": "tester", "role": "feature and regression checks", "status": "ready"},
        ],
        "github": await git_ops.status(),
    }


@app.post("/api/agents/run")
async def run_agents():
    return await crew.run_agent_cycle()


@app.post("/api/github/sync")
async def github_sync():
    return await git_ops.push_current_branch()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host=config.HOST, port=config.PORT)
