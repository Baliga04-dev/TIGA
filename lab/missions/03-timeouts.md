---
title: One slow provider takes the whole shop down
topic: Resilience: timeouts and cascading failure
---
## Why you're doing this
The payment provider slows down to 25 seconds a call. Orders waits for it with no time limit. Each waiting order holds one of orders' worker threads (there are 40). In a few seconds every thread is waiting on payments, and now orders cannot answer anything, not even its health check, even for things that have nothing to do with payments. The gateway waits on orders, and customers see the whole shop hang. This is a cascading failure, and the missing timeout is behind more outages than any other single mistake.

## The benefit, and the cost
A timeout turns "wait forever" into "give up after 2 seconds and say so". The slow dependency then costs each customer 2 seconds and a clear error, instead of costing everyone everything. The cost is choosing the number: too short and you fail calls that would have worked; too long and you are back to hanging. Set it from the dependency's normal latency (its p99) plus headroom, and make each layer's timeout shorter than the layer above it.

## Break it
**Break it** makes payments take 25 seconds, removes orders' timeout, and doubles the traffic.

## Watch it
Watch orders' health turn red, customers' error rate climb, and the "customers are getting errors" incident open. In the logs, the orders lines stop: its threads are all stuck. Notice that browsing the menu also fails at the gateway, though menu itself is fine: the gateway is waiting too.

## Fix it: the quick switch
**Fix** sets orders' payment timeout to 2 seconds and the gateway's to 5. Orders answers "payment did not go through" quickly, keeps its threads free, and the rest of the shop recovers. **Check** asks for orders healthy and customers' p95 at 6 seconds or less, with payments still slow.

## Fix it: in the code
In `lab/services/shoplab/orders.py`, `_charge` builds the timeout from the knob. Change the default so the code always has a timeout (for example `httpx.Timeout(2.0, connect=0.5)`), set `payment_timeout_s` back to 0 on the Lab page, rebuild orders and run **Check**. Then look at the other calls in `place`: each uses `timeout=30`. Is 30 seconds right for a stock check?

## What interviewers ask
**Q: What is a cascading failure?**
A failure in one component that exhausts a shared resource (threads, connections, memory) in the components calling it, so they fail too, all the way up. Timeouts, bulkheads (separate pools per dependency) and circuit breakers stop the spread.

**Q: Connect timeout or read timeout?**
Connect bounds how long you wait to open the connection (should be short, under a second on a local network). Read bounds how long you wait for the answer. Set both; libraries often default to none.

**Q: How do you choose timeout values in a chain of services?**
Inner calls get shorter limits than outer ones, so the inner one gives up first and the outer can still answer cleanly. Many systems pass a deadline down the chain instead of a fixed number per hop.
