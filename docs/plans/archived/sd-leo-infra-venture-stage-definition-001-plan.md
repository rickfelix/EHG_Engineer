<!-- Archived from: C:\Users\rickf\AppData\Local\Temp\sd-venture-stage-align-plan.md -->
<!-- SD Key: SD-LEO-INFRA-VENTURE-STAGE-DEFINITION-001 -->
<!-- Archived at: 2026-05-30T11:05:51.787Z -->

# Venture Stage Definition Alignment — naming + codebase-grounded descriptions across all 26 stages

## Type
infrastructure

## Target Application
EHG_Engineer

## Priority
high

## Goal
The unified `venture_stages` SSOT (26 stages) has consistent `stage_key`/`stage_name`/`component_path` naming, but during the stage REORGANIZATION the phase-grouping labels and the per-stage DESCRIPTIONS drifted out of alignment. Audit (compile session 2026-05-29) found: `phase_name` uses two formats (THE_X for 1-17 vs descriptive for 18-26); stage 23's name embeds the gate type and its chunk/phase_number groupings disagree; stage 17 has an EMPTY description; stages 10-12 names and descriptions are mismatched; `description` and `app_description` describe different activities for many stages (e.g. stage 22 `description`=Distribution vs `app_description`=Integration testing — the latter describes the SUPERSEDED Stage22BuildReview component). Root cause: the reorganization renamed stages and added new components/analysis-step templates but left OLD variants behind, and the descriptions were never re-derived from the new canonical implementation. Bring all 26 stages into alignment so the canonical definition matches what is actually BUILT.

## Changes
- Naming: normalize `phase_name` to one Title-Case convention that mirrors the authoritative `chunk` code; clean stage 23 `stage_name` (drop embedded "Kill Gate", keep gate type in `gate_label`).
- Descriptions: for each of the 26 stages, derive a canonical description from the BUILT artifacts that the canonical record points at — the component at `component_path`, its matching analysis-step template (lib/eva/stage-templates/analysis-steps/), `required_artifacts`, and `gate_label` — ignoring superseded old variants.
- Realign the stage 10-12 name<->description mismatch; fill the empty stage 17 description.
- Reconcile `description` vs `app_description` to one standard (canonical `description` = the fuller 1-2 sentence statement of what happens + what it produces; `app_description` = the short UI blurb) so both agree on the activity for every stage.
- Apply via a `venture_stages` UPDATE migration; regenerate the byte-parity `ehg/src/config/venture-workflow.ts` mirror via the live generator.
- Surface the dead old analysis-step templates + duplicate stage components found during analysis (coordinate removal with Child F SD-LEO-INFRA-UNIFY-VENTURE-STAGE-001-F, which owns "delete dead analysis-step variants").

## Objectives
- All 26 stages follow one naming convention, verified by an automated consistency assertion.
- Every stage's `description` accurately reflects its built implementation: no name<->description mismatch, no empty descriptions, no `description`/`app_description` divergence.
- The ehg `venture-workflow.ts` mirror regenerates and matches the normalized `venture_stages`.

## Acceptance Criteria
- AC-1: `venture_stages.phase_name` uses a single uniform format across all 26 rows (no THE_X vs descriptive split).
- AC-2: stage 23 `stage_name` no longer embeds the gate type; gate type remains in `gate_label`.
- AC-3: no `venture_stages` row has an empty/null `description`; all 26 are non-empty.
- AC-4: for every stage, `description` and `app_description` describe the SAME activity (no old-vs-new divergence), each traceable to the canonical built artifact.
- AC-5: stages 10, 11, 12 descriptions match their current names (the GTM/visual-identity/brand content is assigned to the correct stage).
- AC-6: a unit test asserts naming uniformity + non-empty descriptions for all 26 stages.
- AC-7: `ehg/src/config/venture-workflow.ts` regenerated from the updated `venture_stages` (mirror parity preserved).

## Demo
1. `SELECT stage_number, stage_name, phase_name, description, app_description FROM venture_stages ORDER BY stage_number` shows uniform naming + aligned, non-empty, name-matching descriptions for all 26.
2. Run the naming/description consistency test → passes.
3. Diff `venture-workflow.ts` → only the intended canonical description/name changes.
