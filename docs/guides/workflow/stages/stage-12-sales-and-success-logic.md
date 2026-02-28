---
category: guide
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [guide, auto-generated]
---
# Stage 12: Sales & Success Logic

## Metadata
- **Category**: Protocol
- **Status**: Approved
- **Version**: 2.0.0
- **Author**: Documentation Sub-Agent (DOCMON)
- **Last Updated**: 2026-01-19
- **Tags**: venture-workflow, stage-12, vision-v2, artifact_only, phase-3
- **Stage ID**: 12
- **Phase**: 3 (THE IDENTITY)
- **Work Type**: `artifact_only`
- **SD Required**: No
- **Advisory Enabled**: No
- **Implementation Status**: ✅ Implemented in EHG

## Overview

Sales process design, customer success workflows, and support model.

## Purpose


This is an artifact-only stage focused on producing specific outputs.

## Dependencies

- **Previous Stage**: Stage 11 (Go-to-Market Strategy)
- **Next Stage**: Stage 13 (Tech Stack Interrogation)

## Inputs

| Input | Source | Required |
|------|------|------|
| GTM strategy | Previous stages | Yes |
| Customer segments | Previous stages | Yes |
| Product capabilities | Previous stages | Yes |

## Outputs

| Output | Format | Storage |
|------|------|------|
| Sales playbook | Artifact/Database | Database |
| Success workflows | Artifact/Database | Database |
| Support model | Artifact/Database | Database |

## Artifacts

- **`sales_playbook`**

## Entry Gates

None (previous stage completion is sufficient)

## Exit Gates

No specific exit gates defined.

## Metrics

| Metric | Target | Purpose |
|------|------|------|
| Process completeness | TBD | Performance tracking |
| Handoff clarity | TBD | Performance tracking |

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
- `Stage12*.tsx` - Stage-specific component
- `Stage12Viewer.tsx` - Stage output viewer
- `VentureStageNavigation.tsx` - Phase-based navigation accordion

**Database**: `ventures.current_lifecycle_stage` tracks progression (INTEGER 1-25)

## Database Schema

**Primary Table**: `ventures` (with `current_lifecycle_stage` tracking)

**Related Tables**:
- `lifecycle_stage_config` - Stage definitions (25 stages, 6 phases)
- `venture_stage_work` - Stage entry/completion tracking
- `venture_sales_playbook` (if separate table)

## Related Documentation

- [stages_v2.yaml](../stages_v2.yaml#L559) - Stage 12 definition
- [25-Stage Overview](../25-stage-venture-lifecycle-overview.md#phase-3-the-identity) - Phase context
- [Stage 11: Go-to-Market Strategy](stage-11-go-to-market-strategy.md) - Previous stage
- [Stage 13: Tech Stack Interrogation](stage-13-tech-stack-interrogation.md) - Next stage







## Version History

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | 2026-01-19 | Vision V2 initial documentation |

---
*Part of Vision V2 (25-Stage Venture Lifecycle)*
*Technical Reference: `docs/workflow/stages_v2.yaml` (lines 559-599)*
