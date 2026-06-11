<!-- Archived from: C:/Users/rickf/Projects/_EHG/_plan-block-claims-finish.md -->
<!-- SD Key: SD-LEO-INFRA-SHIP-UNMERGED-LAYERS-001 -->
<!-- Archived at: 2026-05-31T15:40:59.148Z -->

# Ship the unmerged layers of BLOCK-CLAIMS-CANCELLED (FR-1 claim-guard refusal + FR-5 migration 393 PG trigger) — SD marked completed but PR #3672 never merged

<!-- target_application: EHG_Engineer -->

## Type
infrastructure

## Priority
high

## Target Application
EHG_Engineer

## Goal
Close a partial-phantom-completion safety gap. SD-LEO-INFRA-BLOCK-CLAIMS-CANCELLED-001 is status=completed (2026-05-10) with a "three-layer defense-in-depth against cancelled-SD claims," but its delivery PR #3672 was never merged (head commit a9e14beaa1 is not an ancestor of origin/main; PR is CONFLICTING/DIRTY, 21+ days stale). Verify-vs-origin-main shows the defense is only PARTIALLY live: FR-2 (lib/claim-validity-gate.js sd_cancelled / ClaimIdentityError — present, 12 refs), FR-3 (scripts/cancel-sd.js is_working_on sweep — present), and FR-7 (scripts/session-check-concurrency.js import.meta.url guard — present) appear on main, but FR-1 (lib/claim-guard.mjs pre-acquire status='cancelled' refusal — NO 'cancelled' handling on main), FR-5 (database/migrations/393_enforce_no_claim_on_cancelled_sd.sql — ABSENT), and FR-6 (tests/unit/harness/block-claims-cancelled.test.js — ABSENT) are NOT live. So the first claim-guard layer and the DB-level fail-closed trigger are missing; a session can still acquire a claim on a cancelled SD past the gate layer.

## Objectives
- Re-establish FR-1: add the pre-acquire status='cancelled' refusal + distinct sd_cancelled banner to lib/claim-guard.mjs (per PR #3672, adapted to current main).
- Re-establish FR-5: the BEFORE-UPDATE Postgres trigger (migration 393) that refuses claim transitions (is_working_on/claimed_by) on cancelled SDs. Route the migration through database-agent; apply via the sanctioned migration path; test the trigger's refusal AND its fallback branch on a rolled-back transaction before shipping.
- Re-establish FR-6: source-pin tests for the claim-guard refusal + a static guard for is_working_on=true writers.
- Decide the disposition of PR #3672: either rebase + re-validate + merge it, or supersede it with a fresh PR from this SD and close #3672 with a pointer. Do NOT blind-merge #3672 (stale, conflicting, carries an unapplied shared-DB migration).

## Risks
- Shared-DB fail-closed trigger: a malformed trigger could block legitimate claim writes fleet-wide. Mitigate per the venture-lifecycle lesson — cast enums to text before COALESCE with string literals, test the fallback/NULL branch, apply via database-agent with a rolled-back behavioral verify first.
- Fleet is active (a sibling session is working SD-LEO-FEAT-STAGE-REPLIT-DEPLOYMENT-001); coordinate the migration apply for a quiet window. The code-side FR-1/FR-6 changes are isolated-worktree-safe.

## Acceptance
- lib/claim-guard.mjs refuses to claim a status='cancelled' SD with a distinct sd_cancelled reason/banner.
- Migration 393 trigger is applied and verified: a direct UPDATE setting is_working_on=true on a cancelled SD is refused; legitimate claims on active SDs still succeed; the NULL/fallback branch does not throw.
- New tests pass and pin the FR-1 behavior; full harness regression green.
- PR #3672 is resolved (merged-after-rebase or closed-as-superseded with a reference to this SD).

## Files
- lib/claim-guard.mjs | MODIFY | Add pre-acquire status='cancelled' refusal + sd_cancelled banner (FR-1)
- database/migrations/393_enforce_no_claim_on_cancelled_sd.sql | CREATE | BEFORE-UPDATE PG trigger refusing claim transitions on cancelled SDs (FR-5, via database-agent)
- tests/unit/harness/block-claims-cancelled.test.js | CREATE | Source-pin tests for FR-1 refusal + is_working_on writer static guard (FR-6)
