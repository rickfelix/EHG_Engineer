# EHG Venture Workflow Documentation

## Overview
Complete documentation for the EHG 40-stage venture workflow, from ideation to exit.

## Directory Structure

### Core Documentation
- `stages.yaml` - Canonical definition of all 40 stages (single source of truth)
- `SOP_INDEX.md` - Index of all Standard Operating Procedures
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
1. [Stages Definition](stages.yaml) - The canonical source
2. [Workflow Critique](critique/overview.md) - Analysis and recommendations
4. [SOP Index](SOP_INDEX.md) - All operating procedures

### Implementation Guides
1. [PRD Crosswalk](prd_crosswalk.md) - What's built vs. what's needed
2. [Backlog](backlog/backlog.yaml) - Prioritized work items
3. [Reference Research](../../reference/research/) - Deep-dive analysis templates

## Workflow Phases

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

## Key Metrics
- **Total Stages**: 40
- **Decision Gates**: 4 formal, 15+ informal
- **Automation Potential**: 50% fully automatable
- **Typical Duration**: 6-12 months
- **Success Predictability**: 60% by stage 10

## Tools & Scripts
- `validate-stages.js` - Validate workflow consistency
- `generate-mermaid.js` - Regenerate diagrams from stages.yaml
- `generate-workflow-docs.js` - Regenerate all documentation

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

- [GENERATION SUMMARY](GENERATION_SUMMARY.md)
- [Quality Lifecycle Workflow](quality-lifecycle-workflow.md)
