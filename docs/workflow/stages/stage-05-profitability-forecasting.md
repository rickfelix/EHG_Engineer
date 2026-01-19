# Stage 5: Profitability Forecasting

## Metadata
- **Category**: Workflow
- **Status**: Approved
- **Version**: 2.0.0
- **Author**: Documentation Sub-Agent (DOCMON)
- **Last Updated**: 2026-01-19
- **Tags**: venture-workflow, stage-05, vision-v2, decision_gate, phase-1
- **Stage ID**: 5
- **Phase**: 1 (THE TRUTH)
- **Work Type**: `decision_gate`
- **SD Required**: No
- **Advisory Enabled**: Yes
- **Implementation Status**: ✅ Implemented in EHG

## Overview

Financial modeling, unit economics validation, and ROI projections.

## Purpose

This is a **decision gate** stage where critical go/no-go decisions are made.
This is an artifact-only stage focused on producing specific outputs.

## Dependencies

- **Previous Stage**: Stage 4 (Competitive Intelligence)
- **Next Stage**: Stage 6 (Risk Evaluation Matrix)

## Inputs

| Input | Source | Required |
|------|------|------|
| Competitive analysis | Previous stages | Yes |
| Pricing assumptions | Previous stages | Yes |
| Cost structure | Previous stages | Yes |

## Outputs

| Output | Format | Storage |
|------|------|------|
| Financial model | Artifact/Database | Database |
| Unit economics | Artifact/Database | Database |
| ROI projections | Artifact/Database | Database |

## Artifacts

- **`financial_model`**

## Entry Gates

- Competitive analysis complete

## Exit Gates

| Gate | Criteria | Validation |
|------|------|------|
| Financial model complete | Must be met | Required |
| Unit economics viable | Must be met | Required |

## Metrics

| Metric | Target | Purpose |
|------|------|------|
| Gross margin target (40%+) | TBD | Performance tracking |
| Breakeven months (<18) | TBD | Performance tracking |
| CAC:LTV ratio (1:3+) | TBD | Performance tracking |

## Key Activities

1. Review inputs from previous stage(s)
2. Generate required artifacts
3. Make kill/revise/proceed decision
4. Document outcomes in database
5. Proceed to next stage upon completion

## Best Practices

- **Be Ruthless**: Kill ideas that don't meet criteria
- **Use Data**: Base decisions on validation metrics
- **Document Rationale**: Record why decisions were made

- **Artifact Quality**: Ensure all outputs meet standards
- **Exit Gate Validation**: Don't skip validation steps
- **Documentation**: Keep detailed records of decisions

## Common Pitfalls

| Pitfall | Impact | Solution |
|---------|--------|----------|
| Skipping validation | Poor quality downstream | Follow all exit gates |
| Incomplete artifacts | Blocks next stage | Check artifact completeness |
| Emotional decisions | Wrong ventures proceed | Use objective criteria |


## UI Implementation

**Current Status**: ✅ Implemented in EHG

**Location**: `/ventures/[id]` route with stage navigation

**Components**: 
- `Stage5*.tsx` - Stage-specific component
- `Stage5Viewer.tsx` - Stage output viewer
- `VentureStageNavigation.tsx` - Phase-based navigation accordion

**Database**: `ventures.current_lifecycle_stage` tracks progression (INTEGER 1-25)

## Database Schema

**Primary Table**: `ventures` (with `current_lifecycle_stage` tracking)

**Related Tables**:
- `lifecycle_stage_config` - Stage definitions (25 stages, 6 phases)
- `venture_stage_work` - Stage entry/completion tracking
- `venture_financial_model` (if separate table)

## Related Documentation

- [stages_v2.yaml](../stages_v2.yaml#L279) - Stage 5 definition
- [25-Stage Overview](../25-stage-venture-lifecycle-overview.md#phase-1-the-truth) - Phase context
- [Stage 4: Competitive Intelligence](stage-04-competitive-intelligence.md) - Previous stage
- [Stage 6: Risk Evaluation Matrix](stage-06-risk-evaluation-matrix.md) - Next stage

## Golden Nugget: Assumptions vs Reality

This stage includes Assumptions vs Reality tracking:
- **Action**: update
- **Note**: Update Assumption Set with financial model inputs (pricing, costs, margins)


## Golden Nugget: Four Buckets (Epistemic Classification)

This stage requires epistemic classification of all outputs:
- **Required**: Yes
- **Note**: Decision gate - all financial claims must be classified




## Version History

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | 2026-01-19 | Vision V2 initial documentation |

---
*Part of Vision V2 (25-Stage Venture Lifecycle)*
*Technical Reference: `docs/workflow/stages_v2.yaml` (lines 279-319)*
