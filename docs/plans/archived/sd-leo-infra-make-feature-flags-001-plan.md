<!-- Archived from: C:/Users/rickf/AppData/Local/Temp/_flagresilience_plan.md -->
<!-- SD Key: SD-LEO-INFRA-MAKE-FEATURE-FLAGS-001 -->
<!-- Archived at: 2026-06-09T22:01:35.890Z -->

# Make feature flags un-forgettable: mandatory enrollment + intended-state + stale-OFF nag

## Type
infrastructure

## Priority
high

## Summary
We ship new automation behind off-by-default flags (a sound safe-rollout pattern), but we repeatedly forget to turn them back on — so the automation silently never runs. Live proof (2026-06-09): the review-cadence flags (ADAM_SELF_SCORE_CADENCE, COORD_REVIEW_EVERY) and the governance-heartbeat flag (ADAM_GOVERNANCE_HEARTBEAT_V1) are all sitting OFF and forgotten. A feature-flag governance system was shipped 2026-06-08 (leo_feature_flags + a scheduled stale-flag review job + a /flags command), but nothing FORCES new flags to be enrolled in it, and several live flags are plain env-vars that aren't tracked at all. This SD closes the "ship-it-off-and-forget" trap the operator has flagged repeatedly.

## Scope
- MANDATORY ENROLLMENT: a guard/gate (extend the existing flag-governance + a pre-commit/CI lint) that blocks introducing a NEW flag — env-var OR leo_feature_flags row — unless it is registered with: an owner, a purpose, an intended STEADY-STATE (on/off), and, if shipped OFF-but-meant-to-be-ON, a review/enable date.
- STALE-OFF NAG: extend the existing scheduled stale-flag review job to actively surface (to the coordinator + chairman) any flag that is OFF past its intended-on date — escalating, not silent.
- RETROACTIVE ENROLLMENT: enroll the current orphan flags (ADAM_SELF_SCORE_CADENCE, COORD_REVIEW_EVERY, ADAM_GOVERNANCE_HEARTBEAT_V1, and any other ungoverned env-flags) with their intended steady-states so they stop falling through the cracks.
- SURFACING: /flags (and optionally the coordinator/adam startup print) shows "OFF but should be ON (past intended date)" so a human sees forgotten switches at a glance.

## Source
Operator-canonical concern (raised repeatedly, restated 2026-06-09): "we might turn things off by default and then forget to turn them back on — we need a more resilient process to remember." Builds on the shipped leo_feature_flags governance (SD-LEO-INFRA-ACTIVATE-FEATURE-FLAG-001, 2026-06-08); the gap is mandatory enrollment + intended-state tracking + stale-OFF escalation. Reuse-first: extend the existing governance, do NOT build a parallel system.

## Risks
- The enrollment gate could block legitimate quick flag changes if too strict. Mitigation: allow a fast inline registration (one command) so the gate is a speed-bump, not a wall.
- Retroactive enrollment must not auto-FLIP any flag — it only registers intended-state + surfaces the gap; flipping a flag on stays a deliberate (SD/operator) action.
- The stale-OFF nag must dedupe so it doesn't spam every cycle (escalate once, then track).
