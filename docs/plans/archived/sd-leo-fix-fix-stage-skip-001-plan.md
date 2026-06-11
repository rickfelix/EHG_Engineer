<!-- Archived from: scripts/one-off/_plan-churn.md -->
<!-- SD Key: SD-LEO-FIX-FIX-STAGE-SKIP-001 -->
<!-- Archived at: 2026-06-07T15:26:46.890Z -->

# Fix Stage 21 skip persistence — mislabeled artifact_type (build_security_audit) and non-terminal skips producing unbounded duplicate artifacts

## Type
fix

## Priority
medium

## Summary
When Stage 21 (Visual Assets) skips on missing preconditions, the result is persisted via `lib/eva/bridge/replit-reentry-adapter.js:219` under a hardcoded `artifactType: 'build_security_audit'` — NOT via the stage's own `persistSkipMarker()` (which writes `visual_assets_skipped`). Two defects compound: (1) the artifact_type is mislabeled (`build_security_audit` for visual-assets data); (2) a skip never marks the venture's S21 work terminal/blocked, so every worker poll re-runs S21 and writes a NEW artifact. DataDistill accumulated 211 `build_security_audit` artifacts at lifecycle_stage=21 over ~6.6 days (2026-06-01 -> 2026-06-07) — DB bloat + wasted worker cycles.

## Evidence (data-verified)
- 211 venture_artifacts at lifecycle_stage=21 for DataDistill, ALL artifact_type=`build_security_audit`, source=`stage-21`, cadence as fast as ~30s when the worker is active.
- artifact_data shape is the visual-assets result (`_skip, skip_reason, precondition_missing, device_screenshots, social_graphics, video_storyboard, total_assets`), not a security audit.
- `build_security_audit` is defined in lib/eva/artifact-types.js:95 and hardcoded at lib/eva/bridge/replit-reentry-adapter.js:219.

## Scope
- Correct the persisted artifact_type for S21 skip/result so it is not `build_security_audit` (route through the stage's `persistSkipMarker` / correct visual-assets type).
- Make a skip terminal-or-debounced: do not write a fresh duplicate artifact on every poll for the same unmet-precondition state (mark S21 work blocked/skipped, or upsert is_current instead of inserting).
- Consider a one-time cleanup/dedup of the existing 211 duplicate rows (separate, optional).

## Success Criteria
- A skipped S21 writes a correctly-typed skip marker (not `build_security_audit`).
- Repeated polls on an unchanged unmet-precondition state do NOT create unbounded new artifacts (bounded to one current marker, or the venture is marked so the worker stops re-running S21).
- Regression test simulates two consecutive skip polls and asserts no duplicate proliferation + correct artifact_type.

## Linkage
Found during DataDistill pilot chairman-lens walk. Sibling/prerequisite: the resolver column-name SD (after that fix, DataDistill S21 will RUN instead of skip, but the churn/mislabel mechanism still affects genuinely-undeployed ventures).
