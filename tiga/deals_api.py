"""Routes for the Pipeline page: deals, stage moves, payments and the money summary."""
import datetime

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field

from fastapi.responses import HTMLResponse

import billing
import config
import deals
import services
from mailer import MailerError
from store import TransitionError

# Printable pages: no scripts, no network, framed by nothing.
_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; frame-ancestors 'none'"


def _business() -> dict:
    return {"name": config.BUSINESS_NAME or config.SENDER_NAME or "Tiga", "email": config.GMAIL_USER_EMAIL,
            "upi": config.UPI_ID, "address": config.POSTAL_ADDRESS}


def _draft(deal: dict, subject: str, body: str) -> dict | None:
    """Put the email in the approval inbox; report (not fail) if the client already has an open draft."""
    try:
        return services.get_mailer().draft(email=deal["email"], subject=subject, body=body,
                                           company=deal["company"], source_note=f"deal #{deal['id']}")
    except MailerError:
        return None

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


class ProposalIn(BaseModel):
    items: list[dict] = Field(min_length=1, max_length=20)


class InvoiceIn(BaseModel):
    kind: str = Field(pattern="^(advance|balance)$")


def _thanks(deal: dict) -> str:
    portfolio = f" You can see other work at {config.PORTFOLIO_URL}." if config.PORTFOLIO_URL else ""
    name = _business()["name"]
    return (f"Hi,\n\nThank you for working with me on {deal['company'] or 'your project'}, and for the payment.{portfolio}\n\n"
            "One small favour, only if you're happy with the work: could you reply with two or three lines about it? "
            "I'll only quote them if you say yes.\n\n"
            f"Thanks again,\n{name}")


@router.post("/{deal_id}/move")
def move(deal_id: int, body: MoveIn) -> dict:
    def go():
        deal = services.get_store().move_deal(deal_id, body.stage, actor="user")
        draft = _draft(deal, "Thank you", _thanks(deal)) if deal["stage"] == "paid" else None
        return {"deal": deal, "draft": draft}

    return _guard(go)


@router.post("/{deal_id}/payment")
def payment(deal_id: int, body: PaymentIn) -> dict:
    return _guard(lambda: {"deal": deals.record_payment(services.get_store(), deal_id, kind=body.kind, amount=body.amount)})


@router.post("/{deal_id}/proposal")
def proposal(deal_id: int, body: ProposalIn) -> dict:
    def go():
        store = services.get_store()
        deal = store.get_deal(deal_id)
        p = billing.build_proposal(deal, body.items, billing.get_rates(store), _business(), datetime.date.today(),
                                   terms=billing.get_terms(store))
        doc = store.add_document("proposal", deal_id, p)
        if not deal["amount"]:
            store.update_deal(deal_id, amount=p["total"])
        draft = _draft(deal, f"Proposal for {p['client']}", billing.proposal_text(p))
        return {"document": {"id": doc["id"], "kind": "proposal", "total": p["total"]}, "draft": draft}

    return _guard(go)


@router.post("/{deal_id}/invoice")
def invoice(deal_id: int, body: InvoiceIn) -> dict:
    def go():
        store = services.get_store()
        deal = store.get_deal(deal_id)
        today = datetime.date.today()
        inv = billing.build_invoice(deal, body.kind, "PENDING", _business(), today)  # validate before numbering
        number = billing.next_invoice_number(store, today)
        inv = billing.build_invoice(deal, body.kind, number, _business(), today)
        doc = store.add_document("invoice", deal_id, inv, number=number)
        draft = _draft(deal, f"Invoice {number}", billing.invoice_text(inv))
        return {"document": {"id": doc["id"], "kind": "invoice", "number": number, "amount": inv["amount"]}, "draft": draft}

    return _guard(go)


@router.post("/{deal_id}/handover")
def handover(deal_id: int) -> dict:
    def go():
        store = services.get_store()
        deal = store.get_deal(deal_id)
        if deal["stage"] not in ("in_progress", "delivered", "paid"):
            raise ValueError("A handover sheet is for a site that's built: mark the deal in progress or delivered first")
        sheet = billing.build_handover(deal, _business(), billing.get_terms(store), datetime.date.today())
        doc = store.add_document("handover", deal_id, sheet)
        return {"document": {"id": doc["id"], "kind": "handover"}}

    return _guard(go)


@router.get("/{deal_id}/documents")
def documents(deal_id: int) -> dict:
    return {"ok": True, "items": services.get_store().list_documents(deal_id)}


pricing_router = APIRouter(prefix="/api")


class RatesIn(BaseModel):
    rates: list[dict] = Field(min_length=1, max_length=50)


@pricing_router.get("/pricing")
def get_pricing() -> dict:
    return {"ok": True, "rates": billing.get_rates(services.get_store())}


@pricing_router.put("/pricing")
def put_pricing(body: RatesIn) -> dict:
    return _guard(lambda: {"rates": billing.set_rates(services.get_store(), body.rates)})


class TermsIn(BaseModel):
    renewal_yearly: int = Field(ge=0, le=100_000)
    renewal_what: str = Field(default="", max_length=160)


@pricing_router.get("/pricing/terms")
def get_terms() -> dict:
    return {"ok": True, "terms": billing.get_terms(services.get_store())}


@pricing_router.put("/pricing/terms")
def put_terms(body: TermsIn) -> dict:
    return _guard(lambda: {"terms": billing.set_terms(services.get_store(), body.model_dump())})


@pricing_router.get("/documents/{document_id}")
def document_page(document_id: int) -> HTMLResponse:
    try:
        doc = services.get_store().get_document(document_id)
    except KeyError:
        return HTMLResponse("Not found", status_code=404)
    return HTMLResponse(billing.render_html(doc["kind"], doc["data"]), headers={"Content-Security-Policy": _CSP})
