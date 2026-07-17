# Archive the distill-minted duplicate EVA Intake Roadmaps (verify-then-archive, reversible)

## Type
bugfix

## Target Repos
EHG_Engineer

## Summary
Chairman-directed 2026-07-17 (via Solomon advisory fb7ed0b2): the LEO Roadmap is the SOLE plan-of-record; the EVA Intake Roadmaps must be retired. Ground truth (strategic_roadmaps, 4 rows): KEEP 'LEO Roadmap' (active, vision_key=VISION-EHG-L1-001, 6 waves/236 items — drives PLAN CHECK + the roadmap-retro); RETIRE two 'EVA Intake Roadmap' rows (status=draft, NO vision_key, minted TODAY 15:30+15:49Z with 503+577 items — artifacts of eva-intake-pipeline.js wave-clustering, which mints a fresh roadmap row per /distill run); LEAVE the Mar-8 archived row untouched. This is the LIVE instance of the distill single-writer seam (standing guard = SD-LEO-INFRA-DISTILL-ROADMAP-SINGLE-001, already on the belt); this QF is the ONE-TIME cleanup so that SD ships the guard against a clean table.

## Functional Requirements
### FR-1: Verify before disposing (Solomon confidence=medium on this step)
Confirm the two draft rows' roadmap_wave_items only REFERENCE eva_youtube_intake / eva_todoist_intake rows (the backlog SSOT — the roadmap is a clustering VIEW over intake tables, not a store of unique items). COUNTERFACTUAL: any wave_item with NO intake-table backing (genuinely unique authored content) is MIGRATED into the LEO Roadmap before archiving — never lost.
### FR-2: Archive, don't delete
Set the two draft EVA Intake Roadmap rows status='archived' (REVERSIBLE — no hard-delete). Leave the Mar-8 archived row untouched.
### FR-3: Post-verify
`SELECT count(*) FROM strategic_roadmaps WHERE status='active'` = 1 (LEO Roadmap only). Note in the SD-LEO-INFRA-DISTILL-ROADMAP-SINGLE-001 record that the one-time cleanup is done and its standing guard must make a subsequent distill run create ZERO new roadmap rows.

## Success Metrics
- metric: active roadmaps after cleanup; target: exactly 1 (LEO Roadmap)
- metric: unique authored content lost; target: 0 (verify-then-archive + migrate-if-unbacked)
- metric: hard-deletes; target: 0 (reversible archive only)

## Smoke Test Steps
1. instruction: Run the FR-1 verification query on both draft rows; expected_outcome: items all reference intake tables (or the unbacked ones are migrated).
2. instruction: Archive + run the post-verify count; expected_outcome: active=1.

## Sizing / Notes
Tier 1 QF (status flips + a verification query; NO schema change — data disposition only). Chairman directed the OUTCOME in-session; Adam sourced the HOW; worker executes (Solomon cannot mutate roadmap rows). SEQUENCING: fine to run before/parallel to SD-LEO-INFRA-DISTILL-ROADMAP-SINGLE-001 (that SD ships the standing guard; this clears existing duplicates). Relates fb7ed0b2 + the distill-mints-parallel-roadmaps systemic flag.
