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

---

# Round 2: follow-ups, the trust-first quote, proof and the weekly report

Added 2026-10-31. Same rules as round 1: Tiga drafts, counts and reminds; the owner sends.

## In scope

**Visit follow-ups (closing phase 1).** A shop owner who agreed to WhatsApp at a visit is owed one message within
48 hours with the demo for their kind of shop. Tiga lists the follow-ups owed (visits in the last 7 days with
WhatsApp consent and no message since), marks the ones past 48 hours, and drafts each message. Sending goes through
the same gate and `wa.me` link as everything else. At most about 10 demo follow-ups a week; the list says when the
week's 10 are used.

**Trust-first quote (phase 2).**
- Every proposal states, in the same words as the audit sheet: one all-in price; the year-two renewal amount and
  the date it falls due; the domain registered in the client's name with every login on a handover sheet; the
  balance due only after the site is live on their domain; no auto-debit, no lock-in, no commission. The renewal
  amount is a setting (default ₹1,200 a year: the domain; a static site's hosting stays free).
- A printable handover sheet per deal (when delivered): domain, registrar, renewal date and cost, hosting, how to
  change content, Google Business Profile, the WhatsApp number orders go to, and who to call. Never passwords:
  blank lines the owner fills by hand.
- A commission calculator for restaurants: orders a month on delivery apps, average order, commission rate and the
  share that could move to direct orders, giving the monthly commission and how many months a flat-price site
  takes to pay for itself. A printable one-pager to leave behind.
- Owner interviews: a guide (how customers find them, what they've paid for listings or ads, what burned them) and
  a price ladder for four offers (basic site, WhatsApp ordering page, monthly care, photo editing): too cheap to
  trust, a bargain, getting expensive, too expensive. Answers are stored per interview; the summary shows, per
  offer, the range between the median "bargain" and the median "getting expensive", and how many interviews each
  kind of shop has (goal 15 to 20, about 3 per kind).

**Proof engine (phase 3).**
- A deal's client becomes a `client` contact (the relationship is the permission; shop hours apply).
- When a deal is marked delivered, Tiga records what the client lets the owner show (their name, logo,
  screenshots, a quote, numbers), each yes or no. Nothing is drafted for a "no".
- From the owner's notes (the problem, what was built, results with real numbers), Tiga drafts a case study, a
  LinkedIn post and a Google Business Profile update (at most 1,500 characters, no phone number), only from
  allowed items and only when there is at least one real number or quote.
- Asks owed: a Google review request when the deal is paid (to every client, never only happy ones; no incentive),
  and a check-in with a referral request 14 days after. Each is a draft with "Open WhatsApp".

**Weekly "what worked" report (phase 4).** Every Monday (once per ISO week, with the daily run; Gmail optional):
last week against the four-week counts by channel (people you know, walk-ins, shops that messaged first, referrals,
cold email replies), the asks owed, three to five next steps, exactly one experiment, and any channel with four or
more attempts and nothing back marked to retire. Counts, not percentages; "not enough data yet" below 5
conversations. Saved on the Reports page.

**Privacy (part of phase 5).** A plain privacy notice page on the portfolio (`/privacy.html`) saying what is kept,
why, for how long and how to have it deleted; audit sheets point to it. Contacts that came from the map or a
walk-in, never agreed to anything and haven't been touched in 180 days are deleted by the weekly run
(do-not-contact suppressions stay).

## Out of scope

Before/after screenshots taken automatically, API publishing to Instagram, Facebook, LinkedIn or Google Business
Profile, Kannada copy (waits for interview vocabulary), and anything paid.

## Acceptance

- Follow-ups owed: right people, 48-hour marking, weekly cap shown; the gate still decides sending.
- Proposals and their emails carry every trust term and the renewal amount and date.
- Calculator arithmetic is tested; interview summary medians are tested.
- No proof draft without permission and a real number or quote; GBP text is at most 1,500 characters with no phone
  number.
- Asks owed appear at payment and 14 days after, once each.
- The weekly report runs once per ISO week, names one experiment, retires zero-yield channels after 4 attempts.
- The purge deletes only unengaged, non-consented map or walk-in contacts older than 180 days and keeps suppressions.

---

# Round 3: scale what works

Added 2026-10-31. Scale reach and preparation, not message volume (the TRAI and WhatsApp limits stay).

- **No chains.** Shops whose names match well-known chains and franchises (telecom stores, supermarkets,
  pharmacy chains, fast food, clothing and jewellery brands, salon and gym chains, hotel brands) are marked
  "not a fit" when the Analyst records them, existing ones are marked too, and walk-in routes skip them. Ambiguous
  words (Trends, Max, More, Spar) match only as the whole name.
- **Where to walk.** The Walk-ins tab ranks neighbourhoods by how many eligible shops are within the chosen
  distance, so the owner walks where the density is.
- **From where I am.** A route can start from the browser's location instead of a neighbourhood centre.
- **Print the whole walk.** One printable document with an audit sheet per stop, each on its own page.
- **Proof in cold email.** A first cold email to a shop whose kind has a demo carries one line linking it, added
  after the AI's draft passes its checks.
- **A salon demo.** A fifth demo site (booking a slot by service, stylist and time), and salons' audit sheets and
  follow-ups point to it.

Acceptance: chain names are tested, including the whole-name-only words; the ranking matches the routes; the
location route orders stops from the given point; the combined printable has one page per stop; drafts for kinds
with a demo carry exactly one demo link and others none; the salon demo passes the same checks as the others
(axe at 1440 and 390 px, no horizontal scroll).
