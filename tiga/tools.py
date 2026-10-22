import asyncio
import json
import re
import time
import uuid
from datetime import datetime, timedelta
from urllib.parse import quote_plus, urlparse

import httpx

import config
import desktop
import pc
import gmail_service

HTTP_TIMEOUT = 8.0


def _ms(start: float) -> int:
    return int((time.perf_counter() - start) * 1000)


def _demo_metrics() -> dict:
    now = datetime.now()
    return {
        "as_of": now.strftime("%Y-%m-%d %H:%M"),
        "revenue_today": 4820.55,
        "mrr": 61340,
        "active_users": 12874,
        "new_signups_today": 96,
        "churn_rate_pct": 1.8,
        "support_open_tickets": 14,
        "uptime_30d_pct": 99.98,
    }


async def get_metrics() -> dict:
    started = time.perf_counter()
    if config.METRICS_ENDPOINT:
        try:
            async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
                resp = await client.get(
                    config.METRICS_ENDPOINT, headers={"accept": "application/json"}
                )
                resp.raise_for_status()
                data = resp.json()
            if not isinstance(data, dict):
                data = {"value": data}
            return {"ok": True, "source": "live", "data": data, "ms": _ms(started)}
        except Exception as exc:
            return {
                "ok": True,
                "source": "demo",
                "error": f"metrics endpoint failed ({type(exc).__name__}), serving demo data",
                "data": _demo_metrics(),
                "ms": _ms(started),
            }
    return {"ok": True, "source": "demo", "data": _demo_metrics(), "ms": _ms(started)}


def _normalize_url(raw: str) -> str | None:
    url = (raw or "").strip()
    if not url:
        return None
    scheme_only = re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:(?!//)(.*)", url)
    if scheme_only and not re.match(r"^\d+(/|$)", scheme_only.group(1)):
        return None  # javascript:, mailto:, data: ... but allow host:port
    if not re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*://", url):
        url = "https://" + url
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        return None
    host = parsed.hostname or ""
    if not re.fullmatch(r"[A-Za-z0-9.-]+", host) or not (host == "localhost" or "." in host):
        return None
    return url


async def open_tab(url: str) -> dict:
    started = time.perf_counter()
    normalized = _normalize_url(url)
    if not normalized:
        return {
            "ok": False,
            "source": "local",
            "error": f"refusing to open unsafe URL: {url!r}",
            "ms": _ms(started),
        }
    opened = await asyncio.to_thread(desktop.open_url, normalized)
    return {
        "ok": bool(opened),
        "source": "local",
        "url": normalized,
        "error": None if opened else "browser refused to open tab",
        "ms": _ms(started),
    }


def _youtube_search(query: str) -> dict | None:
    """First YouTube result for a query (metadata only, nothing downloaded), or None."""
    try:
        import yt_dlp

        with yt_dlp.YoutubeDL({"quiet": True, "no_warnings": True, "extract_flat": True, "skip_download": True}) as ydl:
            info = ydl.extract_info(f"ytsearch1:{query}", download=False)
        entry = (info or {}).get("entries", [None])[0]
        return {"id": entry["id"], "title": entry.get("title", "")} if entry and entry.get("id") else None
    except Exception:
        return None


async def play_youtube(query: str) -> dict:
    """Find a YouTube video for the request and open its page so it starts playing."""
    started = time.perf_counter()
    query = (query or "").strip()[:200]
    if not query:
        return {"ok": False, "source": "local", "error": "say what to play", "ms": _ms(started)}
    found = await asyncio.to_thread(_youtube_search, query)
    if found:
        url = f"https://www.youtube.com/watch?v={found['id']}"
    else:
        url = f"https://www.youtube.com/results?search_query={quote_plus(query)}"
    opened = await asyncio.to_thread(desktop.open_url, url)
    return {
        "ok": bool(opened), "source": "local", "url": url, "title": (found or {}).get("title", ""),
        "fallback": found is None, "error": None if opened else "could not open the browser", "ms": _ms(started),
    }


async def _powershell(script: str, what: str, started: float) -> dict:
    ok = await asyncio.to_thread(pc.run_powershell, script)
    return {"ok": ok, "source": "local", "did": what, "error": None if ok else "Windows didn't accept the command", "ms": _ms(started)}


async def volume(action: str, level: int = -1) -> dict:
    """Turn the PC volume up, down, mute it, or set it to a level (0-100)."""
    started = time.perf_counter()
    try:
        script = pc.volume_script(action.strip().lower(), level if level >= 0 else None)
    except ValueError as exc:
        return {"ok": False, "error": str(exc), "ms": _ms(started)}
    return await _powershell(script, f"volume {action}" + (f" {level}" if level >= 0 else ""), started)


async def media(action: str) -> dict:
    """Play/pause, next or previous track for whatever is playing."""
    started = time.perf_counter()
    key = {"play": "play_pause", "pause": "play_pause", "play_pause": "play_pause", "resume": "play_pause",
           "next": "next", "skip": "next", "previous": "previous", "back": "previous"}.get(action.strip().lower())
    if key is None:
        return {"ok": False, "error": "media action must be play, pause, next or previous", "ms": _ms(started)}
    return await _powershell(pc.key_script([key]), f"media {key}", started)


async def open_app(name: str) -> dict:
    """Open an app from the allowlist (VS Code, Spotify, File Explorer, Edge, Calculator, Notepad, ...)."""
    started = time.perf_counter()
    command = pc.app_command(name)
    if command is None:
        return {"ok": False, "error": f"'{name}' isn't on the list of apps I can open", "ms": _ms(started)}
    return await _powershell(f"Start-Process '{command}'", f"open {name}", started)


async def lock_screen() -> dict:
    """Lock the Windows screen."""
    started = time.perf_counter()
    return await _powershell("rundll32.exe user32.dll,LockWorkStation", "lock screen", started)


async def remind_me(text: str, when: str) -> dict:
    """Set a reminder: `when` is everyday words like 'at 5', 'in 20 minutes', 'tomorrow 10am'."""
    import config
    import services
    from datetime import datetime
    from zoneinfo import ZoneInfo
    from when import parse_when

    started = time.perf_counter()
    due = parse_when(when, datetime.now(ZoneInfo(config.TIMEZONE)))
    if due is None:
        return {"ok": False, "error": f"I couldn't tell when '{when}' is; try 'at 5pm' or 'in 30 minutes'", "ms": _ms(started)}
    row = services.get_store().add_reminder(text, due.isoformat())
    return {"ok": True, "id": row["id"], "text": row["text"], "due": due.strftime("%a %I:%M %p"), "ms": _ms(started)}


async def take_note(text: str) -> dict:
    """Save a note (client details, ideas). Shown on the Dashboard; can be deleted there."""
    import services

    started = time.perf_counter()
    row = services.get_store().add_note(text)
    return {"ok": True, "id": row["id"], "text": row["text"], "ms": _ms(started)}


async def list_reminders() -> dict:
    import services

    return {"ok": True, "reminders": services.get_store().list_reminders("pending"), "ms": 0}


async def morning_briefing() -> dict:
    """What needs doing today: drafts, interested clients, follow-ups, money, reminders, weather."""
    import briefing
    import config
    import services
    from datetime import datetime
    from zoneinfo import ZoneInfo

    started = time.perf_counter()
    out = await briefing.build(services.get_store(), services.get_mailer(), datetime.now(ZoneInfo(config.TIMEZONE)))
    return {"ok": True, **out, "ms": _ms(started)}


async def book_call(
    name: str = "",
    email: str = "",
    topic: str = "",
    preferred_time: str = "",
) -> dict:
    started = time.perf_counter()
    payload = {
        k: v.strip()
        for k, v in {
            "name": name,
            "email": email,
            "topic": topic,
            "preferred_time": preferred_time,
        }.items()
        if v and v.strip()
    }
    if config.BOOKING_WEBHOOK:
        try:
            async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
                resp = await client.post(config.BOOKING_WEBHOOK, json=payload)
                resp.raise_for_status()
                try:
                    body = resp.json()
                except Exception:
                    body = {"raw": resp.text[:200]}
                if not isinstance(body, dict):
                    body = {"response": body}
            return {
                "ok": True,
                "source": "live",
                "booking_id": body.get("booking_id") or body.get("id") or "confirmed",
                "webhook_response": body,
                "payload": payload,
                "ms": _ms(started),
            }
        except Exception as exc:
            return {
                "ok": False,
                "source": "live",
                "error": f"booking webhook failed: {exc}",
                "payload": payload,
                "ms": _ms(started),
            }
    booking_id = "JC-" + uuid.uuid4().hex[:6].upper()
    return {
        "ok": True,
        "source": "demo",
        "booking_id": booking_id,
        "status": "confirmed",
        "payload": payload,
        "ms": _ms(started),
    }


async def draft_email(to: str, subject: str, body: str, company: str = "") -> dict:
    """Put an email in the approval inbox. It is sent only after the owner approves it on the Outreach page."""
    started = time.perf_counter()
    import services
    from mailer import MailerError

    try:
        draft = services.get_mailer().draft(email=to, subject=subject, body=body, company=company,
                                            source_note="asked for in chat")
    except (MailerError, ValueError) as exc:
        return {"ok": False, "error": str(exc), "ms": _ms(started)}
    return {"ok": True, "draft_id": draft["id"], "to": draft["email"], "status": "drafted",
            "note": "Waiting for your approval on the Outreach page; nothing has been sent.", "ms": _ms(started)}


async def send_email_now(to: str, subject: str, body: str, cc: str = "", bcc: str = "", is_html: bool = False) -> dict:
    """The owner's own Send button on the Email Bot page. Deliberately NOT an assistant tool."""
    started = time.perf_counter()
    try:
        result = await asyncio.to_thread(gmail_service.gmail_service.send_email, to, subject, body, cc, bcc, is_html)
        result["ms"] = _ms(started)
        return result
    except Exception as e:
        return {"ok": False, "error": str(e), "ms": _ms(started)}


async def fetch_recent_emails(
    query: str = "",
    max_results: int = 20,
    days_back: int = 1,
) -> dict:
    """Fetch and parse recent emails."""
    started = time.perf_counter()
    try:
        if days_back and not query:
            since_date = (datetime.now() - timedelta(days=days_back)).strftime("%Y/%m/%d")
            query = f"after:{since_date}"

        emails = await asyncio.to_thread(
            gmail_service.gmail_service.fetch_emails, query=query, max_results=max_results
        )
        parsed = [gmail_service.gmail_service.parse_email_content(e) for e in emails]
        return {"ok": True, "source": "live", "emails": parsed, "count": len(parsed), "ms": _ms(started)}
    except Exception as e:
        return {"ok": False, "error": str(e), "ms": _ms(started)}


async def get_email_summary(days: int = 1) -> dict:
    """Get daily/weekly email summary with insights."""
    started = time.perf_counter()
    try:
        summary = await asyncio.to_thread(gmail_service.gmail_service.get_daily_summary, days)
        summary["ms"] = _ms(started)
        return {"ok": True, "source": "live", **summary}
    except Exception as e:
        return {"ok": False, "error": str(e), "ms": _ms(started)}


async def generate_cold_email_template(
    service_type: str = "general",
    recipient_name: str = "",
    company_name: str = "",
    portfolio_link: str = "",
) -> dict:
    """Generate a cold email template for freelancing."""
    started = time.perf_counter()
    try:
        template = gmail_service.gmail_service.create_cold_email_template(
            recipient_name=recipient_name or "there",
            company_name=company_name or "your company",
            service=service_type,
            portfolio_link=portfolio_link,
        )
        return {"ok": True, "source": "local", "template": template, "ms": _ms(started)}
    except Exception as e:
        return {"ok": False, "error": str(e), "ms": _ms(started)}


TOOL_FUNCS = {
    "get_metrics": get_metrics,
    "open_tab": open_tab,
    "play_youtube": play_youtube,
    "volume": volume,
    "remind_me": remind_me,
    "take_note": take_note,
    "list_reminders": list_reminders,
    "morning_briefing": morning_briefing,
    "media": media,
    "open_app": open_app,
    "lock_screen": lock_screen,
    "book_call": book_call,
    "draft_email": draft_email,
    "fetch_recent_emails": fetch_recent_emails,
    "get_email_summary": get_email_summary,
    "generate_cold_email_template": generate_cold_email_template,
}

TOOL_SPECS = [
    {"type": "function", "function": {"name": "remind_me", "description": "Set a reminder.", "parameters": {
        "type": "object", "properties": {"text": {"type": "string", "description": "what to remind about"},
                                         "when": {"type": "string", "description": "e.g. 'at 5pm', 'in 20 minutes', 'tomorrow 10am'"}},
        "required": ["text", "when"]}}},
    {"type": "function", "function": {"name": "take_note", "description": "Save a note for later.", "parameters": {
        "type": "object", "properties": {"text": {"type": "string"}}, "required": ["text"]}}},
    {"type": "function", "function": {"name": "list_reminders", "description": "List pending reminders.", "parameters": {
        "type": "object", "properties": {}}}},
    {"type": "function", "function": {"name": "morning_briefing", "description": "Today's briefing: drafts to approve, interested clients, follow-ups, money to collect, reminders and weather.", "parameters": {
        "type": "object", "properties": {}}}},
    {"type": "function", "function": {"name": "volume", "description": "Change the PC volume.", "parameters": {
        "type": "object", "properties": {"action": {"type": "string", "enum": ["up", "down", "mute", "set"]},
                                         "level": {"type": "integer", "description": "0-100, only with set"}},
        "required": ["action"]}}},
    {"type": "function", "function": {"name": "media", "description": "Play/pause, next or previous track.", "parameters": {
        "type": "object", "properties": {"action": {"type": "string", "enum": ["play", "pause", "next", "previous"]}},
        "required": ["action"]}}},
    {"type": "function", "function": {"name": "open_app", "description": "Open a desktop app: VS Code, Spotify, File Explorer, Edge, Calculator, Notepad, Settings, WhatsApp, Terminal, Paint.", "parameters": {
        "type": "object", "properties": {"name": {"type": "string"}}, "required": ["name"]}}},
    {"type": "function", "function": {"name": "lock_screen", "description": "Lock the Windows screen.", "parameters": {
        "type": "object", "properties": {}}}},
    {
        "type": "function",
        "function": {
            "name": "play_youtube",
            "description": "Play something on YouTube in the user's browser (music, a video, a channel).",
            "parameters": {"type": "object", "properties": {"query": {"type": "string", "description": "what to play"}},
                           "required": ["query"]},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_metrics",
            "description": (
                "Fetch the user's current business metrics (revenue, MRR, users, "
                "churn, tickets, uptime). Takes no arguments."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "open_tab",
            "description": "Open a URL in a new browser tab on the user's machine.",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "Full URL to open"}
                },
                "required": ["url"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "book_call",
            "description": "Book a call via the user's booking webhook.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "email": {"type": "string"},
                    "topic": {"type": "string"},
                    "preferred_time": {
                        "type": "string",
                        "description": "Free-form, e.g. 'Tuesday 3pm'",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "draft_email",
            "description": "Write an email into the owner's approval inbox. It is never sent until the owner approves it.",
            "parameters": {
                "type": "object",
                "properties": {
                    "to": {"type": "string", "description": "Recipient email address"},
                    "subject": {"type": "string", "description": "Email subject line"},
                    "body": {"type": "string", "description": "Plain-text email body"},
                    "company": {"type": "string", "description": "Recipient's company, if known"},
                },
                "required": ["to", "subject", "body"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "fetch_recent_emails",
            "description": "Fetch and parse recent emails from Gmail inbox.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Gmail search query (e.g., 'is:unread', 'from:client.com')"},
                    "max_results": {"type": "integer", "description": "Maximum emails to fetch", "default": 20},
                    "days_back": {"type": "integer", "description": "Days to look back if no query provided", "default": 1},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_email_summary",
            "description": "Get a summary of email activity with insights for freelancing.",
            "parameters": {
                "type": "object",
                "properties": {
                    "days": {"type": "integer", "description": "Number of days to summarize", "default": 1},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "generate_cold_email_template",
            "description": "Generate a cold email template for freelancing services.",
            "parameters": {
                "type": "object",
                "properties": {
                    "service_type": {"type": "string", "description": "Type of service: web_development, software_development, general", "default": "general"},
                    "recipient_name": {"type": "string", "description": "Name of the recipient"},
                    "company_name": {"type": "string", "description": "Company name"},
                    "portfolio_link": {"type": "string", "description": "Link to portfolio"},
                },
                "required": [],
            },
        },
    },
]


def summarize_result(result: dict, limit: int = 240) -> str:
    slim = {k: v for k, v in result.items() if k not in ("payload",)}
    text = json.dumps(slim, default=str)
    if len(text) > limit:
        text = text[: limit - 3] + "..."
    return text


def flatten_value(value) -> str:
    if isinstance(value, dict) or isinstance(value, list):
        text = json.dumps(value, default=str)
    elif isinstance(value, float):
        text = f"{value:,.2f}".rstrip("0").rstrip(".")
    else:
        text = str(value)
    return text if len(text) <= 60 else text[:57] + "..."
