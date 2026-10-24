---
title: A search box that hands out the database
topic: Security: injection, authentication and rate limits
---
## Why you're doing this
The menu search builds its SQL by pasting in whatever the visitor typed. Type a quote and some SQL, and the database runs your SQL. Here it leaks rows from the wholesale catalogue; in a real shop it leaks customers' phone numbers, or drops a table. SQL injection has been in the OWASP Top 10 for twenty years because it is easy to write and easy to miss.

## The benefit, and the cost
Parameterised queries send the SQL and the values separately, so the database never reads a value as code: the whole class of bug disappears, at no cost. At the edge, an API key (or a login token) decides who may call at all, and a rate limit stops one client from flooding you. Those do have costs: keys must be issued, rotated and kept secret, and a limit set too low blocks real customers.

## Break it
**Break it** turns off the safe search, the API key and the rate limit, and runs the injection: `x' OR category = 'catalogue' AND sku LIKE 'CAT-00000%' --`.

## Watch it
The result lists wholesale rows the menu should never show. Read the SQL in `menu.py` under "THE BUG" and work out how the quote and the `--` turn your text into SQL.

## Fix it: the quick switch
**Fix** turns on `safe_search` (the text goes in as a parameter), makes the gateway require `X-Api-Key`, and limits each client to 600 requests a minute. **Check** runs the injection again and expects no rows.

## Fix it: in the code
In `lab/services/shoplab/menu.py`, function `menu`, delete the unsafe branch so the query is always parameterised (`%s` with the value passed separately), turn `safe_search` off, rebuild menu and run **Check**. Then read `_edge` in `gateway.py`: what does a client get when it is over the limit, and why 429?

## What interviewers ask
**Q: How do you prevent SQL injection?**
Parameterised queries or an ORM that uses them, never string building; least-privilege database users so a mistake cannot drop tables; and input validation as a second layer, not the first.

**Q: Authentication or authorisation?**
Authentication is who you are (a key, a password, a token). Authorisation is what you may do (this user may see this order). Most breaches in APIs are broken authorisation: checking that someone is logged in but not that the thing they asked for is theirs.

**Q: How does rate limiting work?**
Count requests per client in a time window (fixed window here; sliding windows and token buckets are smoother) in a shared store, and answer 429 Too Many Requests with a Retry-After when the count is over the limit.
