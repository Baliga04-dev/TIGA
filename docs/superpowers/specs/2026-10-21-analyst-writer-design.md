# Analyst -> Writer: overnight prospects to morning drafts

## Intent
The owner freelances websites, apps, photo editing and similar digital work. Every morning they want a stack of ready-to-approve cold-email drafts to businesses that plausibly need that work, each with the reason and source beside it. They only review and approve.

## Decided by the owner
- Collect from 16:00 to 02:00 (IST); drafts ready by morning; nothing sends without approval.
- Targets: all of Bengaluru, local shops "ready for a change", plus anyone needing these services (news leads).
- Recipient emails come only from the business's own published details (website contact page/footer, or its OpenStreetMap listing). Never guessed. No address found -> shown as "needs an email" (or "call/WhatsApp" when only a phone is known).
- Zero budget: free sources only.

## Design (deep modules, flat imports in tiga/)
- `places.py`: `await fetch_businesses(category) -> list[Business]`. OpenStreetMap Overpass, Bengaluru bounding box, one category per call. Attribution "(c) OpenStreetMap contributors" shown in the UI (ODbL).
- `sitecheck.py`: `await inspect(url) -> SiteReport` (reachable, https, mobile-ready, stale copyright, slow, published emails with the page they were on, "no solicitation" notice). Honours robots.txt, at most 3 pages per site.
- `analyst.py`: `Analyst(store, fetch_businesses, inspect, find_leads, write_draft)` with one method `tick(now)`:
  - 16:00-02:00: fetch the next OpenStreetMap category (rotating), upsert prospects, then site-check a batch of unchecked ones; once per night also pull news leads.
  - 02:00-16:00, once per day: draft up to N (default 15) best "ready" prospects through the existing Mailer (approval inbox).
- Store: `prospects` table (status new -> checked -> ready / needs_contact / disqualified -> drafted / skipped) and a tiny key-value table for the category cursor.
- Drafter gains hooks for site problems (no website, not mobile-friendly, no HTTPS, slow, outdated, site down) and per-category offers.
- Prospects page: overnight summary, needs-an-email list (add an email -> draft now), call/WhatsApp list, run-now, OSM attribution.

## Qualification (builder's call, tunable)
No website: strong (pitch a website). Website with problems: strong. Modern working site with no problems: disqualified. Chains/brands with a `brand` tag: disqualified. "No solicitation" notice: disqualified.

## Non-goals
Automatic WhatsApp/SMS/calls; scraping Google Maps, Justdial, LinkedIn or any logged-in site; guessing addresses; sending without approval.
