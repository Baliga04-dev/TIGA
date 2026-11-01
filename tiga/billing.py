"""Prices, proposals and invoices for client deals.

Interface: `get_rates(store)` / `set_rates(store, rates)`; `build_proposal(deal, items, rates, business, today)`
and `proposal_text(p)`; `next_invoice_number(store, today)`; `build_invoice(deal, kind, number, business, today)`
and `invoice_text(inv)`; `render_html(kind, doc)` for a printable page (print to PDF from the browser, free).
Payment is by UPI: the invoice carries a upi:// link and a QR for the exact amount. All amounts are whole rupees.
"""
from __future__ import annotations

import html
import io
import json
from datetime import date, timedelta
from urllib.parse import urlencode

from store import Store

# Starter rates for a new Bengaluru freelancer (suggestions; edit them in Settings).
DEFAULT_RATES = [
    {"id": "one_page", "name": "One-page website", "price": 6000, "unit": "project", "days": 5,
     "description": "A fast, mobile-friendly single page: about, services, photos, map, call/WhatsApp buttons."},
    {"id": "business_site", "name": "Business website (up to 5 pages)", "price": 15000, "unit": "project", "days": 10,
     "description": "Home, about, services/menu, gallery and contact, set up on your domain with HTTPS."},
    {"id": "redesign", "name": "Website redesign", "price": 12000, "unit": "project", "days": 10,
     "description": "Modern, mobile-friendly rebuild of an existing site, keeping your content."},
    {"id": "ecommerce", "name": "Online store (up to 30 products)", "price": 30000, "unit": "project", "days": 21,
     "description": "Product catalogue, cart and UPI/card checkout through a payment provider you own."},
    {"id": "web_app", "name": "Custom web app (bookings, orders, dashboards)", "price": 40000, "unit": "project", "days": 30,
     "description": "Starting price; final quote after a short scoping call."},
    {"id": "mobile_app", "name": "Simple mobile app (Android and iOS)", "price": 60000, "unit": "project", "days": 45,
     "description": "Starting price; final quote after a short scoping call."},
    {"id": "logo", "name": "Logo and brand colours", "price": 3000, "unit": "project", "days": 4,
     "description": "Two concepts, one round of changes, files for print and web."},
    {"id": "photo_edit", "name": "Photo editing", "price": 150, "unit": "image", "days": 2,
     "description": "Colour, light and background clean-up for product or shop photos."},
    {"id": "gbp_tuneup", "name": "Google listing tune-up", "price": 1500, "unit": "project", "days": 2,
     "description": "Your Google Business Profile set up properly: category, services, hours, photos, website link "
                    "and a review QR card, so people searching nearby find you. A good first job."},
    {"id": "care", "name": "Monthly website care", "price": 1500, "unit": "month", "days": 0,
     "description": "Updates, backups, small text/photo changes and uptime checks."},
]
CLIENT_PROVIDES = [
    "Your logo (or approval of a new one)",
    "Photos of your shop, products or team",
    "Text: about you, services or menu, prices, opening hours",
    "Domain and hosting logins, or approval for me to buy them at cost in your name",
    "Contact details to show on the site (phone, WhatsApp, email, address)",
]
# The promises that set Tiga's owner apart from the vendors shop owners distrust (research report, "Burned shop
# owners buy ownership and flat fees"). The audit sheet, the proposal and the handover sheet all use these words.
TRUST_TERMS = [
    "One all-in price in writing, with next year's renewal cost and date on it.",
    "The domain is registered in your name, and you get every login on one sheet.",
    "A small advance; the balance only after the site is live on your domain.",
    "No auto-debit, no lock-in, no commission on your orders.",
    "No promises of leads or rankings: a good website, and you own it.",
]
DEFAULT_TERMS = {"renewal_yearly": 1200, "renewal_what": "domain renewal; hosting stays free for a static site"}
_TERMS_KEY = "billing.terms"
_RATES_KEY = "billing.rates"
_UNITS = {"project", "image", "month", "page", "hour"}


def get_rates(store: Store) -> list[dict]:
    saved = store.get_value(_RATES_KEY, "")
    return json.loads(saved) if saved else [dict(r) for r in DEFAULT_RATES]


def set_rates(store: Store, rates: list[dict]) -> list[dict]:
    clean = []
    for r in rates:
        if not str(r.get("id", "")).strip() or not str(r.get("name", "")).strip():
            raise ValueError("every rate needs an id and a name")
        if not isinstance(r.get("price"), int) or r["price"] <= 0:
            raise ValueError(f"price for {r.get('name')} must be a positive whole number of rupees")
        if r.get("unit") not in _UNITS:
            raise ValueError(f"unit must be one of {', '.join(sorted(_UNITS))}")
        clean.append({"id": str(r["id"]).strip(), "name": str(r["name"]).strip()[:120], "price": r["price"],
                      "unit": r["unit"], "days": max(0, int(r.get("days", 0))),
                      "description": str(r.get("description", ""))[:400]})
    store.set_value(_RATES_KEY, json.dumps(clean))
    store.audit("user", "billing.rates", "rates", str(len(clean)))
    return clean


def get_terms(store: Store) -> dict:
    saved = store.get_value(_TERMS_KEY, "")
    return {**DEFAULT_TERMS, **(json.loads(saved) if saved else {})}


def set_terms(store: Store, terms: dict) -> dict:
    amount = terms.get("renewal_yearly")
    if not isinstance(amount, int) or not 0 <= amount <= 100_000:
        raise ValueError("the year-two renewal must be a whole number of rupees, 0 to 1,00,000")
    clean = {"renewal_yearly": amount, "renewal_what": str(terms.get("renewal_what", "")).strip()[:160]
             or DEFAULT_TERMS["renewal_what"]}
    store.set_value(_TERMS_KEY, json.dumps(clean))
    store.audit("user", "billing.terms", "terms", str(amount))
    return clean


def build_proposal(deal: dict, items: list[dict], rates: list[dict], business: dict, today: date,
                   terms: dict | None = None) -> dict:
    by_id = {r["id"]: r for r in rates}
    if not items:
        raise ValueError("choose at least one service for the proposal")
    lines = []
    for item in items:
        rate = by_id.get(item.get("rate_id"))
        qty = int(item.get("qty", 1))
        if rate is None or qty < 1:
            raise ValueError(f"unknown service or quantity: {item}")
        lines.append({"name": rate["name"], "description": rate["description"], "unit": rate["unit"], "qty": qty,
                      "price": rate["price"], "total": rate["price"] * qty, "days": rate["days"]})
    total = sum(line["total"] for line in lines)
    advance = total // 2
    terms = {**DEFAULT_TERMS, **(terms or {})}
    days = max(7, max(l["days"] for l in lines) + 3)
    launch = today + timedelta(days=days)
    return {
        "kind": "proposal", "deal_id": deal["id"], "client": deal.get("company") or deal.get("contact") or deal["email"],
        "client_email": deal["email"], "business": business, "date": today.isoformat(),
        "valid_until": (today + timedelta(days=14)).isoformat(), "lines": lines, "total": total,
        "advance": advance, "balance": total - advance, "days": days,
        "client_provides": list(CLIENT_PROVIDES), "trust": list(TRUST_TERMS),
        "renewal": {"amount": terms["renewal_yearly"], "what": terms["renewal_what"],
                    "due": (launch + timedelta(days=365)).strftime("%B %Y")},
    }


def proposal_text(p: dict) -> str:
    rows = "\n".join(f"- {l['name']} x{l['qty']}: Rs {l['total']:,}" for l in p["lines"])
    provides = "\n".join(f"- {x}" for x in p["client_provides"])
    trust = "\n".join(f"- {x}" for x in p.get("trust", TRUST_TERMS))
    return (
        f"Hi,\n\nThanks for the chat. Here is my proposal for {p['client']}.\n\nWHAT YOU GET\n{rows}\n\n"
        f"Total: Rs {p['total']:,}\nTimeline: about {p['days']} days from the advance and your content.\n\n"
        f"PAYMENT\n50% advance (Rs {p['advance']:,}) to start; 50% balance (Rs {p['balance']:,}) only after the site is "
        f"live on your own domain and you've checked it. UPI or bank transfer.\n\n"
        f"YEAR TWO\n{_renewal_line(p)}\n\nHOW I WORK\n{trust}\n\nWHAT I NEED FROM YOU\n{provides}\n\n"
        f"Includes one round of changes after the first preview. This quote is valid until {p['valid_until']}.\n\n"
        f"Reply 'yes' and I'll send the advance invoice.\n\nBest,\n{p['business']['name']}"
    )


def _renewal_line(p: dict) -> str:
    r = p.get("renewal") or {"amount": DEFAULT_TERMS["renewal_yearly"], "what": DEFAULT_TERMS["renewal_what"], "due": "a year after launch"}
    if not r["amount"]:
        return "Nothing to renew: there is no yearly cost after the first year."
    return (f"Rs {r['amount']:,} a year ({r['what']}), first due around {r['due']}. You pay it to the registrar, in "
            "your name; nothing is auto-debited, and you can move the site anywhere.")


def build_handover(deal: dict, business: dict, terms: dict, today: date) -> dict:
    """What the client owns and where it lives, filled in by hand at handover. Never passwords."""
    terms = {**DEFAULT_TERMS, **terms}
    client = deal.get("company") or deal.get("contact") or deal["email"]
    return {"kind": "handover", "deal_id": deal["id"], "client": client, "client_email": deal["email"],
            "business": business, "date": today.isoformat(), "renewal_yearly": terms["renewal_yearly"],
            "renewal_what": terms["renewal_what"],
            "rows": ["Domain name", "Registrar (where the domain is registered)", f"Registered in the name of: {client}",
                     "Login email for the registrar", f"Renews on (date), about ₹{terms['renewal_yearly']:,} a year",
                     "Hosting (where the site runs)", "How to change prices, photos or hours",
                     "Google Business Profile: owners and managers", "WhatsApp number orders and enquiries go to",
                     "Site editor or admin login (if any)", "Anything else handed over"]}


_REVIEW_HOSTS = ("g.page", "google.com", "goo.gl")


def build_review_card(deal: dict, link: str, business: dict, today: date) -> dict:
    """A counter card for a client's shop: a QR to their Google review page and a WhatsApp line to send customers."""
    from urllib.parse import urlparse

    url = (link or "").strip()
    host = urlparse(url).hostname or ""
    if not url.startswith("https://") or not any(host == h or host.endswith("." + h) for h in _REVIEW_HOSTS):
        raise ValueError("Paste the shop's Google review link (from their Business Profile: 'Ask for reviews', "
                         "starting https://g.page/ or a google.com link)")
    client = deal.get("company") or deal.get("contact") or deal["email"]
    return {"kind": "review_card", "deal_id": deal["id"], "client": client, "link": url, "business": business,
            "date": today.isoformat(),
            "whatsapp": f"Thank you for visiting {client}! If you have a minute, a Google review helps other people find "
                        f"us: {url}"}


def next_invoice_number(store: Store, today: date) -> str:
    key = f"billing.invoice.{today.year}"
    n = int(store.get_value(key, "0")) + 1
    store.set_value(key, str(n))
    return f"INV-{today.year}-{n:04d}"


def build_invoice(deal: dict, kind: str, number: str, business: dict, today: date) -> dict:
    if kind == "advance":
        amount = max(0, deal["amount"] // 2 - deal["advance_paid"])
    elif kind == "balance":
        amount = max(0, deal["amount"] - deal["advance_paid"] - deal["balance_paid"])
    else:
        raise ValueError("invoice kind must be advance or balance")
    if amount <= 0:
        raise ValueError(f"nothing left to invoice for the {kind}; set the deal price first")
    if not business.get("upi"):
        raise ValueError("set TIGA_UPI_ID in tiga/.env so the invoice can carry a UPI payment link")
    upi = "upi://pay?" + urlencode({"pa": business["upi"], "pn": business["name"], "am": f"{amount}.00",
                                    "cu": "INR", "tn": number})
    return {
        "kind": "invoice", "invoice_kind": kind, "number": number, "deal_id": deal["id"], "date": today.isoformat(),
        "due": (today + timedelta(days=7)).isoformat(), "client": deal.get("company") or deal.get("contact") or deal["email"],
        "client_email": deal["email"], "business": business, "amount": amount, "project_total": deal["amount"],
        "upi_link": upi,
    }


def invoice_text(inv: dict) -> str:
    what = "50% advance to start the project" if inv["invoice_kind"] == "advance" else "balance on delivery"
    return (
        f"Hi,\n\nInvoice {inv['number']} for {inv['client']}: {what}.\n\nAmount due: Rs {inv['amount']:,} "
        f"(project total Rs {inv['project_total']:,})\nDue by: {inv['due']}\n\nPay by UPI to {inv['business']['upi']}, "
        f"or tap this link on your phone:\n{inv['upi_link']}\n\nPlease mention {inv['number']} in the payment note. "
        f"Thank you!\n\n{inv['business']['name']}"
    )


def qr_svg(data: str) -> str:
    import qrcode
    import qrcode.image.svg

    buffer = io.BytesIO()
    qrcode.make(data, image_factory=qrcode.image.svg.SvgPathImage, box_size=8).save(buffer)
    return buffer.getvalue().decode().split("?>", 1)[-1]


_PAGE = """<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title}</title><style>
body{{font:15px/1.55 Georgia,serif;color:#15211c;background:#fff;margin:0}}main{{max-width:46rem;margin:0 auto;padding:2.5rem 1.5rem}}
h1{{font-size:1.9rem;margin:0 0 .2rem}}.muted{{color:#46544c}}table{{width:100%;border-collapse:collapse;margin:1rem 0}}
th,td{{text-align:left;padding:.5rem;border-bottom:1px solid #c5ccbf;vertical-align:top}}td.r,th.r{{text-align:right}}
.total{{font-size:1.3rem;font-weight:bold}}.box{{border:1px solid #c5ccbf;border-radius:6px;padding:1rem;margin:1rem 0}}
.qr svg{{width:180px;height:180px}}@media print{{.noprint{{display:none}}}}</style></head><body><main>{body}
<p class="noprint muted">Use your browser's Print (Ctrl+P) and choose "Save as PDF".</p></main></body></html>"""


def render_html(kind: str, doc: dict) -> str:
    e = lambda v: html.escape(str(v))  # every client-supplied value goes through this
    biz = doc["business"]
    head = f"<p class='muted'>{e(biz['name'])} · {e(biz.get('email', ''))} · {e(biz.get('address', ''))}</p>"
    if kind == "proposal":
        rows = "".join(f"<tr><td><b>{e(l['name'])}</b><br><span class='muted'>{e(l['description'])}</span></td>"
                       f"<td class='r'>{l['qty']}</td><td class='r'>₹{l['total']:,}</td></tr>" for l in doc["lines"])
        provides = "".join(f"<li>{e(x)}</li>" for x in doc["client_provides"])
        renewal = doc.get("renewal") or {"amount": DEFAULT_TERMS["renewal_yearly"], "what": DEFAULT_TERMS["renewal_what"], "due": "a year after launch"}
        trust = "".join(f"<li>{e(x)}</li>" for x in doc.get("trust", TRUST_TERMS))
        year_two = (f"<b>Year two:</b> ₹{renewal['amount']:,} a year ({e(renewal['what'])}), first due around {e(renewal['due'])}, "
                    "paid by you to the registrar in your name. Nothing is auto-debited." if renewal["amount"]
                    else "<b>Year two:</b> nothing to renew.")
        body = (f"<h1>Proposal for {e(doc['client'])}</h1>{head}<p class='muted'>{e(doc['date'])} · valid until "
                f"{e(doc['valid_until'])}</p><table><tr><th>Service</th><th class='r'>Qty</th><th class='r'>Price</th></tr>{rows}"
                f"<tr><td class='total'>Total</td><td></td><td class='r total'>₹{doc['total']:,}</td></tr></table>"
                f"<div class='box'><b>Timeline:</b> about {doc['days']} days from the advance and your content.<br>"
                f"<b>Payment:</b> 50% advance ₹{doc['advance']:,} to start; 50% balance ₹{doc['balance']:,} only after the "
                f"site is live on your own domain and you've checked it.<br>{year_two}<br>"
                f"Includes one round of changes after the first preview.</div><h2>How I work</h2><ul>{trust}</ul>"
                f"<h2>What I need from you</h2><ul>{provides}</ul>")
        return _PAGE.format(title=f"Proposal: {e(doc['client'])}", body=body)
    if kind == "review_card":
        card = (f"<div class='box' style='text-align:center;max-width:22rem;margin:1.5rem auto;padding:1.6rem'>"
                f"<h1 style='font-size:1.6rem'>Liked your visit?</h1><p>A Google review helps other people find "
                f"<b>{e(doc['client'])}</b>. It takes a minute.</p><div class='qr' style='display:flex;justify-content:center'>"
                f"{qr_svg(doc['link'])}</div><p class='muted' style='font-size:.8rem;word-break:break-all'>{e(doc['link'])}</p></div>")
        body = (f"<h2>Review card for {e(doc['client'])}</h2><p class='muted'>Print and keep it at the counter or on the "
                f"bill folder.</p>{card}<h2>To send customers on WhatsApp</h2><div class='box'>{e(doc['whatsapp'])}</div>"
                "<h2>For the shop</h2><p class='muted'>Ask every customer, not only the happy ones, and never offer a "
                "discount or gift for a review: Google removes reviews that break its rules.</p>")
        return _PAGE.format(title=f"Review card: {e(doc['client'])}", body=body)
    if kind == "handover":
        rows = "".join(f"<tr><th style='width:42%'>{e(r)}</th><td>&nbsp;</td></tr>" for r in doc["rows"])
        body = (f"<h1>Handover: {e(doc['client'])}</h1>{head}<p class='muted'>{e(doc['date'])}. Everything below belongs "
                f"to {e(doc['client'])}.</p><table>{rows}</table><div class='box'>Passwords are not written here: write them "
                "on your own copy by hand, or keep them in a password manager. Change any password I set as soon as you "
                f"take over.</div><p>Questions later? {e(biz['name'])}, {e(biz.get('email', ''))}.</p>")
        return _PAGE.format(title=f"Handover: {e(doc['client'])}", body=body)
    what = "50% advance" if doc["invoice_kind"] == "advance" else "Balance on delivery"
    body = (f"<h1>Invoice {e(doc['number'])}</h1>{head}<p>Billed to <b>{e(doc['client'])}</b> ({e(doc['client_email'])})<br>"
            f"Date {e(doc['date'])} · due {e(doc['due'])}</p><table><tr><th>Description</th><th class='r'>Amount</th></tr>"
            f"<tr><td>{e(what)} (project total ₹{doc['project_total']:,})</td><td class='r total'>₹{doc['amount']:,}</td></tr>"
            f"</table><div class='box'><b>Pay by UPI</b> to {e(biz['upi'])}: scan the code, and mention {e(doc['number'])}."
            f"<div class='qr'>{qr_svg(doc['upi_link'])}</div></div>")
    return _PAGE.format(title=f"Invoice {e(doc['number'])}", body=body)
