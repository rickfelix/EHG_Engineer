# Session Prologue - LEO Protocol v4.4.1
*Copy-paste this at session start to align Claude with EHG_Engineer practices*
*Generated: 2025-12-03T23:21:50.817Z*

## Operating Mode

At SessionStart, `scripts/hooks/session-role-orient.cjs` emits a `[ROLE]` block naming your role and channel:
- **SOLO** — no active coordinator. Canonical pause points apply. Fall through to `/leo assist` Phase 1 when `/leo next` returns no workable SD under AUTO-PROCEED=ON.
- **WORKER** — under coordinator. `/signal <type> "<body>"` when recurrence (gate 2×, RCA 2×, tool 3×) | bypass intent | spec/PRD friction | harness-bug recognized | memory-trend match.
- **COORDINATOR** — drain worker signals via `/coordinator inbox`. 3+ matching signals within 60min auto-promote to feedback (category=harness_backlog).

If you don't see a `[ROLE]` line at session start, the hook is unregistered or failed silently — check `.claude/settings.json` and run `echo '{"session_id":"<uuid>"}' | node scripts/hooks/session-role-orient.cjs` to probe.

## Core Directives

1. **Follow LEAD→PLAN→EXEC workflow** - Target ≥85% gate pass rate for all phases
2. **Activate sub-agents** - Architect (design/boundaries), QA (tests/coverage), Reviewer (PR checks). Summarize outputs concisely
3. **Database-first artifacts** - No markdown files as source of truth; use DB tables for PRDs, handoffs, retros
4. **Small PRs only** - Keep diffs ≤100 lines per change; split larger work into increments
5. **7-element handoffs** - Required for all phase transitions: Executive Summary, Completeness Report, Deliverables Manifest, Key Decisions & Rationale, Known Issues & Risks, Resource Utilization, Action Items
6. **Priority-first approach** - Use `npm run prio:top3` to justify work selection

## Slash Commands Cheatsheet

- `/plan` - Outline implementation steps and files to change
- `/implement <ticket>` - Execute with code, tests, and handoff
- `/review pr:<#>` - Apply rubric: correctness, tests, types, a11y, perf, security
- `/test changed` - Run focused tests on modified code

## Quick Checks

- `npm run sd:next` - **START HERE** - Intelligent SD queue showing what to work on next
- `npm run prio:top3` - View current top 3 priorities with WSJF scores
- `npm run sd:status` - Progress vs baseline with variance analysis
- `npm run sd:burnrate` - Velocity metrics and completion forecasting

## Session Start Workflow

1. Run `npm run sd:next` to see the SD queue
2. If SD marked "CONTINUE" → Resume that SD
3. If no active SD → Pick highest-ranked READY SD
4. Load CLAUDE_LEAD.md for approval workflow

---
*Remind Claude: Follow database-first, keep PRs small, use sub-agents, create handoffs*