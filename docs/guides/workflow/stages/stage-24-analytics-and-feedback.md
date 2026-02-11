# Stage 24: Analytics & Feedback

## Metadata
- **Category**: Protocol
- **Status**: Approved
- **Version**: 2.0.0
- **Author**: Documentation Sub-Agent (DOCMON)
- **Last Updated**: 2026-01-19
- **Tags**: venture-workflow, stage-24, vision-v2, artifact_only, phase-6
- **Stage ID**: 24
- **Phase**: 6 (LAUNCH & LEARN)
- **Work Type**: `artifact_only`
- **SD Required**: No
- **Advisory Enabled**: No
- **Implementation Status**: ✅ Implemented in EHG

## Overview

Analytics implementation, feedback collection, and metric tracking.

## Purpose


This is an artifact-only stage focused on producing specific outputs.

## Dependencies

- **Previous Stage**: Stage 23 (Production Launch)
- **Next Stage**: Stage 25 (Optimization & Scale)

## Inputs

| Input | Source | Required |
|------|------|------|
| Live product | Previous stages | Yes |
| User activity | Previous stages | Yes |
| Market feedback | Previous stages | Yes |

## Outputs

| Output | Format | Storage |
|------|------|------|
| Analytics dashboard | Artifact/Database | Database |
| Feedback reports | Artifact/Database | Database |
| KPI tracking | Artifact/Database | Database |

## Artifacts

- **`analytics_dashboard`**

## Entry Gates

None (previous stage completion is sufficient)

## Exit Gates

No specific exit gates defined.

## Metrics

| Metric | Target | Purpose |
|------|------|------|
| DAU/MAU tracking | TBD | Performance tracking |
| NPS score | TBD | Performance tracking |
| Feature adoption | TBD | Performance tracking |

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
- `Stage24*.tsx` - Stage-specific component
- `Stage24Viewer.tsx` - Stage output viewer
- `VentureStageNavigation.tsx` - Phase-based navigation accordion

**Database**: `ventures.current_lifecycle_stage` tracks progression (INTEGER 1-25)

## Database Schema

**Primary Table**: `ventures` (with `current_lifecycle_stage` tracking)

**Related Tables**:
- `lifecycle_stage_config` - Stage definitions (25 stages, 6 phases)
- `venture_stage_work` - Stage entry/completion tracking
- `venture_analytics_dashboard` (if separate table)

## Related Documentation

- [stages_v2.yaml](../stages_v2.yaml#L1039) - Stage 24 definition
- [25-Stage Overview](../25-stage-venture-lifecycle-overview.md#phase-6-launch-learn) - Phase context
- [Stage 23: Production Launch](stage-23-production-launch.md) - Previous stage
- [Stage 25: Optimization & Scale](stage-25-optimization-and-scale.md) - Next stage

## Golden Nugget: Assumptions vs Reality

This stage includes Assumptions vs Reality tracking:
- **Action**: collect_reality_data
- **Note**: Analytics feed reality data for assumption comparison (market size, adoption, pricing)






## Version History

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | 2026-01-19 | Vision V2 initial documentation |

---
*Part of Vision V2 (25-Stage Venture Lifecycle)*
*Technical Reference: `docs/workflow/stages_v2.yaml` (lines 1039-1079)*
