# Stage 14: Data Model & Architecture

## Metadata
- **Category**: Protocol
- **Status**: Approved
- **Version**: 2.0.0
- **Author**: Documentation Sub-Agent (DOCMON)
- **Last Updated**: 2026-01-19
- **Tags**: venture-workflow, stage-14, vision-v2, sd_required, phase-4
- **Stage ID**: 14
- **Phase**: 4 (THE BLUEPRINT)
- **Work Type**: `sd_required`
- **SD Required**: Yes (DATAMODEL)
- **Advisory Enabled**: No
- **Implementation Status**: ✅ Implemented in EHG

## Overview

Entity relationship design, schema architecture, and data flow planning.

## Purpose


This stage requires a Strategic Directive (SD) to be created and executed.

## Dependencies

- **Previous Stage**: Stage 13 (Tech Stack Interrogation)
- **Next Stage**: Stage 15 (Epic & User Story Breakdown)

## Inputs

| Input | Source | Required |
|------|------|------|
| Tech stack decision | Previous stages | Yes |
| Business entities | Previous stages | Yes |
| Integration requirements | Previous stages | Yes |

## Outputs

| Output | Format | Storage |
|------|------|------|
| Data model | Artifact/Database | Database |
| ERD diagrams | Artifact/Database | Database |
| Schema specifications | Artifact/Database | Database |

## Artifacts

- **`data_model`**
- **`erd_diagram`**

## Entry Gates

None (previous stage completion is sufficient)

## Exit Gates

No specific exit gates defined.

## Metrics

| Metric | Target | Purpose |
|------|------|------|
| Entity coverage | TBD | Performance tracking |
| Relationship clarity | TBD | Performance tracking |

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
- `Stage14*.tsx` - Stage-specific component
- `Stage14Viewer.tsx` - Stage output viewer
- `VentureStageNavigation.tsx` - Phase-based navigation accordion

**Database**: `ventures.current_lifecycle_stage` tracks progression (INTEGER 1-25)

## Database Schema

**Primary Table**: `ventures` (with `current_lifecycle_stage` tracking)

**Related Tables**:
- `lifecycle_stage_config` - Stage definitions (25 stages, 6 phases)
- `venture_stage_work` - Stage entry/completion tracking
- `venture_data_model` (if separate table)
- `venture_erd_diagram` (if separate table)

## Related Documentation

- [stages_v2.yaml](../stages_v2.yaml#L639) - Stage 14 definition
- [25-Stage Overview](../25-stage-venture-lifecycle-overview.md#phase-4-the-blueprint) - Phase context
- [Stage 13: Tech Stack Interrogation](stage-13-tech-stack-interrogation.md) - Previous stage
- [Stage 15: Epic & User Story Breakdown](stage-15-epic-and-user-story-breakdown.md) - Next stage







## Version History

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | 2026-01-19 | Vision V2 initial documentation |

---
*Part of Vision V2 (25-Stage Venture Lifecycle)*
*Technical Reference: `docs/workflow/stages_v2.yaml` (lines 639-679)*
