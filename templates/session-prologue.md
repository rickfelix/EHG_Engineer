# Session Prologue - LEO Protocol v4.2.0 - Story Gates & Automated Release Control v4.2.0_story_gates
*Copy-paste this at session start to align Claude with EHG_Engineer practices*
*Generated: 2025-09-26T14:18:32.015Z*

## 🎯 APPLICATION QUICK REFERENCE
- **Management Dashboard**: `/mnt/c/_EHG/EHG_Engineer/` (YOU ARE HERE - for managing work)
- **Target App for Features**: `/mnt/c/_EHG/ehg/` (IMPLEMENT HERE - actual features)
- **Before ANY implementation**: `cd /mnt/c/_EHG/ehg` then verify with `pwd`
- **GitHub Repos**: EHG_Engineer.git (dashboard) vs ehg.git (app)

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

## 🛡️ Pre-Session Validation (NEW - MANDATORY)

**Run BEFORE starting any SD work:**

```bash
# Validate LEO Protocol database schema
node scripts/validate-leo-schema.js
```

This checks:
- ✅ Handoff tables exist with correct schema
- ✅ Strategic directives table is accessible
- ✅ Sub-agent configuration is loaded
- ✅ Environment variables are set

**If validation fails:**
- Red warnings (❌) = Use fallback handoff methods
- See: `docs/handoff-resilience-guide.md` for recovery steps
- Handoff fallback: Use git commit messages with 7 elements

**Handoff Table Check:**
```bash
node scripts/check-handoff-tables-new.mjs
```

Returns: `handoff_tracking` (preferred) or `leo_sub_agent_handoffs` (legacy) or null (use git)

---
*Remind Claude: Validate schema first, follow database-first, keep PRs small, use sub-agents, create resilient handoffs*