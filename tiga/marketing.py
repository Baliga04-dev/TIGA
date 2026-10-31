"""The marketing desk: who Tiga may help the owner contact, and the walk-in kit. See docs/specs/marketing-desk.md.

Interface:
  add_contact(store, data) / delete_contact(store, id)        the consent ledger (suppressions outlive a delete)
  can_contact(store, id, channel, now) -> {"ok", "reason"}   the one gate every outward step goes through
  whatsapp_link(store, id, text, now) -> {"ok", "url"|"reason"}   a wa.me link, only when the gate allows
  record_touch(...), give_consent(...), do_not_contact(...)
  log_visit(store, prospect_id, ...) / inbound(store, ref, ...)   after a walk-in, or a message with "Ref T42"
  warm_message(contact, owner=, demos_url=) -> str
  route(store, locality, category, radius_km, now) -> walk-in stops in walking order
  audit_sheet_html(prospect, ...) / route_sheet_html(...)     printable pages (no scripts)
  scorecard(store, today) -> four weeks of counts

Tiga never sends WhatsApp messages or dials: the owner opens the link and presses send. `now` is passed in so
the rules (shop hours in Bengaluru time, 30-day windows) are testable; `now()` is the clock the API uses.
"""
from __future__ import annotations

import html
import math
import re
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from urllib.parse import quote
from zoneinfo import ZoneInfo

import billing
import config
import places
from store import Store

SOURCES = {"warm", "walk_in", "inbound", "referral", "map", "other", "client"}
KNOWN = {"warm", "client"}   # people who know the owner: no separate permission needed
CHANNELS = {"whatsapp", "call", "email"}
OUTCOMES = {"not_met", "talked", "interested", "not_interested", "come_back"}
CONVERSATIONS = {"talked", "interested", "not_interested", "come_back"}
IST = ZoneInfo("Asia/Kolkata")
UNANSWERED_LIMIT, WINDOW_DAYS, REVISIT_DAYS = 2, 30, 60
HOURS = {"business": (10, 19), "warm": (9, 21)}
WALK_M_PER_MIN = 80
ROUTE_STATUSES = ("new", "ready", "needs_contact", "no_contact", "drafted")
MAX_STOPS = 20

# Neighbourhood centres for walk-in routes (approximate).
LOCALITIES: dict[str, tuple[float, float]] = {
    "Banashankari": (12.9255, 77.5468), "Bannerghatta Road": (12.8880, 77.5970), "Basavanagudi": (12.9420, 77.5750),
    "Bellandur": (12.9260, 77.6762), "BTM Layout": (12.9166, 77.6101), "Electronic City": (12.8452, 77.6602),
    "Frazer Town": (12.9990, 77.6150), "Hebbal": (13.0358, 77.5970), "HSR Layout": (12.9116, 77.6474),
    "Indiranagar": (12.9784, 77.6408), "Jayanagar": (12.9300, 77.5830), "JP Nagar": (12.9080, 77.5850),
    "Kalyan Nagar": (13.0280, 77.6400), "Koramangala": (12.9352, 77.6245), "Malleshwaram": (13.0035, 77.5700),
    "Marathahalli": (12.9569, 77.7011), "MG Road": (12.9756, 77.6050), "Rajajinagar": (12.9910, 77.5540),
    "RT Nagar": (13.0210, 77.5950), "Sadashivanagar": (13.0068, 77.5813), "Shivajinagar": (12.9857, 77.6057),
    "Ulsoor": (12.9817, 77.6286), "Vijayanagar": (12.9719, 77.5360), "Whitefield": (12.9698, 77.7500),
    "Yelahanka": (13.1007, 77.5963), "Yeshwanthpur": (13.0285, 77.5400),
}

# What the site check found, in a shop owner's words, and what fixing it looks like.
PROBLEMS: dict[str, tuple[str, str]] = {
    "no_website": ("There's no website on your map listing, so people nearby who search for {category} find the "
                   "shops that have one.",
                   "A one-page site with your hours, photos, prices and a WhatsApp button, linked from your Google listing."),
    "site_down": ("Your website didn't open when I checked it.",
                  "Your site back up on hosting you control, or a new fast site on your own domain."),
    "not_mobile": ("Your website isn't built for phones: visitors have to pinch and zoom to read it.",
                   "A layout made for phones first, where most of your customers will see it."),
    "no_https": ("Browsers show your website as \"Not secure\".",
                 "A free security certificate, so the warning disappears."),
    "outdated": ("The website's details look old, so customers can't tell if the hours and prices still hold.",
                 "Fresh hours, photos and prices, and changes whenever you WhatsApp me."),
    "slow": ("Your website is slow to open on mobile data.",
             "Light pages that open in a couple of seconds on a basic phone."),
}
# How a shop owner would name their kind of business, with its article ("an electronics shop").
SHOP_NOUNS = {"restaurant": "restaurant", "cafe": "café", "bakery": "bakery", "salon": "salon", "clinic": "clinic",
              "grocery": "grocery shop", "pharmacy": "pharmacy", "gym": "gym", "clothes": "clothes shop",
              "jewellery": "jewellery shop", "furniture": "furniture shop", "electronics": "electronics shop",
              "optician": "optician", "florist": "florist", "school": "school", "coaching": "coaching centre",
              "hotel": "hotel", "real_estate": "estate agent", "travel": "travel agent", "photography": "photo studio",
              "car_services": "garage", "pet": "pet shop", "lawyer": "law or accounts office"}


def shop_noun(category: str) -> str:
    noun = SHOP_NOUNS.get(category or "", "shop")
    return ("an " if noun[0] in "aeiou" else "a ") + noun


DEMOS = {"clinic": "tulasi-clinic", "salon": "mallige-salon", "restaurant": "malnad-table", "cafe": "malnad-table", "bakery": "malnad-table", "clothes": "navilu-boutique",
         "jewellery": "navilu-boutique", "florist": "navilu-boutique", "school": "little-banyan",
         "coaching": "little-banyan", "hotel": "sampige-residency", "travel": "sampige-residency"}
TRUST_TERMS = billing.TRUST_TERMS   # one wording for the audit sheet, proposal and handover sheet


class MarketingError(ValueError):
    """A request the desk refuses, with a reason the owner can act on."""


def now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(moment: datetime) -> str:
    return moment.astimezone(timezone.utc).isoformat(timespec="seconds")


def _clean(value, limit: int) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()[:limit]


# ------------------------------------------------------------------------------------------- owner
def owner_whatsapp() -> str:
    """The owner's WhatsApp number: TIGA_WHATSAPP, else the one the portfolio already publishes."""
    if config.WHATSAPP_NUMBER:
        return re.sub(r"\D", "", config.WHATSAPP_NUMBER)
    site = Path(__file__).resolve().parent.parent / "portfolio" / "site.config.js"
    match = re.search(r'whatsapp:\s*"(\d{10,15})"', site.read_text()) if site.exists() else None
    return match.group(1) if match else ""


def owner_name() -> str:
    return config.SENDER_NAME or config.BUSINESS_NAME or ""


def privacy_url() -> str:
    return (config.PORTFOLIO_URL or "https://baliga04-dev.github.io").rstrip("/") + "/privacy.html"


def demos_url() -> str:
    return (config.PORTFOLIO_URL or "https://baliga04-dev.github.io").rstrip("/") + "/demos/"


# ------------------------------------------------------------------------------------------ ledger
def normalise_phone(raw: str) -> str:
    """Digits as wa.me wants them: a 10-digit Indian number gets 91; trunk zeros go."""
    digits = re.sub(r"\D", "", raw or "").lstrip("0")
    if not digits:
        return ""
    if len(digits) == 10:
        digits = "91" + digits
    if not 11 <= len(digits) <= 15:
        raise MarketingError(f"{raw.strip()} doesn't look like a phone number. Write it with its 10 digits.")
    return digits


def _suppressed(store: Store, contact: dict) -> bool:
    return bool((contact["phone"] and store.is_suppressed(f"tel:+{contact['phone']}"))
                or (contact["email"] and store.is_suppressed(contact["email"])))


def add_contact(store: Store, data: dict) -> dict:
    name = _clean(data.get("name"), 120)
    source = str(data.get("source", "")).strip()
    if not name:
        raise MarketingError("Write the person's name.")
    if source not in SOURCES:
        raise MarketingError(f"Where they came from must be one of: {', '.join(sorted(SOURCES))}.")
    phone = normalise_phone(str(data.get("phone", "")))
    email = _clean(data.get("email"), 254).lower()
    if email and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        raise MarketingError(f"{email} doesn't look like an email address.")
    if phone and store.find_contact(phone=phone):
        raise MarketingError(f"{name}'s number is already in your contacts.")
    fields = {"name": name, "business": _clean(data.get("business"), 200), "category": _clean(data.get("category"), 60),
              "phone": phone, "email": email, "area": _clean(data.get("area"), 120), "source": source,
              "source_detail": _clean(data.get("source_detail"), 300), "owner_published": bool(data.get("owner_published")),
              "prospect_id": data.get("prospect_id"), "note": _clean(data.get("note"), 1000), "consent": {}}
    contact = store.add_contact(fields)
    if _suppressed(store, contact):
        contact = store.update_contact(contact["id"], dnc=True, dnc_reason="asked not to be contacted before")
    return contact


def delete_contact(store: Store, contact_id: int) -> None:
    store.delete_contact(contact_id)


def give_consent(store: Store, contact_id: int, channel: str, how: str, now: datetime, notice: bool = False) -> dict:
    contact = store.get_contact(contact_id)
    if channel not in CHANNELS:
        raise MarketingError(f"Permission is per channel: {', '.join(sorted(CHANNELS))}.")
    if contact["dnc"]:
        raise MarketingError(f"{contact['name']} asked not to be contacted; that stands.")
    consent = {**contact["consent"], channel: {"at": _iso(now), "how": _clean(how, 120) or "asked in person"}}
    fields = {"consent": consent}
    if notice:
        fields["notice_at"] = _iso(now)
    store.audit("user", "contact.consent", "contact", str(contact_id), f"{channel}: {how}")
    return store.update_contact(contact_id, **fields)


def do_not_contact(store: Store, contact_id: int, reason: str, now: datetime) -> dict:
    contact = store.get_contact(contact_id)
    why = _clean(reason, 200) or "asked not to be contacted"
    if contact["phone"]:
        store.suppress(f"tel:+{contact['phone']}", reason=why)
    if contact["email"]:
        store.suppress(contact["email"], reason=why)
    store.audit("user", "contact.dnc", "contact", str(contact_id), why)
    return store.update_contact(contact_id, dnc=True, dnc_reason=why, consent={})


# -------------------------------------------------------------------------------------------- gate
def _verb(channel: str) -> str:
    return {"whatsapp": "WhatsApp", "call": "call", "email": "email"}[channel]


def can_contact(store: Store, contact_id: int, channel: str, now: datetime) -> dict:
    contact = store.get_contact(contact_id)
    if channel not in CHANNELS:
        raise MarketingError(f"Unknown channel {channel!r}.")
    name = contact["name"]
    if contact["dnc"] or _suppressed(store, contact):
        return {"ok": False, "reason": f"{name} asked not to be contacted."}
    warm = contact["source"] == "warm"
    known = contact["source"] in KNOWN
    if channel in ("whatsapp", "call"):
        if not contact["phone"]:
            return {"ok": False, "reason": f"There's no number for {name}."}
        if not known and channel not in contact["consent"]:
            return {"ok": False, "reason": f"No permission to {_verb(channel)} {name} yet. Ask when you visit, or wait "
                                           "for them to message you first (the QR on the audit sheet)."}
    else:
        if not contact["email"]:
            return {"ok": False, "reason": f"There's no email address for {name}."}
        if not (known or contact["owner_published"] or "email" in contact["consent"]):
            return {"ok": False, "reason": f"{name} didn't publish that address or agree to email. Ask first."}
    start, end = HOURS["warm" if warm else "business"]
    local = now.astimezone(IST)
    if not start <= local.hour < end:
        who = "Friends and family" if warm else "Shops"
        return {"ok": False, "reason": f"It's {local:%-I:%M%p} in Bengaluru. {who} are contacted between "
                                       f"{_hour(start)} and {_hour(end)}."}
    window = store.list_touches(contact_id, since=_iso(now - timedelta(days=WINDOW_DAYS)), until=_iso(now + timedelta(seconds=1)))
    last_in = max((t["at"] for t in window if t["direction"] == "in"), default="")
    unanswered = [t for t in window if t["direction"] == "out" and t["channel"] in CHANNELS and t["at"] > last_in]
    if len(unanswered) >= UNANSWERED_LIMIT:
        until = datetime.fromisoformat(unanswered[0]["at"]) + timedelta(days=WINDOW_DAYS)
        return {"ok": False, "reason": f"{UNANSWERED_LIMIT} messages to {name} without a reply in {WINDOW_DAYS} days. "
                                       f"Wait for an answer, or until {until.astimezone(IST):%-d %b}."}
    return {"ok": True, "reason": ""}


def _hour(h: int) -> str:
    return f"{h % 12 or 12}{'am' if h < 12 else 'pm'}"


def whatsapp_link(store: Store, contact_id: int, text: str, now: datetime) -> dict:
    text = str(text or "").strip()
    if not text:
        raise MarketingError("Write the message first.")
    gate = can_contact(store, contact_id, "whatsapp", now)
    if not gate["ok"]:
        return gate
    phone = store.get_contact(contact_id)["phone"]
    return {"ok": True, "url": f"https://wa.me/{phone}?text={quote(text[:1500], safe='')}"}


def record_touch(store: Store, contact_id: int, *, channel: str, direction: str, kind: str, outcome: str = "",
                 note: str = "", now: datetime) -> dict:
    if channel not in CHANNELS | {"visit"} or direction not in ("in", "out") or kind not in ("message", "call", "email", "visit"):
        raise MarketingError("That isn't a kind of contact Tiga records.")
    if outcome and outcome not in OUTCOMES:
        raise MarketingError(f"Outcome must be one of: {', '.join(sorted(OUTCOMES))}.")
    if direction == "out" and channel in CHANNELS:
        gate = can_contact(store, contact_id, channel, now)
        if not gate["ok"]:
            raise MarketingError(gate["reason"])
    return store.add_touch(contact_id, channel=channel, direction=direction, kind=kind, outcome=outcome,
                           note=_clean(note, 1000), at=_iso(now))


# ------------------------------------------------------------------------------- visits and inbound
def _contact_for(store: Store, prospect: dict, *, name: str, phone: str, source: str, detail: str) -> dict:
    phone = normalise_phone(phone)
    existing = store.find_contact(prospect_id=prospect["id"]) or (store.find_contact(phone=phone) if phone else None)
    if existing:
        changes = {}
        if name and existing["name"].endswith("(owner)"):
            changes["name"] = _clean(name, 120)
        if phone and not existing["phone"]:
            changes["phone"] = phone
        if existing["prospect_id"] is None:
            changes["prospect_id"] = prospect["id"]
        return store.update_contact(existing["id"], **changes) if changes else existing
    return add_contact(store, {"name": name or f"{prospect['name']} (owner)", "business": prospect["name"],
                               "category": prospect.get("category", ""), "phone": phone, "area": prospect.get("address", ""),
                               "source": source, "source_detail": detail, "prospect_id": prospect["id"]})


def log_visit(store: Store, prospect_id: int, *, outcome: str, name: str, phone: str, consent: list[str],
              notice: bool, note: str, dnc: bool, now: datetime) -> dict:
    if outcome not in OUTCOMES:
        raise MarketingError(f"Outcome must be one of: {', '.join(sorted(OUTCOMES))}.")
    try:
        prospect = store.get_prospect(prospect_id)
    except KeyError as exc:
        raise MarketingError("That shop isn't in your prospects any more.") from exc
    contact = _contact_for(store, prospect, name=_clean(name, 120), phone=phone, source="walk_in", detail="visited the shop")
    record_touch(store, contact["id"], channel="visit", direction="out", kind="visit", outcome=outcome, note=note, now=now)
    if dnc:
        contact = do_not_contact(store, contact["id"], "said no at the shop", now)
    else:
        for channel in consent:
            contact = give_consent(store, contact["id"], channel, "asked in person", now, notice=notice)
        if notice and not consent:
            contact = store.update_contact(contact["id"], notice_at=_iso(now))
    store.update_prospect(prospect_id, note=f"visited {now.astimezone(IST):%-d %b}: {outcome.replace('_', ' ')}")
    return store.get_contact(contact["id"])


def inbound(store: Store, ref: str, *, name: str, phone: str, note: str, now: datetime) -> dict:
    """Someone messaged first with a reference code from an audit sheet: find the shop, record their permission."""
    match = re.search(r"T\s*(\d+)", str(ref).upper())
    if not match:
        raise MarketingError("Type the reference code from their message, like T1042.")
    try:
        prospect = store.get_prospect(int(match.group(1)))
    except KeyError as exc:
        raise MarketingError(f"No shop has the reference T{match.group(1)}.") from exc
    contact = _contact_for(store, prospect, name=_clean(name, 120), phone=phone, source="inbound",
                           detail=f"messaged with Ref T{prospect['id']}")
    store.add_touch(contact["id"], channel="whatsapp", direction="in", kind="message", note=_clean(note, 1000), at=_iso(now))
    if not contact["dnc"]:
        contact = give_consent(store, contact["id"], "whatsapp", "messaged first", now)
    return contact


# ------------------------------------------------------------------------------------- warm network
def warm_message(contact: dict, *, owner: str, demos_url: str) -> str:
    first = (contact.get("name") or "").split()[0] if contact.get("name") else "there"
    sign = (owner or "").split()[0] if owner else ""
    return (f"Hi {first}, hope you're doing well! I've started building websites for local shops in Bengaluru: menus, "
            f"bookings and orders that come straight to WhatsApp, for one flat price. A few I've made: {demos_url}\n\n"
            "If you know a shop owner who could use one, could you pass on my number? It would really help. Thank you!"
            + (f"\n{sign}" if sign else ""))


FOLLOWUP_DAYS, FOLLOWUP_HOURS, FOLLOWUPS_PER_WEEK = 7, 48, 10


def demo_for(category: str, demos: str) -> str:
    return demos + (DEMOS[category] + "/" if category in DEMOS else "")


def followup_message(contact: dict, *, owner: str, demos_url: str) -> str:
    """The one message owed after a visit where the owner agreed to WhatsApp: the demo for their kind of shop."""
    name = "" if contact["name"].endswith("(owner)") else contact["name"].split()[0]
    me = (owner or "").split()[0] if owner else "the web developer who visited"
    business = contact.get("business") or "your shop"
    kind = SHOP_NOUNS.get(contact.get("category", ""), "")
    shown = f"the {kind} website I showed you" if contact.get("category") in DEMOS else "a few websites I've made"
    return (f"{'Hi ' + name if name else 'Hi'}, this is {me}. Thanks for talking with me at {business}. Here's {shown}: "
            f"{demo_for(contact.get('category', ''), demos_url)}\n\nIf you'd like one for {business}, reply here and I'll "
            "send a one-page plan with the full price. If not, no problem: say so and I won't message again.")


def followups(store: Store, now: datetime, *, owner: str | None = None, demos: str | None = None) -> dict:
    """Owners who agreed to WhatsApp at a visit in the last week and haven't had the follow-up yet."""
    owner = owner_name() if owner is None else owner
    demos = demos_url() if demos is None else demos
    since = _iso(now - timedelta(days=FOLLOWUP_DAYS))
    by_contact: dict[int, list[dict]] = {}
    for t in store.list_touches(since=since, until=_iso(now + timedelta(seconds=1))):
        by_contact.setdefault(t["contact_id"], []).append(t)
    monday = datetime.combine(now.astimezone(IST).date() - timedelta(days=now.astimezone(IST).weekday()), time(0), IST)
    items, sent_week = [], 0
    for contact_id, touches in by_contact.items():
        visits = [t for t in touches if t["kind"] == "visit"]
        if not visits:
            continue
        sent = [t for t in touches if t["direction"] == "out" and t["channel"] in CHANNELS]
        sent_week += sum(1 for t in sent if t["at"] >= _iso(monday))
        contact = store.get_contact(contact_id)
        last_visit = visits[-1]["at"]
        if contact["dnc"] or "whatsapp" not in contact["consent"] or any(t["at"] > last_visit for t in sent):
            continue
        age = now - datetime.fromisoformat(last_visit)
        items.append({"contact": contact, "visit_at": last_visit, "overdue": age > timedelta(hours=FOLLOWUP_HOURS),
                      "text": followup_message(contact, owner=owner, demos_url=demos)})
    items.sort(key=lambda f: f["visit_at"])
    return {"items": items, "sent_this_week": sent_week, "weekly_cap": FOLLOWUPS_PER_WEEK}


# ------------------------------------------------------------------------------------------ routes
def _metres(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lon1, lat2, lon2 = map(math.radians, (*a, *b))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * 6_371_000 * math.asin(math.sqrt(h))


def why_words(prospect: dict) -> list[str]:
    """The site-check problems in plain words (a shop with no site at all gets that first)."""
    keys = list(prospect.get("problems") or [])
    if not prospect.get("website") and "no_website" not in keys:
        keys.insert(0, "no_website")
    return [PROBLEMS[k][0].format(category=shop_noun(prospect.get("category", ""))) for k in keys if k in PROBLEMS]


BENGALURU = (12.70, 77.30, 13.35, 77.95)   # south, west, north, east: a route must start inside the city


def _pool(store: Store, category: str, now: datetime) -> tuple[list[dict], int]:
    """Shops worth a visit: on a to-do list, placed on the map, not a chain, not do-not-contact, not visited lately."""
    candidates = [p for p in store.list_prospects(*ROUTE_STATUSES, limit=50_000)
                  if category in ("", "all") or p["category"] == category]
    by_prospect = {c["prospect_id"]: c for c in store.list_contacts() if c["prospect_id"] is not None}
    recent = _iso(now - timedelta(days=REVISIT_DAYS))
    visited = {t["contact_id"] for t in store.list_touches(since=recent) if t["kind"] == "visit"}
    pool, without = [], 0
    for p in candidates:
        if p.get("lat") is None or p.get("lon") is None:
            without += 1
            continue
        contact = by_prospect.get(p["id"])
        if places.looks_like_chain(p["name"]) or (contact and (contact["dnc"] or contact["id"] in visited)):
            continue
        pool.append(p)
    return pool, without


def _radius(radius_km: float) -> float:
    return min(max(float(radius_km), 0.2), 5.0) * 1000


def route(store: Store, locality: str | None, category: str, radius_km: float, now: datetime, *,
          start: tuple[float, float] | None = None) -> dict:
    """Stops in walking order from a neighbourhood centre, or from `start` (where the owner is standing)."""
    if start is not None:
        lat, lon = float(start[0]), float(start[1])
        south, west, north, east = BENGALURU
        if not (south <= lat <= north and west <= lon <= east):
            raise MarketingError("That location is outside Bengaluru. Pick a neighbourhood instead.")
        centre, label = (lat, lon), "Where you are"
    elif locality in LOCALITIES:
        centre, label = LOCALITIES[locality], locality
    else:
        raise MarketingError(f"Pick a neighbourhood from the list (not {locality!r}).")
    radius = _radius(radius_km)
    everything, without = _pool(store, category, now)
    pool = [p for p in everything if _metres(centre, (p["lat"], p["lon"])) <= radius]
    stops, here, total = [], centre, 0.0
    while pool and len(stops) < MAX_STOPS:   # nearest next shop, starting from the centre
        nxt = min(pool, key=lambda p: _metres(here, (p["lat"], p["lon"])))
        pool.remove(nxt)
        step = _metres(here, (nxt["lat"], nxt["lon"]))
        total += step
        here = (nxt["lat"], nxt["lon"])
        stops.append({"id": nxt["id"], "name": nxt["name"], "category": nxt["category"], "address": nxt["address"],
                      "website": nxt["website"], "phone": nxt["phone"], "problems": nxt["problems"],
                      "why": why_words(nxt), "ref": f"T{nxt['id']}", "walk_m": round(step), "lat": nxt["lat"], "lon": nxt["lon"]})
    return {"locality": label, "stops": stops, "without_coordinates": without, "total_m": round(total),
            "minutes": round(total / WALK_M_PER_MIN)}


def best_localities(store: Store, category: str, radius_km: float, now: datetime) -> list[dict]:
    """Neighbourhoods ranked by how many shops are left to visit within the distance: walk where they are dense."""
    pool, _ = _pool(store, category, now)
    radius = _radius(radius_km)
    counts = [{"locality": name, "shops": sum(1 for p in pool if _metres(centre, (p["lat"], p["lon"])) <= radius)}
              for name, centre in LOCALITIES.items()]
    return sorted((c for c in counts if c["shops"]), key=lambda c: (-c["shops"], c["locality"]))


# ------------------------------------------------------------------------------------------ printables
_SHEET = """<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title}</title><style>
@page{{size:A4;margin:14mm}}body{{font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:#17201c;margin:0;background:#fff}}
main{{max-width:46rem;margin:0 auto;padding:1.5rem}}h1{{font-size:1.7rem;margin:0}}h2{{font-size:1.05rem;margin:1.3rem 0 .4rem}}
.muted{{color:#4b5650}}ul{{margin:.2rem 0;padding-left:1.2rem}}li{{margin:.25rem 0}}.grid{{display:grid;grid-template-columns:1fr 1fr;gap:1.2rem}}
.box{{border:1.5px solid #17201c;border-radius:10px;padding:.9rem 1rem}}.qr svg{{width:150px;height:150px;display:block}}
.ref{{font-size:1.2rem;font-weight:700;letter-spacing:.04em}}table{{width:100%;border-collapse:collapse}}
th,td{{text-align:left;padding:.45rem .35rem;border-bottom:1px solid #b9c2bc;vertical-align:top}}td.n{{width:2rem}}td.w{{width:9rem}}
.small{{font-size:12px}}@media print{{.noprint{{display:none}}}}</style></head><body><main>{body}
<p class="noprint muted small">Print with Ctrl+P (or Save as PDF).</p></main></body></html>"""


def audit_sheet_html(prospect: dict, *, owner: str, whatsapp: str, demos_url: str, today: date, privacy_url: str = "") -> str:
    body = _audit_body(prospect, owner=owner, whatsapp=whatsapp, demos_url=demos_url, today=today, privacy_url=privacy_url)
    return _SHEET.format(title=f"{html.escape(str(prospect.get('name') or ''), quote=False)}: a look at your shop online", body=body)


def audit_sheets_html(prospects: list[dict], *, owner: str, whatsapp: str, demos_url: str, today: date,
                      privacy_url: str = "") -> str:
    """Every stop's audit sheet in one printable document, one per page."""
    if not prospects:
        raise MarketingError("No shops on this route to print.")
    bodies = [_audit_body(p, owner=owner, whatsapp=whatsapp, demos_url=demos_url, today=today, privacy_url=privacy_url)
              for p in prospects]
    return _SHEET.format(title=f"Audit sheets, {len(prospects)} shops",
                         body="<div style='break-after:page'></div>".join(bodies))


def _audit_body(prospect: dict, *, owner: str, whatsapp: str, demos_url: str, today: date, privacy_url: str = "") -> str:
    e = lambda v: html.escape(str(v or ""), quote=False)  # every shop detail comes from the map or a website
    if not whatsapp:
        raise MarketingError("Set TIGA_WHATSAPP in tiga/.env (or the number in portfolio/site.config.js) for the QR.")
    keys = list(prospect.get("problems") or [])
    if not prospect.get("website") and "no_website" not in keys:
        keys.insert(0, "no_website")
    keys = [k for k in keys if k in PROBLEMS][:3]
    category = shop_noun(prospect.get("category", ""))
    noticed = "".join(f"<li>{e(PROBLEMS[k][0].format(category=category))}</li>" for k in keys) or \
        "<li>Your listing could carry your hours, prices and photos, and take orders on WhatsApp.</li>"
    fixes = "".join(f"<li>{e(PROBLEMS[k][1])}</li>" for k in keys) or \
        "<li>A small, fast website on your own domain, with a WhatsApp button.</li>"
    ref = f"T{prospect['id']}"
    me = owner or "me"
    demo = demos_url + (DEMOS[prospect.get("category", "")] + "/" if prospect.get("category") in DEMOS else "")
    chat = f"https://wa.me/{whatsapp}?text=" + quote(f"Hi, this is {prospect.get('name', '')}. Ref {ref}", safe="")
    terms = "".join(f"<li>{e(t)}</li>" for t in TRUST_TERMS)
    body = (f"<h1>{e(prospect.get('name'))}</h1><p class='muted'>{e(prospect.get('address'))}</p>"
            f"<p class='muted small'>A free look at your shop online, {today:%-d %B %Y}, by {e(me)}, web developer, Bengaluru.</p>"
            f"<h2>What I noticed</h2><ul>{noticed}</ul><h2>What would fix it</h2><ul>{fixes}</ul>"
            f"<div class='grid'><div class='box'><h2 style='margin-top:0'>See one working</h2>"
            f"<p class='small'>{'A website I built for ' + e(category) + ' like yours' if prospect.get('category') in DEMOS else 'Websites I built for Bengaluru shops'}:<br>{e(demo)}</p>"
            f"<div class='qr'>{billing.qr_svg(demo)}</div></div>"
            f"<div class='box'><h2 style='margin-top:0'>Talk to me on WhatsApp</h2>"
            f"<p class='small'>Scan to message me. Your message carries this code:</p><p class='ref'>Ref {ref}</p>"
            f"<div class='qr'>{billing.qr_svg(chat)}</div></div></div>"
            f"<h2>How I work</h2><ul>{terms}</ul>"
            f"<p class='muted small'>If you message me, I keep your name and number only to talk about your website. "
            f"Say \"delete my number\" any time and I will delete it."
            + (f" More: {e(privacy_url)}" if privacy_url else "") + "</p>")
    return body


def route_sheet_html(locality: str, stops: list[dict], *, today: date) -> str:
    e = lambda v: html.escape(str(v or ""), quote=False)
    rows = "".join(
        f"<tr><td class='n'>{i}</td><td><b>{e(s['name'])}</b><br><span class='muted small'>{e(s['category'])}. "
        f"{e(s['address'])}</span><br><span class='small'>{e(' '.join(s['why'][:2]))}</span></td>"
        f"<td class='w small'>Ref {e(s['ref'])}<br>{e(s['walk_m'])} m walk</td><td class='w small'>Met / not met<br>Said:<br><br>Number given? Y / N</td></tr>"
        for i, s in enumerate(stops, 1))
    total = sum(s["walk_m"] for s in stops)
    body = (f"<h1>Walk-in route: {e(locality)}</h1><p class='muted'>{today:%A %-d %B %Y}. {len(stops)} shops, about "
            f"{round(total / WALK_M_PER_MIN)} minutes of walking. Visit at a quiet hour; ask before you leave a sheet.</p>"
            f"<table><tr><th></th><th>Shop</th><th>Ref, walk</th><th>Notes</th></tr>{rows}</table>"
            "<p class='muted small'>Log each visit in Tiga afterwards: what they said, and whether they agreed to a "
            "WhatsApp. A \"no\" is final.</p>")
    return _SHEET.format(title=f"Walk-in route, {e(locality)}", body=body)


# ------------------------------------------------------------------------------------ proof engine
PROOF_ITEMS = {"name": "Their business name", "logo": "Their logo", "screenshots": "Screenshots of the site",
               "quote": "A quote from them", "numbers": "Results with numbers"}
REFERRAL_AFTER_DAYS = 14
_PHONE_IN_TEXT = re.compile(r"(?:\+?91[\s-]?)?(?:0?[6-9]\d{4}[\s-]?\d{5}|0?80[\s-]?\d{4}[\s-]?\d{4})")


def client_contact(store: Store, deal: dict) -> dict | None:
    """The deal's client as a contact (source `client`), so asks go through the same gate. None without a usable number."""
    try:
        phone = normalise_phone(deal.get("phone", ""))
    except MarketingError:
        return None
    if not phone:
        return None
    found = store.find_contact(phone=phone)
    if found:
        return found
    return add_contact(store, {"name": deal.get("contact") or deal.get("company") or "Client", "business": deal.get("company", ""),
                               "phone": phone, "email": deal.get("email", ""), "source": "client",
                               "source_detail": f"client, deal #{deal['id']}"})


def save_proof(store: Store, deal_id: int, *, permissions: dict, facts: dict) -> dict:
    store.get_deal(deal_id)   # KeyError for an unknown deal
    perms = {k: bool(permissions.get(k)) for k in PROOF_ITEMS}
    clean = {k: _clean(facts.get(k), 2000) for k in ("problem", "built", "results", "quote")}
    return store.save_proof(deal_id, permissions=perms, facts=clean)


def _no_phones(text: str) -> str:
    return re.sub(r"\s{2,}", " ", _PHONE_IN_TEXT.sub("", text)).strip()


def _cut(text: str, limit: int) -> str:
    text = _no_phones(text)
    if len(text) <= limit:
        return text
    return text[: limit - 1].rsplit(" ", 1)[0].rstrip(",.;:") + "…"


def proof_drafts(store: Store, deal_id: int, *, owner: str) -> dict:
    """Case study, LinkedIn post, Google Business Profile update and three Status frames, from allowed items only."""
    deal, proof = store.get_deal(deal_id), store.get_proof(deal_id)
    perms, facts = proof["permissions"], proof["facts"]
    results = facts.get("results", "") if perms.get("numbers") and re.search(r"\d", facts.get("results", "")) else ""
    quote = facts.get("quote", "") if perms.get("quote") else ""
    if not (results or quote):
        return {"ok": False, "reason": "Drafts need a real number or a quote the client agreed to show. Add one, and "
                                       "tick what they said yes to."}
    who = deal["company"] if perms.get("name") and deal["company"] else "a Bengaluru shop"
    by = (deal["contact"] or "the owner") if perms.get("name") else "the owner"
    service = deal["service"] or "a website"
    problem, built = facts.get("problem", ""), facts.get("built", "")
    short_quote = _cut(quote, 280)
    case = "\n\n".join(part for part in [
        f"{who[0].upper() + who[1:]}: {service.lower()}",
        f"The problem\n{problem}" if problem else "", f"What I built\n{built}" if built else "",
        f"What changed\n{results}" if results else "", f"\"{short_quote}\"\n- {by}" if short_quote else ""] if part)
    linkedin = " ".join(part for part in [
        f"I built {service.lower()} for {who}.", f"Before: {problem}." if problem else "", f"Now: {results}." if results else "",
        f"\n\n\"{short_quote}\" ({by})" if short_quote else ""] if part).strip()
    gbp = _cut(" ".join(p for p in [f"New work: {service.lower()} for {who}.", problem, built, results,
                                     f"\"{short_quote}\"" if short_quote else ""] if p), 1500)
    status = [_cut(f"Before: {problem or 'no website'}", 140), _cut(f"Built: {built or service}", 140),
              _cut(f"After: {results}" if results else f"\"{short_quote}\"", 140)]
    return {"ok": True, "case_study": _no_phones(case), "linkedin": _cut(linkedin, 1300), "gbp": gbp, "status": status,
            "allowed": [PROOF_ITEMS[k] for k, v in perms.items() if v]}


def _ask_key(deal_id: int, kind: str) -> str:
    return f"marketing.ask.{deal_id}.{kind}"


def asks_owed(store: Store, now: datetime, *, review_link: str | None = None, owner: str | None = None) -> list[dict]:
    """A Google review request when a deal is paid (every client, no incentive), a check-in and referral 14 days later."""
    link = config.REVIEW_LINK if review_link is None else review_link
    me = (owner_name() if owner is None else owner).split()[0] if (owner_name() if owner is None else owner) else ""
    out = []
    for deal in store.list_deals("paid"):
        if not deal["paid_at"]:
            continue
        paid = datetime.fromisoformat(deal["paid_at"])
        first = (deal["contact"] or "").split()[0] if deal["contact"] else ""
        hello = f"Hi {first}" if first else "Hi"
        site = f"{deal['company']}'s website" if deal["company"] else "your website"
        due = {"review": paid, "referral": paid + timedelta(days=REFERRAL_AFTER_DAYS)}
        texts = {
            "review": (f"{hello}, thank you again for choosing me for {site}. If you have a minute, a Google review would "
                       f"help other shop owners find me{': ' + link if link else ''}. Honest is best, whatever you think."
                       + (f"\n{me}" if me else "")),
            "referral": (f"{hello}, it's been two weeks since {site} went live. How is it working for you? Anything you'd "
                         "like changed? And if you know another shop owner who could use one, I'd be grateful for an "
                         "introduction." + (f"\n{me}" if me else "")),
        }
        for kind in ("review", "referral"):
            if now < due[kind] or store.get_value(_ask_key(deal["id"], kind), ""):
                continue
            out.append({"deal_id": deal["id"], "company": deal["company"] or deal["contact"] or deal["email"], "kind": kind,
                        "due": _iso(due[kind]), "text": texts[kind], "contact": client_contact(store, deal)})
    return out


def ask_done(store: Store, deal_id: int, kind: str, now: datetime) -> None:
    if kind not in ("review", "referral"):
        raise MarketingError("Asks are 'review' or 'referral'.")
    store.get_deal(deal_id)
    store.set_value(_ask_key(deal_id, kind), _iso(now))
    store.audit("user", "ask.done", "deal", str(deal_id), kind)


# ------------------------------------------------------------------------------ restaurant commission
def commission_maths(*, orders: int, average: int, commission: float, direct_share: float, site_price: int) -> dict:
    """What delivery-app commission costs a restaurant a month, and what moving some regulars to direct pickup saves."""
    if not (0 < orders <= 100_000 and 0 < average <= 20_000 and 0 <= commission <= 60 and 0 <= direct_share <= 100
            and 0 <= site_price <= 1_000_000):
        raise MarketingError("Check the numbers: orders and order value above 0, commission 0 to 60%, share 0 to 100%.")
    sales = orders * average
    saved = orders * direct_share / 100 * average * commission / 100
    return {"orders": orders, "average": average, "commission_pct": commission, "direct_share_pct": direct_share,
            "site_price": site_price, "app_sales": round(sales), "commission": round(sales * commission / 100),
            "saved_monthly": round(saved), "saved_yearly": round(saved * 12),
            "payback_months": math.ceil(site_price / saved) if saved > 0 else None}


def commission_sheet_html(shop: str, m: dict, *, today: date) -> str:
    e = lambda v: html.escape(str(v or ""), quote=False)
    r = lambda n: f"₹{n:,}"
    payback = (f"A {r(m['site_price'])} website pays for itself in about {m['payback_months']} "
               f"month{'s' if m['payback_months'] != 1 else ''}." if m["payback_months"] else "")
    body = (f"<h1>{e(shop) or 'Your restaurant'}: the commission maths</h1>"
            f"<p class='muted'>{today:%-d %B %Y}. Your own numbers; change any of them and the maths changes.</p>"
            "<table>"
            f"<tr><th>Orders a month on delivery apps</th><td>{m['orders']:,}</td></tr>"
            f"<tr><th>Average order</th><td>{r(m['average'])}</td></tr>"
            f"<tr><th>Sales through the apps</th><td>{r(m['app_sales'])} a month</td></tr>"
            f"<tr><th>Commission at {m['commission_pct']:g}%</th><td><b>{r(m['commission'])} a month</b></td></tr>"
            f"<tr><th>If {m['direct_share_pct']:g}% of those orders came to you directly</th>"
            f"<td><b>{r(m['saved_monthly'])} a month</b> stays with you, {r(m['saved_yearly'])} a year</td></tr></table>"
            f"<p>{e(payback)}</p>"
            "<div class='box'>Keep the apps: they bring new customers. This is about your regulars, who already know "
            "you, ordering pickup straight from your own page and paying you by UPI.</div>")
    return _SHEET.format(title=f"Commission maths: {e(shop) or 'your restaurant'}", body=body)


# ------------------------------------------------------------------------------------ owner interviews
INTERVIEW_GUIDE = [
    ("find_you", "How do new customers find you today?"),
    ("paid_before", "What have you paid for listings, ads or apps in the last year, and did it work?"),
    ("burned", "Has a vendor ever let you down? What happened?"),
    ("must_do", "If you had a website, what's the one thing it must do for you?"),
]
OFFERS = {
    "basic_site": "A basic website: one page with your hours, photos, prices and a WhatsApp button",
    "ordering": "A WhatsApp ordering page: your menu or catalogue, with orders arriving on WhatsApp",
    "care": "Monthly care: changes, backups and keeping the site running (per month)",
    "photos": "Photo editing for products or the menu (per photo)",
}
LADDER = ("too_cheap", "bargain", "expensive", "too_expensive")
INTERVIEW_GOAL = 15


def add_interview(store: Store, data: dict, now: datetime) -> dict:
    answers = {k: _clean((data.get("answers") or {}).get(k), 1000) for k, _ in INTERVIEW_GUIDE}
    prices: dict[str, dict] = {}
    for offer, ladder in (data.get("prices") or {}).items():
        if offer not in OFFERS:
            raise MarketingError(f"Unknown offer {offer!r}.")
        points = {k: int(ladder[k]) for k in LADDER if isinstance(ladder, dict) and ladder.get(k) not in (None, "")}
        if any(v < 0 or v > 10_000_000 for v in points.values()):
            raise MarketingError("Prices are whole rupees, 0 or more.")
        given = [points[k] for k in LADDER if k in points]
        if given != sorted(given):
            raise MarketingError("Prices should rise from 'too cheap' to 'too expensive'. Check the order.")
        if points:
            prices[offer] = points
    if not any(answers.values()) and not prices:
        raise MarketingError("Write at least one answer or one price.")
    return store.add_owner_interview(business=_clean(data.get("business"), 200), category=_clean(data.get("category"), 60),
                                     answers=answers, prices=prices, at=_iso(now), contact_id=data.get("contact_id"))


def _median(values: list[int]) -> int | None:
    if not values:
        return None
    ordered = sorted(values)
    mid = len(ordered) // 2
    return ordered[mid] if len(ordered) % 2 else round((ordered[mid - 1] + ordered[mid]) / 2)


def interview_summary(interviews: list[dict]) -> dict:
    """Per offer, the range from the median 'bargain' to the median 'getting expensive': where a price feels fair."""
    by_category: dict[str, int] = {}
    for i in interviews:
        by_category[i["category"] or "other"] = by_category.get(i["category"] or "other", 0) + 1
    offers = {}
    for offer in OFFERS:
        answered = [i["prices"][offer] for i in interviews if offer in i["prices"]]
        medians = {k: _median([p[k] for p in answered if k in p]) for k in LADDER}
        fair = [medians["bargain"], medians["expensive"]] if medians["bargain"] is not None and medians["expensive"] is not None else None
        offers[offer] = {"answers": len(answered), **medians, "range": fair}
    return {"count": len(interviews), "goal": INTERVIEW_GOAL, "by_category": by_category, "offers": offers}


# ---------------------------------------------------------------------------------------- scorecard
def scorecard(store: Store, today: date) -> dict:
    monday = today - timedelta(days=today.weekday())
    contacts = store.list_contacts()
    paid = store.list_deals("paid")
    weeks = []
    for back in range(4):
        start_day = monday - timedelta(weeks=back)
        start = _iso(datetime.combine(start_day, time(0), IST))
        end = _iso(datetime.combine(start_day + timedelta(days=7), time(0), IST))
        touches = store.list_touches(since=start, until=end)
        visits = [t for t in touches if t["kind"] == "visit"]
        weeks.append({
            "start": start_day.isoformat(),
            "warm_sent": sum(1 for t in touches if t["direction"] == "out" and t["channel"] in CHANNELS and t["source"] == "warm"),
            "visits": len(visits),
            "conversations": sum(1 for t in visits if t["outcome"] in CONVERSATIONS),
            "interested": sum(1 for t in visits if t["outcome"] == "interested"),
            "messages_in": sum(1 for t in touches if t["direction"] == "in" and t["source"] != "warm"),
            "consents": sum(1 for c in contacts for v in c["consent"].values() if start <= v["at"] < end),
            "proposals": store.count_documents("proposal", start, end),
            "won": sum(1 for a in store.audit_between("deal.move", start, end) if a["detail"].endswith("-> won")),
            "revenue": sum(d["amount"] for d in paid if start <= (d["paid_at"] or "") < end),
        })
    return {"weeks": weeks, "enough_data": sum(w["conversations"] for w in weeks) >= 5}


# ------------------------------------------------------------------------------- weekly "what worked"
CHANNEL_LABELS = {"warm": "People you know", "walk_in": "Walk-ins", "inbound": "Shops that messaged first",
                  "referral": "Referrals", "cold_email": "Cold email"}
RETIRE_AFTER = 4
PURGE_AFTER_DAYS = 180


def _channels(store: Store, since: str, until: str) -> dict[str, dict]:
    touches = store.list_touches(since=since, until=until)
    out_msgs = [t for t in touches if t["direction"] == "out" and t["channel"] in CHANNELS]
    visits = [t for t in touches if t["kind"] == "visit"]
    consents = sum(1 for c in store.list_contacts() if c["source"] == "walk_in"
                   for v in c["consent"].values() if since <= v["at"] < until)
    referrals = sum(1 for c in store.list_contacts("referral") if since <= c["created_at"] < until)
    sent = [o for o in store.list_outreach() if since <= (o.get("sent_at") or "") < until]
    interested = [o for o in store.list_outreach() if o["status"] == "interested" and since <= (o.get("replied_at") or "") < until]
    asked = sum(1 for a in store.audit_between("ask.done", since, until) if a["detail"] == "referral")
    return {
        "warm": {"attempts": sum(1 for t in out_msgs if t["source"] == "warm"),
                 "results": sum(1 for t in touches if t["direction"] == "in" and t["source"] == "warm") + referrals},
        "walk_in": {"attempts": len(visits), "results": sum(1 for t in visits if t["outcome"] == "interested") + consents},
        "inbound": {"attempts": None, "results": sum(1 for t in touches if t["direction"] == "in" and t["source"] == "inbound")},
        "referral": {"attempts": asked, "results": referrals},
        "cold_email": {"attempts": len(sent), "results": len(interested)},
    }


def weekly_report(store: Store, today: date, *, purged: int = 0) -> dict:
    """Last week against four weeks, by channel; what to retire; three to five next steps; exactly one experiment."""
    end = datetime.combine(today + timedelta(days=1), time(0), IST)
    week, month = _channels(store, _iso(end - timedelta(days=7)), _iso(end)), _channels(store, _iso(end - timedelta(days=28)), _iso(end))
    channels = []
    for cid, label in CHANNEL_LABELS.items():
        m, w = month[cid], week[cid]
        retire = m["attempts"] is not None and m["attempts"] >= RETIRE_AFTER and m["results"] == 0
        channels.append({"id": cid, "label": label, "attempts": m["attempts"], "results": m["results"],
                         "week_attempts": w["attempts"], "week_results": w["results"], "retire": retire})
    card = scorecard(store, today)
    conversations = sum(w["conversations"] for w in card["weeks"])
    interested = sum(w["interested"] for w in card["weeks"])
    visits = month["walk_in"]["attempts"]
    warm_ever = sum(1 for t in store.list_touches() if t["source"] == "warm" and t["direction"] == "out")
    interviews = len(store.list_owner_interviews())
    if visits < 10:
        experiment = "Do 10 walk-ins on one street this week, at a quiet hour, with printed audit sheets."
    elif warm_ever < 30:
        experiment = "Message 10 more people you know, one at a time, with the demo link."
    elif conversations >= 5 and interested == 0:
        experiment = ("Change the opener: start with the one problem on their audit sheet (for restaurants, the "
                      "commission maths) before showing any demo.")
    elif interviews < INTERVIEW_GOAL:
        experiment = "Ask 3 owners the price-ladder questions this week, then set prices from the fair range."
    else:
        experiment = "Try one new kind of shop for a week: plan every walk for that kind only, and compare."
    now = end - timedelta(hours=12)
    steps = []
    owed = len(followups(store, now)["items"])
    asks = len(asks_owed(store, now))
    waiting = len(store.list_deals("proposal_sent"))
    unmessaged = sum(1 for c in store.list_contacts("warm") if not c["dnc"]
                     and not any(t["direction"] == "out" for t in store.list_touches(c["id"])))
    if owed:
        steps.append(f"Send the {owed} follow-up{'s' if owed != 1 else ''} owed after visits.")
    if asks:
        steps.append(f"Send the {asks} review or referral ask{'s' if asks != 1 else ''} owed to clients.")
    if waiting:
        steps.append(f"Chase {waiting} proposal{'s' if waiting != 1 else ''} waiting for an answer.")
    if unmessaged:
        steps.append(f"Message the {unmessaged} people you know who haven't heard from you yet.")
    if interviews < INTERVIEW_GOAL:
        steps.append(f"Interviews: {interviews} of {INTERVIEW_GOAL}. Ask one owner the price ladder this week.")
    for filler in ("Plan next week's walk on the Marketing page and print the sheets.",
                   "Log every visit the same day, including the ones where nobody was in."):
        if len(steps) < 3:
            steps.append(filler)
    steps = steps[:5]
    retired = [c["label"] for c in channels if c["retire"]]
    enough = conversations >= 5

    def count(n):
        return "n/a" if n is None else str(n)

    lines = [f"Tiga marketing: what worked, week to {today:%-d %b %Y}", ""]
    if not enough:
        lines += ["Not enough data yet: fewer than 5 conversations with owners in four weeks. Read these as counts, "
                  "not rates.", ""]
    lines.append("CHANNELS: tries and results, last 7 days / last 4 weeks")
    for c in channels:
        lines.append(f"- {c['label']}: tries {count(c['week_attempts'])} / {count(c['attempts'])}, results "
                     f"{c['week_results']} / {c['results']}" + ("  -> retire for now: 4 or more tries, nothing back" if c["retire"] else ""))
    lines += ["", "THIS WEEK'S ONE EXPERIMENT", experiment, "", "NEXT STEPS", *[f"- {s}" for s in steps]]
    if retired:
        lines += ["", f"Retire for now: {', '.join(retired)}. Put that time into the experiment."]
    if purged:
        lines += ["", f"Privacy: deleted {purged} contact{'s' if purged != 1 else ''} who never agreed to anything and "
                      f"haven't been in touch for {PURGE_AFTER_DAYS} days. Every 'no' stays on the do-not-contact list."]
    return {"channels": channels, "experiment": experiment, "next_steps": steps, "retire": retired,
            "enough_data": enough, "body": "\n".join(lines)}


def purge_unengaged(store: Store, now: datetime) -> int:
    """Delete map and walk-in contacts who never agreed to anything and haven't been touched in 180 days."""
    cutoff = _iso(now - timedelta(days=PURGE_AFTER_DAYS))
    gone = 0
    for c in store.list_contacts():
        if c["source"] not in ("map", "walk_in") or c["dnc"] or c["consent"]:
            continue
        touches = store.list_touches(c["id"])
        last = max((t["at"] for t in touches), default=c["created_at"])
        if last < cutoff and not any(t["direction"] == "in" for t in touches):
            store.delete_contact(c["id"])
            gone += 1
    if gone:
        store.audit("system", "contacts.purge", "contacts", str(gone), f"unengaged for {PURGE_AFTER_DAYS} days")
    return gone


def run_weekly(store: Store, *, send, to: str, today: date) -> dict:
    """Once per ISO week with the daily run: purge, then the report. Saved in Tiga; mailed only when Gmail works."""
    year, week, _ = today.isocalendar()
    key = f"{year}-W{week:02d}"
    if not store.claim_job("marketing_weekly", key):
        return {"ok": True, "skipped": f"already ran for {key}"}
    purged = purge_unengaged(store, datetime.combine(today, time(12), IST))
    report = weekly_report(store, today, purged=purged)
    subject = f"Tiga marketing: what worked, {key}"
    report_id = store.save_report("marketing", key, subject, report["body"], to)
    if to:
        try:
            result = send(to, subject, report["body"])
        except Exception as exc:
            result = {"ok": False, "error": f"{type(exc).__name__}: {exc}"}
        if result.get("ok"):
            store.mark_report_sent(report_id)
        else:
            store.mark_report_unsent(report_id, result.get("error", "send failed"))
    else:
        store.mark_report_unsent(report_id, "Gmail is not configured; the report is saved in Tiga")
    return {"ok": True, "report_id": report_id, "purged": purged, "experiment": report["experiment"]}

