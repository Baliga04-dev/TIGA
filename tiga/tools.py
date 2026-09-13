import json
import re
import time
import uuid
import webbrowser
from datetime import datetime, timedelta
from urllib.parse import urlparse

import httpx

import config
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
    if not re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*://", url):
        url = "https://" + url
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        return None
    if any(c in parsed.netloc for c in " \t\r\n"):
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
    opened = webbrowser.open(normalized, new=2)
    return {
        "ok": bool(opened),
        "source": "local",
        "url": normalized,
        "error": None if opened else "browser refused to open tab",
        "ms": _ms(started),
    }


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


async def send_cold_email(
    to: str,
    subject: str,
    body: str,
    cc: str = "",
    bcc: str = "",
    is_html: bool = False,
) -> dict:
    """Send a cold email via Gmail."""
    started = time.perf_counter()
    try:
        result = gmail_service.gmail_service.send_email(to, subject, body, cc, bcc, is_html)
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

        emails = gmail_service.gmail_service.fetch_emails(query=query, max_results=max_results)
        parsed = [gmail_service.gmail_service.parse_email_content(e) for e in emails]
        return {"ok": True, "source": "live", "emails": parsed, "count": len(parsed), "ms": _ms(started)}
    except Exception as e:
        return {"ok": False, "error": str(e), "ms": _ms(started)}


async def get_email_summary(days: int = 1) -> dict:
    """Get daily/weekly email summary with insights."""
    started = time.perf_counter()
    try:
        summary = gmail_service.gmail_service.get_daily_summary(days)
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
    "book_call": book_call,
    "send_cold_email": send_cold_email,
    "fetch_recent_emails": fetch_recent_emails,
    "get_email_summary": get_email_summary,
    "generate_cold_email_template": generate_cold_email_template,
}

TOOL_SPECS = [
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
            "name": "send_cold_email",
            "description": "Send a cold email via Gmail for freelancing outreach.",
            "parameters": {
                "type": "object",
                "properties": {
                    "to": {"type": "string", "description": "Recipient email address"},
                    "subject": {"type": "string", "description": "Email subject line"},
                    "body": {"type": "string", "description": "Email body content"},
                    "cc": {"type": "string", "description": "CC recipients"},
                    "bcc": {"type": "string", "description": "BCC recipients"},
                    "is_html": {"type": "boolean", "description": "Send as HTML email"},
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
