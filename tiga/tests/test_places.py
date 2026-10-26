import httpx
import pytest

import places


def element(id, kind="node", **tags):
    base = {"type": kind, "id": id, "tags": tags}
    if kind == "node":
        base.update(lat=12.97, lon=77.59)
    else:
        base["center"] = {"lat": 12.98, "lon": 77.6}
    return base


async def test_fetches_one_category_in_bengaluru_and_normalises_contacts(http):
    http.add("overpass", json={"elements": [
        element(1, name="Sri Bakery", shop="bakery", phone="+91 80 1111", **{"addr:suburb": "Indiranagar"}),
        element(2, kind="way", name="Glow Salon", shop="beauty", **{"contact:website": "glowsalon.in",
                "contact:email": "Hello@GlowSalon.in", "addr:street": "100 Feet Rd"}),
        element(3, shop="bakery"),  # no name: not a business we can write to
    ]})
    found = await places.fetch_businesses("bakery")
    assert [b.name for b in found] == ["Sri Bakery", "Glow Salon"]
    salon = found[1]
    assert salon.key == "osm:way/2" and salon.website == "https://glowsalon.in" and salon.email == "hello@glowsalon.in"
    assert found[0].phone == "+91 80 1111" and "Indiranagar" in found[0].address
    query = http.requests[0].content.decode()
    assert "12.83" in query and "77.78" in query  # Bengaluru bounding box


async def test_brands_and_chains_are_marked(http):
    http.add("overpass", json={"elements": [element(1, name="Big Chain", shop="supermarket", brand="BigChain")]})
    assert (await places.fetch_businesses("grocery"))[0].is_chain


def test_categories_cover_shops_food_health_services():
    names = places.CATEGORIES
    assert {"bakery", "restaurant", "salon", "clinic", "gym"} <= set(names)


async def test_unknown_category_is_rejected():
    with pytest.raises(ValueError):
        await places.fetch_businesses("nuclear-plant")


async def test_server_errors_raise_a_clear_error(http):
    http.add("overpass", status=429, json={})
    with pytest.raises(places.PlacesError):
        await places.fetch_businesses("bakery")


async def test_each_business_carries_its_map_position(http):
    http.add("overpass", json={"elements": [element(1, name="Sri Bakery", shop="bakery"),
                                            element(2, kind="way", name="Glow Salon", shop="beauty")]})
    node, way = await places.fetch_businesses("bakery")
    assert (node.lat, node.lon) == (12.97, 77.59) and (way.lat, way.lon) == (12.98, 77.6)
