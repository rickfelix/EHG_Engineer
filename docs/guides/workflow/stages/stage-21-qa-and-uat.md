# Stage 21: QA & UAT

## Metadata
- **Category**: Protocol
- **Status**: Approved
- **Version**: 2.0.0
- **Author**: Documentation Sub-Agent (DOCMON)
- **Last Updated**: 2026-01-19
- **Tags**: venture-workflow, stage-21, vision-v2, sd_required, phase-6
- **Stage ID**: 21
- **Phase**: 6 (LAUNCH & LEARN)
- **Work Type**: `sd_required`
- **SD Required**: Yes (QA)
- **Advisory Enabled**: No
- **Implementation Status**: ✅ Implemented in EHG

## Overview

Quality assurance testing, user acceptance testing, and bug resolution.

## Purpose


This stage requires a Strategic Directive (SD) to be created and executed.

## Dependencies

- **Previous Stage**: Stage 20 (Security & Performance)
- **Next Stage**: Stage 22 (Deployment & Infrastructure)

## Inputs

| Input | Source | Required |
|------|------|------|
| Hardened system | Previous stages | Yes |
| Test scenarios | Previous stages | Yes |
| User test cases | Previous stages | Yes |

## Outputs

| Output | Format | Storage |
|------|------|------|
| Test reports | Artifact/Database | Database |
| Bug fixes | Artifact/Database | Database |
| UAT signoff | Artifact/Database | Database |

## Artifacts

- **`test_plan`**
- **`uat_report`**

## Entry Gates

None (previous stage completion is sufficient)

## Exit Gates

No specific exit gates defined.

## Metrics

| Metric | Target | Purpose |
|------|------|------|
| Test coverage >= 80% | TBD | Performance tracking |
| Bug resolution rate | TBD | Performance tracking |
| UAT pass rate | TBD | Performance tracking |

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
- `Stage21*.tsx` - Stage-specific component
- `Stage21Viewer.tsx` - Stage output viewer
- `VentureStageNavigation.tsx` - Phase-based navigation accordion

**Database**: `ventures.current_lifecycle_stage` tracks progression (INTEGER 1-25)

## Database Schema

**Primary Table**: `ventures` (with `current_lifecycle_stage` tracking)

**Related Tables**:
- `lifecycle_stage_config` - Stage definitions (25 stages, 6 phases)
- `venture_stage_work` - Stage entry/completion tracking
- `venture_test_plan` (if separate table)
- `venture_uat_report` (if separate table)

## Related Documentation

- [stages_v2.yaml](../stages_v2.yaml#L919) - Stage 21 definition
- [25-Stage Overview](../25-stage-venture-lifecycle-overview.md#phase-6-launch-learn) - Phase context
- [Stage 20: Security & Performance](stage-20-security-and-performance.md) - Previous stage
- [Stage 22: Deployment & Infrastructure](stage-22-deployment-and-infrastructure.md) - Next stage







## Version History

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | 2026-01-19 | Vision V2 initial documentation |

---
*Part of Vision V2 (25-Stage Venture Lifecycle)*
*Technical Reference: `docs/workflow/stages_v2.yaml` (lines 919-959)*
