# Brainstorm: Venture Pipeline Artifact Shadowing Fix

## Metadata
- **Date**: 2026-03-15
- **Domain**: Protocol
- **Phase**: Discovery
- **Mode**: Structured
- **Crystallization Score**: 0.91/1.0
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Skipped (RCA agent provided comprehensive root cause analysis)
- **Related Ventures**: ListingLens AI (primary), all ventures affected

---

## Problem Statement

The venture stage pipeline's `loadUpstreamArtifacts()` function uses a "newest artifact wins" strategy per stage. When a stage produces multiple artifacts (e.g., Stage 5 produces both `financial_model` and `devils_advocate_review`), the most recently created artifact shadows the primary one. The DA review (created 19 seconds later) contains empty data, causing downstream contract validation to fail because required fields like `unitEconomics` are missing.

This cascades: stages 6-9 are blocked at contract pre-validation, never persist artifacts, and downstream stages that depend on them also fail. The result is that stages 6-9 and 11-13 have advisory_data in `venture_stage_work` but no `venture_artifacts` rows.

## Discovery Summary

### Root Cause (from RCA agent)
- **File**: `lib/eva/eva-orchestrator-helpers.js`, lines 273-292
- **Function**: `loadUpstreamArtifacts()` — sorts by `created_at DESC`, keeps first artifact per stage
- **Same bug**: `lib/eva/stage-execution-engine.js`, `fetchUpstreamArtifacts()` — identical logic
- **Pattern**: `PAT-MULTI-ARTIFACT-SHADOW` — non-primary artifact shadows primary in upstream data loading

### Evidence
- Stage 5 `financial_model` created at 10:01:17 (22 keys including unitEconomics)
- Stage 5 `devils_advocate_review` created at 10:01:36 (NULL artifact_data)
- `loadUpstreamArtifacts` returns DA review (empty) instead of financial model
- Contract validation for stage 6 requires `stage-5.unitEconomics` -> BLOCKED

### Cascade
Stages 1-5: artifacts created correctly (no multi-artifact shadowing)
Stages 6-9: blocked at contract pre-validation (missing unitEconomics from stage 5)
Stage 10: passes (contract requires only stage 1 data)
Stages 11-13: mixed failures (some contracts pass, persistence still fails)

## Analysis

### Arguments For
- Small, focused fix with massive impact (unblocks entire pipeline for all ventures)
- Root cause is definitively identified with code line references
- Fix is straightforward: merge artifacts per stage instead of newest-wins
- Prevents the same issue from affecting future multi-artifact stages

### Arguments Against
- Merging artifacts blindly could cause field collisions if two artifacts have same keys
- The DA review exists for a reason — need to ensure it's still accessible after fix
- Contract system may have other latent issues that this masks

## Protocol: Friction/Value/Risk Analysis

| Dimension | Score |
|-----------|-------|
| Friction Reduction | 9/10 |
| Value Addition | 8/10 |
| Risk Profile | 3/10 |
| **Decision** | **Implement** — (9+8)=17 > 3*2=6 |

## Out of Scope
- Redesigning the venture stage pipeline
- Changing advisory_data storage mechanism
- Building a new artifact system

## Open Questions
- Should DA review artifacts be excluded from contract validation entirely?
- Should a reconciliation pass fix existing ventures with missing artifacts?

## Suggested Next Steps
- Create SD to fix `loadUpstreamArtifacts()` and `fetchUpstreamArtifacts()`
- After fix, re-run stages 6-13 for ListingLens AI to verify artifacts are created
- Consider adding an artifact reconciliation health check
