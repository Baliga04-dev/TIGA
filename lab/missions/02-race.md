---
title: The last honey cake, sold twice
topic: Concurrency: race conditions and transactions
---
## Why you're doing this
Menu reserves stock by reading it ("5 left?"), thinking for a moment, then writing it back. When forty customers arrive in the same instant, many read "5 left" before anyone has written. They all succeed, and the shop sells cakes it does not have. You will see stock go below zero. Every booking, ticket and inventory system has to get this right.

## The benefit, and the cost
Doing the check and the change as one atomic step makes the database serialise the buyers for that one row, so it can never oversell. The cost is that buyers of the same item now wait for each other for a moment (lock contention). That is almost always the right trade; the alternative is apologising to customers.

## Break it
**Break it** turns the atomic reserve off, switches off the oven (which normally rebakes anything running low every 20 seconds), sets honey cake stock to 5 and sends 40 customers at it at once.

## Watch it
The "Inside the shop" card shows honey cake below zero, in red, and an incident opens: "Sold more Honey cake than we had". Count the orders that went through against the 5 cakes there were.

## Fix it: the quick switch
**Fix** turns on `atomic_stock`: one statement, `UPDATE items SET stock = stock - 1 WHERE sku = 'BAK-001' AND stock >= 1 RETURNING stock`. If no row comes back, it is sold out. Press **Check**: it runs the 40-customer rush again and stock must end at 0, never below.

## Fix it: in the code
In `lab/services/shoplab/menu.py`, function `reserve`, the code under "THE BUG" reads, sleeps (`race_window_ms`, to make the gap visible) and writes. Replace that branch with the single conditional UPDATE, turn the switch off on the Lab page, rebuild menu, and run **Check** again. Another correct fix: `SELECT ... FOR UPDATE` inside a transaction, which locks the row until you commit. Compare the two.

## What interviewers ask
**Q: What is a race condition?**
A bug where the result depends on the timing of operations that run at the same time. Check-then-act on shared data is the classic shape: two actors check the same condition before either acts.

**Q: What does a transaction's isolation level change?**
What one transaction can see of others running at the same time. READ COMMITTED (Postgres's default) still allows this bug if you read then write; REPEATABLE READ or SERIALIZABLE make the database detect the conflict and fail one transaction, which you must then retry.

**Q: Optimistic or pessimistic locking?**
Pessimistic takes a lock first (SELECT FOR UPDATE): simple, but buyers queue. Optimistic reads a version number and writes only if it has not changed (UPDATE ... WHERE version = ?), retrying on conflict: better when conflicts are rare.
