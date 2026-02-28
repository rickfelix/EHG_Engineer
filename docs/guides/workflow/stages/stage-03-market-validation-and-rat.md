---
category: guide
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [guide, auto-generated]
---
# Stage 3: Market Validation & RAT

## Metadata
- **Category**: Protocol
- **Status**: Approved
- **Version**: 2.0.0
- **Author**: Documentation Sub-Agent (DOCMON)
- **Last Updated**: 2026-01-19
- **Tags**: venture-workflow, stage-03, vision-v2, decision_gate, phase-1
- **Stage ID**: 3
- **Phase**: 1 (THE TRUTH)
- **Work Type**: `decision_gate`
- **SD Required**: No
- **Advisory Enabled**: Yes
- **Implementation Status**: ✅ Implemented in EHG

## Overview

Validate problem-solution fit, user willingness to pay, and technical feasibility.

## Purpose

This is a **decision gate** stage where critical go/no-go decisions are made.
This is an artifact-only stage focused on producing specific outputs.

## Dependencies

- **Previous Stage**: Stage 2 (AI Multi-Model Critique)
- **Next Stage**: Stage 4 (Competitive Intelligence)

## Inputs

| Input | Source | Required |
|------|------|------|
| AI review report | Previous stages | Yes |
| Market research | Previous stages | Yes |
| User interviews | Previous stages | Yes |

## Outputs

| Output | Format | Storage |
|------|------|------|
| Validation report | Artifact/Database | Database |
| User feedback | Artifact/Database | Database |
| Feasibility assessment | Artifact/Database | Database |

## Artifacts

- **`validation_report`**

## Entry Gates

- AI critique complete

## Exit Gates

| Gate | Criteria | Validation |
|------|------|------|
| Validation score >= 6 | Must be met | Required |
| [object Object] | Must be met | Required |

## Metrics

| Metric | Target | Purpose |
|------|------|------|
| Validation score (1-10) | TBD | Performance tracking |
| WTP confidence | TBD | Performance tracking |

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

- **Artifact Quality**: Ensure all outputs meet standards
- **Exit Gate Validation**: Don't skip validation steps
- **Documentation**: Keep detailed records of decisions

## Common Pitfalls

| Pitfall | Impact | Solution |
|---------|--------|----------|
| Skipping validation | Poor quality downstream | Follow all exit gates |
| Incomplete artifacts | Blocks next stage | Check artifact completeness |
| Emotional decisions | Wrong ventures proceed | Use objective criteria |


## UI Implementation

**Current Status**: ✅ Implemented in EHG

**Location**: `/ventures/[id]` route with stage navigation

**Components**: 
- `Stage3*.tsx` - Stage-specific component
- `Stage3Viewer.tsx` - Stage output viewer
- `VentureStageNavigation.tsx` - Phase-based navigation accordion

**Database**: `ventures.current_lifecycle_stage` tracks progression (INTEGER 1-25)

## Database Schema

**Primary Table**: `ventures` (with `current_lifecycle_stage` tracking)

**Related Tables**:
- `lifecycle_stage_config` - Stage definitions (25 stages, 6 phases)
- `venture_stage_work` - Stage entry/completion tracking
- `venture_validation_report` (if separate table)

## Related Documentation

- [stages_v2.yaml](../stages_v2.yaml#L199) - Stage 3 definition
- [25-Stage Overview](../25-stage-venture-lifecycle-overview.md#phase-1-the-truth) - Phase context
- [Stage 2: AI Multi-Model Critique](stage-02-ai-multi-model-critique.md) - Previous stage
- [Stage 4: Competitive Intelligence](stage-04-competitive-intelligence.md) - Next stage

## Golden Nugget: Assumptions vs Reality

This stage includes Assumptions vs Reality tracking:
- **Action**: finalize_v1
- **Note**: Finalize Assumption Set V1 with validated market beliefs, confidence scores


## Golden Nugget: Four Buckets (Epistemic Classification)

This stage requires epistemic classification of all outputs:
- **Required**: Yes
- **Note**: Decision gate - all claims must be classified as Facts/Assumptions/Simulations/Unknowns




## Version History

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | 2026-01-19 | Vision V2 initial documentation |

---
*Part of Vision V2 (25-Stage Venture Lifecycle)*
*Technical Reference: `docs/workflow/stages_v2.yaml` (lines 199-239)*
