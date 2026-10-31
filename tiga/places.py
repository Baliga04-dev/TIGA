"""Local businesses in Bengaluru from OpenStreetMap (free, ODbL: credit "(c) OpenStreetMap contributors").

Interface: `await fetch_businesses(category) -> list[Business]`, one category per call (Overpass API
usage policy: few, modest queries). Raises PlacesError when the map server refuses or fails.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

import httpx

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
BENGALURU_BBOX = (12.83, 77.46, 13.14, 77.78)  # south, west, north, east
USER_AGENT = {"user-agent": "Tiga/1.0 (personal freelance lead research)"}

# category name -> Overpass tag filter(s)
CATEGORIES: dict[str, list[str]] = {
    "bakery": ['"shop"="bakery"'],
    "restaurant": ['"amenity"="restaurant"'],
    "cafe": ['"amenity"="cafe"'],
    "salon": ['"shop"="hairdresser"', '"shop"="beauty"'],
    "clinic": ['"amenity"="clinic"', '"amenity"="dentist"', '"amenity"="doctors"'],
    "grocery": ['"shop"="supermarket"', '"shop"="convenience"', '"shop"="greengrocer"'],
    "pharmacy": ['"amenity"="pharmacy"'],
    "gym": ['"leisure"="fitness_centre"'],
    "clothes": ['"shop"="clothes"', '"shop"="boutique"', '"shop"="tailor"'],
    "jewellery": ['"shop"="jewelry"'],
    "furniture": ['"shop"="furniture"', '"shop"="interior_decoration"'],
    "electronics": ['"shop"="electronics"', '"shop"="mobile_phone"', '"shop"="computer"'],
    "optician": ['"shop"="optician"'],
    "florist": ['"shop"="florist"', '"shop"="gift"'],
    "school": ['"amenity"="school"', '"amenity"="college"', '"office"="educational_institution"'],
    "coaching": ['"amenity"="training"', '"office"="tutoring"'],
    "hotel": ['"tourism"="hotel"', '"tourism"="guest_house"'],
    "real_estate": ['"office"="estate_agent"'],
    "travel": ['"shop"="travel_agency"'],
    "photography": ['"shop"="photo"', '"craft"="photographer"'],
    "car_services": ['"shop"="car_repair"', '"shop"="car"'],
    "pet": ['"shop"="pet"', '"amenity"="veterinary"'],
    "lawyer": ['"office"="lawyer"', '"office"="accountant"'],
}


# Chains and franchises: they have head offices and websites, so they are never a freelancer's client. Matched as
# whole words anywhere in the name; WHOLE_NAME_ONLY entries are ordinary words, so they match only the entire name.
CHAINS = [
    "vodafone", "airtel", "jio", "bsnl", "nandini", "heritage fresh", "reliance", "more supermarket", "more megastore",
    "dmart", "d mart", "big bazaar", "star bazaar", "ratnadeep", "nilgiris", "namdhari", "namdharis", "foodworld",
    "food world", "twenty four seven", "24seven", "easyday", "apollo", "medplus", "wellness forever", "frank ross",
    "trust chemists", "domino", "dominos", "pizza hut", "kfc", "mcdonald", "mcdonalds", "burger king", "subway",
    "starbucks", "cafe coffee day", "ccd", "chai point", "chaayos", "third wave coffee", "blue tokai", "a2b",
    "adyar ananda bhavan", "haldiram", "haldirams", "baskin robbins", "keventers", "theobroma", "truffles",
    "meghana foods", "empire restaurant", "max fashion", "pantaloons", "westside", "zudio", "lifestyle",
    "shoppers stop", "biba", "fabindia", "allen solly", "peter england", "raymond", "levi", "levis", "puma", "adidas",
    "nike", "bata", "metro shoes", "decathlon", "manyavar", "mufti", "us polo", "louis philippe", "van heusen",
    "jockey", "tanishq", "kalyan jewellers", "malabar gold", "joyalukkas", "caratlane", "bluestone", "bhima",
    "croma", "poorvika", "sangeetha mobiles", "vijay sales", "samsung", "mi store", "oneplus", "sony center",
    "naturals", "green trends", "lakme salon", "toni and guy", "ylg", "jawed habib", "bodycraft", "enrich salon",
    "cult fit", "cultfit", "golds gym", "gold s gym", "anytime fitness", "snap fitness", "talwalkars", "lenskart",
    "titan eye", "specsmakers", "oyo", "fabhotel", "treebo", "taj", "itc", "marriott", "hilton", "radisson", "ibis",
    "lemon tree", "ginger hotel", "holiday inn", "hyatt", "novotel", "sheraton", "zostel", "maruti", "hyundai",
    "tata motors", "mahindra", "toyota", "kia", "mytvs", "gomechanic", "bosch car service", "heads up for tails",
    "thomas cook", "makemytrip", "eurokids", "kidzee", "manipal", "fortis", "narayana", "cloudnine", "motherhood",
]
WHOLE_NAME_ONLY = {"trends", "max", "more", "spar", "cult", "titan"}


def _words(name: str) -> str:
    plain = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()   # Café -> cafe
    return " " + re.sub(r"[^a-z0-9]+", " ", plain.replace("'", "").replace("’", "")).strip() + " "


def looks_like_chain(name: str) -> bool:
    words = _words(name)
    return words.strip() in WHOLE_NAME_ONLY or any(f" {c} " in words for c in CHAINS)


class PlacesError(RuntimeError):
    pass


@dataclass(frozen=True)
class Business:
    key: str
    name: str
    category: str
    website: str
    email: str
    phone: str
    address: str
    is_chain: bool
    lat: float | None = None   # where it is on the map (a way's centre), for walk-in routes
    lon: float | None = None


def _query(category: str) -> str:
    south, west, north, east = BENGALURU_BBOX
    box = f"({south},{west},{north},{east})"
    parts = "".join(f"nwr[{f}]{box};" for f in CATEGORIES[category])
    return f"[out:json][timeout:90];({parts});out tags center;"


def _website(tags: dict) -> str:
    url = (tags.get("website") or tags.get("contact:website") or tags.get("url") or "").strip().split(";")[0]
    if url and not url.startswith(("http://", "https://")):
        url = "https://" + url
    return url


def _first(tags: dict, *names: str) -> str:
    for name in names:
        if tags.get(name):
            return tags[name].split(";")[0].strip()
    return ""


async def fetch_businesses(category: str) -> list[Business]:
    if category not in CATEGORIES:
        raise ValueError(f"unknown category {category!r}")
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.post(OVERPASS_URL, data={"data": _query(category)}, headers=USER_AGENT)
            response.raise_for_status()
            elements = response.json().get("elements", [])
    except (httpx.HTTPError, ValueError) as exc:
        raise PlacesError(f"OpenStreetMap query failed: {type(exc).__name__}") from exc

    found = []
    for el in elements:
        tags = el.get("tags", {})
        name = (tags.get("name") or tags.get("name:en") or "").strip()
        if not name:
            continue
        address = ", ".join(p for p in (tags.get("addr:housenumber"), tags.get("addr:street"),
                                          tags.get("addr:suburb"), tags.get("addr:city")) if p)
        found.append(Business(
            key=f"osm:{el['type']}/{el['id']}", name=name, category=category, website=_website(tags),
            email=_first(tags, "email", "contact:email").lower(),
            phone=_first(tags, "phone", "contact:phone", "contact:mobile", "mobile"),
            address=address, is_chain=bool(tags.get("brand") or tags.get("brand:wikidata")) or looks_like_chain(name),
            lat=el.get("lat", el.get("center", {}).get("lat")), lon=el.get("lon", el.get("center", {}).get("lon")),
        ))
    return found
