# Stage 18: MVP Development Loop

## Metadata
- **Category**: Protocol
- **Status**: Approved
- **Version**: 2.0.0
- **Author**: Documentation Sub-Agent (DOCMON)
- **Last Updated**: 2026-01-19
- **Tags**: venture-workflow, stage-18, vision-v2, sd_required, phase-5
- **Stage ID**: 18
- **Phase**: 5 (THE BUILD LOOP)
- **Work Type**: `sd_required`
- **SD Required**: Yes (MVP)
- **Advisory Enabled**: No
- **Implementation Status**: ✅ Implemented in EHG

## Overview

Core feature implementation following story-driven development.

## Purpose


This stage requires a Strategic Directive (SD) to be created and executed.

## Dependencies

- **Previous Stage**: Stage 17 (Environment & Agent Config)
- **Next Stage**: Stage 19 (Integration & API Layer)

## Inputs

| Input | Source | Required |
|------|------|------|
| User stories | Previous stages | Yes |
| Schema specifications | Previous stages | Yes |
| Environment config | Previous stages | Yes |

## Outputs

| Output | Format | Storage |
|------|------|------|
| Working code | Artifact/Database | Database |
| Feature implementations | Artifact/Database | Database |
| Technical debt log | Artifact/Database | Database |

## Artifacts

No named artifacts defined.

## Entry Gates

None (previous stage completion is sufficient)

## Exit Gates

No specific exit gates defined.

## Metrics

| Metric | Target | Purpose |
|------|------|------|
| Story completion rate | TBD | Performance tracking |
| Code quality score | TBD | Performance tracking |

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
- `Stage18*.tsx` - Stage-specific component
- `Stage18Viewer.tsx` - Stage output viewer
- `VentureStageNavigation.tsx` - Phase-based navigation accordion

**Database**: `ventures.current_lifecycle_stage` tracks progression (INTEGER 1-25)

## Database Schema

**Primary Table**: `ventures` (with `current_lifecycle_stage` tracking)

**Related Tables**:
- `lifecycle_stage_config` - Stage definitions (25 stages, 6 phases)
- `venture_stage_work` - Stage entry/completion tracking


## Related Documentation

- [stages_v2.yaml](../stages_v2.yaml#L799) - Stage 18 definition
- [25-Stage Overview](../25-stage-venture-lifecycle-overview.md#phase-5-the-build-loop) - Phase context
- [Stage 17: Environment & Agent Config](stage-17-environment-and-agent-config.md) - Previous stage
- [Stage 19: Integration & API Layer](stage-19-integration-and-api-layer.md) - Next stage







## Version History

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | 2026-01-19 | Vision V2 initial documentation |

---
*Part of Vision V2 (25-Stage Venture Lifecycle)*
*Technical Reference: `docs/workflow/stages_v2.yaml` (lines 799-839)*
