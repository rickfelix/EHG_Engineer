# Brainstorm: PRD User Stories Table Enforcement

## Metadata
- **Date**: 2026-03-14
- **Domain**: Protocol
- **Phase**: Design
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Board of Directors (6/6 seats)
- **Chairman Review**: 3 items reviewed, 3 accepted, 0 flagged, 0 research-needed
- **Related Ventures**: None (internal LEO protocol tooling)

---

## Problem Statement

When sub-agents create PRDs via direct Supabase insert (bypassing `scripts/prd/index.js`), user stories get embedded in the PRD's JSONB content/metadata instead of being written to the separate `user_stories` table. The PRD quality gate passes at 100/100 (it doesn't check for stories), but the PLAN-TO-EXEC handoff fails on `userStoryQualityValidation` with "No user stories found in PRD or user_stories table."

The `product_requirements_v2` table doesn't have a `user_stories` column — stories must go in the `user_stories` table with `prd_id` and `sd_id` foreign keys. The PRD creation process has a two-step requirement that isn't enforced or documented:
1. Create the PRD in `product_requirements_v2`
2. Create stories in `user_stories` with matching `prd_id` and `sd_id`

The `autoTriggerStories()` function in `scripts/modules/auto-trigger-stories.mjs` handles step 2 and is called from `scripts/prd/index.js`, but sub-agents bypass this entirely.

## Discovery Summary

### Current Architecture
- `autoTriggerStories()` already exists and works — generates stories via LLM (opus tier) and inserts into `user_stories` table
- `scripts/prd/index.js` calls `autoTriggerStories()` after PRD creation — the canonical path works
- `gate-1-plan-to-exec.js` checks BOTH `prd.user_stories`/`prd.content.user_stories` AND the `user_stories` table
- `user_stories` table has strict constraints: `story_key` format `NNN:US-NNN`, `implementation_context` min 10 chars, priority must be `'critical'`

### Chosen Fix Approach
- **Enforce script path**: Always use `add-prd-to-database.js` (which calls `autoTriggerStories()`)
- **Improve gate error message**: Distinguish "no stories at all" from "stories in wrong location"
- **Document the two-step requirement**: Add to CLAUDE.md and memory
- **Keep dual-check**: Gate continues checking both JSONB and table (defense in depth)
- **One-time migration script**: Extract stories from existing PRD JSONB into `user_stories` table
- **Escalation path**: If bypass recurs, escalate to a DB trigger on `product_requirements_v2`

## Analysis

### Arguments For
- **Eliminates a recurring pipeline blocker**: Every sub-agent PRD creation hits this failure
- **Low implementation cost**: ~70-110 LOC across 4 files, Tier 2 QF scope
- **Uses existing infrastructure**: `autoTriggerStories()` already works, just needs to be reliably invoked
- **Compound value**: Better error messages benefit ALL future gate failures, not just this one
- **Fast ROI**: CFO estimates payback within one week of operation

### Arguments Against
- **Prompt compliance is weak enforcement**: Sub-agents can still bypass the script path (CRO concern)
- **Dual-check safety net can mask the root problem**: If gate reads from JSONB, it legitimizes the bypass path
- **Migration script needs careful constraint handling**: `user_stories` table has strict check constraints that naive extraction will violate

## Protocol: Friction/Value/Risk Analysis

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Friction Reduction | 8/10 | Current friction is HIGH (every sub-agent PRD hits this). Wide breadth (affects all SDs through PLAN). |
| Value Addition | 7/10 | Direct: eliminates recurring handoff failures. Compound: better errors help all gate failures. |
| Risk Profile | 3/10 | Low breaking change risk (additive). Low regression risk (existing flows unaffected). |
| **Decision** | **Implement** | (8 + 7) = 15 > (3 * 2) = 6 |

## Board of Directors Deliberation

### Round 1: Board Positions

| Seat | Standing Question | Position Summary |
|------|------------------|-----------------|
| CSO | Does this move EHG forward or sideways? | Forward — eliminates throughput bottleneck, compound value from constraint enforcement. Ship convention fix, escalate to trigger only if bypass recurs. |
| CRO | What's the blast radius if this fails? | HIGH risk on prompt compliance — prompt-based enforcement is fundamentally weak. Advocates DB-level guard (trigger/constraint). Migration script needs idempotency and dry-run. |
| CTO | What do we already have? What's the real build cost? | Technically sound, ~70-110 LOC across 4 files. Audit autoTriggerStories() prompt for constraint compliance. Low complexity. |
| CISO | What attack surface does this create? | Security-neutral — no new API surfaces, no new auth, no schema changes. Migration is internal data normalization. |
| COO | Can we actually deliver this given current load? | Yes — Tier 2 QF, single session delivery, minimal disruption to in-flight SDs. Migration needs dry-run mode. |
| CFO | What does this cost and what's the return? | Strong ROI — ~50-120 LOC one-time cost vs. ~3-5 failed handoffs/week saved. Pays for itself in days. |

### Judiciary Verdict
- **Board Consensus**: 5/6 seats agree — ship the convention fix immediately as Tier 2 QF
- **Key Tensions**: CRO dissents on enforcement strength — prompt compliance is unreliable. CSO proposes compromise: ship now, escalate to DB trigger if bypass recurs.
- **Recommendation**: Implement Option A (enforce script path) with improved error messaging and migration script. Monitor bypass rate. Escalate to DB trigger if sub-agents continue to bypass.
- **Escalation**: No — chairman override not needed. CRO's concern is documented as a monitored escalation path.

## Open Questions
- Should `autoTriggerStories()` be extractable as a standalone script for independent invocation?
- What is the actual bypass rate — how many existing PRDs have JSONB-only stories?
- Should the DB trigger escalation be pre-designed now (even if not implemented)?

## Suggested Next Steps
- Create SD for the enforcement fix (Tier 2 QF or full SD depending on final LOC)
- Migration script with dry-run mode to clean up existing PRDs
- Update CLAUDE.md with two-step PRD requirement documentation
- Monitor for bypass recurrence post-fix
