<!-- Archived from: C:/Users/rickf/Projects/_EHG/_plan-s17-legacy-delete.md -->
<!-- SD Key: SD-LEO-REFAC-DELETE-INERT-LEGACY-001 -->
<!-- Archived at: 2026-05-31T15:40:43.609Z -->

# Delete inert legacy S17 "Design Archetype Review" gallery (complete the descoped deletion from SD-LEO-REFAC-RETIRE-LEGACY-STAGE-001)

<!-- target_application: EHG -->

## Type
refactor

## Priority
medium

## Target Application
EHG

## Goal
Remove the dead, runtime-inert legacy "Design Archetype Review" gallery from the ehg app's Stage17BlueprintReview.tsx. SD-LEO-REFAC-RETIRE-LEGACY-STAGE-001 ("Retire legacy Stage 17 Design Archetype Review path") is marked status=completed, but it explicitly DESCOPED the frontend deletion (entanglement with the shared archetype-generator). The follow-up SD-LEO-REFAC-EXTRACT-S17-ARCHETYPE-001 then extracted/removed the backend archetype-generator, but left this frontend block out of scope. The result is ~280 lines of legacy UI that no longer renders (gated behind global-ON flag s17_use_gvos_composer; an explicit comment at Stage17BlueprintReview.tsx:162-163 hides it so the chairman cannot accidentally trigger Continue/Regenerate Strategy) but still ships in the bundle. The backend dependency is gone, so the deletion is now safe — this SD completes the originally-intended retirement.

## Objectives
- Delete the legacy "Design Archetype Review" gallery Card block (Stage17BlueprintReview.tsx ~lines 632-912), including the embedded Stage17StrategySelector usage, the generation log, the "Continue/Start Generation" button (~:763) and the "Regenerate Strategy" button (~:793-812), plus the now-dead gating logic/comment at ~:162-163.
- Remove any imports, props, state, and helper functions that become unused once the block is gone (e.g. archetypeCount-driven branches), without touching the live GVOS composer path (strategy-recommendation + refine).
- Confirm no other component imports the deleted sub-elements.

## Risks
- The block is entangled with shared state used by the live GVOS path; deletion must be surgical to avoid breaking the composer. Mitigate with a careful read of the full component and a typecheck + render smoke test.
- Confirm s17_use_gvos_composer remains 100%-on (it is) so no production surface depends on the legacy gallery.

## Acceptance
- The legacy "Design Archetype Review" gallery and its Continue/Regenerate buttons no longer exist in Stage17BlueprintReview.tsx.
- The live GVOS composer flow (Stage17StrategySelector strategy-recommendation, Stage17ReviewPanel refine) is unchanged and renders correctly.
- ehg typecheck passes; no unused-import/unused-var lint regressions introduced.
- No remaining references to the deleted symbols anywhere in ehg/src.

## Files
- ehg/src/components/stages/Stage17BlueprintReview.tsx | MODIFY | Delete the legacy Design Archetype Review gallery block (~632-912) and its now-dead gating/imports/state
