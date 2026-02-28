---
category: guide
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [guide, auto-generated]
---
# Stage 10: Strategic Naming

## Metadata
- **Category**: Protocol
- **Status**: Approved
- **Version**: 2.0.0
- **Author**: Documentation Sub-Agent (DOCMON)
- **Last Updated**: 2026-01-19
- **Tags**: venture-workflow, stage-10, vision-v2, sd_required, phase-3
- **Stage ID**: 10
- **Phase**: 3 (THE IDENTITY)
- **Work Type**: `sd_required`
- **SD Required**: Yes (BRAND)
- **Advisory Enabled**: No
- **Implementation Status**: ✅ Implemented in EHG

## Overview

Brand naming, identity development, cultural design style selection, and guidelines creation.

## Purpose


This stage requires a Strategic Directive (SD) to be created and executed.

## Dependencies

- **Previous Stage**: Stage 9 (Exit-Oriented Design)
- **Next Stage**: Stage 11 (Go-to-Market Strategy)

## Inputs

| Input | Source | Required |
|------|------|------|
| Business model | Previous stages | Yes |
| Target audience | Previous stages | Yes |
| Competitive positioning | Previous stages | Yes |
| Industry vertical (for cultural style inference) | Previous stages | Yes |

## Outputs

| Output | Format | Storage |
|------|------|------|
| Brand name | Artifact/Database | Database |
| Brand guidelines | Artifact/Database | Database |
| Visual identity specs | Artifact/Database | Database |
| Cultural design style selection | Artifact/Database | Database |

## Artifacts

- **`brand_guidelines`**
- **`cultural_design_config`**

## Entry Gates

None (previous stage completion is sufficient)

## Exit Gates

No specific exit gates defined.

## Metrics

| Metric | Target | Purpose |
|------|------|------|
| Name availability | TBD | Performance tracking |
| Brand strength score | TBD | Performance tracking |
| Cultural style alignment score | TBD | Performance tracking |

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
- `Stage10*.tsx` - Stage-specific component
- `Stage10Viewer.tsx` - Stage output viewer
- `VentureStageNavigation.tsx` - Phase-based navigation accordion

**Database**: `ventures.current_lifecycle_stage` tracks progression (INTEGER 1-25)

## Database Schema

**Primary Table**: `ventures` (with `current_lifecycle_stage` tracking)

**Related Tables**:
- `lifecycle_stage_config` - Stage definitions (25 stages, 6 phases)
- `venture_stage_work` - Stage entry/completion tracking
- `venture_brand_guidelines` (if separate table)
- `venture_cultural_design_config` (if separate table)

## Related Documentation

- [stages_v2.yaml](../stages_v2.yaml#L479) - Stage 10 definition
- [25-Stage Overview](../25-stage-venture-lifecycle-overview.md#phase-3-the-identity) - Phase context
- [Stage 9: Exit-Oriented Design](stage-09-exit-oriented-design.md) - Previous stage
- [Stage 11: Go-to-Market Strategy](stage-11-go-to-market-strategy.md) - Next stage







## Version History

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | 2026-01-19 | Vision V2 initial documentation |

---
*Part of Vision V2 (25-Stage Venture Lifecycle)*
*Technical Reference: `docs/workflow/stages_v2.yaml` (lines 479-519)*
