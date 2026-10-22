"""Routes for the Pipeline page: deals, stage moves, payments and the money summary."""
import datetime

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field

import deals
import services
from store import TransitionError

router = APIRouter(prefix="/api/deals")


class _In(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)


class DealIn(_In):
    email: str = Field(min_length=3, max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    contact: str = Field(default="", max_length=120)
    company: str = Field(default="", max_length=200)
    phone: str = Field(default="", max_length=40)
    service: str = Field(default="", max_length=200)
    amount: int = Field(default=0, ge=0, le=10_000_000)
    notes: str = Field(default="", max_length=4000)


class DealEditIn(_In):
    contact: str | None = Field(default=None, max_length=120)
    company: str | None = Field(default=None, max_length=200)
    phone: str | None = Field(default=None, max_length=40)
    service: str | None = Field(default=None, max_length=200)
    amount: int | None = Field(default=None, ge=0, le=10_000_000)
    notes: str | None = Field(default=None, max_length=4000)


class MoveIn(BaseModel):
    stage: str


class PaymentIn(BaseModel):
    kind: str = Field(pattern="^(advance|balance)$")
    amount: int = Field(gt=0, le=10_000_000)


def _guard(fn):
    try:
        return {"ok": True, **fn()}
    except (KeyError, ValueError, TransitionError) as exc:
        return {"ok": False, "error": str(exc).strip("'\"")}


@router.get("")
def list_deals() -> dict:
    rows = services.get_store().list_deals()
    return {"ok": True, "items": rows, "money": deals.money_summary(rows, today=datetime.date.today())}


@router.post("")
def create(body: DealIn) -> dict:
    return _guard(lambda: {"deal": services.get_store().create_deal(body.model_dump())})


@router.patch("/{deal_id}")
def edit(deal_id: int, body: DealEditIn) -> dict:
    return _guard(lambda: {"deal": services.get_store().update_deal(deal_id, **body.model_dump(exclude_none=True))})


@router.post("/{deal_id}/move")
def move(deal_id: int, body: MoveIn) -> dict:
    return _guard(lambda: {"deal": services.get_store().move_deal(deal_id, body.stage, actor="user")})


@router.post("/{deal_id}/payment")
def payment(deal_id: int, body: PaymentIn) -> dict:
    return _guard(lambda: {"deal": deals.record_payment(services.get_store(), deal_id, kind=body.kind, amount=body.amount)})
