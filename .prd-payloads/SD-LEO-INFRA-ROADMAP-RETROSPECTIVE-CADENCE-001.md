# Roadmap-anchored retrospective on an SD-cohort cadence (Adam-led, scheduled)

## Type
infrastructure

## Target Repos
EHG_Engineer

## Summary
Chairman-directed 2026-07-17: Adam runs a periodic retrospective AGAINST the roadmap plan-of-record as a standing governance duty — the plan-adherence discipline (does the plan predict what actually happens). Chairman rejected a wave-gate cadence as too coarse (~5 waves, hundreds of SDs each) and directed an SD-frequency / ~3-4-day cadence. Solomon adjudicated the parameters (verdict be825042 / ledger a32e4fb7, confidence high on the mechanism): the retro grades roadmap ANCHORS (predicted vs actual movement) over a windowed cohort of completed SDs, and prediction-error-must-decrease is the loop-KPI.

## Functional Requirements
### FR-1: Cohort trigger (day-close, count-based)
Fire a retro when N SDs have completed since the last retro, evaluated at DAY-CLOSE only (so no cohort boundary lands mid-burst). DEFAULT N=80 with a 4-day backstop (fire on whichever comes first). N is a tuned parameter in config, not a constitution line.
### FR-2: Anchor-unit grading (not cohort-unit)
The cohort defines the WINDOW (which completions are in scope); roadmap ANCHORS define the ROWS graded. Anchors touched by cohort SDs get predicted-vs-actual delta; untouched anchors are omitted or listed no-movement-expected (carry the rollup honesty rule — null-with-reason, never fabricated). Do NOT grade "did these N SDs succeed" (that's execution grading the per-SD retros already own).
### FR-3: Prediction source = windowed forward-list union
The retro grades actual movement against the UNION of persisted forward-list commitment snapshots (plan-check-forward-list-*) inside the cohort window (a ~3-4-day cohort spans ~1.5 PLAN CHECK windows). Build this as a query over existing anchor persistence, not an ad-hoc re-derivation.
### FR-4: Cycle-2 self-recalibration rule
After cycle 2: if >~half the touched anchors show measurable movement per cohort, halve N toward 40; if two consecutive cycles are attest-only (no measurable movement), raise N toward 120. The loop-KPI (prediction-error must decrease) is the arbiter — N is empirical, not doctrinal.
### FR-5: Output contract + anti-theater + loop-KPI
Keep the five-part output contract; Adam-led async with coordinator reason-band attestation as data; deltas PROPOSED never ratified (propose-only); anti-theater decision-surface binding; the prediction-error-must-decrease loop-KPI as the retro's own success gate. Waves demoted to cohort annotations (waves-as-gates stays the ratification structure; retro cadence decouples).

## Success Metrics
- metric: retro fires on N-completions-at-day-close or 4-day backstop; target: yes (no mid-burst boundaries)
- metric: prediction-error trend across cycles; target: decreasing (loop-KPI)
- metric: fabricated anchor movement; target: 0 (null-with-reason)

## Smoke Test Steps
1. instruction: Simulate 80 completed SDs across 3 days, run the day-close trigger; expected_outcome: one retro fires grading touched anchors vs the windowed forward-list union.
2. instruction: Run two attest-only cycles; expected_outcome: recalibration raises N toward 120.

## Sizing / Notes
Tier 3 (governance mechanism, plan-of-record). Solomon-adjudicated (reasoning done — be825042); COORDINATOR review for the reason-band attestation wiring. Relates SD-LEO-INFRA-DISTILL-ROADMAP-SINGLE-WRITER-001 (retro must grade a single-writer plan — sequence after/with it) + SD-LEO-ORCH-ADAM-PLAN-KEEPER-001 (keeper duty). Chairman decision pending on the DEFAULT N (recommendation-with-default: N=80/4-day/day-close/cycle-2-recalibrate).
