---
title: Erasure with a hashed suppression list
kind: concept
date: 2026-11-09
summary: Deleting a person on request while still being able to honour "never contact me again"; Tiga's "Erase on request" (R&D issue #14)
---
## What it is
Privacy law (India's DPDP Act here) lets a person ask you to erase their data. But to never contact them again you must still recognise them, for example when the nightly map import finds their shop again. The usual answer is to delete everything and keep only a one-way hash of the identifier on a suppression list.

## Why we picked it
Keeping the plain email or phone on the list would keep their data. Keeping nothing means the Analyst re-imports them from OpenStreetMap the next night and Tiga drafts them a mail. A hash is the smallest thing that still lets Tiga say "this one asked to be erased". The cost: a hash of a phone number is not anonymous (see below), so it's kept only for this purpose and the privacy notice doesn't claim more.

## How it works here
- `marketing.erase_person(store, "98450 12345, ravi@shop.in")` pulls out emails and phones, normalises phones to `91XXXXXXXXXX`, and finds matching contacts and prospects
- `store.erase(keys, contact_ids, prospect_ids)` in one transaction deletes the contacts, their touches, their outreach mails and the shop rows. It replaces plain suppressions with `sha256:<hex>` entries and scrubs the identifiers from the audit log.
- `store.is_suppressed` also checks the hash, so the mailer refuses to draft to them; `store.is_erased` makes the Analyst skip them on import
- On the page: Marketing, Contacts tab, "Erase on request"

## What bit us
- The audit log held the email itself (`entity_id` of the suppress entry). An erasure that forgets logs isn't one; `erase` rewrites those rows to `[erased]`.
- The first version blocked the map import for every suppressed person, which changed the existing behaviour for people who only replied STOP (they stay listed but are never drafted). Splitting `is_erased` from `is_suppressed` kept both behaviours.
- I first wrote that the code "can't be turned back" into the number. That's false for phone numbers, so the notice was corrected the same day.

## Say it in an interview
When someone asks to be erased, my app deletes their records everywhere, including mentions in the audit log, and keeps only a SHA-256 hash on a suppression list, so the nightly import and the mailer can still recognise and skip them. I learned that hashing isn't anonymisation for small input spaces like phone numbers. So I don't call it anonymous, and the next step would be a keyed hash (HMAC) with the key stored away from the database.

## What interviewers ask
**Q: Why not just delete the person completely?**
Because "don't contact me" has to outlive the record. Without some marker, a re-import or a bought list brings them back and you contact them again, which is worse than keeping a minimal hash.

**Q: Is a SHA-256 of a phone number anonymous?**
No. There are only about ten billion ten-digit numbers, so anyone with the hash can try them all and find the match. It's pseudonymous. A keyed HMAC with the key held outside the database stops someone with only the database from doing that.

**Q: What else has to be erased besides the main tables?**
Logs, caches, exports and backups. Here that meant the audit log and the drafted mails; backups need a retention limit so erased data ages out.

## Go deeper
- MeitY, Digital Personal Data Protection Act 2023 and Rules: https://www.meity.gov.in/data-protection-framework
- AZB & Partners, DPDP framework comes into effect: https://www.azbpartners.com/bank/update-indias-digital-personal-data-protection-framework-comes-into-effect/
