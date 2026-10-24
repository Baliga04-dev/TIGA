---
title: The lookup that reads 600,000 rows
topic: Databases: indexes and query plans
---
## Why you're doing this
Orders asks menu for an item by its code (`sku`) on every single order. The items table also holds an old wholesale catalogue of 600,000 rows, and there is no index on `sku`. So Postgres reads the whole table to find one row, every time. At 2 orders a second nobody notices; at 6 the database is busy reading the same rows over and over and every order gets slower. This is the most common performance bug in real apps.

## The benefit, and the cost
An index is a sorted copy of one column with pointers back to the rows (a B-tree). A lookup goes from "read everything" to "read a few pages". The cost: the index takes disk space, and every INSERT, UPDATE and DELETE must also update it, so writes get a little slower. Index the columns you search by, not every column.

## Break it
**Break it** removes any index on `sku` and raises traffic to 6 customers a second.

## Watch it
In the service map, watch menu's p95 (the time the slowest 1 in 20 requests take) and the customers' p95. Press **See the query plan** to run `EXPLAIN ANALYZE` on one lookup: look for `Seq Scan on items` and how many rows it read ("Rows Removed by Filter").

## Fix it: the quick switch
**Fix** runs `CREATE INDEX idx_items_sku ON items (sku)`. Run the query plan again: it should now say `Index Scan using idx_items_sku` and finish in a fraction of a millisecond. Watch menu's p95 fall.

## Fix it: in the code
Do it yourself in psql: from `lab/`, run `docker compose exec postgres psql -U shop -d shop`, then `DROP INDEX idx_items_sku;`, then `EXPLAIN ANALYZE SELECT * FROM items WHERE sku = 'BAK-007';`, then create the index again and compare. In a real project the index belongs in a migration file next to the table it serves, so every environment gets it; add it to `setup()` in `lab/services/shoplab/menu.py` and rebuild menu.

## What interviewers ask
**Q: How does a B-tree index find a row?**
It is a balanced tree of sorted keys. From the root it compares the key at each level and follows one child, so a lookup in a million rows takes about three or four page reads instead of reading every page.

**Q: Why might the database not use your index?**
The query does something to the column (`lower(sku)`, a leading wildcard `LIKE '%x'`), the types do not match, the table is small enough that a scan is cheaper, or the statistics are stale (run ANALYZE). Read the plan with EXPLAIN instead of guessing.

**Q: What is a composite index and when does column order matter?**
An index on (a, b) sorts by a, then b. It serves `WHERE a = ?` and `WHERE a = ? AND b = ?`, but not `WHERE b = ?` alone. Put the column you always filter by, usually with equality, first.
