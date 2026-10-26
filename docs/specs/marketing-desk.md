# Spec: the marketing desk (phases 0 and 1)

## Objective

Help the owner win local-shop clients the way the evidence says they are won: messages to people he knows,
walk-in visits with a printed audit, and follow-ups only to people who agreed to them. Tiga prepares,
remembers and counts; the owner talks and presses send. Source: `reports/Tiga marketing assistant.md`
(build order: consent ledger, then warm network and walk-in kit, then quote, proof engine, weekly report).

## In scope (this round)

**Phase 0, consent ledger.** A contact record for every person Tiga helps the owner reach: where they came from
(`warm`, `walk_in`, `inbound`, `referral`, `map`, `other`, with a detail such as the listing URL), whether the
owner published the number or email themselves, consent per channel (`whatsapp`, `call`, `email`) with when and
how it was given, whether the privacy notice was given, and a permanent do-not-contact flag. One gate,
`marketing.can_contact(store, contact_id, channel, now)`, decides every outward step:

1. Do-not-contact, or the number or address is suppressed: never.
2. `whatsapp` and `call` need recorded consent, except people the owner knows personally (`warm`) and people
   who messaged first (`inbound`, which records consent itself). `email` needs consent or an owner-published
   business address.
3. At most 2 outbound touches without a reply in 30 days, across all channels.
4. Business contacts only between 10:00 and 19:00 Bengaluru time (warm contacts 09:00 to 21:00).

The gate returns a plain reason when it says no. Do-not-contact also suppresses the phone and email, so the
"no" survives deleting the contact; adding a suppressed number creates the contact already marked.

**Phase 1, warm network and walk-in kit.**
- *My network*: add people the owner knows (name, phone, how they know each other). Tiga drafts a short,
  personal message asking them to pass his number to shop owners they know, with the demo websites link. The
  owner edits it, opens WhatsApp from Tiga (a `wa.me` link, only if the gate allows), sends it himself, then
  marks it sent. Replies and referrals are recorded by hand; a referral becomes a new contact.
- *Walk-ins*: pick a Bengaluru locality, a shop category and a radius; Tiga lists the prospects within walking
  distance that have no website or a broken one, in walking order, skipping anyone marked do-not-contact or
  visited in the last 60 days. Needs coordinates on prospects (OpenStreetMap gives them; the Analyst refreshes
  existing prospects as it cycles categories).
- *Printables* (no scripts, strict CSP, print to PDF): a route sheet for the walk, and a one-page audit sheet
  per shop: what was noticed (from the site check, in plain words), what a fix looks like, the nearest demo
  website, the trust terms (one all-in price, domain in the owner's name, balance after the site is live, no
  auto-debit or lock-in, logins handed over), a QR that opens WhatsApp to the owner with a reference code
  (`Ref T<prospect id>`), and a one-line privacy notice.
- *Visit log*: after a visit, record the outcome (not met, talked, interested, not interested, come back),
  the person's name, number and which channels they agreed to, whether the notice was given, a note. "Asked
  not to be contacted" sets do-not-contact.
- *Inbound*: when someone messages with a reference code, the owner records it; Tiga finds the shop, creates
  or updates the contact as `inbound` with WhatsApp consent ("messaged first").
- *Scorecard*: counts for this week and each of the last 4 weeks: warm messages sent, visits, conversations,
  consents, interested, proposals sent, won, revenue paid. Counts, not percentages; "not enough data yet"
  below 5 conversations.

**Prospects page fix.** Shops that list only a phone on the map stop offering a WhatsApp link and a call
script; they become walk-in stops (WhatsApp's policy needs the number to be given to you; repeated cold calls
risk the owner's only number under TRAI's rules).

## Out of scope (later phases)

Trust-first quote and commission calculator, interview guide, proof engine (case studies, review and
referral asks), Monday "what worked" report, DPDP erasure and purge jobs, any API publishing. Tiga never
sends WhatsApp messages, never uses whatsapp-web.js or similar, never auto-dials.

## Interface

`marketing.py` (deep module; callers never see the rules):

```python
add_contact(store, data) -> dict                  # validates, normalises the phone, applies suppressions
can_contact(store, contact_id, channel, now) -> {"ok": bool, "reason": str}
whatsapp_link(store, contact_id, text, now) -> {"ok": bool, "url" | "reason"}
record_touch(store, contact_id, *, channel, direction, kind, outcome="", note="", now) -> dict
give_consent(store, contact_id, channel, how, now, notice=False) -> dict
do_not_contact(store, contact_id, reason, now) -> dict
log_visit(store, prospect_id, *, outcome, name, phone, consent, notice, note, dnc, now) -> dict
inbound(store, ref, *, name, phone, note, now) -> dict
warm_message(contact, *, owner, demos_url) -> str
route(store, locality, category, radius_km, now) -> {"stops": [...], "without_coordinates": int}
audit_sheet_html(prospect, *, owner, whatsapp, demos_url) -> str
route_sheet_html(locality, stops) -> str
scorecard(store, today) -> {"weeks": [...], "enough_data": bool}
```

Routes in `marketing_api.py` under `/api/marketing`; the printables under `/api/marketing/print/...` with the
same CSP as invoices. Frontend: a Marketing page (Clients group) with tabs This week, My network, Walk-ins,
Contacts.

## Acceptance

- Gate rules each have a test, including the time window in Bengaluru time and the 30-day unanswered cap.
- No WhatsApp link can be produced for a map-sourced contact without consent; do-not-contact survives
  deleting and re-adding the number.
- Route returns only nearby, unvisited, not-do-not-contact prospects, ordered by walking distance.
- Audit sheet escapes every value and carries the QR, the reference code and the notice.
- Backend and frontend suites, `tsc` and lint pass; axe clean on the new page in both themes.
