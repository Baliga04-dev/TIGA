# Glossary

Words used in Tiga's code, UI and docs. Use these names; don't invent synonyms.

- **Prospect**: a business the Analyst found (OpenStreetMap listing or news item) that might buy websites, apps or photo editing. Lives in `prospects`; statuses new, checked, ready, needs_contact, no_contact, disqualified, drafted, skipped.
- **Lead**: a scored news or forum item from `leads.py`. A lead becomes a Prospect when the Analyst stores it.
- **Draft**: an email in the approval inbox (`outreach` table, status `drafted`). Nothing is sent until the owner approves it; then `Mailer.send_next` sends it within limits.
- **Suppression**: an address or domain that must never be emailed again (STOP, unsubscribe, decline, bounce). Permanent.
- **Deal**: a Prospect or reply that has turned into a possible paid job; moves interested -> call_booked -> proposal_sent -> won/lost -> in_progress -> delivered -> paid.
- **Proposal**: the one-page scope, price, timeline and 50% advance terms sent to a Deal.
- **Invoice**: a numbered request for the advance or the balance, with a UPI QR for the exact amount.
- **Tool**: one thing the assistant can do (open a link, play YouTube, draft an email...). Runs only through `executor.execute`.
- **Tier**: how risky a Tool is: READ, LOCAL (reversible, on this machine), OUTWARD (reaches people or can't be undone), FORBIDDEN.
- **Turn**: one user request. Once a Turn has read untrusted text (mail, web pages), every non-read Tool in it needs a click.
- **Pending action**: an OUTWARD (or tainted) Tool call waiting for the owner's Confirm click; single use, expires after 10 minutes.
- **Bridge**: the Tiga Bridge browser extension that lets Tiga see and act on the owner's real Edge tabs over localhost.
- **Tiga**: the assistant itself (formerly styled "Jarvis").
