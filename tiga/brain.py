import asyncio
import inspect
import json
import random
import re
from datetime import datetime

import httpx

import config
import tools

MAX_TOOL_ROUNDS = 5

SYSTEM_PROMPT = (
    "You are Tiga, the user's personal AI valet, in the style of Tony Stark's "
    "assistant: impeccably polite, concise, faintly dry British wit. Address the "
    "user as 'sir' occasionally. Your replies are spoken aloud via text-to-speech, "
    "so keep them to one or two short sentences of plain prose. Never use markdown, "
    "bullet points, or emoji. Prefer calling tools over guessing numbers; never "
    "invent metric values. When a tool result has source=demo, you may note it "
    "briefly ('per my demo records')."
)

GREETINGS = [
    "At your service, sir.",
    "Online and attentive, sir. How may I assist?",
    "Good to hear from you, sir. What shall we accomplish?",
]

UNKNOWN = [
    "I'm afraid that's beyond my current remit, sir. I can report metrics, open a tab, or book a call.",
    "My apologies, sir, that instruction isn't in my repertoire just yet. Try metrics, opening a site, or booking a call.",
]

SITE_MAP = {
    "youtube": "https://youtube.com",
    "github": "https://github.com",
    "gmail": "https://mail.google.com",
    "google mail": "https://mail.google.com",
    "calendar": "https://calendar.google.com",
    "google": "https://google.com",
    "maps": "https://maps.google.com",
    "drive": "https://drive.google.com",
    "linkedin": "https://linkedin.com",
    "twitter": "https://x.com",
    "reddit": "https://reddit.com",
    "stack overflow": "https://stackoverflow.com",
    "notion": "https://notion.so",
    "slack": "https://app.slack.com",
    "whatsapp web": "https://web.whatsapp.com",
}

URL_RE = re.compile(
    r"(https?://[^\s\"']+|(?:[\w-]+\.)+[a-zA-Z]{2,}(?:/[^\s\"']*)?)", re.IGNORECASE
)
EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")

RE_METRICS = re.compile(
    r"\b(metrics?|kpis?|numbers?|figures?|revenue|sales|"
    r"how('s| is) (the )?business|business report)\b",
    re.IGNORECASE,
)
RE_BOOK = re.compile(
    r"\b(book|schedule|arrange|set ?up|organise|organize)\b[^.?!]*\b(call|meeting|chat|slot)\b"
    r"|\b(call|meeting)\b[^.?!]*\b(book|schedule|arrange|set ?up)\b",
    re.IGNORECASE,
)
RE_OPEN = re.compile(
    r"\b(open|launch|pull up|bring up|go to|show me|visit)\b(.*)",
    re.IGNORECASE | re.DOTALL,
)
RE_TIME = re.compile(r"\btime is it\b|\bwhat('s| is)? (the )?(time|date)\b|\bwhat day is it\b", re.IGNORECASE)
RE_STATUS = re.compile(
    r"\b(status|systems? check|diagnostics?|integrations?|are you (online|there|awake))\b",
    re.IGNORECASE,
)
RE_GREETING = re.compile(
    r"^(hey|hi|hello|yo|good (morning|afternoon|evening))\b[,.\s]*(tiga|tiga)?\b[!. ]*$",
    re.IGNORECASE,
)

RE_EMAIL_SUMMARY = re.compile(
    r"\b(email|mail|inbox)\b[^.?!]*\b(summary|report|digest|overview|how many|check)\b"
    r"|\b(check|show|give)\b[^.?!]*\b(email|mail|inbox)\b",
    re.IGNORECASE,
)
RE_SEND_COLD_EMAIL = re.compile(
    r"\b(send|write|draft|create)\b[^.?!]*\b(cold email|outreach|proposal)\b"
    r"|\b(cold email|outreach)\b[^.?!]*\b(send|write|draft)\b",
    re.IGNORECASE,
)
RE_FETCH_EMAILS = re.compile(
    r"\b(fetch|get|show|read|check)\b[^.?!]*\b(email|mail|message|inbox)\b"
    r"|\b(recent|latest|new)\b[^.?!]*\b(email|mail)\b",
    re.IGNORECASE,
)
RE_GENERATE_TEMPLATE = re.compile(
    r"\b(generate|create|draft|write)\b[^.?!]*\b(template|draft)\b[^.?!]*\b(cold email|outreach)\b"
    r"|\b(cold email|outreach)\b[^.?!]*\b(template|draft)\b",
    re.IGNORECASE,
)


def _signature(func):
    return set(inspect.signature(func).parameters)


async def run_tool(name: str, args: dict) -> dict:
    func = tools.TOOL_FUNCS.get(name)
    if func is None:
        return {
            "tool": name,
            "args": args or {},
            "result": {"ok": False, "error": f"unknown tool '{name}'"},
            "ok": False,
            "ms": 0,
        }
    params = {}
    wanted = _signature(func)
    for key, value in (args or {}).items():
        if key in wanted and value not in (None, ""):
            params[key] = str(value)[:200]
    try:
        result = await func(**params) if params else await func()
    except Exception as exc:
        result = {"ok": False, "source": "error", "error": f"{type(exc).__name__}: {exc}"}
    return {
        "tool": name,
        "args": params,
        "result": result,
        "ok": bool(result.get("ok", True)),
        "ms": int(result.get("ms", 0)),
    }


async def respond(user_text: str, history: list) -> dict:
    if config.OPENAI_API_KEY:
        try:
            reply, actions = await _llm_respond(user_text, history)
            if reply:
                return {"reply": reply, "actions": actions, "mode": "llm"}
        except Exception:
            pass
    return await _builtin_respond(user_text)


async def _builtin_respond(text: str) -> dict:
    lowered = text.lower().strip()

    if RE_EMAIL_SUMMARY.search(lowered):
        days_m = re.search(r"\b(\d+)\s*(day|week)s?\b", lowered)
        days = int(days_m.group(1)) if days_m else 1
        if days_m and "week" in days_m.group(2):
            days *= 7
        action = await run_tool("get_email_summary", {"days": days})
        return {"reply": _email_summary_reply(action), "actions": [action], "mode": "builtin"}

    if RE_SEND_COLD_EMAIL.search(lowered):
        email_m = EMAIL_RE.search(text)
        subject_m = re.search(r"\b(?:subject|re:)\s*[:\-]?\s*([^.!?]+)", text, re.IGNORECASE)
        to = email_m.group(0) if email_m else ""
        subject = subject_m.group(1).strip() if subject_m else "Freelance proposal"
        body = f"Cold email to {to} — please provide the full content, sir."
        action = await run_tool("send_cold_email", {"to": to, "subject": subject, "body": body})
        return {"reply": _send_email_reply(action), "actions": [action], "mode": "builtin"}

    if RE_FETCH_EMAILS.search(lowered):
        days_m = re.search(r"\b(\d+)\s*(day|week)s?\b", lowered)
        days = int(days_m.group(1)) if days_m else 1
        if days_m and "week" in days_m.group(2):
            days *= 7
        action = await run_tool("fetch_recent_emails", {"days_back": days, "max_results": 20})
        return {"reply": _fetch_emails_reply(action), "actions": [action], "mode": "builtin"}

    if RE_GENERATE_TEMPLATE.search(lowered):
        service_type = "general"
        if "web" in lowered or "website" in lowered or "frontend" in lowered:
            service_type = "web_development"
        elif "software" in lowered or "app" in lowered or "backend" in lowered or "api" in lowered:
            service_type = "software_development"

        name_m = re.search(r"\b(?:to|for|dear)\s+([A-Z][a-z]+)", text)
        company_m = re.search(r"\b(?:at|from)\s+([A-Z][a-zA-Z0-9\s]+)", text)

        action = await run_tool(
            "generate_cold_email_template",
            {
                "service_type": service_type,
                "recipient_name": name_m.group(1) if name_m else "",
                "company_name": company_m.group(1).strip() if company_m else "",
            },
        )
        return {"reply": _template_reply(action), "actions": [action], "mode": "builtin"}

    if RE_METRICS.search(lowered):
        action = await run_tool("get_metrics", {})
        return {"reply": _metrics_reply(action), "actions": [action], "mode": "builtin"}

    if RE_BOOK.search(lowered):
        email_m = EMAIL_RE.search(text)
        topic_m = re.search(r"\b(?:about|regarding|re:?)\s+([\w .,-]{3,60})", text, re.IGNORECASE)
        time_m = re.search(
            r"\b(?:for|at|on)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today|"
            r"next week|this afternoon|this morning|\d{1,2}(:\d{2})?\s*(?:am|pm))",
            text,
            re.IGNORECASE,
        )
        args = {
            "topic": topic_m.group(1).strip() if topic_m else "",
            "preferred_time": time_m.group(1) if time_m else "",
            "email": email_m.group(0) if email_m else "",
        }
        action = await run_tool("book_call", args)
        return {"reply": _booking_reply(action), "actions": [action], "mode": "builtin"}

    open_m = RE_OPEN.search(text)
    if open_m:
        rest = (open_m.group(2) or "").strip()
        target = None
        url_m = URL_RE.search(rest)
        if url_m:
            target = url_m.group(0)
        elif re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:\S+$", rest):
            target = rest.split()[0]
        else:
            for key, url in sorted(SITE_MAP.items(), key=lambda kv: -len(kv[0])):
                if re.search(rf"(?<!\w){re.escape(key)}(?!\w)", rest.lower()):
                    target = url
                    break
        if target:
            action = await run_tool("open_tab", {"url": target})
            shown = action["result"].get("url") or re.sub(r"^[a-zA-Z][a-zA-Z0-9+.-]*:?/*", "", target)
            host = shown.replace("https://", "").replace("http://", "").split("/")[0] or shown[:40]
            reply = (
                f"Bringing up {host}, sir."
                if action["ok"]
                else f"I'm afraid I can't open that, sir — {host} was refused as unsafe."
            )
            return {"reply": reply, "actions": [action], "mode": "builtin"}
        return {"reply": "Which site shall I summon, sir?", "actions": [], "mode": "builtin"}

    if RE_TIME.search(lowered):
        now = datetime.now()
        return {
            "reply": f"It's {now.strftime('%H:%M')} on {now.strftime('%A, %d %B')}, sir.",
            "actions": [],
            "mode": "builtin",
        }

    if RE_STATUS.search(lowered):
        return {"reply": _status_reply(), "actions": [], "mode": "builtin"}

    if RE_GREETING.match(lowered) or lowered.rstrip("!?. ") in {"tiga", "tiga"}:
        return {"reply": random.choice(GREETINGS), "actions": [], "mode": "builtin"}

    return {"reply": random.choice(UNKNOWN), "actions": [], "mode": "builtin"}


def _demo_suffix(source: str) -> str:
    if source == "live":
        return ""
    return " That's from my demo records until you wire me up, of course."


def _metrics_reply(action: dict) -> str:
    result = action["result"]
    if not result.get("data"):
        return "I'm afraid the metrics feed came back empty, sir."
    bits = []
    for key, value in list(result["data"].items())[:6]:
        bits.append(f"{key.replace('_', ' ')} {tools.flatten_value(value)}")
    body = "; ".join(bits)
    note = f" ({result['error']})" if result.get("error") else ""
    return f"Current figures, sir{note} — {body}.{_demo_suffix(result.get('source'))}"


def _booking_reply(action: dict) -> str:
    result = action["result"]
    payload = result.get("payload") or {}
    when = payload.get("preferred_time")
    topic = payload.get("topic")
    if not action["ok"]:
        return f"My apologies, sir — the booking failed: {result.get('error', 'unknown error')}."
    ref = result.get("booking_id", "confirmed")
    parts = ["Done, sir."]
    if topic:
        parts.append(f"The call on {topic}")
    elif when:
        parts.append("The call")
    else:
        parts.append("The call has been pencilled in.")
    if when:
        parts.append(f"is set for {when}")
    parts.append(f"— reference {ref}.")
    if payload.get("email"):
        parts.append(f"A confirmation will find its way to {payload['email']}.")
    return " ".join(parts) + _demo_suffix(result.get("source"))


def _status_reply() -> str:
    parts = []
    parts.append("cognition online via OpenAI" if config.OPENAI_API_KEY else "running on my built-in demo brain")
    parts.append("metrics feed live" if config.METRICS_ENDPOINT else "metrics on demo data")
    parts.append("booking webhook live" if config.BOOKING_WEBHOOK else "bookings in demo mode")
    if config.ELEVENLABS_API_KEY:
        parts.append("voice synthesis via ElevenLabs")
    else:
        parts.append("voice falling back to your browser's synthesizer")
    return "Diagnostics complete, sir: " + ", ".join(parts) + "."


async def _llm_respond(user_text: str, history: list):
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for turn in history[-8:]:
        if isinstance(turn, dict) and turn.get("role") in ("user", "assistant") and turn.get("content"):
            messages.append({"role": turn["role"], "content": str(turn["content"])[:2000]})
    messages.append({"role": "user", "content": user_text})

    actions = []
    headers = {"Authorization": f"Bearer {config.OPENAI_API_KEY}"}
    url = f"{config.OPENAI_BASE_URL}/chat/completions"

    async with httpx.AsyncClient(timeout=90) as client:
        for _ in range(MAX_TOOL_ROUNDS):
            resp = await client.post(
                url,
                headers=headers,
                json={
                    "model": config.OPENAI_MODEL,
                    "messages": messages,
                    "tools": tools.TOOL_SPECS,
                    "tool_choice": "auto",
                },
            )
            resp.raise_for_status()
            message = resp.json()["choices"][0]["message"]
            calls = message.get("tool_calls") or []
            if not calls:
                return (message.get("content") or "").strip(), actions
            messages.append(
                {
                    "role": "assistant",
                    "content": message.get("content"),
                    "tool_calls": [
                        {
                            "id": c["id"],
                            "type": "function",
                            "function": {
                                "name": c["function"]["name"],
                                "arguments": c["function"].get("arguments") or "{}",
                            },
                        }
                        for c in calls
                    ],
                }
            )
            for call in calls:
                name = call["function"]["name"]
                try:
                    args = json.loads(call["function"].get("arguments") or "{}")
                except json.JSONDecodeError:
                    args = {}
                action = await run_tool(name, args)
                actions.append(action)
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": call["id"],
                        "content": tools.summarize_result(action["result"], limit=1500),
                    }
                )
    return "All done, sir.", actions


def _email_summary_reply(action: dict) -> str:
    result = action["result"]
    if not action["ok"]:
        return f"I couldn't fetch the email summary, sir — {result.get('error', 'unknown error')}."
    total = result.get("total_emails", 0)
    cold = result.get("cold_emails", 0)
    replies = result.get("replies_received", 0)
    positive = result.get("positive_responses", 0)
    topics = result.get("top_topics", {})

    parts = [f"Email summary for the last {result.get('period_days', 1)} day(s), sir:"]
    parts.append(f"{total} total, {cold} cold outreach, {replies} replies, {positive} positive.")
    if topics:
        top = ", ".join(f"{k} ({v})" for k, v in list(topics.items())[:3])
        parts.append(f"Top topics: {top}.")
    if result.get("action_items"):
        parts.append(f"Action items: {len(result['action_items'])} extracted.")
    return " ".join(parts) + _demo_suffix(result.get("source"))


def _send_email_reply(action: dict) -> str:
    result = action["result"]
    if not action["ok"]:
        return f"My apologies, sir — the email failed to send: {result.get('error', 'unknown error')}."
    return f"Email sent, sir. Message ID: {result.get('message_id', 'unknown')}."


def _fetch_emails_reply(action: dict) -> str:
    result = action["result"]
    if not action["ok"]:
        return f"I couldn't fetch emails, sir — {result.get('error', 'unknown error')}."
    count = result.get("count", 0)
    emails = result.get("emails", [])
    cold = sum(1 for e in emails if e.get("is_cold_email"))
    replies = sum(1 for e in emails if e.get("is_reply"))
    positive = sum(1 for e in emails if e.get("sentiment") == "positive")
    return f"Fetched {count} emails, sir — {cold} cold, {replies} replies, {positive} positive.{_demo_suffix(result.get('source'))}"


def _template_reply(action: dict) -> str:
    result = action["result"]
    if not action["ok"]:
        return f"Couldn't generate template, sir — {result.get('error', 'unknown error')}."
    template = result.get("template", {})
    subject = template.get("subject", "")
    return f"Template ready, sir. Subject: {subject}. Check the UI for the full draft."
