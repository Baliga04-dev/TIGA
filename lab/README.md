# ShopLab

A small online bakery built as real microservices, so you can learn how production systems fail by breaking this one and fixing it. Tiga's **Learn** page drives it (set `TIGA_LEARN_ENABLED=true` in `tiga/.env`).

```
browser / pretend customers
        |
     gateway (127.0.0.1:8080)  -- API key, rate limit, timeouts
        |
     orders  ---->  menu (prices, stock)  ---->  Postgres
        |     ---->  payments (pretend UPI) ---->  Postgres
        |     ---->  notifier (WhatsApp) <---- Redis stream (queue)
     Redis: cache, queue, and every service's knobs
```

- `services/shoplab/` holds the services (FastAPI, one image, one module each). `common.py` gives all of them request ids, JSON logs, `/metrics` and **knobs**: switches stored in Redis that inject faults (latency, errors, crashes) or turn fixes on. The bugs the missions are about are written plainly in the code, marked "THE BUG".
- `missions/*.md` are the lessons. Each has the same seven parts: why you're doing it, the benefit and the cost, break it, watch it, the quick fix, the real fix in the code, and interview questions with answers. Their buttons and checks are in `tiga/lab.py`.
- While the lab runs, Tiga checks it every 15 seconds and opens incidents (overselling, double charges, a service down, slow or failing customers, a queue backing up) and closes them when they clear.

Run it from the Learn page, or by hand: `docker compose up -d --build` here, then `curl http://127.0.0.1:8080/menu`. Edit a service, then press its Rebuild button (or `docker compose up -d --build <service>`).

If Docker answers "permission denied" right after installing it, your session predates the `docker` group: run `wsl --shutdown` in Windows PowerShell once and reopen Ubuntu (reloading the VS Code window is not enough).

Unit tests for the shared pieces run without Docker: `cd services && ../../tiga/.venv/bin/python -m pytest -q tests`.
