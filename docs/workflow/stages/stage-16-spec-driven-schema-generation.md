# Stage 16: Spec-Driven Schema Generation

## Metadata
- **Category**: Protocol
- **Status**: Approved
- **Version**: 2.0.0
- **Author**: Documentation Sub-Agent (DOCMON)
- **Last Updated**: 2026-01-19
- **Tags**: venture-workflow, stage-16, vision-v2, decision_gate, phase-4
- **Stage ID**: 16
- **Phase**: 4 (THE BLUEPRINT)
- **Work Type**: `decision_gate`
- **SD Required**: Yes (SCHEMA)
- **Advisory Enabled**: Yes
- **Implementation Status**: ✅ Implemented in EHG

## Overview

TypeScript interfaces, SQL schemas, and API contract generation from specifications.

## Purpose

This is a **decision gate** stage where critical go/no-go decisions are made.
This stage requires a Strategic Directive (SD) to be created and executed.

## Dependencies

- **Previous Stage**: Stage 15 (Epic & User Story Breakdown)
- **Next Stage**: Stage 17 (Environment & Agent Config)

## Inputs

| Input | Source | Required |
|------|------|------|
| User stories | Previous stages | Yes |
| Data model | Previous stages | Yes |
| API requirements | Previous stages | Yes |

## Outputs

| Output | Format | Storage |
|------|------|------|
| TypeScript interfaces | Artifact/Database | Database |
| SQL schemas | Artifact/Database | Database |
| API contracts | Artifact/Database | Database |

## Artifacts

- **`api_contract`**
- **`schema_spec`**

## Entry Gates

None (previous stage completion is sufficient)

## Exit Gates

No specific exit gates defined.

## Metrics

| Metric | Target | Purpose |
|------|------|------|
| Schema completeness | TBD | Performance tracking |
| Type coverage | TBD | Performance tracking |

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
| Emotional decisions | Wrong ventures proceed | Use objective criteria |
| Bypassing SD process | Protocol violation | Always create SD first |

## UI Implementation

**Current Status**: ✅ Implemented in EHG

**Location**: `/ventures/[id]` route with stage navigation

**Components**: 
- `Stage16*.tsx` - Stage-specific component
- `Stage16Viewer.tsx` - Stage output viewer
- `VentureStageNavigation.tsx` - Phase-based navigation accordion

**Database**: `ventures.current_lifecycle_stage` tracks progression (INTEGER 1-25)

## Database Schema

**Primary Table**: `ventures` (with `current_lifecycle_stage` tracking)

**Related Tables**:
- `lifecycle_stage_config` - Stage definitions (25 stages, 6 phases)
- `venture_stage_work` - Stage entry/completion tracking
- `venture_api_contract` (if separate table)
- `venture_schema_spec` (if separate table)

## Related Documentation

- [stages_v2.yaml](../stages_v2.yaml#L719) - Stage 16 definition
- [25-Stage Overview](../25-stage-venture-lifecycle-overview.md#phase-4-the-blueprint) - Phase context
- [Stage 15: Epic & User Story Breakdown](stage-15-epic-and-user-story-breakdown.md) - Previous stage
- [Stage 17: Environment & Agent Config](stage-17-environment-and-agent-config.md) - Next stage



## Golden Nugget: Four Buckets (Epistemic Classification)

This stage requires epistemic classification of all outputs:
- **Required**: Yes
- **Note**: Schema Firewall - all schema decisions must have epistemic classification (Facts/Assumptions/Unknowns)




## Version History

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | 2026-01-19 | Vision V2 initial documentation |

---
*Part of Vision V2 (25-Stage Venture Lifecycle)*
*Technical Reference: `docs/workflow/stages_v2.yaml` (lines 719-759)*
