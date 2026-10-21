# Curriculum map

Tracks in order. Each lesson points at real Tiga code. Status lives in `learning-records/`.

1. **The network path** (lesson 01, written): DNS, TCP, TLS, HTTP, proxies, CORS, how a click reaches FastAPI.
2. **Databases from the ground up** (lesson 02, written): tables, keys, transactions, idempotency, WAL, indexes (`tiga/store.py`).
3. Python and asyncio: event loop, `to_thread`, dependency injection (`tiga/mailer.py`, `jobs.py`).
4. HTTP APIs with FastAPI: validation, errors, status codes, security headers (`main.py`, `outreach_api.py`).
5. React, TypeScript and state: components, effects, data loading, accessibility (`frontend/src/pages`).
6. Testing: pytest, fakes vs mocks, Vitest, Playwright, TDD (`tiga/tests`, `frontend/e2e`).
7. Git, branches, PR flow and CI (`tiga/codesync.py`).
8. Auth and security: OAuth, CSRF, prompt injection, secrets, least privilege (`gmail_service.py`, `brain.py`).
9. Email as a protocol: SMTP, IMAP, SPF, DKIM, DMARC, deliverability, compliance (`mailer.py`).
10. Distributed systems and system design: queues, caching, load balancing, consistency, observability, scaling this app to many users.
11. LLM and agent patterns: tool use, workflows vs agents, evaluation (`crew`, `interview.py`).
12. Interview drills: ten system-design prompts, code questions, behavioural stories from this project.
