---
title: The new version is broken
topic: Deployments: health checks and rollback
---
## Why you're doing this
Most outages start with a change. **Break it** "deploys" a new orders version that cannot read its settings: every order fails, and so does its health check. You will see how a health check catches a bad version, and why the fastest fix for a bad deploy is almost always to roll back, then debug.

## The benefit, and the cost
Health checks let the platform (Docker here, Kubernetes or a load balancer in production) see that a container is not ready, stop sending it traffic and restart it. Rolling deploys replace copies one at a time, so a bad version is caught on the first copy. The cost: health checks must be honest (checking the database too eagerly makes every service unhealthy when the database blips) and rollbacks need the old version kept ready.

## Break it
**Break it** turns on `bad_deploy` for orders.

## Watch it
Orders' health turns red in the map, `docker compose ps` shows it unhealthy, every order returns 500, and the "orders is unhealthy" incident opens. In the logs, the error message says what the new version did wrong.

## Fix it: the quick switch
**Fix** rolls back (turns `bad_deploy` off). Watch health go green and the incident close. **Check** wants orders passing its health check.

## Fix it: in the code
Look at `health` in `orders.py` and the `HEALTHCHECK` in `lab/services/Dockerfile`. Real platforms separate two checks: liveness ("is the process stuck? restart it") and readiness ("can it take traffic now?"). Which one should check the database, and why should the other not?

## What interviewers ask
**Q: Blue-green, canary or rolling deployment?**
Blue-green runs the new version beside the old and switches all traffic at once (instant rollback, double the machines). Canary sends a small share of traffic to the new version first and watches its errors. Rolling replaces copies one by one.

**Q: Liveness versus readiness probes?**
Liveness failing means restart the container. Readiness failing means stop sending it traffic until it recovers. Readiness may check dependencies; liveness should not, or a database blip restarts everything.

**Q: What do you do in the first five minutes of an incident?**
Stop the bleeding before finding the cause: roll back the last change or fail over, tell people what is happening, and keep a timeline. Root cause and the write-up come after customers are fine.
