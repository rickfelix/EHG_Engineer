# Stage 7: Pricing Strategy

## Metadata
- **Category**: Protocol
- **Status**: Approved
- **Version**: 2.0.0
- **Author**: Documentation Sub-Agent (DOCMON)
- **Last Updated**: 2026-01-19
- **Tags**: venture-workflow, stage-07, vision-v2, artifact_only, phase-2
- **Stage ID**: 7
- **Phase**: 2 (THE ENGINE)
- **Work Type**: `artifact_only`
- **SD Required**: No
- **Advisory Enabled**: No
- **Implementation Status**: ✅ Implemented in EHG

## Overview

Pricing model development, tier structure, and value-based pricing analysis.

## Purpose


This is an artifact-only stage focused on producing specific outputs.

## Dependencies

- **Previous Stage**: Stage 6 (Risk Evaluation Matrix)
- **Next Stage**: Stage 8 (Business Model Canvas)

## Inputs

| Input | Source | Required |
|------|------|------|
| Financial model | Previous stages | Yes |
| Competitor pricing | Previous stages | Yes |
| Value analysis | Previous stages | Yes |

## Outputs

| Output | Format | Storage |
|------|------|------|
| Pricing model | Artifact/Database | Database |
| Tier structure | Artifact/Database | Database |
| Discount policies | Artifact/Database | Database |

## Artifacts

- **`pricing_model`**

## Entry Gates

None (previous stage completion is sufficient)

## Exit Gates

No specific exit gates defined.

## Metrics

| Metric | Target | Purpose |
|------|------|------|
| Price sensitivity analysis | TBD | Performance tracking |
| Margin optimization | TBD | Performance tracking |

## Key Activities

1. Review inputs from previous stage(s)
2. Generate required artifacts
3. Validate outputs against exit gates
4. Document outcomes in database
5. Proceed to next stage upon completion

## Best Practices



- **Artifact Quality**: Ensure all outputs meet standards
- **Exit Gate Validation**: Don't skip validation steps
- **Documentation**: Keep detailed records of decisions

## Common Pitfalls

| Pitfall | Impact | Solution |
|---------|--------|----------|
| Skipping validation | Poor quality downstream | Follow all exit gates |
| Incomplete artifacts | Blocks next stage | Check artifact completeness |



## UI Implementation

**Current Status**: ✅ Implemented in EHG

**Location**: `/ventures/[id]` route with stage navigation

**Components**: 
- `Stage7*.tsx` - Stage-specific component
- `Stage7Viewer.tsx` - Stage output viewer
- `VentureStageNavigation.tsx` - Phase-based navigation accordion

**Database**: `ventures.current_lifecycle_stage` tracks progression (INTEGER 1-25)

## Database Schema

**Primary Table**: `ventures` (with `current_lifecycle_stage` tracking)

**Related Tables**:
- `lifecycle_stage_config` - Stage definitions (25 stages, 6 phases)
- `venture_stage_work` - Stage entry/completion tracking
- `venture_pricing_model` (if separate table)

## Related Documentation

- [stages_v2.yaml](../stages_v2.yaml#L359) - Stage 7 definition
- [25-Stage Overview](../25-stage-venture-lifecycle-overview.md#phase-2-the-engine) - Phase context
- [Stage 6: Risk Evaluation Matrix](stage-06-risk-evaluation-matrix.md) - Previous stage
- [Stage 8: Business Model Canvas](stage-08-business-model-canvas.md) - Next stage







## Version History

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | 2026-01-19 | Vision V2 initial documentation |

---
*Part of Vision V2 (25-Stage Venture Lifecycle)*
*Technical Reference: `docs/workflow/stages_v2.yaml` (lines 359-399)*
