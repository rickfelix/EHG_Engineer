<!-- Archived from: C:/Users/rickf/AppData/Local/Temp/adam-plans/selfassess-canonicalize.md -->
<!-- SD Key: SD-LEO-INFRA-CANONICALIZE-TRI-PARTY-001 -->
<!-- Archived at: 2026-06-08T15:03:54.730Z -->

# Canonicalize the tri-party self-assessment rubric + a NON-OPTIONAL grade-to-action-to-verify improvement loop into the role contracts

## Type
infrastructure

## Priority
high

## Summary
The coordinator and Adam are standing up role self-assessment rubrics (work-triggered for the coordinator via coordinator-self-review.mjs every 8 completed SDs; turn-triggered for Adam every ~10 turns) that feed the bidirectional tri-party review (worker COORDINATOR-FEEDBACK + Adam ADAM-COORD-FEEDBACK). Both converged 2026-06-08 on a shared per-dimension shape (good / failure / observable-signal / data-source / 1-5 anchor + hard red-flags). But a score is only worth the action it forces: today the existing review merely PRINTS an advisory "cluster -> adjust + source fixes as SDs -> digest operator" step, untracked, and it was dormant (1 coordinator_review row ever, 0 Adam rows). This SD canonicalizes the rubrics into the role contracts AND makes the grade-to-action-to-verify loop an explicit, NON-OPTIONAL part of the design, so self-scoring drives real improvement instead of becoming vanity measurement (the same forget-it failure mode as the dormant review and the unregistered flag).

## Root Cause
Scoring without an enforced commit-and-verify step is measurement theater. The current design stops at suggestions (top_2_improvements / an advisory print), with no record of committed actions and no check that the next cycle score actually moved. A dimension can stay broken indefinitely while each cycle claims it "identified improvements."

## Success Criteria
- Adam self-assessment rubric canonicalized into the Adam Role Contract (leo_protocol_sections id=601 -> regen CLAUDE_ADAM.md/_DIGEST); coordinator rubric canonicalized into coordinator.md, both in the SHARED shape (1-5 anchors + hard red-flags = auto-fail boundary violations).
- A COMMON score schema is fixed: {dimension, score 1-5, evidence, overall, biggest_strength, top_2_improvements, committed_actions, prior_action_outcomes} so the tri-party review renders coordinator + Adam side-by-side.
- The grade-to-action-to-verify loop is documented as MANDATORY (see Scope FR-6) - a score with any below-threshold dimension and NO committed action is itself a red-flag.
- Both self-scores feed coordinator-self-review.mjs (Adam -> ADAM-COORD-FEEDBACK / category coordinator_adam_review gated COORD_ADAM_REVIEW_V1; coordinator -> COORDINATOR-FEEDBACK).
- Self-score cadence flags registered in leo_feature_flags (owner + expiry) so neither mechanism becomes the next dormant flag.

## Scope
- FR-1 Adam rubric -> id=601 (regen CLAUDE_ADAM.md/_DIGEST; never hand-edit generated files).
- FR-2 Coordinator rubric -> coordinator.md, re-cast to the shared shape.
- FR-3 Common score schema (with committed_actions + prior_action_outcomes fields) used by both roles.
- FR-4 Cadence + persistence: Adam turn-triggered (~10 turns, reuse the autonomous-checkpoint turnCount counter at os.tmpdir()/leo-checkpoints/session-<id>.json) cat=adam_self_assessment; coordinator work-triggered (8 SDs) + ~10-turn live supplement cat=coordinator_review.
- FR-5 Bidirectional feed into coordinator-self-review.mjs (both lanes).
- FR-6 (CENTERPIECE - NON-OPTIONAL) grade-to-action-to-verify loop, mandatory after EVERY score: (a) cluster below-threshold dimensions + red-flags to ROOT CAUSES; (b) COMMIT each gap to a concrete action of the right type - behavior -> memory lesson (Adam) / coordinator.md note (coordinator); tooling/process -> DRAFT SD via the EXISTING retro -> issue_patterns -> /learn -> SD pipeline (do NOT reinvent); protocol/role -> governed SD; (c) RECORD committed_actions on the score row; (d) at the NEXT score VERIFY the prior actions landed AND the dimension moved (prior_action_outcomes); (e) ESCALATE to the operator if a dimension stays below threshold N consecutive cycles despite committed actions. No below-threshold dimension may close with zero committed action.
- FR-7 Anti-forget: register self-score cadence flags (e.g. ADAM_SELF_SCORE_CADENCE) + COORD_ADAM_REVIEW_V1 in leo_feature_flags with owner + expiry (per SD-LEO-INFRA-ACTIVATE-FEATURE-FLAG-001). Dogfood the flag-governance fix.
- FR-8 Governance division: a gated worker applies the id=601 + coordinator.md canonical edits (DOC-001 / CONST-005: Adam and the coordinator never hand-edit role contracts); CLAUDE_ADAM.md is regenerated.

## Notes
- Depends on SD-LEO-INFRA-ARM-CANONICALIZE-WORK-001 (arms coordinator-self-review.mjs that the scores feed) and pairs with SD-LEO-INFRA-ACTIVATE-FEATURE-FLAG-001 (flag registry for the cadence flags).
- LEAD: this is ~8 FRs spanning TWO role contracts + a cross-cutting loop - consider orchestrator decomposition per CONST-014 (Adam-rubric / coordinator-rubric / grade-action-verify-loop / flag-registration as children).
- Governance change to the Adam Role Contract + coordinator.md: operator/chairman-authorized (chairman-directed 2026-06-08).
