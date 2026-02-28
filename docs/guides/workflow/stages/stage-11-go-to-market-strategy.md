---
category: guide
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [guide, auto-generated]
---
# Stage 11: Go-to-Market Strategy

## Metadata
- **Category**: Protocol
- **Status**: Approved
- **Version**: 2.0.0
- **Author**: Documentation Sub-Agent (DOCMON)
- **Last Updated**: 2026-01-19
- **Tags**: venture-workflow, stage-11, vision-v2, artifact_only, phase-3
- **Stage ID**: 11
- **Phase**: 3 (THE IDENTITY)
- **Work Type**: `artifact_only`
- **SD Required**: No
- **Advisory Enabled**: No
- **Implementation Status**: ✅ Implemented in EHG

## Overview

Marketing strategy, channel selection, and launch planning.

## Purpose


This is an artifact-only stage focused on producing specific outputs.

## Dependencies

- **Previous Stage**: Stage 10 (Strategic Naming)
- **Next Stage**: Stage 12 (Sales & Success Logic)

## Inputs

| Input | Source | Required |
|------|------|------|
| Brand identity | Previous stages | Yes |
| Target segments | Previous stages | Yes |
| Competitive position | Previous stages | Yes |

## Outputs

| Output | Format | Storage |
|------|------|------|
| GTM plan | Artifact/Database | Database |
| Marketing manifest | Artifact/Database | Database |
| Channel strategy | Artifact/Database | Database |

## Artifacts

- **`gtm_plan`**
- **`marketing_manifest`**
- **`brand_messaging_options`**

## Entry Gates

None (previous stage completion is sufficient)

## Exit Gates

No specific exit gates defined.

## Metrics

| Metric | Target | Purpose |
|------|------|------|
| Channel coverage | TBD | Performance tracking |
| Launch readiness | TBD | Performance tracking |

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
- `Stage11*.tsx` - Stage-specific component
- `Stage11Viewer.tsx` - Stage output viewer
- `VentureStageNavigation.tsx` - Phase-based navigation accordion

**Database**: `ventures.current_lifecycle_stage` tracks progression (INTEGER 1-25)

## Database Schema

**Primary Table**: `ventures` (with `current_lifecycle_stage` tracking)

**Related Tables**:
- `lifecycle_stage_config` - Stage definitions (25 stages, 6 phases)
- `venture_stage_work` - Stage entry/completion tracking
- `venture_gtm_plan` (if separate table)
- `venture_marketing_manifest` (if separate table)
- `venture_brand_messaging_options` (if separate table)

## Related Documentation

- [stages_v2.yaml](../stages_v2.yaml#L519) - Stage 11 definition
- [25-Stage Overview](../25-stage-venture-lifecycle-overview.md#phase-3-the-identity) - Phase context
- [Stage 10: Strategic Naming](stage-10-strategic-naming.md) - Previous stage
- [Stage 12: Sales & Success Logic](stage-12-sales-and-success-logic.md) - Next stage





## Golden Nugget: Crew Tournament

This stage uses tournament-style agent competition:
- **Enabled**: Yes (Pilot stage)
- **Note**: Tournament-style agent competition for brand messaging (3 workers, 1 manager)


## Version History

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | 2026-01-19 | Vision V2 initial documentation |

---
*Part of Vision V2 (25-Stage Venture Lifecycle)*
*Technical Reference: `docs/workflow/stages_v2.yaml` (lines 519-559)*
