---
title: Stop calling the service that is down
topic: Resilience: circuit breakers
---
## Why you're doing this
Payments is completely down, and slow to say so. Orders, with retries switched on, now waits for three slow failures per customer before giving up, and hammers a service that is already struggling. Retries help with blips; for an outage they make everything worse.

## The benefit, and the cost
A circuit breaker counts failures. After five in a row it "opens": calls fail instantly for 10 seconds without touching payments, so customers get a fast "try again shortly" and payments gets room to recover. Then it lets one trial call through ("half-open"); if that works, it closes. The cost: for a few seconds after payments recovers, some orders are still refused, and each replica of orders has its own breaker that learns separately.

## Break it
**Break it** makes payments fail every call after 3 seconds and has orders retry three times with a 5-second timeout.

## Watch it
Customers' p95 climbs past 10 seconds: every order now waits through four slow failures. Payments' request rate is four times the order rate.

## Fix it: the quick switch
**Fix** turns on `circuit_breaker`. After five failures the breaker opens (orders' stats say `open`), customers get an answer in milliseconds, and payments' request rate drops. **Check** wants the breaker open and customers' p95 under 2 seconds.

## Fix it: in the code
Read `lab/services/shoplab/resilience.py`, class `CircuitBreaker`: about 30 lines. Then answer: why does a failure while half-open open it again straight away? What would go wrong if the cooldown were 1 second? Change `threshold` or `cooldown_s` in `orders.py`, rebuild and watch the difference.

## What interviewers ask
**Q: What are the three states of a circuit breaker?**
Closed (calls pass, failures counted), open (calls fail fast), half-open (one trial call decides whether to close or open again).

**Q: Retries and circuit breakers together: in which order?**
The breaker wraps each attempt, so retries stop as soon as it opens. Retries handle short blips; the breaker handles outages.

**Q: What is a fallback?**
What you do when the call cannot be made: a cached answer, a default, or a clear message. For a payment there is no safe fallback but "try again", which is why failing fast matters.
