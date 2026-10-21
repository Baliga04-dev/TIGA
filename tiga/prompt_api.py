"""Routes for the interview-style prompt generator."""
from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field

import services
from interview import Interviewer

router = APIRouter(prefix="/api/interviews")


class _In(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)


class StartIn(_In):
    idea: str = Field(min_length=3, max_length=2000)


class AnswerIn(_In):
    text: str = Field(default="", max_length=2000)


def _interviewer() -> Interviewer:
    return Interviewer(services.get_store())


def _guard(fn):
    try:
        return {"ok": True, **fn()}
    except (KeyError, ValueError) as exc:
        return {"ok": False, "error": str(exc).strip("'\"")}


@router.post("")
def start(body: StartIn) -> dict:
    return _guard(lambda: {"interview": _interviewer().start(body.idea)})


@router.post("/{interview_id}/answer")
def answer(interview_id: str, body: AnswerIn) -> dict:
    return _guard(lambda: {"interview": _interviewer().answer(interview_id, body.text)})


@router.post("/{interview_id}/generate")
def generate(interview_id: str) -> dict:
    return _guard(lambda: _interviewer().generate(interview_id))
