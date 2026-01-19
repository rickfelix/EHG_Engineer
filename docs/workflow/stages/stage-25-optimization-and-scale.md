# Stage 25: Optimization & Scale

## Metadata
- **Category**: Workflow
- **Status**: Approved
- **Version**: 2.0.0
- **Author**: Documentation Sub-Agent (DOCMON)
- **Last Updated**: 2026-01-19
- **Tags**: venture-workflow, stage-25, vision-v2, sd_required, phase-6
- **Stage ID**: 25
- **Phase**: 6 (LAUNCH & LEARN)
- **Work Type**: `sd_required`
- **SD Required**: Yes (OPTIMIZE)
- **Advisory Enabled**: No
- **Implementation Status**: ✅ Implemented in EHG

## Overview

Continuous improvement, scaling preparation, and growth optimization.

## Purpose


This stage requires a Strategic Directive (SD) to be created and executed.

## Dependencies

- **Previous Stage**: Stage 24 (Analytics & Feedback)
- **Next Stage**: Phase 7: THE ORBIT (Active Operations)

## Inputs

| Input | Source | Required |
|------|------|------|
| Analytics data | Previous stages | Yes |
| User feedback | Previous stages | Yes |
| Performance metrics | Previous stages | Yes |

## Outputs

| Output | Format | Storage |
|------|------|------|
| Optimization roadmap | Artifact/Database | Database |
| Scaling plan | Artifact/Database | Database |
| Growth experiments | Artifact/Database | Database |
| Assumptions vs Reality Report | Artifact/Database | Database |

## Artifacts

- **`optimization_roadmap`**
- **`assumptions_vs_reality_report`**

## Entry Gates

None (previous stage completion is sufficient)

## Exit Gates

No specific exit gates defined.

## Metrics

| Metric | Target | Purpose |
|------|------|------|
| Performance improvements | TBD | Performance tracking |
| Scale readiness | TBD | Performance tracking |
| Assumption error rate | TBD | Performance tracking |

## Key Activities

1. Review inputs from previous stage(s)
2. Create and execute Strategic Directive
3. Validate outputs against exit gates
4. Document outcomes in database
5. Proceed to next stage upon completion

## Best Practices


- **Database-First**: All SDs tracked in strategic_directives_v2 table
- **Quality Gates**: Ensure all acceptance criteria pass
- **Handoff Protocol**: Follow proper phase transition
- **Artifact Quality**: Ensure all outputs meet standards
- **Exit Gate Validation**: Don't skip validation steps
- **Documentation**: Keep detailed records of decisions

## Common Pitfalls

| Pitfall | Impact | Solution |
|---------|--------|----------|
| Skipping validation | Poor quality downstream | Follow all exit gates |
| Incomplete artifacts | Blocks next stage | Check artifact completeness |

| Bypassing SD process | Protocol violation | Always create SD first |

## UI Implementation

**Current Status**: ✅ Implemented in EHG

**Location**: `/ventures/[id]` route with stage navigation

**Components**: 
- `Stage25*.tsx` - Stage-specific component
- `Stage25Viewer.tsx` - Stage output viewer
- `VentureStageNavigation.tsx` - Phase-based navigation accordion

**Database**: `ventures.current_lifecycle_stage` tracks progression (INTEGER 1-25)

## Database Schema

**Primary Table**: `ventures` (with `current_lifecycle_stage` tracking)

**Related Tables**:
- `lifecycle_stage_config` - Stage definitions (25 stages, 6 phases)
- `venture_stage_work` - Stage entry/completion tracking
- `venture_optimization_roadmap` (if separate table)
- `venture_assumptions_vs_reality_report` (if separate table)

## Related Documentation

- [stages_v2.yaml](../stages_v2.yaml#L1079) - Stage 25 definition
- [25-Stage Overview](../25-stage-venture-lifecycle-overview.md#phase-6-launch-and-learn) - Phase context
- [Stage 24: Analytics & Feedback](stage-24-analytics-and-feedback.md) - Previous stage


## Golden Nugget: Assumptions vs Reality

This stage includes Assumptions vs Reality tracking:
- **Action**: generate_calibration_report
- **Note**: Generate Assumptions vs Reality Report comparing V1 beliefs against actual outcomes






## Version History

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | 2026-01-19 | Vision V2 initial documentation |

---
*Part of Vision V2 (25-Stage Venture Lifecycle)*
*Technical Reference: `docs/workflow/stages_v2.yaml` (lines 1079-1119)*
