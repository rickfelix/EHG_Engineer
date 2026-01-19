# Stage 6: Risk Evaluation Matrix

## Metadata
- **Category**: Workflow
- **Status**: Approved
- **Version**: 2.0.0
- **Author**: Documentation Sub-Agent (DOCMON)
- **Last Updated**: 2026-01-19
- **Tags**: venture-workflow, stage-06, vision-v2, artifact_only, phase-2
- **Stage ID**: 6
- **Phase**: 2 (THE ENGINE)
- **Work Type**: `artifact_only`
- **SD Required**: No
- **Advisory Enabled**: No
- **Implementation Status**: ✅ Implemented in EHG

## Overview

Comprehensive risk identification, probability assessment, and mitigation planning.

## Purpose


This is an artifact-only stage focused on producing specific outputs.

## Dependencies

- **Previous Stage**: Stage 5 (Profitability Forecasting)
- **Next Stage**: Stage 7 (Pricing Strategy)

## Inputs

| Input | Source | Required |
|------|------|------|
| Financial model | Previous stages | Yes |
| Market analysis | Previous stages | Yes |
| Technical assessment | Previous stages | Yes |

## Outputs

| Output | Format | Storage |
|------|------|------|
| Risk matrix | Artifact/Database | Database |
| Mitigation strategies | Artifact/Database | Database |
| Contingency plans | Artifact/Database | Database |

## Artifacts

- **`risk_matrix`**

## Entry Gates

- Financial model complete (Stage 5)

## Exit Gates

| Gate | Criteria | Validation |
|------|------|------|
| Risk matrix artifact present (≥200 chars) | Must be met | Required |
| Epistemic classification complete (Facts/Assumptions/Simulations/Unknowns) | Must be met | Required |
| HIGH+ risks have mitigation strategies | Must be met | Required |

## Metrics

| Metric | Target | Purpose |
|------|------|------|
| Risks identified | TBD | Performance tracking |
| Mitigation coverage | TBD | Performance tracking |

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
- `Stage6*.tsx` - Stage-specific component
- `Stage6Viewer.tsx` - Stage output viewer
- `VentureStageNavigation.tsx` - Phase-based navigation accordion

**Database**: `ventures.current_lifecycle_stage` tracks progression (INTEGER 1-25)

## Database Schema

**Primary Table**: `ventures` (with `current_lifecycle_stage` tracking)

**Related Tables**:
- `lifecycle_stage_config` - Stage definitions (25 stages, 6 phases)
- `venture_stage_work` - Stage entry/completion tracking
- `venture_risk_matrix` (if separate table)

## Related Documentation

- [stages_v2.yaml](../stages_v2.yaml#L319) - Stage 6 definition
- [25-Stage Overview](../25-stage-venture-lifecycle-overview.md#phase-2-the-engine) - Phase context
- [Stage 5: Profitability Forecasting](stage-05-profitability-forecasting.md) - Previous stage
- [Stage 7: Pricing Strategy](stage-07-pricing-strategy.md) - Next stage



## Golden Nugget: Four Buckets (Epistemic Classification)

This stage requires epistemic classification of all outputs:
- **Required**: Yes
- **Note**: Risk matrix must classify all claims - Facts (from financial model), Assumptions (market/customer), Simulations (projections), Unknowns (deliberate gaps)




## Version History

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | 2026-01-19 | Vision V2 initial documentation |

---
*Part of Vision V2 (25-Stage Venture Lifecycle)*
*Technical Reference: `docs/workflow/stages_v2.yaml` (lines 319-359)*
