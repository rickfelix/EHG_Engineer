# Stage 17: Environment & Agent Config

## Metadata
- **Category**: Protocol
- **Status**: Approved
- **Version**: 2.0.0
- **Author**: Documentation Sub-Agent (DOCMON)
- **Last Updated**: 2026-01-19
- **Tags**: venture-workflow, stage-17, vision-v2, sd_required, phase-5
- **Stage ID**: 17
- **Phase**: 5 (THE BUILD LOOP)
- **Work Type**: `sd_required`
- **SD Required**: Yes (ENVCONFIG)
- **Advisory Enabled**: No
- **Implementation Status**: ✅ Implemented in EHG

## Overview

Development environment setup, AI agent configuration, and CI/CD pipeline.

## Purpose


This stage requires a Strategic Directive (SD) to be created and executed.

## Dependencies

- **Previous Stage**: Stage 16 (Spec-Driven Schema Generation)
- **Next Stage**: Stage 18 (MVP Development Loop)

## Inputs

| Input | Source | Required |
|------|------|------|
| Tech stack decision | Previous stages | Yes |
| Schema specifications | Previous stages | Yes |
| Team requirements | Previous stages | Yes |

## Outputs

| Output | Format | Storage |
|------|------|------|
| Environment setup | Artifact/Database | Database |
| System prompts | Artifact/Database | Database |
| CI/CD pipeline | Artifact/Database | Database |

## Artifacts

- **`system_prompt`**
- **`cicd_config`**

## Entry Gates

None (previous stage completion is sufficient)

## Exit Gates

No specific exit gates defined.

## Metrics

| Metric | Target | Purpose |
|------|------|------|
| Environment readiness | TBD | Performance tracking |
| Agent effectiveness | TBD | Performance tracking |

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
- `Stage17*.tsx` - Stage-specific component
- `Stage17Viewer.tsx` - Stage output viewer
- `VentureStageNavigation.tsx` - Phase-based navigation accordion

**Database**: `ventures.current_lifecycle_stage` tracks progression (INTEGER 1-25)

## Database Schema

**Primary Table**: `ventures` (with `current_lifecycle_stage` tracking)

**Related Tables**:
- `lifecycle_stage_config` - Stage definitions (25 stages, 6 phases)
- `venture_stage_work` - Stage entry/completion tracking
- `venture_system_prompt` (if separate table)
- `venture_cicd_config` (if separate table)

## Related Documentation

- [stages_v2.yaml](../stages_v2.yaml#L759) - Stage 17 definition
- [25-Stage Overview](../25-stage-venture-lifecycle-overview.md#phase-5-the-build-loop) - Phase context
- [Stage 16: Spec-Driven Schema Generation](stage-16-spec-driven-schema-generation.md) - Previous stage
- [Stage 18: MVP Development Loop](stage-18-mvp-development-loop.md) - Next stage







## Version History

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | 2026-01-19 | Vision V2 initial documentation |

---
*Part of Vision V2 (25-Stage Venture Lifecycle)*
*Technical Reference: `docs/workflow/stages_v2.yaml` (lines 759-799)*
