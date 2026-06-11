<!-- Archived from: scripts/one-off/_plan-gate.md -->
<!-- SD Key: SD-LEO-FEAT-CONVERT-STAGE-VISUAL-001 -->
<!-- Archived at: 2026-06-07T16:45:05.550Z -->

# Convert Stage 21 (Visual Assets) into a manual chairman gate — generate briefs, pause for the chairman creative handoff (Continue + optional asset upload), then advance to S22

## Type
feature

## Priority
medium

## Summary
Stage 21 (Visual Assets) currently runs as an AUTOMATED stage (it is not in the chairman-gate set 3,5,10,13,17,18,23,24,25 and its template declares no gate/review mode), so it auto-runs and is meant to auto-advance. Per chairman direction (DataDistill pilot, 2026-06-07), S21 is a HUMAN-IN-THE-LOOP CREATIVE HANDOFF gate: the pipeline generates the visual-asset briefs/storyboards (these stay as textual briefs BY DESIGN — the chairman feeds them into a third-party image/video generation tool), then PAUSES. The chairman reviews the briefs, OPTIONALLY uploads the finished images/videos back into the venture, and clicks Continue to advance to S22. Chairman-selected UX: "Continue + optional upload" (a Continue button always advances; an optional upload attaches final assets).

## Current vs desired
- CURRENT: S21 auto-runs, no pause; (intended to) auto-advance. Not a gate.
- DESIRED: S21 generates briefs ONCE -> enters an "awaiting chairman" blocked state at stage 21 -> chairman Continue advances 21->22; optional final-asset upload persists assets to the venture.

## Scope (cross-repo: EHG_Engineer + EHG)
- EHG_Engineer (gate/runtime): add S21 to chairman-gate handling in the stage-execution-worker (or a new `creative_handoff` gate type) so that after S21 emits its briefs it creates a PENDING chairman decision / blocked state and does NOT auto-advance. On chairman Continue, advance 21->22 via the existing (already-fixed) advance machinery. Persist optionally-uploaded final images/videos as current S21 artifacts (e.g. artifact_type `visual_final_assets`).
- EHG (app UI): Stage 21 view renders the generated briefs/storyboards, an OPTIONAL upload control for the final images/videos, and a Continue button that always advances to S22; reflect the "awaiting chairman" state.

## Coordination / dependencies
Complements SD-LEO-FIX-FIX-STAGE-SKIP-001 (stop the every-30s S21 regeneration churn + fix the `build_security_audit` mislabel). The gate-pause defined here IS S21's correct terminal state — coordinate so S21 produces briefs ONCE then enters the gate (no churn) and the result is labeled correctly (not build_security_audit). Sequence: SKIP-001 (stop churn/mislabel) with/before this gate work. NOTE: S21 textual briefs are by-design (do NOT change S21 to render images itself) — chairman-confirmed.

## Success Criteria
- After S21 generates briefs, the venture enters a chairman-gate "awaiting review" state at stage 21 and does NOT auto-advance.
- The EHG Stage 21 view shows the briefs, an optional final-asset upload control, and a Continue button.
- Uploading final images/videos persists them as current S21 artifacts on the venture.
- Clicking Continue advances the venture 21->22 and S22 picks up with upstream present.
- S21 does NOT regenerate/churn while awaiting the chairman (coordinated with SKIP-001).

## Smoke Test Steps
- For a venture with S21 briefs generated, confirm it is blocked at stage 21 (pending chairman decision), not advanced.
- In the EHG app, open the venture Stage 21 view; confirm briefs render + Continue button + optional upload control are present.
- Upload a sample image; confirm it persists as a current S21 artifact.
- Click Continue; confirm the venture advances to S22 and S22 processing begins.

## Success Metrics
- 100% of ventures reaching S21 pause for chairman review (0 auto-advance past 21).
- Continue reliably advances 21->22 (no stuck-at-21 after Continue).
- 0 S21 regeneration churn events while awaiting chairman.

## Linkage
DataDistill pilot chairman-lens walk 2026-06-07; chairman UX decision "Continue + optional upload"; complements SD-LEO-FIX-FIX-STAGE-SKIP-001 + builds on SD-LEO-FIX-FIX-STAGE-DEPLOYMENT-001 (S21 now produces briefs).
