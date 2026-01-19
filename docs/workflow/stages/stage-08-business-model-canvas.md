# Stage 8: Business Model Canvas

## Metadata
- **Category**: Workflow
- **Status**: Approved
- **Version**: 2.0.0
- **Author**: Documentation Sub-Agent (DOCMON)
- **Last Updated**: 2026-01-19
- **Tags**: venture-workflow, stage-08, vision-v2, artifact_only, phase-2
- **Stage ID**: 8
- **Phase**: 2 (THE ENGINE)
- **Work Type**: `artifact_only`
- **SD Required**: No
- **Advisory Enabled**: No
- **Implementation Status**: ✅ Implemented in EHG

## Overview

Complete business model documentation using BMC framework.

## Purpose


This is an artifact-only stage focused on producing specific outputs.

## Dependencies

- **Previous Stage**: Stage 7 (Pricing Strategy)
- **Next Stage**: Stage 9 (Exit-Oriented Design)

## Inputs

| Input | Source | Required |
|------|------|------|
| All previous analyses | Previous stages | Yes |
| Pricing strategy | Previous stages | Yes |
| Risk assessment | Previous stages | Yes |

## Outputs

| Output | Format | Storage |
|------|------|------|
| Business Model Canvas | Artifact/Database | Database |
| Value propositions | Artifact/Database | Database |
| Revenue streams | Artifact/Database | Database |

## Artifacts

- **`business_model_canvas`**

## Entry Gates

None (previous stage completion is sufficient)

## Exit Gates

No specific exit gates defined.

## Metrics

| Metric | Target | Purpose |
|------|------|------|
| BMC completeness | TBD | Performance tracking |
| Strategic alignment | TBD | Performance tracking |

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
- `Stage8*.tsx` - Stage-specific component
- `Stage8Viewer.tsx` - Stage output viewer
- `VentureStageNavigation.tsx` - Phase-based navigation accordion

**Database**: `ventures.current_lifecycle_stage` tracks progression (INTEGER 1-25)

## Database Schema

**Primary Table**: `ventures` (with `current_lifecycle_stage` tracking)

**Related Tables**:
- `lifecycle_stage_config` - Stage definitions (25 stages, 6 phases)
- `venture_stage_work` - Stage entry/completion tracking
- `venture_business_model_canvas` (if separate table)

## Related Documentation

- [stages_v2.yaml](../stages_v2.yaml#L399) - Stage 8 definition
- [25-Stage Overview](../25-stage-venture-lifecycle-overview.md#phase-2-the-engine) - Phase context
- [Stage 7: Pricing Strategy](stage-07-pricing-strategy.md) - Previous stage
- [Stage 9: Exit-Oriented Design](stage-09-exit-oriented-design.md) - Next stage







## Version History

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | 2026-01-19 | Vision V2 initial documentation |

---
*Part of Vision V2 (25-Stage Venture Lifecycle)*
*Technical Reference: `docs/workflow/stages_v2.yaml` (lines 399-439)*
