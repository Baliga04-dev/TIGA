from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import brain
import config
import tts as tts_mod
import orchestration
import asyncio

app = FastAPI(title="Tiga", version="0.2.0")

STATIC_DIR = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
_maintenance_task: asyncio.Task | None = None


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
    max_results: int = 20
    days_back: int = 1


class EmailSummaryIn(BaseModel):
    days: int = 1


class TemplateGenIn(BaseModel):
    service_type: str = "general"
    recipient_name: str = ""
    company_name: str = ""
    portfolio_link: str = ""


class LeadResearchIn(BaseModel):
    topic: str = Field(min_length=2, max_length=200)
    limit: int = Field(default=10, ge=1, le=50)


class PromptGenerateIn(BaseModel):
    idea: str = Field(min_length=3, max_length=4000)
    outcome: str = Field(min_length=3, max_length=1000)
    audience: str = Field(default="", max_length=1000)
    stack: str = Field(default="", max_length=1000)
    constraints: str = Field(default="", max_length=2000)
    research_topic: str = Field(default="", max_length=200)


@app.get("/")
async def index():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/status")
async def status():
    return {
        "brain": "openai" if config.OPENAI_API_KEY else "builtin",
        "tts": "elevenlabs" if config.ELEVENLABS_API_KEY else "browser",
        "metrics_endpoint": bool(config.METRICS_ENDPOINT),
        "booking_webhook": bool(config.BOOKING_WEBHOOK),
        "gmail_configured": Path(config.GMAIL_CREDENTIALS_FILE).exists(),
        "version": app.version,
        "name": "Tiga",
        "github_repository": config.GITHUB_REPOSITORY,
        "agents": ["manager", "dev", "tester"],
    }


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
    from tools import send_cold_email
    result = await send_cold_email(
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


@app.post("/api/research/leads")
async def research_leads(payload: LeadResearchIn):
    return await orchestration.research_leads(payload.topic, payload.limit)


@app.post("/api/prompt/generate")
async def generate_prompt(payload: PromptGenerateIn):
    return await orchestration.generate_prompt(
        payload.idea,
        payload.outcome,
        payload.audience,
        payload.stack,
        payload.constraints,
        payload.research_topic,
    )


@app.get("/api/agents/status")
async def agent_status():
    return {
        "name": "Tiga",
        "agents": [
            {"name": "manager", "role": "triage, coordination, reporting", "status": "ready"},
            {"name": "dev", "role": "implementation and GitHub sync", "status": "ready"},
            {"name": "tester", "role": "feature and regression checks", "status": "ready"},
        ],
        "github": await orchestration.github_sync_status(),
    }


@app.post("/api/agents/run")
async def run_agents():
    return await orchestration.run_agent_cycle()


@app.post("/api/github/sync")
async def github_sync():
    return await orchestration.github_sync_push()


@app.post("/api/agents/daily-report")
async def daily_report():
    report = await orchestration.run_agent_cycle()
    delivery = await orchestration.send_daily_report(report)
    return {"report": report, "delivery": delivery}


async def _daily_maintenance() -> None:
    while True:
        await asyncio.sleep(max(60, config.GITHUB_SYNC_INTERVAL_MINUTES * 60))
        report = await orchestration.run_agent_cycle()
        if Path(config.GMAIL_CREDENTIALS_FILE).exists():
            await orchestration.send_daily_report(report)
        if config.GITHUB_TOKEN:
            await orchestration.github_sync_push()


@app.on_event("startup")
async def start_daily_sync():
    global _maintenance_task
    if config.GITHUB_SYNC_INTERVAL_MINUTES > 0 and (
        config.GITHUB_TOKEN or Path(config.GMAIL_CREDENTIALS_FILE).exists()
    ):
        _maintenance_task = asyncio.create_task(_daily_maintenance())


@app.on_event("shutdown")
async def stop_daily_sync():
    if _maintenance_task:
        _maintenance_task.cancel()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host=config.HOST, port=config.PORT)
