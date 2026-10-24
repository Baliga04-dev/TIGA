---
title: Customers charged twice
topic: Retries and idempotency
---
## Why you're doing this
Payments sometimes takes the money and then answers "504 gateway timeout". Orders sees a failure and, being helpful, retries. The retry is a brand new charge. The customer pays twice for one cake, and you find out from an angry WhatsApp. Retrying is necessary on a network; retrying blindly is how money gets lost.

## The benefit, and the cost
An idempotency key is an id the caller makes once per intended action and sends with every try. The server remembers the key and, when it sees it again, returns the first result instead of acting again. The client may then retry as often as it likes. The cost: the server stores keys (for a day or so) and must check them atomically (a unique index on the key does it).

## Break it
**Break it** makes 30% of charges succeed-then-fail, and has orders retry twice without sending a key.

## Watch it
The ledger panel lists orders charged more than once, and the "charged more than once" incident opens. In the logs, payments writes `charge.taken` two or three times for the same `order_ref`.

## Fix it: the quick switch
**Fix** turns on `idempotency`: orders sends the customer's Idempotency-Key on every try, and payments replays the first charge (`charge.replayed` in the logs). **Check** watches 30 seconds of traffic with the faults still on and expects no new double charges.

## Fix it: in the code
Look at `lab/services/shoplab/payments.py`, `charge`: the lookup of `idem_key` before the INSERT, and the `UNIQUE` on the column. Why both? (Two retries can arrive at the same time; the lookup alone has the race from mission 2. The unique index is what really guarantees one charge.) Then in `orders.py`, notice the customer's key is also stored on the order, so a client resending the whole order gets the first order back.

## What interviewers ask
**Q: Which HTTP methods are idempotent?**
GET, PUT and DELETE are defined as idempotent: doing them twice has the same effect as once. POST is not, which is why payment APIs (Stripe, Razorpay) accept an Idempotency-Key header on POST.

**Q: At-most-once, at-least-once, exactly-once?**
Without retries you get at most once (may be lost). With retries, at least once (may repeat). "Exactly once" in practice means at least once plus an idempotent receiver.

**Q: How do you retry safely?**
Retry only failures that may succeed (timeouts, 503s, not 400s), with exponential backoff and jitter so clients do not retry in lockstep, a cap on attempts, and an idempotency key for anything that changes state.
