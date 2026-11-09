---
title: Claude Code plugins
kind: tool
date: 2026-11-09
summary: Installable bundles of skills, agents, hooks and MCP servers for Claude Code; used here to add the karpathy-guidelines coding rules
---
## What it is
A plugin is a folder that adds things to Claude Code: skills (a `SKILL.md` of instructions), agents, hooks, MCP servers. A marketplace is just a git repo or folder with a `.claude-plugin/marketplace.json` that lists plugins and where to fetch each one. It is a catalogue, not a store.

## Why we picked it
I wanted the "Karpathy guidelines" (think before coding, keep it simple, change only what you must, define how you'll check it) to apply in every project, not only Tiga. Copying the text into each project's CLAUDE.md works but drifts. A plugin installs once at user scope and updates from its repo. The cost: it is third-party content that steers the agent, so I read every file before installing (it was only Markdown and two JSON manifests, no scripts or hooks).

## How it works here
- `claude plugin marketplace add multica-ai/andrej-karpathy-skills` cloned the repo into `~/.claude/plugins/marketplaces/karpathy-skills/`
- `claude plugin install andrej-karpathy-skills@karpathy-skills` installed it at user scope; `claude plugin list` shows it
- The marketplace manifest `.claude-plugin/marketplace.json` names one plugin with `"source": "./"`; its `plugin.json` points at `skills/karpathy-guidelines`
- Inside a session the same steps are `/plugin marketplace add ...` and `/plugin install name@marketplace`

## What bit us
- The repo's README tells you to add `forrestchang/andrej-karpathy-skills`; the link I was given was a fork, `multica-ai/...`. Both declare the marketplace name `karpathy-skills`, so the install name is the same either way. Check which repo you actually trust.
- A newly installed skill shows up in new sessions, not in the one that installed it.

## Say it in an interview
I use Claude Code plugins to share agent instructions across my projects. Before installing one I read every file in it, because a plugin can carry hooks or MCP servers that run code, not only text. This one was Markdown only, a set of coding rules I now apply to every build: small changes, tests that prove the fix, and no speculative features.

## What interviewers ask
**Q: What is the difference between a plugin and a marketplace?**
A plugin is the bundle of skills, agents, hooks or MCP servers. A marketplace is a repo with a `marketplace.json` that lists plugins and where each one lives. You add a marketplace once, then install plugins from it by `name@marketplace`.

**Q: What's the supply-chain risk, and how do you manage it?**
A plugin can add hooks and MCP servers that run commands with your permissions, and it updates from a repo someone else controls. Read it before installing, prefer Markdown-only plugins, pin or review updates, and install at the narrowest scope that works.

**Q: Why not just paste the rules into CLAUDE.md?**
That works for one project, but copies drift. A user-scope plugin applies everywhere and updates in one place. CLAUDE.md is still right for rules about a single repo.

## Go deeper
- Claude Code, Plugins: https://code.claude.com/docs/en/plugins
- The plugin itself: https://github.com/multica-ai/andrej-karpathy-skills
