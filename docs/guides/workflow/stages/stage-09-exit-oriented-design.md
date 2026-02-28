---
category: guide
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [guide, auto-generated]
---
# Stage 9: Exit-Oriented Design

## Metadata
- **Category**: Protocol
- **Status**: Approved
- **Version**: 2.0.0
- **Author**: Documentation Sub-Agent (DOCMON)
- **Last Updated**: 2026-01-19
- **Tags**: venture-workflow, stage-09, vision-v2, artifact_only, phase-2
- **Stage ID**: 9
- **Phase**: 2 (THE ENGINE)
- **Work Type**: `artifact_only`
- **SD Required**: No
- **Advisory Enabled**: No
- **Implementation Status**: ✅ Implemented in EHG

## Overview

Strategic exit planning, valuation targets, and acquisition-friendly architecture.

## Purpose


This is an artifact-only stage focused on producing specific outputs.

## Dependencies

- **Previous Stage**: Stage 8 (Business Model Canvas)
- **Next Stage**: Stage 10 (Strategic Naming)

## Inputs

| Input | Source | Required |
|------|------|------|
| Business model | Previous stages | Yes |
| Market multiples | Previous stages | Yes |
| Comparable exits | Previous stages | Yes |

## Outputs

| Output | Format | Storage |
|------|------|------|
| Exit strategy | Artifact/Database | Database |
| Valuation targets | Artifact/Database | Database |
| Timeline planning | Artifact/Database | Database |

## Artifacts

- **`exit_strategy`**

## Entry Gates

None (previous stage completion is sufficient)

## Exit Gates

No specific exit gates defined.

## Metrics

| Metric | Target | Purpose |
|------|------|------|
| Exit scenarios defined | TBD | Performance tracking |
| Valuation methodology | TBD | Performance tracking |

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
- `Stage9*.tsx` - Stage-specific component
- `Stage9Viewer.tsx` - Stage output viewer
- `VentureStageNavigation.tsx` - Phase-based navigation accordion

**Database**: `ventures.current_lifecycle_stage` tracks progression (INTEGER 1-25)

## Database Schema

**Primary Table**: `ventures` (with `current_lifecycle_stage` tracking)

**Related Tables**:
- `lifecycle_stage_config` - Stage definitions (25 stages, 6 phases)
- `venture_stage_work` - Stage entry/completion tracking
- `venture_exit_strategy` (if separate table)

## Related Documentation

- [stages_v2.yaml](../stages_v2.yaml#L439) - Stage 9 definition
- [25-Stage Overview](../25-stage-venture-lifecycle-overview.md#phase-2-the-engine) - Phase context
- [Stage 8: Business Model Canvas](stage-08-business-model-canvas.md) - Previous stage
- [Stage 10: Strategic Naming](stage-10-strategic-naming.md) - Next stage







## Version History

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | 2026-01-19 | Vision V2 initial documentation |

---
*Part of Vision V2 (25-Stage Venture Lifecycle)*
*Technical Reference: `docs/workflow/stages_v2.yaml` (lines 439-479)*
