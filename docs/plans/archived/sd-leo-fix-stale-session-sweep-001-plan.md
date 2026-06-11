<!-- Archived from: C:/Users/rickf/.claude/plans/sd-sweep-claim-lifecycle-residuals.md -->
<!-- SD Key: SD-LEO-FIX-STALE-SESSION-SWEEP-001 -->
<!-- Archived at: 2026-06-09T15:00:55.344Z -->

# stale-session-sweep residuals: purge terminal WORK_ASSIGNMENT rows, grace-window QF-existence race, ignore zombie-tick conflict on unclaimed SDs

## Type
fix

## Priority
medium

## Target Application
EHG_Engineer

## Summary
Three residual claim-lifecycle defects that all live in ONE file, `scripts/stale-session-sweep.cjs`, grouped into a single SD to avoid manufacturing merge conflicts. (1) The sweep INSERTs WORK_ASSIGNMENT rows (around line 1490) but never DELETEs/expires stale ones whose target SD/QF has since gone terminal (completed/cancelled/deferred/escalated); these clutter the channel and re-fire. (2) The sweep's QF-existence check races QF creation — it reads `quick_fixes` before a freshly-claimed QF's INSERT is visible and orphan-releases the claim with "QF-XXX not found in DB" (witnessed 4x: QF-564/255/703/666); needs a grace window (skip release if claim age < ~60s). (3) Zombie `process_ticks` from a dead session with no `claude_sessions` row hold a phantom claim-conflict + WIP_GUARD_CROSS_SIGNAL on a DEFERRED/unclaimed SD; the cross-signal guard should ignore tick-evidence when the SD itself is deferred/unclaimed.

## Scope
Edits confined to `scripts/stale-session-sweep.cjs`: (a) add a terminal-target purge pass that DELETEs/expires WORK_ASSIGNMENT rows whose target SD/QF status is terminal, reusing the existing terminal-status predicate already in the file; (b) add a claim-age grace window to the QF-existence orphan-release path so a recently-claimed QF id absent from `quick_fixes` is treated as PENDING, not orphaned; (c) make the cross-signal/WIP_GUARD conflict path skip tick-evidence when the SD is deferred or has `claiming_session_id IS NULL`. Reuse existing predicates; do not re-implement terminal-status logic.

## Key Principles
- ONE file only — no shared surface with worker-checkin.cjs (its terminal-assignment ACK + isSdInFlight dedup already shipped; do NOT re-touch them).
- Fail-safe: a query error in any new pass must degrade to today's behavior, never throw (the sweep runs every 5 min fleet-wide).
- Reuse the terminal-status predicate already present in the file rather than duplicating it.

## Acceptance
- Stale WORK_ASSIGNMENT rows targeting terminal SD/QF are deleted/expired by the sweep
- A QF claimed within the grace window is NOT orphan-released even if its row isn't yet visible
- A deferred / unclaimed SD with only zombie-tick evidence does NOT raise a claim-conflict or WIP_GUARD_CROSS_SIGNAL
- Existing sweep static/behavioral guard tests still pass; new behavior covered by tests

## Risks
- Over-deletion of live WORK_ASSIGNMENT rows (mitigation: only delete when target status is provably terminal)
- Grace window too long masks a genuine missing-QF orphan (mitigation: bound to ~60s, age-based)
- Suppressing a REAL conflict by ignoring tick-evidence (mitigation: only ignore when the SD is unclaimed/deferred — a real conflict has a non-null live claimant)

## Smoke Test Steps
1. Seed a WORK_ASSIGNMENT targeting a completed SD -> run sweep -> row is gone
2. Claim a QF, run sweep before the QF row commits (simulate) -> claim retained (grace)
3. Seed zombie ticks for a deferred SD with null claimant -> run sweep -> no CONFLICT/WIP_GUARD action

## Success Metrics
- Spurious mid-work claim releases from QF race: target 0
- Stale terminal WORK_ASSIGNMENT rows after a sweep cycle: target 0
- Phantom conflicts on deferred/unclaimed SDs: target 0
