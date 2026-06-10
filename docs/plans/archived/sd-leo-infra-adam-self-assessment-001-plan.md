<!-- Archived from: .worktrees/SD-LEO-INFRA-ENABLE-WIRE-AUTOMATIC-001/.followups/adam-self-assessment-writer.md -->
<!-- SD Key: SD-LEO-INFRA-ADAM-SELF-ASSESSMENT-001 -->
<!-- Archived at: 2026-06-09T23:01:07.430Z -->

# Adam self-assessment writer + turn-counter (consumes the verify-score contract)

## Type
infrastructure

## Priority
high

## Summary
Build the missing Adam self-assessment WRITER. Today ADAM_SELF_SCORE_CADENCE is registered but has ZERO runtime consumer and there is NO code that writes Adam's per-dimension self-score (the single live adam_self_assessment row was hand-authored). Deferred child of SD-LEO-INFRA-ENABLE-WIRE-AUTOMATIC-001, which shipped the verify-score-contract enforcement primitive at lib/fleet/verify-score-contract.mjs.

## Scope
- NEW Adam self-assessment writer (~250-400 LOC) scoring Adam on the canonical 8 dimensions (D1_proactive_sourcing..D8_interface_clarity per leo_protocol_sections id=601), sourcing the observable signals, writing a feedback row (category=adam_self_assessment) with the common score schema (dimensions + committed_actions + prior_action_outcomes).
- Turn-counter infrastructure (does not exist; session-tick only heartbeats) to fire the writer about every ADAM_SELF_SCORE_CADENCE turns.
- REUSE lib/fleet/verify-score-contract.mjs to validate the score before write.
- Do NOT flip the cadence flag on here (that is the live-enablement child).

## Success Metrics
- The Adam writer produces a valid adam_self_assessment row scored on the 8 dimensions, validated by the verify-score contract before write.
- A turn-counter fires the writer on the ADAM_SELF_SCORE_CADENCE cadence.

## Risks
- Large net-new surface; expensive signal sourcing. Mitigation: lightContext/isolated run; reuse the existing feedback pipeline + the shipped verify-score-contract lib.
