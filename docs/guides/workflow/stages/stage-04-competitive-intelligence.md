# Stage 4: Competitive Intelligence

## Metadata
- **Category**: Protocol
- **Status**: Approved
- **Version**: 2.0.0
- **Author**: Documentation Sub-Agent (DOCMON)
- **Last Updated**: 2026-01-19
- **Tags**: venture-workflow, stage-04, vision-v2, artifact_only, phase-1
- **Stage ID**: 4
- **Phase**: 1 (THE TRUTH)
- **Work Type**: `artifact_only`
- **SD Required**: No
- **Advisory Enabled**: No
- **Implementation Status**: ✅ Implemented in EHG

## Overview

Deep analysis of competitive landscape, market gaps, and positioning opportunities.

## Purpose


This is an artifact-only stage focused on producing specific outputs.

## Dependencies

- **Previous Stage**: Stage 3 (Market Validation & RAT)
- **Next Stage**: Stage 5 (Profitability Forecasting)

## Inputs

| Input | Source | Required |
|------|------|------|
| Market validation results | Previous stages | Yes |
| Competitor data | Previous stages | Yes |
| Industry reports | Previous stages | Yes |

## Outputs

| Output | Format | Storage |
|------|------|------|
| Competitive analysis | Artifact/Database | Database |
| Gap identification | Artifact/Database | Database |
| Positioning strategy | Artifact/Database | Database |

## Artifacts

- **`competitive_analysis`**

## Entry Gates

None (previous stage completion is sufficient)

## Exit Gates

No specific exit gates defined.

## Metrics

| Metric | Target | Purpose |
|------|------|------|
| Competitors identified | TBD | Performance tracking |
| Gap opportunities scored | TBD | Performance tracking |

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
- `Stage4*.tsx` - Stage-specific component
- `Stage4Viewer.tsx` - Stage output viewer
- `VentureStageNavigation.tsx` - Phase-based navigation accordion

**Database**: `ventures.current_lifecycle_stage` tracks progression (INTEGER 1-25)

## Database Schema

**Primary Table**: `ventures` (with `current_lifecycle_stage` tracking)

**Related Tables**:
- `lifecycle_stage_config` - Stage definitions (25 stages, 6 phases)
- `venture_stage_work` - Stage entry/completion tracking
- `venture_competitive_analysis` (if separate table)

## Related Documentation

- [stages_v2.yaml](../stages_v2.yaml#L239) - Stage 4 definition
- [25-Stage Overview](../25-stage-venture-lifecycle-overview.md#phase-1-the-truth) - Phase context
- [Stage 3: Market Validation & RAT](stage-03-market-validation-and-rat.md) - Previous stage
- [Stage 5: Profitability Forecasting](stage-05-profitability-forecasting.md) - Next stage







## Version History

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | 2026-01-19 | Vision V2 initial documentation |

---
*Part of Vision V2 (25-Stage Venture Lifecycle)*
*Technical Reference: `docs/workflow/stages_v2.yaml` (lines 239-279)*
