# 5. The Dev bot only ever opens draft pull requests

Status: accepted (2026-10-22)

The Dev bot works only on issues the owner approved, in a throwaway git worktree on a new `tiga/dev-<id>-<slug>` branch. Claude Code (the owner's subscription, API-key variables stripped) gets file tools only (Read, Edit, Write, Glob, Grep), edits accepted inside that worktree, no shell and no web, with a turn and time limit. Tiga runs the tests and the secret scan itself; only then does it push that branch and open a draft pull request. Any failure hands the issue back to "approved" with the reason and pushes nothing. It never pushes main and never merges; at most `TIGA_DEV_DAILY_RUNS` runs a day, and the nightly run is off unless `TIGA_DEV_AUTO` is set.

Why: approving an issue is the human gate; reviewing the pull request is the second. Giving the model a shell would let an issue's text (often from the R&D bot's web research) reach the machine, and Tiga running the tests itself means a model cannot claim they passed.
