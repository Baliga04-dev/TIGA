# Spec: the R&D bot researches, proposes and learns

Status: accepted (2026-10-26). Owner: Adithya. Replaces the numbers-only R&D bot.

## Objective
Every week, and whenever the owner asks, the R&D bot researches what would most improve Tiga and the owner's freelance business (websites, booking/ordering apps and photo editing for local shops in Bengaluru), and files a few ranked, evidence-backed proposals the owner can approve. It learns from what the owner approved and rejected before.

## Inputs
- Tiga's state: the outreach scorecard, the Analyst's prospect counts, the money summary, Claude usage, and the issue board (open, approved, done and rejected titles).
- The owner's goals, constraints and research topics: the `## Goals`, `## Constraints` and `## Research topics` sections of `tiga/skills/rnd/SKILL.md` (editable on the Crew page).
- The web, through Claude's WebSearch and WebFetch tools only.

## Behaviour
1. The existing number checks still run first and still cite the number that triggered them.
2. Research: one Claude Code session (the owner's subscription; API-key variables stripped) with WebSearch and WebFetch only: no file, shell or MCP tools, an empty working folder, a turn and time limit. It returns JSON: at most 5 proposals, each with title, kind (`improvement` = something to build in Tiga, `idea` = something the owner does in the business), why (evidence), benefit, effort (S/M/L), first step and at least one source URL.
3. Validation: proposals without an http(s) source, or with a title close to an existing issue, are dropped; text is length-limited. Web pages are untrusted data: the prompt says so, the session has no write tools, and nothing it returns runs without the owner approving the issue (the Dev bot only builds approved `improvement`/`bug` issues, never `idea`s).
4. Filing: each proposal becomes an issue (source `rnd`) whose body holds why, benefit, effort, first step and sources.
5. Learning: the next run is told which earlier proposals the owner approved or finished and which were rejected, and to lean towards the former.
6. The weekly report (numbers, proposals, sources) is always saved in the app and emailed when Gmail works; a missing Gmail never stops the bot.
7. Limits: one automatic run per ISO week; at most 2 manual runs a day; AI calls logged as feature "research bot". With Claude unavailable it falls back to the number checks and says so.

## Acceptance criteria
- Parsing keeps only valid proposals (sourced, sized, de-duplicated, at most 5) from the model's JSON, and survives junk around it.
- A run files issues, records when it ran, and the weekly job runs without Gmail.
- Manual runs past the daily limit are refused with a clear message.
- The research call can only use WebSearch and WebFetch, runs in an empty folder and strips API-key variables; tests never make a real call.
- The Dev bot never picks an `idea` issue.
- The Crew page shows the last research run, a Run research now button, and each proposal's sources as links.

## Out of scope
Auto-approving anything; posting or sending anything; changing code or skills on its own.
