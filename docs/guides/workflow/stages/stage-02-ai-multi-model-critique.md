---
category: guide
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [guide, auto-generated]
---
# Stage 2: AI Multi-Model Critique

## Metadata
- **Category**: Protocol
- **Status**: Approved
- **Version**: 2.0.0
- **Author**: Documentation Sub-Agent (DOCMON)
- **Last Updated**: 2026-01-19
- **Tags**: venture-workflow, stage-02, vision-v2, automated_check, phase-1
- **Stage ID**: 2
- **Phase**: 1 (THE TRUTH)
- **Work Type**: `automated_check`
- **SD Required**: No
- **Advisory Enabled**: No
- **Implementation Status**: ✅ Implemented in EHG

## Overview

Multi-agent AI system reviews and critiques the idea from multiple perspectives.

## Purpose


This is an artifact-only stage focused on producing specific outputs.

## Dependencies

- **Previous Stage**: Stage 1 (Draft Idea & Chairman Review)
- **Next Stage**: Stage 3 (Market Validation & RAT)

## Inputs

| Input | Source | Required |
|------|------|------|
| Structured idea | Previous stages | Yes |
| Historical data | Previous stages | Yes |
| Market signals | Previous stages | Yes |

## Outputs

| Output | Format | Storage |
|------|------|------|
| AI critique report | Artifact/Database | Database |
| Contrarian analysis | Artifact/Database | Database |
| Risk assessment | Artifact/Database | Database |

## Artifacts

- **`critique_report`**

## Entry Gates

- Idea document complete

## Exit Gates

| Gate | Criteria | Validation |
|------|------|------|
| Multi-model pass complete | Must be met | Required |
| Contrarian review done | Must be met | Required |
| Top-5 risks identified | Must be met | Required |

## Metrics

| Metric | Target | Purpose |
|------|------|------|
| Review thoroughness | TBD | Performance tracking |
| Risk identification rate | TBD | Performance tracking |

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
- `Stage2*.tsx` - Stage-specific component
- `Stage2Viewer.tsx` - Stage output viewer
- `VentureStageNavigation.tsx` - Phase-based navigation accordion

**Database**: `ventures.current_lifecycle_stage` tracks progression (INTEGER 1-25)

## Database Schema

**Primary Table**: `ventures` (with `current_lifecycle_stage` tracking)

**Related Tables**:
- `lifecycle_stage_config` - Stage definitions (25 stages, 6 phases)
- `venture_stage_work` - Stage entry/completion tracking
- `venture_critique_report` (if separate table)

## Related Documentation

- [stages_v2.yaml](../stages_v2.yaml#L159) - Stage 2 definition
- [25-Stage Overview](../25-stage-venture-lifecycle-overview.md#phase-1-the-truth) - Phase context
- [Stage 1: Draft Idea & Chairman Review](stage-01-draft-idea-and-chairman-review.md) - Previous stage
- [Stage 3: Market Validation & RAT](stage-03-market-validation-and-rat.md) - Next stage

## Golden Nugget: Assumptions vs Reality

This stage includes Assumptions vs Reality tracking:
- **Action**: create_draft
- **Note**: Begin drafting Assumption Set V1 with initial market/competitor beliefs from critique






## Version History

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | 2026-01-19 | Vision V2 initial documentation |

---
*Part of Vision V2 (25-Stage Venture Lifecycle)*
*Technical Reference: `docs/workflow/stages_v2.yaml` (lines 159-199)*
