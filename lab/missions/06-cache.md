---
title: Ten browsers a second, and a price that will not change
topic: Caching and cache invalidation
---
## Why you're doing this
Most visitors only look at the menu. Every look is a database query, even though the menu changes a few times a day. Caching the menu in Redis for 30 seconds removes almost all of those queries. Then you change a price and customers keep seeing the old one: "there are only two hard things in computer science: cache invalidation and naming things".

## The benefit, and the cost
A cache answers from memory in microseconds and protects the database from repeated reads. The cost is staleness: for as long as the entry lives, customers may see old data. You choose how stale is acceptable (a menu: seconds; a bank balance: never) and how the cache learns about changes.

## Break it
**Break it** turns the cache off and sends 10 visitors a second.

## Watch it
Menu's request rate and p95. Then press **Fix** and watch the `cached: true` answers in the logs and menu's queries drop. Now press **Show the stale price**: it changes Dil pasand from ₹35 to ₹39 in the database. Look at the menu: still ₹35, for up to 30 seconds.

## Fix it: the quick switch
**Fix** turns the cache on (cache-aside: look in Redis, else read the database and store the answer for 30 s). The quick switch fixes speed, not staleness: **Check** changes a price with the cache on and expects the menu to show the new price at once. It fails until you fix the code.

## Fix it: in the code
In `lab/services/shoplab/menu.py`, `set_price` updates the database and stops. Add one line after the UPDATE: `redis_client().delete("menu:list")`. Rebuild menu and run **Check**. That is invalidate-on-write. Think about what happens with three menu replicas and a CDN in front: who else needs telling?

## What interviewers ask
**Q: Cache-aside, write-through, write-behind?**
Cache-aside: the app reads the cache, falls back to the database, then fills the cache. Write-through: every write goes to the cache and the database together. Write-behind: writes go to the cache and are flushed to the database later (fast, but can lose data).

**Q: What is a cache stampede and how do you stop it?**
When a popular entry expires, every request misses at once and they all hit the database. Fixes: one request rebuilds while others wait (a lock), refresh before expiry, or add jitter to expiry times.

**Q: What should you never cache?**
Anything that must be exactly right at the moment of use (stock you are about to sell, a balance before a payment) unless you also check the source of truth at that moment.
