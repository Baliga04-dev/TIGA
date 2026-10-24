"""Menu and stock for the bakery.

The table holds the dozen things the bakery sells plus 600,000 rows of an old wholesale catalogue, which is
what makes a missing index hurt. Knobs (see common.DEFAULTS["menu"]):
  cache         keep the menu in Redis for 30 s          (mission: caching, and the stale price it causes)
  atomic_stock  reserve stock in one UPDATE ... WHERE    (mission: the last honey cake sold twice)
  safe_search   pass the search text as a parameter      (mission: SQL injection)
Lessons change the database itself too, e.g. `CREATE INDEX` on items(sku).
"""
from __future__ import annotations

import json
import time

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from .common import instrument, log, pool, redis_client, wait_for

app = FastAPI(title="menu")
knobs, metrics = instrument(app, "menu")

BAKERY = [
    ("BAK-001", "Honey cake", 4000, 25), ("BAK-002", "Dil pasand", 3500, 60), ("BAK-003", "Veg puff", 2500, 120),
    ("BAK-004", "Khara bun", 2000, 80), ("BAK-005", "Rusk, 250 g", 9000, 40), ("BAK-006", "Coconut biscuit", 3000, 70),
    ("BAK-007", "Plum cake", 12000, 15), ("BAK-008", "Egg puff", 3000, 90), ("BAK-009", "Benne biscuit", 2500, 75),
    ("BAK-010", "Masala bread", 5000, 30), ("BAK-011", "Butter biscuit", 2500, 100), ("BAK-012", "Chocolate brownie", 6000, 20),
]
CATALOGUE_ROWS = 600_000
QUERIES = [0]   # menu-page database queries so far (the caching mission watches this)


def _ping() -> None:
    with pool().connection() as conn:
        conn.execute("SELECT 1")


def setup() -> None:
    wait_for(_ping, "postgres")
    with pool().connection() as conn:
        conn.execute("""CREATE TABLE IF NOT EXISTS items (
            id BIGSERIAL PRIMARY KEY, sku TEXT NOT NULL, name TEXT NOT NULL, category TEXT NOT NULL,
            price_paise INTEGER NOT NULL, stock INTEGER NOT NULL)""")
        if conn.execute("SELECT count(*) FROM items").fetchone()[0] == 0:
            # the catalogue first, in random order, so the bakery rows are not conveniently at the front
            conn.execute(f"""INSERT INTO items (sku, name, category, price_paise, stock)
                SELECT 'CAT-' || lpad(g::text, 6, '0'), 'Wholesale item ' || g, 'catalogue', 1000 + g % 9000, 500
                FROM generate_series(1, {CATALOGUE_ROWS}) g ORDER BY random()""")
            with conn.cursor() as cur:
                cur.executemany("INSERT INTO items (sku, name, category, price_paise, stock) VALUES (%s, %s, 'bakery', %s, %s)",
                                BAKERY)
            conn.execute("ANALYZE items")
            log("seeded", rows=CATALOGUE_ROWS + len(BAKERY))


def oven() -> None:
    """Every 20 s, items that are running low, or were oversold, are baked back to their usual stock.
    The race mission switches the oven off so the oversell stays visible."""
    usual = {sku: stock for sku, _, _, stock in BAKERY}
    while True:
        time.sleep(20)
        if not knobs.get("oven"):
            continue
        try:
            with pool().connection() as conn:
                for sku, stock in usual.items():
                    conn.execute("UPDATE items SET stock = %s WHERE sku = %s AND stock < %s", (stock, sku, stock // 2))
        except Exception as exc:
            log("oven.error", error=str(exc))


@app.on_event("startup")
def _startup() -> None:
    import threading

    setup()
    threading.Thread(target=oven, daemon=True, name="oven").start()


def _row(r) -> dict:
    return {"sku": r[0], "name": r[1], "price_paise": r[2], "stock": r[3]}


@app.get("/health")
def health():
    with pool().connection() as conn:
        conn.execute("SELECT 1")
    return {"ok": True}


@app.get("/menu")
def menu(q: str = ""):
    k = knobs.all()
    if not q and k["cache"]:
        cached = redis_client().get("menu:list")
        if cached:
            return {"items": json.loads(cached), "cached": True}
    QUERIES[0] += 1
    metrics.gauge("shop_db_queries_total", QUERIES[0])
    with pool().connection() as conn:
        if not q:
            rows = conn.execute("SELECT sku, name, price_paise, stock FROM items WHERE category = 'bakery' ORDER BY sku").fetchall()
        elif k["safe_search"]:
            rows = conn.execute("SELECT sku, name, price_paise, stock FROM items WHERE category = 'bakery' AND name ILIKE %s",
                                (f"%{q}%",)).fetchall()
        else:
            # THE BUG (mission: SQL injection): the visitor's text is pasted into the SQL itself.
            rows = conn.execute("SELECT sku, name, price_paise, stock FROM items WHERE category = 'bakery' "
                                f"AND name ILIKE '%{q}%'").fetchall()
    items = [_row(r) for r in rows]
    if not q and k["cache"]:
        redis_client().set("menu:list", json.dumps(items), ex=30)
    return {"items": items, "cached": False}


@app.get("/items/{sku}")
def item(sku: str):
    with pool().connection() as conn:
        # No index on sku until a mission adds one: Postgres reads all 600,000 rows to find this one.
        r = conn.execute("SELECT sku, name, price_paise, stock FROM items WHERE sku = %s", (sku,)).fetchone()
    if r is None:
        raise HTTPException(404, f"no item {sku}")
    return _row(r)


class Reserve(BaseModel):
    sku: str
    qty: int = Field(gt=0, le=50)


@app.post("/reserve")
def reserve(body: Reserve):
    with pool().connection() as conn:
        if knobs.get("atomic_stock"):
            # The fix: check and take in one statement; the row lock makes concurrent buyers queue.
            r = conn.execute("UPDATE items SET stock = stock - %s WHERE sku = %s AND stock >= %s RETURNING stock",
                             (body.qty, body.sku, body.qty)).fetchone()
            if r is None:
                raise HTTPException(409, "sold out")
            return {"ok": True, "left": r[0]}
        # THE BUG (mission: race condition): read, think, then write. Two buyers can both read "1 left".
        r = conn.execute("SELECT stock FROM items WHERE sku = %s", (body.sku,)).fetchone()
        if r is None:
            raise HTTPException(404, f"no item {body.sku}")
        if r[0] < body.qty:
            raise HTTPException(409, "sold out")
        time.sleep(knobs.get("race_window_ms") / 1000)   # the gap another buyer slips into
        conn.execute("UPDATE items SET stock = stock - %s WHERE sku = %s", (body.qty, body.sku))
        return {"ok": True, "left": r[0] - body.qty}


@app.post("/release")
def release(body: Reserve):
    with pool().connection() as conn:
        conn.execute("UPDATE items SET stock = stock + %s WHERE sku = %s", (body.qty, body.sku))
    return {"ok": True}


class Price(BaseModel):
    sku: str
    price_paise: int = Field(gt=0)


@app.post("/admin/price")
def set_price(body: Price):
    with pool().connection() as conn:
        conn.execute("UPDATE items SET price_paise = %s WHERE sku = %s", (body.price_paise, body.sku))
    # Note what is missing here: nothing tells the cache. That is the caching mission's second half.
    return {"ok": True}


class Stock(BaseModel):
    sku: str
    stock: int = Field(ge=0)


@app.post("/admin/restock")
def restock(body: Stock):
    with pool().connection() as conn:
        conn.execute("UPDATE items SET stock = %s WHERE sku = %s", (body.stock, body.sku))
    return {"ok": True}


@app.get("/admin/stock")
def stock_report():
    with pool().connection() as conn:
        rows = conn.execute("SELECT sku, name, price_paise, stock FROM items WHERE category = 'bakery' ORDER BY sku").fetchall()
        indexes = [r[0] for r in conn.execute("SELECT indexname FROM pg_indexes WHERE tablename = 'items'").fetchall()]
    items = [_row(r) for r in rows]
    return {"items": items, "oversold": [i for i in items if i["stock"] < 0], "indexes": indexes}
