---
category: guide
status: approved
version: 1.0.0
author: Rick Felix
last_updated: 2026-04-23
tags: [guide, guides, workflow]
---

# EHG Venture Workflow Documentation

## Overview
Complete documentation for the EHG venture workflow, from ideation to exit. The original 40-stage workflow is retired; the live model is the 25-stage workflow defined in `stages_v2.yaml`. References to stages above 25 in this directory describe the retired 40-stage workflow.

## Directory Structure

### Core Documentation
- `stages_v2.yaml` - Canonical definition of the live 25-stage model (single source of truth)
- `stages.yaml` - Archived 40-stage configuration (deprecated; retained for history)
- `sop-index.md` - Index of all Standard Operating Procedures
- `sop/` - Detailed SOPs for each stage

### Analysis & Optimization
- `critique/` - Critical analysis of workflow and individual stages
- `prd_crosswalk.md` - Mapping of stages to PRD documentation
- `prd_crosswalk.csv` - Machine-readable PRD mapping

### Work Management
- `backlog/backlog.yaml` - Prioritized improvement backlog
- `backlog/issues/` - GitHub-ready issue templates

## Quick Start

### For Developers
1. Start with `stages.yaml` for stage definitions
2. Reference SOPs for implementation details
3. Check PRD crosswalk for existing documentation
4. Review backlog for known issues

### For Product Managers
1. Review critique/overview.md for optimization opportunities
2. Check backlog for prioritized improvements
3. Use research packs for deep analysis
4. Reference individual stage critiques for specific improvements

### For Executives
1. View workflow diagrams in the stages documentation for visual overview
2. Review critique for strategic recommendations
3. Check metrics and KPIs in stages.yaml
4. Monitor backlog for major initiatives

## Key Documents

### Essential Reading
1. [Stages Definition](stages_v2.yaml) - The canonical source (25-stage model)
2. [Workflow Critique](critique/overview.md) - Analysis and recommendations
4. [SOP Index](sop-index.md) - All operating procedures

### Implementation Guides
1. [PRD Crosswalk](prd_crosswalk.md) - What's built vs. what's needed
2. [Backlog](backlog/backlog.yaml) - Prioritized work items
3. [Reference Research](../../reference/research/) - Deep-dive analysis templates

## Workflow Phases (retired 40-stage workflow)

### Phase 1: IDEATION (Stages 1-10)
Focus: Idea validation and feasibility assessment
Owner Mix: EVA, LEAD, PLAN, EXEC

### Phase 2: PLANNING (Stages 11-20)
Focus: Strategic planning and resource preparation
Owner Mix: LEAD, PLAN, EXEC, EVA

### Phase 3: DEVELOPMENT (Stages 21-28)
Focus: Building and iterating the product
Owner Mix: EXEC, PLAN, EVA

### Phase 4: LAUNCH (Stages 29-34)
Focus: Go-to-market and initial customer success
Owner Mix: PLAN, EXEC, LEAD, EVA

### Phase 5: OPERATIONS (Stages 35-40)
Focus: Growth, optimization, and exit
Owner Mix: LEAD, PLAN, Chairman

## Key Metrics (retired 40-stage workflow)
- **Total Stages**: 40 (retired; live model is 25 stages)
- **Decision Gates**: 4 formal, 15+ informal
- **Automation Potential**: 50% fully automatable
- **Typical Duration**: 6-12 months
- **Success Predictability**: 60% by stage 10

## Tools & Scripts
- `scripts/archive/one-time/validate-stages.js` - Validate workflow consistency (archived)
- `generate-mermaid.js` (retired) - Regenerated diagrams from stages.yaml
- `scripts/generate-workflow-docs.js` - Regenerate all documentation

## Contributing
1. All changes start with updating `stages.yaml`
2. Run validation script after changes
3. Update SOPs for affected stages
4. Create backlog items for major changes
5. Update diagrams if dependencies change

## Related Documentation
- [API Documentation](../../02_api/) - Technical PRDs
- [Feature Documentation](../../04_features/) - Feature specifications
- [Reference Research](../../reference/research/) - Analysis templates

## Files

- [GENERATION SUMMARY](generation-summary.md)
- [Quality Lifecycle Workflow](quality-lifecycle-workflow.md)
