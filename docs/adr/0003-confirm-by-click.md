# 3. Risky assistant actions are confirmed by a click, not by the model

Status: accepted (2026-10-22)

All Tools run through `executor.execute`. OUTWARD Tools, and LOCAL Tools after untrusted text was read in the same Turn, return a Pending action instead of running. Only `POST /api/actions/{id}/confirm` (a UI click, protected by the cross-site write guard) runs it, once, within 10 minutes. Voice and chat text can never confirm. "Tiga stop" pauses everything.

Why: prompt injection is unsolved (even the best browser agents still fail some attacks), so the decision to act on the world must come from the owner's hand, enforced in code.
