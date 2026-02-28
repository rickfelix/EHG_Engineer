---
category: guide
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [guide, auto-generated]
---
# Stage 15: Epic & User Story Breakdown

## Metadata
- **Category**: Protocol
- **Status**: Approved
- **Version**: 2.0.0
- **Author**: Documentation Sub-Agent (DOCMON)
- **Last Updated**: 2026-01-19
- **Tags**: venture-workflow, stage-15, vision-v2, sd_required, phase-4
- **Stage ID**: 15
- **Phase**: 4 (THE BLUEPRINT)
- **Work Type**: `sd_required`
- **SD Required**: Yes (STORIES)
- **Advisory Enabled**: No
- **Implementation Status**: ✅ Implemented in EHG

## Overview

Feature decomposition into epics and user stories with acceptance criteria.

## Purpose


This stage requires a Strategic Directive (SD) to be created and executed.

## Dependencies

- **Previous Stage**: Stage 14 (Data Model & Architecture)
- **Next Stage**: Stage 16 (Spec-Driven Schema Generation)

## Inputs

| Input | Source | Required |
|------|------|------|
| Data model | Previous stages | Yes |
| Business requirements | Previous stages | Yes |
| User journeys | Previous stages | Yes |

## Outputs

| Output | Format | Storage |
|------|------|------|
| Epic definitions | Artifact/Database | Database |
| User story pack | Artifact/Database | Database |
| Acceptance criteria | Artifact/Database | Database |

## Artifacts

- **`user_story_pack`**

## Entry Gates

None (previous stage completion is sufficient)

## Exit Gates

No specific exit gates defined.

## Metrics

| Metric | Target | Purpose |
|------|------|------|
| Story completeness | TBD | Performance tracking |
| INVEST compliance | TBD | Performance tracking |

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
- `Stage15*.tsx` - Stage-specific component
- `Stage15Viewer.tsx` - Stage output viewer
- `VentureStageNavigation.tsx` - Phase-based navigation accordion

**Database**: `ventures.current_lifecycle_stage` tracks progression (INTEGER 1-25)

## Database Schema

**Primary Table**: `ventures` (with `current_lifecycle_stage` tracking)

**Related Tables**:
- `lifecycle_stage_config` - Stage definitions (25 stages, 6 phases)
- `venture_stage_work` - Stage entry/completion tracking
- `venture_user_story_pack` (if separate table)

## Related Documentation

- [stages_v2.yaml](../stages_v2.yaml#L679) - Stage 15 definition
- [25-Stage Overview](../25-stage-venture-lifecycle-overview.md#phase-4-the-blueprint) - Phase context
- [Stage 14: Data Model & Architecture](stage-14-data-model-and-architecture.md) - Previous stage
- [Stage 16: Spec-Driven Schema Generation](stage-16-spec-driven-schema-generation.md) - Next stage







## Version History

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | 2026-01-19 | Vision V2 initial documentation |

---
*Part of Vision V2 (25-Stage Venture Lifecycle)*
*Technical Reference: `docs/workflow/stages_v2.yaml` (lines 679-719)*
