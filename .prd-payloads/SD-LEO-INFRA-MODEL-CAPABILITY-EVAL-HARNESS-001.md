# Model-capability EVAL harness — reality-graded reference table for token-effective model routing

## Type
infrastructure

## Target Repos
EHG_Engineer

## Summary
Chairman-directed 2026-07-17 ("create an Eval for EHG... token-effectively within my Max plans... build a reference table"), Solomon-specified as hand-off #2 item 1 (ledger 4eb2b4ab; full spec = Part 4 of docs/design/solomon-fable-capability-grounding.md @ 75d8cf8e333). Build a `model_capability_reference` table keyed (problem_shape R1-R5 + mechanical-baseline, model, effort) → {clears_bar, quality_score, tokens, wall_clock, cost_norm, graded_at}, driven by golden task sets ANSWER-KEYED FROM ALREADY-ADJUDICATED HISTORY — resolving the "knowing what good looks like" blocker with reality-graded keys. Consumes the sealed Fable-5 baselines (QF-SEAL-FABLE5-GOLDEN-TASK-BASELINES-001, which must ship first).

## Functional Requirements
### FR-1: model_capability_reference table + keys
Table keyed (problem_shape, model, effort). Golden task sets per shape, answer-keyed from adjudicated history (loops=R2, claim-race roots=R4, ratified reversals=R5, venture/pricing picks=R3, merged QFs=mechanical). Keys DB-SIDE only (contamination guard).
### FR-2: Scoring — pairwise + cost-normalized, fresh-context
Pairwise + cost-normalized scoring; fresh-context grading (grader never sees the candidate's own reasoning as authority). Split-verb: a deep tier designs/grades borderline cases, cheap seats run the bulk.
### FR-3: Regression rerun + binding gate
Regression-rerun on every model / pricing / limits change. GT gate: the eval must reproduce >=1 known result before its table binds any routing decision. First real run = Opus 5 GA vs the sealed Fable-5 baselines.
### FR-4: Routing consumption (single doctrine)
The table is the SINGLE routing-doctrine source — the Foresight Board §17 routing (hand-off #3) and dispatch tiering both CONSUME it; no second routing doctrine.

## Success Metrics
- metric: routing decisions grounded in reality-graded scores vs guesswork; target: table-bound
- metric: answer-key contamination in-repo; target: 0
- metric: eval reproduces >=1 known result before binding; target: yes

## Smoke Test Steps
1. instruction: Run the harness on a shape with a known-adjudicated key; expected_outcome: reproduces the known result, then scores candidates pairwise + cost-normalized.
2. instruction: Change a model/pricing input and rerun; expected_outcome: regression rerun updates the table.

## Sizing / Notes
Tier 3 (decompose at sourcing). Chairman-directed + Solomon-specified (Part 4). SEQUENCE AFTER the Fable-baseline seal (QF-SEAL-FABLE5-...); consumes it. COORDINATOR review for decomposition + sequencing. Feeds the Fable-suitability-map un-defer (hand-off #2 item 2) + Foresight Board routing (hand-off #3).
