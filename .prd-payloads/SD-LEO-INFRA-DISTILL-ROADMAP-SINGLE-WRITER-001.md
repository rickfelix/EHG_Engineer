# Distill roadmap SINGLE-WRITER — distill wave output becomes an Adam PROPOSAL, never a direct roadmap write

## Type
infrastructure

## Target Repos
EHG_Engineer

## Summary
Chairman-ratified Solomon hand-off 2026-07-17 (seam 2; capture .prd-payloads/CAPTURE-SOLOMON-DISTILL-INTEGRATION-SEAMS.md). The distill intake pipeline creates roadmap waves directly (historically whole parallel roadmaps — an archived one sits beside the active one), with NO Adam disposition step. But the roadmap is Adam's plan-of-record (chairman 2026-07-16), and BOTH PLAN CHECK and the new roadmap-retro derive from it. Two writers to the plan-of-record = the plan the PM manages can be mutated out from under the PM. Fix: make distill wave output a PROPOSAL that Adam reconciles into the ONE canonical roadmap — single writer.

## Functional Requirements
### FR-1: Distill emits a wave PROPOSAL, not a direct write
Distill wave output lands in a proposal surface (staging rows / proposed-wave state), never a direct INSERT/UPDATE into the canonical `roadmap_waves`. Ground-truth the current write path first and identify every site where distill mutates roadmap_waves.
### FR-2: Adam disposition step reconciles proposals into the canonical roadmap
Add an Adam reconcile/disposition step: proposed waves are accepted/merged/rejected into the single canonical roadmap by Adam (the plan-of-record owner), so there is exactly one authoritative roadmap and one writer. Archived/parallel roadmaps are reconciled or explicitly retired, not left beside the active one.
### FR-3: Single plan surface invariant
Assert (test + a guard) that PLAN CHECK and the roadmap-retro read the SAME single canonical roadmap, and that no non-Adam path writes it. Non-goal (seam 4): do not wire Solomon into distill scoring as part of this.

## Success Metrics
- metric: non-Adam direct writes to canonical roadmap_waves; target: 0 (all via proposal→disposition)
- metric: parallel/archived roadmaps coexisting with the active one unreconciled; target: 0
- metric: PLAN CHECK + roadmap-retro reading a single canonical plan; target: yes

## Smoke Test Steps
1. instruction: Run one distill pipeline end-to-end; expected_outcome: wave output appears as a PROPOSAL → Adam disposition → a single canonical roadmap write; PLAN CHECK output unchanged in shape.
2. instruction: Attempt a direct distill write to canonical roadmap_waves; expected_outcome: blocked/guarded (must go through the proposal path).

## Sizing / Notes
Tier 3 (touches the plan-of-record + PM loop). SOURCE-AND-GO on reasoning (Solomon-diagnosed, chairman-ratified) but **COORDINATOR review for SEQUENCING**: Solomon's explicit note — land this BEFORE or WITH the roadmap-retro SD so the retro grades a single-writer plan from cycle 1. COUNTERFACTUAL (check belt before dispatch): if distill is being retired/absorbed into the PM loop entirely, seams 2-3 collapse into that redesign — dedup against any in-flight distill-absorption work. Relates SD-LEO-INFRA-DISTILL-REFINE-INSTITUTION-AWARE-STANDING-001 + the roadmap-retro cadence SD (Solomon verdict be825042).
