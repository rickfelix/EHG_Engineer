# Post-merge automation vs worker LEAD-FINAL claim window — race fix

## Type
bugfix

## Target Repos
EHG_Engineer

## Summary
Coordinator-verified (Charlie hit it x2), belt-low #3 remainder 2026-07-17: post-merge automation and a worker's LEAD-FINAL claim window race. The post-merge automation acts on an SD around the same moment a worker holds/attempts the LEAD-FINAL claim, producing a lost-update or a claim that lands against already-mutated state. Recurrence (x2, one worker) marks it a real reachability race, not a one-off.

## Functional Requirements
### FR-1: Ground-truth the race window first
Reproduce/trace the exact interleaving: identify the post-merge automation entry point and the LEAD-FINAL claim path, and pinpoint the shared row/state both mutate (SD status/phase, claim row, or handoff row) without a guard. Confirm against live logs from Charlie's two occurrences before designing the fix (do not patch a hypothesized window).
### FR-2: Serialize or fence the window
Close the race with the minimal correct mechanism — an atomic compare-and-set on the contended transition (claim only succeeds if phase is still the expected pre-automation value), or an advisory lock around the LEAD-FINAL claim + post-merge mutation. No sleep/retry band-aid; the guard must make the losing side observe the winner's state and act correctly (re-read, not clobber).
### FR-3: Regression test
Add a test that drives the two operations concurrently against the contended row and asserts exactly one wins and the loser re-reads rather than lost-updates. The test must fail against the pre-fix code path.

## Success Metrics
- metric: lost-update/claim-against-stale-state incidents post-fix; target: 0
- metric: concurrent-path regression test present and red-before/green-after; target: yes

## Smoke Test Steps
1. instruction: Run the concurrency regression test; expected_outcome: one operation wins, the other observes updated state, no lost update.
2. instruction: Replay Charlie's interleaving from logs against the fixed path; expected_outcome: deterministic correct resolution.

## Sizing / Notes
Tier 2-3. DISPATCH-MECHANISM (touches the LEAD-FINAL claim path) → coordinator-reviewed for tiering before dispatch (the coordinator surfaced it, so review is implicit; set min_tier_rank deliberately). Premise coordinator-verified; FR-1 still confirms against live logs. Wave-1 foundation reliability.
