<!-- Archived from: C:/Users/rickf/AppData/Local/Temp/adam-plans/triage-gate-plancontent-fix.md -->
<!-- SD Key: SD-LEO-FIX-FIX-TRIAGE-GATE-001 -->
<!-- Archived at: 2026-06-08T15:41:01.931Z -->

# Fix triage-gate.js plan_content column bug — arch-plan LOC auto-escalation is a silent no-op

## Type
bugfix

## Priority
medium

## Summary
scripts/modules/triage-gate.js lookupArchPlanLOC() queries a NON-EXISTENT column plan_content on eva_architecture_plans (the actual column is content). The query silently returns nothing, so the LOC-based Tier-3 auto-escalation that is supposed to fire when an arch plan implies a large change is a permanent NO-OP. Work items that should auto-escalate to a full Tier-3 SD on arch-plan LOC are not being escalated. The CLAUDE.md rule "arch plan exists -> Tier 3" is currently enforced only by the hard rule, not by this LOC path.

## Root Cause
Wrong column name (plan_content vs content) in lookupArchPlanLOC(); PostgREST returns empty rather than erroring, so the no-op is silent.

## Success Criteria
- lookupArchPlanLOC() reads the correct column (content) on eva_architecture_plans and returns a real LOC estimate.
- The LOC-based auto-escalation fires for arch-plan-backed work items above the LOC threshold.
- A test covers the column-name contract so a future rename fails loud instead of silently no-op-ing.

## Scope
- scripts/modules/triage-gate.js lookupArchPlanLOC() — fix the column name; confirm the LOC extraction path against the real content shape.
- Add a unit/integration test asserting lookupArchPlanLOC returns non-null for an arch plan with content.

## Notes
- Latent defect flagged earlier this session; no SD existed. Low blast radius (escalation is currently under-firing, not over-firing) hence medium.
