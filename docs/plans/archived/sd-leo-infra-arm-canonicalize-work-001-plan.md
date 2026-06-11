<!-- Archived from: C:/Users/rickf/AppData/Local/Temp/adam-plans/tri-party-review-activation.md -->
<!-- SD Key: SD-LEO-INFRA-ARM-CANONICALIZE-WORK-001 -->
<!-- Archived at: 2026-06-08T14:28:52.395Z -->

# Arm and canonicalize the work-triggered tri-party coordinator review + enable the Adam bidirectional lane

## Type
infrastructure

## Priority
high

## Summary
scripts/coordinator-self-review.mjs is fully built — work-triggered every COORD_REVIEW_EVERY completed SDs (default 8), tri-party coordinator-workers-Adam, bidirectional (worker COORDINATOR-FEEDBACK and Adam ADAM-COORD-FEEDBACK reciprocal markers; the Adam lane was built by Child D of SD-LEO-INFRA-ADAM-ROLE-FORMALIZATION-001, FR-4/FR-5). But it is DORMANT. Live 2026-06-08: completed SD count = 2990 but the state file .coord-review-last.json is stuck at 2945 (delta 45, threshold 8) — it should have fired about 5 times and has not, because it is NOT in the canonical coordinator cron set emitted by coordinator-startup-check.mjs, NOT in coordinator.md, NOT in docs/protocol/fleet-coordinator-and-worker-behavior.md, and NOT npm-wired in package.json. On a coordinator restart that re-arms only the documented crons, this review is never re-armed. AND the Adam lane is gated COORD_ADAM_REVIEW_V1 (default-OFF) so coordinator_adam_review has 0 rows ever — the bidirectional lane has literally never run. This SD activates and canonicalizes it.

## Root Cause
The review cron was built but never added to the coordinator standard armed cron set or any canonical doc, so it silently stopped firing and stayed undetected (the state file froze at 2945). The Adam participation flag was left default-OFF and unenrolled in governance, so the bidirectional half never activated.

## Success Criteria
- coordinator-self-review.mjs is added to the canonical coordinator cron set (the 7th standard cron emitted by coordinator-startup-check.mjs) and is auto-re-armed on coordinator restart.
- It is documented in coordinator.md and docs/protocol/fleet-coordinator-and-worker-behavior.md and npm-wired in package.json (WIRE_CHECK reachable).
- COORD_ADAM_REVIEW_V1 is enabled via the leo_feature_flags registry from the sibling flag-governance SD (not a raw .env edit) so the Adam bidirectional lane activates and coordinator_adam_review captures Adam reciprocal feedback.
- The work-gate counter resets correctly; the 45-SD backlog triggers one review on the first armed run; a frozen/stale review counter is now detectable (a health check or the flag-governance stale digest catches it).

## Scope
- Register coordinator-self-review.mjs into coordinator-startup-check.mjs standard-cron emission and arm spec.
- Documentation: coordinator.md cron section + fleet-coordinator-and-worker-behavior.md Adam/review subsection + package.json npm script.
- Enable COORD_ADAM_REVIEW_V1 through the governance registry (depends on the flag-governance activation SD).
- Verify cheap-poller / no-op-below-threshold / idle-teardown behavior so an always-armed cron does not run work during genuine idle.
- Add a guard/health-check so a stuck review counter (delta much greater than threshold with no fire) raises an alert instead of silently freezing.

## Notes
- Pairs with the flag-governance activation SD: that SD enrolls and enables COORD_ADAM_REVIEW_V1; this SD consumes it. Sequence flag-governance first, or co-deliver.
- Do NOT hand-edit CLAUDE_*.md (DB-generated). coordinator.md is hand-authored and editable.
