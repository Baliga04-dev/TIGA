"""Routes for the Marketing page: the consent ledger, warm-network messages, walk-in routes, visits and printables."""
from fastapi import APIRouter
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, ConfigDict, Field

import billing
import marketing
import services
from marketing import MarketingError

router = APIRouter(prefix="/api/marketing")
# Printable pages: no scripts, no network, framed by nothing (the QR codes are inline SVG).
_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; frame-ancestors 'none'"


class _In(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)


class ContactIn(_In):
    name: str = Field(default="", max_length=120)
    business: str = Field(default="", max_length=200)
    category: str = Field(default="", max_length=60)
    phone: str = Field(default="", max_length=40)
    email: str = Field(default="", max_length=254)
    area: str = Field(default="", max_length=120)
    source: str = Field(default="warm", max_length=20)
    source_detail: str = Field(default="", max_length=300)
    owner_published: bool = False
    note: str = Field(default="", max_length=1000)


class ConsentIn(_In):
    channel: str = Field(max_length=20)
    how: str = Field(default="asked in person", max_length=120)
    notice: bool = False


class TextIn(_In):
    text: str = Field(default="", max_length=1500)


class TouchIn(_In):
    channel: str = Field(max_length=20)
    direction: str = Field(max_length=4)
    kind: str = Field(max_length=20)
    note: str = Field(default="", max_length=1000)


class ReasonIn(_In):
    reason: str = Field(default="", max_length=200)


class VisitIn(_In):
    prospect_id: int
    outcome: str = Field(max_length=20)
    name: str = Field(default="", max_length=120)
    phone: str = Field(default="", max_length=40)
    consent: list[str] = Field(default_factory=list, max_length=3)
    notice: bool = False
    note: str = Field(default="", max_length=1000)
    dnc: bool = False


class InboundIn(_In):
    ref: str = Field(default="", max_length=200)
    name: str = Field(default="", max_length=120)
    phone: str = Field(default="", max_length=40)
    note: str = Field(default="", max_length=1000)


def _refuse(exc: Exception) -> dict:
    return {"ok": False, "error": str(exc).strip("'\"")}


def _with_gates(contact: dict) -> dict:
    """The contact, what the gate says for each channel, and when they were last messaged and last answered."""
    store, now = services.get_store(), marketing.now()
    touches = store.list_touches(contact["id"])
    last = lambda direction: max((t["at"] for t in touches if t["direction"] == direction and t["kind"] != "visit"), default="")
    visits = [t for t in touches if t["kind"] == "visit"]
    return {**contact, "gates": {ch: marketing.can_contact(store, contact["id"], ch, now) for ch in ("whatsapp", "call", "email")},
            "last_out_at": last("out"), "last_in_at": last("in"), "visits": len(visits),
            "last_outcome": visits[-1]["outcome"] if visits else ""}


@router.get("/contacts")
def contacts(source: str = "") -> dict:
    return {"ok": True, "items": [_with_gates(c) for c in services.get_store().list_contacts(source)]}


@router.post("/contacts")
def add_contact(body: ContactIn) -> dict:
    try:
        return {"ok": True, "contact": _with_gates(marketing.add_contact(services.get_store(), body.model_dump()))}
    except MarketingError as exc:
        return _refuse(exc)


@router.delete("/contacts/{contact_id}")
def delete_contact(contact_id: int) -> dict:
    marketing.delete_contact(services.get_store(), contact_id)
    return {"ok": True}


@router.post("/contacts/{contact_id}/consent")
def consent(contact_id: int, body: ConsentIn) -> dict:
    try:
        contact = marketing.give_consent(services.get_store(), contact_id, body.channel, body.how, marketing.now(), body.notice)
        return {"ok": True, "contact": _with_gates(contact)}
    except (MarketingError, KeyError) as exc:
        return _refuse(exc)


@router.post("/contacts/{contact_id}/dnc")
def dnc(contact_id: int, body: ReasonIn) -> dict:
    try:
        return {"ok": True, "contact": _with_gates(marketing.do_not_contact(services.get_store(), contact_id, body.reason, marketing.now()))}
    except KeyError as exc:
        return _refuse(exc)


@router.get("/contacts/{contact_id}/draft")
def draft(contact_id: int) -> dict:
    try:
        contact = services.get_store().get_contact(contact_id)
    except KeyError as exc:
        return _refuse(exc)
    return {"ok": True, "text": marketing.warm_message(contact, owner=marketing.owner_name(), demos_url=marketing.demos_url())}


@router.post("/contacts/{contact_id}/whatsapp")
def whatsapp(contact_id: int, body: TextIn) -> dict:
    try:
        out = marketing.whatsapp_link(services.get_store(), contact_id, body.text, marketing.now())
    except (MarketingError, KeyError) as exc:
        return _refuse(exc)
    return out if out["ok"] else {"ok": False, "error": out["reason"]}


@router.post("/contacts/{contact_id}/touches")
def touch(contact_id: int, body: TouchIn) -> dict:
    try:
        row = marketing.record_touch(services.get_store(), contact_id, channel=body.channel, direction=body.direction,
                                     kind=body.kind, note=body.note, now=marketing.now())
        return {"ok": True, "touch": row}
    except (MarketingError, KeyError) as exc:
        return _refuse(exc)


@router.get("/contacts/{contact_id}/touches")
def touches(contact_id: int) -> dict:
    return {"ok": True, "items": services.get_store().list_touches(contact_id)}


@router.get("/localities")
def localities() -> dict:
    return {"ok": True, "items": sorted(marketing.LOCALITIES)}


@router.get("/route")
def route(locality: str, category: str = "all", radius_km: float = 1.0) -> dict:
    try:
        return {"ok": True, **marketing.route(services.get_store(), locality, category, radius_km, marketing.now())}
    except MarketingError as exc:
        return _refuse(exc)


@router.post("/visits")
def visit(body: VisitIn) -> dict:
    try:
        contact = marketing.log_visit(services.get_store(), body.prospect_id, outcome=body.outcome, name=body.name,
                                      phone=body.phone, consent=body.consent, notice=body.notice, note=body.note,
                                      dnc=body.dnc, now=marketing.now())
        return {"ok": True, "contact": _with_gates(contact)}
    except MarketingError as exc:
        return _refuse(exc)


@router.post("/inbound")
def inbound(body: InboundIn) -> dict:
    try:
        contact = marketing.inbound(services.get_store(), body.ref, name=body.name, phone=body.phone, note=body.note,
                                    now=marketing.now())
        return {"ok": True, "contact": _with_gates(contact)}
    except MarketingError as exc:
        return _refuse(exc)


@router.get("/followups")
def followups() -> dict:
    out = marketing.followups(services.get_store(), marketing.now())
    return {"ok": True, **out, "items": [{**f, "contact": _with_gates(f["contact"])} for f in out["items"]]}


@router.get("/scorecard")
def scorecard() -> dict:
    today = marketing.now().astimezone(marketing.IST).date()
    return {"ok": True, **marketing.scorecard(services.get_store(), today)}


class InterviewIn(_In):
    business: str = Field(default="", max_length=200)
    category: str = Field(default="", max_length=60)
    answers: dict[str, str] = Field(default_factory=dict)
    prices: dict[str, dict[str, int | None]] = Field(default_factory=dict)


def _site_price() -> int:
    rates = {r["id"]: r["price"] for r in billing.get_rates(services.get_store())}
    return rates.get("business_site") or rates.get("one_page") or 0


@router.get("/commission")
def commission(orders: int, average: int, commission: float = 25, share: float = 20, price: int | None = None) -> dict:
    try:
        return {"ok": True, **marketing.commission_maths(orders=orders, average=average, commission=commission,
                                                         direct_share=share, site_price=_site_price() if price is None else price)}
    except MarketingError as exc:
        return _refuse(exc)


@router.get("/interviews")
def interviews() -> dict:
    rows = services.get_store().list_owner_interviews()
    return {"ok": True, "items": rows, "summary": marketing.interview_summary(rows),
            "guide": [{"id": k, "question": q} for k, q in marketing.INTERVIEW_GUIDE],
            "offers": [{"id": k, "label": v} for k, v in marketing.OFFERS.items()]}


@router.post("/interviews")
def add_interview(body: InterviewIn) -> dict:
    try:
        return {"ok": True, "interview": marketing.add_interview(services.get_store(), body.model_dump(), marketing.now())}
    except MarketingError as exc:
        return _refuse(exc)


@router.get("/print/commission", response_class=HTMLResponse)
def print_commission(orders: int, average: int, commission: float = 25, share: float = 20, price: int | None = None,
                     shop: str = "") -> HTMLResponse:
    try:
        maths = marketing.commission_maths(orders=orders, average=average, commission=commission, direct_share=share,
                                           site_price=_site_price() if price is None else price)
    except MarketingError as exc:
        return HTMLResponse(str(exc), status_code=400, headers={"Content-Security-Policy": _CSP})
    page = marketing.commission_sheet_html(shop[:120], maths, today=marketing.now().astimezone(marketing.IST).date())
    return HTMLResponse(page, headers={"Content-Security-Policy": _CSP})


@router.get("/print/audit/{prospect_id}", response_class=HTMLResponse)
def print_audit(prospect_id: int) -> HTMLResponse:
    try:
        prospect = services.get_store().get_prospect(prospect_id)
    except KeyError:
        return HTMLResponse("No such shop.", status_code=404, headers={"Content-Security-Policy": _CSP})
    try:
        page = marketing.audit_sheet_html(prospect, owner=marketing.owner_name(), whatsapp=marketing.owner_whatsapp(),
                                          demos_url=marketing.demos_url(), today=marketing.now().astimezone(marketing.IST).date())
    except MarketingError as exc:
        return HTMLResponse(str(exc), status_code=409, headers={"Content-Security-Policy": _CSP})
    return HTMLResponse(page, headers={"Content-Security-Policy": _CSP})


@router.get("/print/route", response_class=HTMLResponse)
def print_route(locality: str, category: str = "all", radius_km: float = 1.0) -> HTMLResponse:
    try:
        out = marketing.route(services.get_store(), locality, category, radius_km, marketing.now())
    except MarketingError as exc:
        return HTMLResponse(str(exc), status_code=400, headers={"Content-Security-Policy": _CSP})
    page = marketing.route_sheet_html(locality, out["stops"], today=marketing.now().astimezone(marketing.IST).date())
    return HTMLResponse(page, headers={"Content-Security-Policy": _CSP})
