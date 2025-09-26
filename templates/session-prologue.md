# Session Prologue - LEO Protocol v4.2.0 - Story Gates & Automated Release Control v4.2.0_story_gates
*Copy-paste this at session start to align Claude with EHG_Engineer practices*
*Generated: 2025-09-26T14:18:32.015Z*

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

- `npm run prio:top3` - View current top 3 priorities with WSJF scores
- `npm run docs:boundary` - Regenerate DO/DON'T boundary patterns
- `node scripts/check-deps.js` - Verify dependency policy compliance
- `node scripts/query-active-sds.js` - List active strategic directives

---
*Remind Claude: Follow database-first, keep PRs small, use sub-agents, create handoffs*