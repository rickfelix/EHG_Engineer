---
category: guide
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [guide, auto-generated]
---
# Stage 1: Draft Idea & Chairman Review

## Metadata
- **Category**: Protocol
- **Status**: Approved
- **Version**: 2.0.0
- **Author**: Documentation Sub-Agent (DOCMON)
- **Last Updated**: 2026-01-19
- **Tags**: venture-workflow, stage-01, vision-v2, artifact_only, phase-1
- **Stage ID**: 1
- **Phase**: 1 (THE TRUTH)
- **Work Type**: `artifact_only`
- **SD Required**: No
- **Advisory Enabled**: No
- **Implementation Status**: ✅ Implemented in EHG

## Overview

Capture and validate initial venture ideas with AI assistance and Chairman feedback.

## Purpose


This is an artifact-only stage focused on producing specific outputs.

## Dependencies

- **Previous Stage**: None (entry point)
- **Next Stage**: Stage 2 (AI Multi-Model Critique)

## Inputs

| Input | Source | Required |
|------|------|------|
| Voice recording | Previous stages | Yes |
| Text input | Previous stages | Yes |
| Chairman feedback | Previous stages | Yes |

## Outputs

| Output | Format | Storage |
|------|------|------|
| Structured idea document | Artifact/Database | Database |
| Initial validation | Artifact/Database | Database |
| Risk assessment | Artifact/Database | Database |

## Artifacts

- **`idea_brief`**

## Entry Gates

None (previous stage completion is sufficient)

## Exit Gates

| Gate | Criteria | Validation |
|------|------|------|
| Title validated (3-120 chars) | Must be met | Required |
| Description validated (20-2000 chars) | Must be met | Required |
| Category assigned | Must be met | Required |
| problem_statement populated | Must be met | Required |
| Chairman intent captured | Must be met | Required |

## Metrics

| Metric | Target | Purpose |
|------|------|------|
| Idea quality score | TBD | Performance tracking |
| Validation completeness | TBD | Performance tracking |

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
- `Stage1*.tsx` - Stage-specific component
- `Stage1Viewer.tsx` - Stage output viewer
- `VentureStageNavigation.tsx` - Phase-based navigation accordion

**Database**: `ventures.current_lifecycle_stage` tracks progression (INTEGER 1-25)

## Database Schema

**Primary Table**: `ventures` (with `current_lifecycle_stage` tracking)

**Related Tables**:
- `lifecycle_stage_config` - Stage definitions (25 stages, 6 phases)
- `venture_stage_work` - Stage entry/completion tracking
- `venture_idea_brief` (if separate table)

## Related Documentation

- [stages_v2.yaml](../stages_v2.yaml#L119) - Stage 1 definition
- [25-Stage Overview](../25-stage-venture-lifecycle-overview.md#phase-1-the-truth) - Phase context

- [Stage 2: AI Multi-Model Critique](stage-02-ai-multi-model-critique.md) - Next stage







## Version History

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | 2026-01-19 | Vision V2 initial documentation |

---
*Part of Vision V2 (25-Stage Venture Lifecycle)*
*Technical Reference: `docs/workflow/stages_v2.yaml` (lines 119-159)*
