"""Prompt generator that interviews you first, then writes a build-ready prompt.

Interface: `Interviewer(store)` with `start(idea)`, `answer(id, text)`, `add_sources(id, sources)`
and `generate(id)`. A fixed state machine owns the flow (priority order, at most
MAX_QUESTIONS questions, "skip" allowed, generate-now any time). Slots found in the
idea are never asked. State lives in the store, so an interview survives restarts.
"""
from __future__ import annotations

import json
import re
import uuid

from store import Store

MAX_QUESTIONS = 7
MAX_ANSWER = 2000
SKIPPED = "(you decide)"

# (slot, question) in the order they matter.
QUESTIONS = [
    ("user", "Who is the first person who will use this, and what is their situation?"),
    ("core_flow", "Walk me through the one thing a user must be able to do end to end."),
    ("data", "What information does it store or handle, and is any of it sensitive?"),
    ("stack", "Do you have a preferred language, framework or hosting, or should I choose?"),
    ("success", "How will you know the first version worked? Give a measurable result."),
    ("out_of_scope", "What should the first version explicitly NOT do?"),
    ("constraints", "Any deadline, budget, integration or compliance constraint?"),
]
_STACK = ["React", "Vue", "Svelte", "Next.js", "FastAPI", "Django", "Flask", "Node", "Express", "Python",
          "TypeScript", "Flutter", "SQLite", "PostgreSQL", "WordPress", "Shopify"]
_PLATFORMS = [("web app", r"\bweb ?(app|site|site)?\b|\bwebsite\b"), ("mobile app", r"\bmobile\b|\bandroid\b|\bios\b"),
              ("CLI tool", r"\bcli\b|\bcommand[- ]line\b"), ("bot", r"\bbot\b")]


def _extract(idea: str) -> dict[str, str]:
    slots = {"purpose": idea.strip()}
    found = [name for name in _STACK if re.search(rf"(?<![A-Za-z]){re.escape(name)}(?![A-Za-z])", idea, re.I)]
    if found:
        slots["stack"] = ", ".join(found)
    audience = re.search(r"\bfor ([a-z][a-z -]{2,40}?)(?: to | who | that | so | in | on |$|[,.])", idea, re.I)
    if audience:
        slots["user"] = audience.group(1).strip()
    for label, pattern in _PLATFORMS:
        if re.search(pattern, idea, re.I):
            slots["platform"] = label
            break
    return slots


def _next_question(state: dict) -> dict | None:
    if len(state["asked"]) >= MAX_QUESTIONS:
        return None
    for slot, text in QUESTIONS:
        if slot not in state["slots"] and slot not in state["asked"]:
            return {"slot": slot, "text": text}
    return None


class Interviewer:
    def __init__(self, store: Store):
        self.store = store

    def start(self, idea: str) -> dict:
        if not idea.strip():
            raise ValueError("Describe your idea first")
        state = {"id": uuid.uuid4().hex[:12], "slots": _extract(idea[:MAX_ANSWER]), "asked": [], "sources": []}
        return self._save(state)

    def answer(self, interview_id: str, text: str) -> dict:
        if len(text) > MAX_ANSWER:
            raise ValueError(f"Answers are limited to {MAX_ANSWER} characters")
        state = self._load(interview_id)
        question = _next_question(state)
        if question:
            skipped = text.strip().lower() in {"", "skip", "you decide", "idk"}
            state["slots"][question["slot"]] = SKIPPED if skipped else text.strip()
            state["asked"].append(question["slot"])
        return self._save(state)

    def add_sources(self, interview_id: str, sources: list[dict]) -> dict:
        state = self._load(interview_id)
        for src in sources:
            if str(src.get("url", "")).startswith(("http://", "https://")) and src.get("title"):
                state["sources"].append({"url": src["url"], "title": src["title"], "excerpt": str(src.get("excerpt", ""))[:300]})
        return self._save(state)

    def generate(self, interview_id: str) -> dict:
        state = self._load(interview_id)
        s = state["slots"]
        decided = [slot for slot, _ in QUESTIONS if s.get(slot, SKIPPED) == SKIPPED]
        refs = "\n".join(f"[{i}] {src['title']} {src['url']}" for i, src in enumerate(state["sources"], 1))
        facts = "\n".join(f"- {src['excerpt']} [{i}]" for i, src in enumerate(state["sources"], 1) if src["excerpt"])
        known = lambda slot, fallback: s.get(slot) if s.get(slot, SKIPPED) != SKIPPED else fallback
        prompt = f"""You are a senior engineer. Build the project described below. Ask before assuming anything listed under open questions.

<goal>
{s['purpose']}
</goal>

<users_and_context>
User: {known('user', 'not specified: propose one and confirm')}
Platform: {s.get('platform', 'not specified')}
Core flow: {known('core_flow', 'not specified: propose the simplest end-to-end flow')}
Data handled: {known('data', 'not specified: list what you assume and flag anything sensitive')}
</users_and_context>

<requirements>
- Deliver the core flow end to end before adding anything else.
- Keep the first version small, tested and runnable locally.
{facts or '- No sources were attached: state what must be verified instead of inventing facts.'}
</requirements>

<non_goals>
{known('out_of_scope', 'Anything not needed for the core flow.')}
</non_goals>

<constraints>
Stack: {known('stack', 'choose a justified, maintainable stack and say why')}
Other: {known('constraints', 'none stated')}
Never invent versions, API names or numbers; write "unknown" instead.
</constraints>

<acceptance_criteria>
- [ ] {known('success', 'Define a measurable success check with me before building')}
- [ ] The core flow works end to end and has automated tests.
- [ ] Setup and run steps are documented.
</acceptance_criteria>

<open_questions>
{chr(10).join(f'- {slot}: not decided, confirm or propose' for slot in decided) or '- none'}
</open_questions>

<references>
{refs or 'none'}
</references>"""
        return {"id": interview_id, "prompt": prompt}

    def _load(self, interview_id: str) -> dict:
        return json.loads(self.store.load_interview(interview_id))

    def _save(self, state: dict) -> dict:
        self.store.save_interview(state["id"], json.dumps(state))
        question = _next_question(state)
        return {**state, "question": question, "status": "asking" if question else "ready"}
