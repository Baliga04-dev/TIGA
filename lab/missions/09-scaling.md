---
title: Thirty customers a second
topic: Scaling out and stateless services
---
## Why you're doing this
A festival offer brings 30 orders a second. Each order holds one of orders' 40 threads while payments takes 1.5 s, so one orders container can finish at most about 26 a second, and requests queue, time out and fail. Scaling out means running more copies of the service and spreading the work between them.

## The benefit, and the cost
Three copies of orders give three times the threads, and if one dies the others keep serving. It only works because orders is stateless: everything it must remember is in Postgres or Redis, so any copy can handle any request. The costs: the database and payments now get three times the concurrent load, anything kept in a process's memory (like the circuit breaker's state) is now per copy, and you need something that spreads requests (here Docker's DNS hands out the copies' addresses in turn; in production, a load balancer).

## Break it
**Break it** makes payments take 1.5 s and sends 30 customers a second.

## Watch it
Customers' error rate, orders' p95, and the threads running out (orders' rps flattening near 26 while requests keep coming).

## Fix it: the quick switch
**Fix** runs `docker compose up --scale orders=3`. Watch the service map show three orders containers and the errors fall. **Check** wants three running copies and fewer than 5% of requests failing.

## Fix it: in the code
Find what in `orders.py` is not stateless: the `breaker` object lives in memory. With three copies, one may have its breaker open while another keeps calling a dead payments service. How would you share it? (Store failure counts in Redis, or accept per-instance breakers, which is what most service meshes do.)

## What interviewers ask
**Q: Vertical or horizontal scaling?**
Vertical: a bigger machine; simple, but has a ceiling and a single point of failure. Horizontal: more machines; needs stateless services and a load balancer, but grows further and survives failures.

**Q: How does a load balancer choose a server?**
Round robin, least connections, or a hash of something (client address, user id) for stickiness. It also health-checks backends and stops sending to the unhealthy ones.

**Q: What breaks when you scale a stateful service?**
In-memory sessions, caches and counters split between copies, scheduled jobs run once per copy, and file uploads land on one machine. Move that state to a shared store, or route each user to the same copy.
