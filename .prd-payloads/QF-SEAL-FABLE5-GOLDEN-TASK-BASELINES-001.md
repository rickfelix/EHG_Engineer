# TIME-CRITICAL — seal Fable-5 golden-task baselines before the Fable window closes (~2026-07-19)

## Type
infrastructure

## Target Repos
EHG_Engineer

## Summary
Solomon chairman-approved Mode-C hand-off #2 item 3 (ledger 4eb2b4ab): HARD DEADLINE ~2026-07-19 — chairman intel says Fable subscription access ends ~Jul 19 and Opus 5 is imminent (successor ~Aug). Run the model-eval golden tasks (Part 4 of the Fable-capability-grounding finding, docs/design/solomon-fable-capability-grounding.md @ 75d8cf8e333) on **Fable 5 THIS window** and persist sealed answers/scores DB-side, so Opus 5 (and later models) can be graded against a real Fable-5 reference AFTER the window is gone. After 07-19 these baselines become UNGENERATABLE — this is the small, deadline-bearing precursor to the full eval harness (item 1), and must ship FIRST.

## Functional Requirements
### FR-1: Golden-task set (from the finding's Part 4)
Assemble the Part-4 golden tasks, answer-keyed from already-adjudicated history (known-open loops=R2, verified claim-race root causes=R4, ratified reversals=R5, chairman-ratified venture/pricing picks=R3, merged QFs=mechanical). Keys stored DB-SIDE only (contamination guard — never in-repo).
### FR-2: Run on Fable 5 + persist sealed baselines
Execute the golden tasks on Fable 5 within the current window; persist per-task {clears_bar, quality_score, tokens, wall_clock, cost_norm, graded_at, model='fable-5', sealed=true} to a DB table (the model_capability_reference shape from item 1, or a sealed-baseline table item 1 later reads). Fresh-context grading. This is a RUN + PERSIST, not the full harness.
### FR-3: Ground-truth gate
The run must reproduce >=1 known-adjudicated result before its numbers are trusted as a baseline (GT self-check).

## Success Metrics
- metric: Fable-5 sealed baselines persisted before ~2026-07-19; target: yes (deadline)
- metric: answer keys leaked in-repo; target: 0 (DB-side only)
- metric: baseline reproduces >=1 known result; target: yes (GT gate)

## Smoke Test Steps
1. instruction: Run the golden set on Fable 5, query the sealed-baseline rows; expected_outcome: per-task scored rows persisted with model='fable-5', sealed=true.
2. instruction: Check a known-adjudicated task's graded result; expected_outcome: matches the known answer (GT reproduced).

## Sizing / Notes
Tier 2, TIME-CRITICAL (hard external deadline ~2026-07-19 — CHAIRMAN-FLAGGED). Precursor to SD (model-eval harness, hand-off #2 item 1) — sequence FIRST; item 1 consumes these baselines (Opus-5-vs-Fable-5 first run). Solomon-diagnosed, chairman-approved. Fable-window doctrine applies (run on Fable during the window). Board-track immediately.
