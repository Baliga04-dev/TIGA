# 6. Consent before contact; Tiga never messages on WhatsApp

Status: accepted (2026-10-27)

**Context.** Shop owners are won face to face and followed up on WhatsApp. WhatsApp's Business Messaging Policy
allows contact only with people who gave you their number and opted in; its terms ban automated messaging, and a
ban takes the owner's only business number. TRAI acts on five complaints in ten days against an unregistered
sender. Numbers on OpenStreetMap or JustDial were not given to the owner. (Sources in
`reports/Tiga marketing assistant.md`, outside the repo.)

**Decision.** Every person Tiga helps the owner reach is a contact with a recorded source and per-channel consent.
One gate, `marketing.can_contact`, decides each outward step: never after do-not-contact (which also suppresses
the number, so it outlives deletion); WhatsApp and calls only with recorded consent, except people the owner knows
and people who messaged first; at most two unanswered touches in 30 days; shops only 10:00 to 19:00 Bengaluru
time. Tiga produces `wa.me` links for the owner to send by hand; it never sends WhatsApp messages, never uses
unofficial WhatsApp clients, and never dials. Map numbers become walk-in stops, not message targets.

**Consequences.** Fewer messages, each one wanted. A sale needs a visit or a warm introduction first, which is how
the evidence says these clients are won anyway. Cold email keeps its own path (ADR 0001).
