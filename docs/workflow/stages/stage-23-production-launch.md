# Stage 23: Production Launch

## Metadata
- **Category**: Workflow
- **Status**: Approved
- **Version**: 2.0.0
- **Author**: Documentation Sub-Agent (DOCMON)
- **Last Updated**: 2026-01-19
- **Tags**: venture-workflow, stage-23, vision-v2, decision_gate, phase-6
- **Stage ID**: 23
- **Phase**: 6 (LAUNCH & LEARN)
- **Work Type**: `decision_gate`
- **SD Required**: No
- **Advisory Enabled**: No
- **Implementation Status**: ✅ Implemented in EHG

## Overview

Go-live execution, launch checklist completion, and initial user onboarding.

## Purpose

This is a **decision gate** stage where critical go/no-go decisions are made.
This is an artifact-only stage focused on producing specific outputs.

## Dependencies

- **Previous Stage**: Stage 22 (Deployment & Infrastructure)
- **Next Stage**: Stage 24 (Analytics & Feedback)

## Inputs

| Input | Source | Required |
|------|------|------|
| Deployed system | Previous stages | Yes |
| Launch checklist | Previous stages | Yes |
| Marketing assets | Previous stages | Yes |

## Outputs

| Output | Format | Storage |
|------|------|------|
| Live product | Artifact/Database | Database |
| Launch metrics | Artifact/Database | Database |
| User feedback | Artifact/Database | Database |

## Artifacts

- **`launch_checklist`**

## Entry Gates

None (previous stage completion is sufficient)

## Exit Gates

No specific exit gates defined.

## Metrics

| Metric | Target | Purpose |
|------|------|------|
| Launch checklist complete | TBD | Performance tracking |
| Initial users onboarded | TBD | Performance tracking |

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
- `Stage23*.tsx` - Stage-specific component
- `Stage23Viewer.tsx` - Stage output viewer
- `VentureStageNavigation.tsx` - Phase-based navigation accordion

**Database**: `ventures.current_lifecycle_stage` tracks progression (INTEGER 1-25)

## Database Schema

**Primary Table**: `ventures` (with `current_lifecycle_stage` tracking)

**Related Tables**:
- `lifecycle_stage_config` - Stage definitions (25 stages, 6 phases)
- `venture_stage_work` - Stage entry/completion tracking
- `venture_launch_checklist` (if separate table)

## Related Documentation

- [stages_v2.yaml](../stages_v2.yaml#L999) - Stage 23 definition
- [25-Stage Overview](../25-stage-venture-lifecycle-overview.md#phase-6-launch-and-learn) - Phase context
- [Stage 22: Deployment & Infrastructure](stage-22-deployment-and-infrastructure.md) - Previous stage
- [Stage 24: Analytics & Feedback](stage-24-analytics-and-feedback.md) - Next stage

## Golden Nugget: Assumptions vs Reality

This stage includes Assumptions vs Reality tracking:
- **Action**: begin_reality_collection
- **Note**: Launch triggers reality data collection against Assumption Set V1






## Version History

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | 2026-01-19 | Vision V2 initial documentation |

---
*Part of Vision V2 (25-Stage Venture Lifecycle)*
*Technical Reference: `docs/workflow/stages_v2.yaml` (lines 999-1039)*
