import pytest

from store import Store


@pytest.fixture
def store():
    s = Store(":memory:")
    yield s
    s.close()


def biz(**kw):
    return {"key": "osm:node/1", "source": "osm", "name": "Sri Bakery", "category": "bakery",
            "website": "", "email": "", "phone": "+91 80 1234", "address": "Indiranagar", **kw}


def test_upsert_creates_once_and_refreshes_details_without_losing_progress(store):
    first, created = store.upsert_prospect(biz())
    assert created and first["status"] == "new"
    store.update_prospect(first["id"], status="ready", email="hi@sri.in", problems=["no_website"])
    again, created = store.upsert_prospect(biz(phone="+91 80 9999"))
    assert not created and again["id"] == first["id"]
    assert again["phone"] == "+91 80 9999" and again["status"] == "ready" and again["email"] == "hi@sri.in"


def test_lists_are_json_round_tripped_and_filterable(store):
    p, _ = store.upsert_prospect(biz(signals=["funding"]))
    store.update_prospect(p["id"], problems=["no_https", "slow"], status="checked")
    got = store.list_prospects("checked")
    assert got[0]["problems"] == ["no_https", "slow"] and got[0]["signals"] == ["funding"]
    assert store.list_prospects("new") == []


def test_unknown_fields_are_rejected(store):
    p, _ = store.upsert_prospect(biz())
    with pytest.raises(ValueError):
        store.update_prospect(p["id"], evil="x")


def test_counts_by_status(store):
    for i in range(3):
        store.upsert_prospect(biz(key=f"osm:node/{i}"))
    store.update_prospect(1, status="skipped")
    assert store.prospect_counts() == {"new": 2, "skipped": 1}


def test_kv_holds_small_cursors(store):
    assert store.get_value("cursor", "0") == "0"
    store.set_value("cursor", "3")
    assert store.get_value("cursor", "0") == "3"
