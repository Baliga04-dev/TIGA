# 1. Every outbound email needs the owner's approval

Status: accepted (2026-10-22)

The assistant, the Analyst, follow-ups and chat can only create Drafts. Sending happens through `Mailer.approve` then `Mailer.send_next`, which enforces suppression, the CAN-SPAM footer, business hours, a ramping daily cap and gaps. The chat tool is `draft_email`, not "send". The only direct send is the owner's own Send button on the Email Bot page.

Why: cold email from a personal Gmail risks suspension and legal exposure, and mail content can carry prompt injection. A human click is the one control a model can't forge.
