"""Private Learn service: serves a /teach workspace (MISSION.md + lessons/*.html) and the build notes.

Build notes are notes/<project>/NNNN-<tool>.md, one per tool a build brought in, written by
Claude's build-learnings skill in the same header-and-sections shape as the lab missions.

Every route 404s unless TIGA_LEARN_ENABLED is set, so a hosted Tiga exposes nothing.
"""
import re
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse

import config
from lab import parse_mission

_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]*$")
_TITLE = re.compile(r"<title>(.*?)</title>", re.I | re.S)
# Lessons are self-contained pages: no scripts, network or framing from the app's origin.
_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; sandbox"


def _require_enabled() -> None:
    if not config.LEARN_ENABLED:
        raise HTTPException(status_code=404, detail="Not Found")


router = APIRouter(prefix="/api/learn", dependencies=[Depends(_require_enabled)])


def _lessons_dir() -> Path:
    return Path(config.LEARN_DIR) / "lessons"


@router.get("/lessons")
def list_lessons() -> dict:
    lessons = []
    for page in sorted(_lessons_dir().glob("*.html")):
        match = _TITLE.search(page.read_text(encoding="utf-8", errors="replace"))
        lessons.append({"name": page.stem, "title": match.group(1).strip() if match else page.stem})
    return {"lessons": lessons}


@router.get("/lessons/{name}")
def get_lesson(name: str) -> HTMLResponse:
    page = _lessons_dir() / f"{name}.html"
    if not _NAME.match(name) or not page.is_file():
        raise HTTPException(status_code=404, detail="Lesson not found")
    return HTMLResponse(page.read_text(encoding="utf-8"), headers={"Content-Security-Policy": _CSP})


@router.get("/mission")
def get_mission() -> dict:
    mission = Path(config.LEARN_DIR) / "MISSION.md"
    return {"text": mission.read_text(encoding="utf-8") if mission.is_file() else ""}


def _read_note(page: Path) -> dict:
    doc = parse_mission(page.read_text(encoding="utf-8", errors="replace"))
    return {"id": f"{page.parent.name}/{page.stem}", "project": page.parent.name, "title": doc.get("title") or page.stem,
            "kind": doc.get("kind", ""), "date": doc.get("date", ""), "summary": doc.get("summary", ""),
            "sections": doc["sections"]}


@router.get("/notes")
def list_notes() -> dict:
    pages = [p for p in sorted((Path(config.LEARN_DIR) / "notes").glob("*/*.md"))
             if _NAME.match(p.parent.name) and _NAME.match(p.stem)]
    return {"ok": True, "items": [{k: v for k, v in _read_note(p).items() if k != "sections"} for p in pages]}


@router.get("/notes/{project}/{name}")
def get_note(project: str, name: str) -> dict:
    page = Path(config.LEARN_DIR) / "notes" / project / f"{name}.md"
    if not (_NAME.match(project) and _NAME.match(name)) or not page.is_file():
        raise HTTPException(status_code=404, detail="Note not found")
    return {"ok": True, "note": _read_note(page)}
