---
title: Something is slow. Which service?
topic: Observability: metrics, logs and traces
---
## Why you're doing this
In production nobody tells you which part is broken; customers just say "it's slow". **Break it** makes one service slow, and the page will not tell you which. You find it with the three tools every on-call engineer uses: metrics (numbers over time), logs (what happened), and traces (one request across services).

## The benefit, and the cost
Good observability turns a two-hour hunt into a two-minute one. Its cost is real: every service must emit consistent metrics and structured logs, someone pays to store them, and too many alerts teach people to ignore alerts.

## Break it
**Break it** adds 800 ms to one of menu, orders, payments or notifier.

## Watch it
Start from the customer: their p95 went up. Then the service map: compare each service's p95. Careful: orders calls menu and payments, so if menu is slow, orders is slow too. The slow one is the deepest service that is slow. Then confirm in the logs: filter one slow request id and compare each service's `ms`.

## Fix it: the quick switch
Type the service you think is slow and press **Check**. **Undo** puts every service back to normal speed.

## Fix it: in the code
Every number on the map comes from `/metrics` (`lab/services/shoplab/common.py`, class `Metrics`): a counter of requests by status and a histogram of latency. Tiga computes p95 from the histogram buckets. Read `summarize` in `tiga/lab.py` and work out why a histogram, not an average, is the right tool. (An average hides the slow few; p95 and p99 are what unhappy customers feel.)

## What interviewers ask
**Q: What are the RED and USE methods?**
RED for services: Rate, Errors, Duration. USE for resources: Utilisation, Saturation, Errors. Together they cover "is it working for users" and "is the machine coping".

**Q: Why p95 or p99 instead of the average?**
Latency is skewed: most requests are fast and a few are very slow. An average of 100 ms can hide 5% of users waiting 3 seconds. Percentiles describe what the slow users get.

**Q: Logs, metrics or traces: when do you use which?**
Metrics tell you that something is wrong and roughly where (cheap, aggregated). Traces show which hop in one request is slow. Logs explain what exactly happened in that hop.
