<!-- Archived from: C:/Users/rickf/AppData/Local/Temp/_reviewloop_plan.md -->
<!-- SD Key: SD-LEO-INFRA-ENABLE-WIRE-AUTOMATIC-001 -->
<!-- Archived at: 2026-06-09T22:01:33.639Z -->

# Enable + wire the automatic tri-party review loop, with the enforced "verify it stuck" step

## Type
infrastructure

## Priority
high

## Summary
The self-improvement loop across coordinator + Adam + workers is designed but only half-running. Evidence (2026-06-09): the coordinator<->Adam bidirectional review fires (manually), but the scheduled cadence switches are OFF (ADAM_SELF_SCORE_CADENCE, COORD_REVIEW_EVERY), Adam's last self-score is ~30h stale, and the worker fleet-retro last ran ~2.5 days ago. Critically, NOBODY does the loop's final step: at the next score, verify the PRIOR committed actions actually landed and the dimension moved (prior_action_outcomes is empty on every recent review row). So the loop is grade -> commit -> act, but never grade -> ... -> VERIFY — which is exactly how a self-improvement loop quietly becomes a vanity metric.

## Scope
Turn the loop ON, on a schedule, AND enforce the verify step — for all three roles.
- ENABLE THE CADENCE: wire ADAM_SELF_SCORE_CADENCE (Adam self-scores ~every N turns) and COORD_REVIEW_EVERY (coordinator self-reviews every N completed SDs) so the reviews fire automatically, not only when someone remembers. The deliverable is the loop RUNNING, not left behind an off flag.
- RESTORE THE WORKER FLEET-RETRO to a schedule (last ran ~2.5d ago) — a periodic fleet-wide "what worked / what didn't" that feeds the same feedback/issue_patterns pipeline.
- ENFORCE THE VERIFY STEP (the core fix): in the scoring path (coordinator-self-review.mjs + the Adam self-assessment writer), every new score MUST populate prior_action_outcomes for the previous cycle's committed_actions (did each land? did the dimension move?). A score that has below-threshold dimensions but NO committed_actions is INVALID (already mandated in the contract — enforce it in code). A score that fails to verify the prior cycle's actions is flagged INVALID / blocks until it does. Escalate to the operator when a dimension stays below-threshold N cycles despite committed actions.
- ENROLL the cadence flags in the feature-flag governance (pairs with the flag-resilience SD) so they can't be silently turned off and forgotten again.

## Source
Adam diagnosis 2026-06-09 (chairman-directed). Live evidence: coordinator_review rows have committed_actions but zero prior_action_outcomes; adam_self_assessment is a single 30h-old row; fleet_retro last 62h ago; cadence flags unset. Per CLAUDE_ADAM.md the runtime cadence wiring is an explicitly-tracked follow-up gated by these flags.

## Risks
- Enabling auto-cadence could add review noise if N is too low. Mitigation: tune N (turns/SDs) conservatively; silence-by-default on no-change cycles.
- The verify-step enforcement must not hard-block real work — scope the INVALID-score gate to the review artifact itself, not to SD handoffs.
- Restoring the worker fleet-retro must reuse the existing retro-agent + feedback/issue_patterns pipeline (do NOT build a parallel one).
