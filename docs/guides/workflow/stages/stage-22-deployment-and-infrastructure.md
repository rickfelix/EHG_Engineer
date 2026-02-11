# Stage 22: Deployment & Infrastructure

## Metadata
- **Category**: Protocol
- **Status**: Approved
- **Version**: 2.0.0
- **Author**: Documentation Sub-Agent (DOCMON)
- **Last Updated**: 2026-01-19
- **Tags**: venture-workflow, stage-22, vision-v2, sd_required, phase-6
- **Stage ID**: 22
- **Phase**: 6 (LAUNCH & LEARN)
- **Work Type**: `sd_required`
- **SD Required**: Yes (DEPLOY)
- **Advisory Enabled**: No
- **Implementation Status**: ✅ Implemented in EHG

## Overview

Production deployment, infrastructure provisioning, and monitoring setup.

## Purpose


This stage requires a Strategic Directive (SD) to be created and executed.

## Dependencies

- **Previous Stage**: Stage 21 (QA & UAT)
- **Next Stage**: Stage 23 (Production Launch)

## Inputs

| Input | Source | Required |
|------|------|------|
| QA-passed system | Previous stages | Yes |
| Infrastructure specs | Previous stages | Yes |
| Deployment plan | Previous stages | Yes |

## Outputs

| Output | Format | Storage |
|------|------|------|
| Deployed system | Artifact/Database | Database |
| Monitoring setup | Artifact/Database | Database |
| Runbooks | Artifact/Database | Database |

## Artifacts

- **`deployment_runbook`**

## Entry Gates

None (previous stage completion is sufficient)

## Exit Gates

No specific exit gates defined.

## Metrics

| Metric | Target | Purpose |
|------|------|------|
| Deployment success | TBD | Performance tracking |
| Monitoring coverage | TBD | Performance tracking |

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
- `Stage22*.tsx` - Stage-specific component
- `Stage22Viewer.tsx` - Stage output viewer
- `VentureStageNavigation.tsx` - Phase-based navigation accordion

**Database**: `ventures.current_lifecycle_stage` tracks progression (INTEGER 1-25)

## Database Schema

**Primary Table**: `ventures` (with `current_lifecycle_stage` tracking)

**Related Tables**:
- `lifecycle_stage_config` - Stage definitions (25 stages, 6 phases)
- `venture_stage_work` - Stage entry/completion tracking
- `venture_deployment_runbook` (if separate table)

## Related Documentation

- [stages_v2.yaml](../stages_v2.yaml#L959) - Stage 22 definition
- [25-Stage Overview](../25-stage-venture-lifecycle-overview.md#phase-6-launch-learn) - Phase context
- [Stage 21: QA & UAT](stage-21-qa-and-uat.md) - Previous stage
- [Stage 23: Production Launch](stage-23-production-launch.md) - Next stage







## Version History

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | 2026-01-19 | Vision V2 initial documentation |

---
*Part of Vision V2 (25-Stage Venture Lifecycle)*
*Technical Reference: `docs/workflow/stages_v2.yaml` (lines 959-999)*
