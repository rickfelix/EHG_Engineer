---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-03-01
tags: [general, auto-generated]
---

## Table of Contents

- [Metadata](#metadata)
- [Visual Dependency Map](#visual-dependency-map)
- [Upstream Dependencies](#upstream-dependencies)
  - [Stage 16: Pricing Agent Development](#stage-16-pricing-agent-development)
- [Downstream Dependents](#downstream-dependents)
  - [Stage 18: Sales Agent Development](#stage-18-sales-agent-development)
- [Workflow Position Analysis](#workflow-position-analysis)
  - [Critical Path Status](#critical-path-status)
  - [Parallel Execution Opportunities](#parallel-execution-opportunities)
  - [Workflow Optimization](#workflow-optimization)
- [Cross-Stage Data Flow](#cross-stage-data-flow)
  - [Input Sources](#input-sources)
  - [Output Consumers](#output-consumers)
- [Recursion Patterns](#recursion-patterns)
  - [Backward Recursion Triggers](#backward-recursion-triggers)
  - [Forward Recursion Triggers](#forward-recursion-triggers)
- [Critical Path Analysis](#critical-path-analysis)
  - [Stage 17 Duration Estimate](#stage-17-duration-estimate)
  - [Bottleneck Risks](#bottleneck-risks)
  - [Mitigation Strategies](#mitigation-strategies)
- [Dependency Health Monitoring](#dependency-health-monitoring)
  - [Upstream Health Checks](#upstream-health-checks)
  - [Downstream Impact Assessment](#downstream-impact-assessment)
  - [Data Availability Validation](#data-availability-validation)

---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
<!-- ARCHIVED: 2026-01-26T16:26:36.738Z
     Reason: Duplicate of canonical file
     Original location: docs\workflow\dossiers\stage-17\02_stage-map.md
     See: docs/fixes/duplicate-consolidation-manifest.json for details
-->

# Stage 17: Dependency Graph and Workflow Position


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: api, testing, unit, sd

## Visual Dependency Map

```
Stage 16 (Pricing Agent)
    ↓
[Stage 17: GTM Strategist Agent] ← YOU ARE HERE
    ↓
Stage 18 (Sales Agent)
```

## Upstream Dependencies

### Stage 16: Pricing Agent Development
**Relationship**: Direct prerequisite
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:738-739 "depends_on: - 16"

**Required Outputs from Stage 16**:
- Pricing strategy models
- Competitive positioning data
- Value proposition framework

**Integration Points**:
- Pricing models inform campaign messaging
- Value propositions drive content generation
- Competitive data shapes channel selection

**Validation Gates**:
- Stage 16 must reach "exit" state: "Pricing strategies defined"
- Pricing agent must be operational
- Market analysis complete

## Downstream Dependents

### Stage 18: Sales Agent Development
**Relationship**: Direct dependent
**Evidence**: Inferred from sequential stage numbering and workflow architecture

**Stage 17 Outputs Required by Stage 18**:
- GTM agent configuration (EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:745 "GTM agent config")
- Campaign templates (EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:746 "Campaign templates")
- Lead generation workflows

**Handoff Criteria**:
- GTM agent deployed and operational
- Campaign automation active
- Lead scoring mechanisms functional

**Failure Impact**:
- Stage 18 cannot configure sales workflows without campaign context
- Lead handoff from marketing to sales broken
- Revenue pipeline disrupted

## Workflow Position Analysis

### Critical Path Status
**On Critical Path**: No
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-17.md:60 "Critical Path: No"

**Reasoning**:
- Marketing automation can proceed in parallel with other revenue operations
- Not a blocker for minimum viable product launch
- Enhances efficiency but not required for core functionality

### Parallel Execution Opportunities
**Can Execute in Parallel With**:
- Stage 14 (Customer Support Agent) - different domain
- Stage 15 (Financial Modeling) - different functional area

**Cannot Execute in Parallel With**:
- Stage 16 (direct prerequisite)
- Stage 18 (direct dependent)

### Workflow Optimization

**Early Start Conditions**:
- Market strategy documented (EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:754 "Market strategy defined")
- Customer segments identified (EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:755 "Segments identified")
- Pricing framework available from Stage 16

**Fast-Track Scenarios**:
- If venture uses standard B2B/B2C campaign templates (reduces 17.2 duration)
- If marketing channels pre-defined (accelerates 17.1 configuration)
- If automation workflows reuse existing patterns (speeds up 17.3)

## Cross-Stage Data Flow

### Input Sources

| Input | Source Stage | Format | Evidence |
|-------|-------------|--------|----------|
| Market strategy | Stage 16 | JSON config | EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:741 "Market strategy" |
| Customer segments | Stage 11/16 | Segment definitions | EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:742 "Customer segments" |
| Marketing channels | Configuration | Channel list | EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:743 "Marketing channels" |

### Output Consumers

| Output | Consumer Stage | Purpose | Evidence |
|--------|---------------|---------|----------|
| GTM agent config | Stage 18 | Sales workflow configuration | EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:745 "GTM agent config" |
| Campaign templates | Stage 18 | Lead nurturing | EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:746 "Campaign templates" |
| Automation workflows | Stage 18 | Marketing-to-sales handoff | EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:747 "Automation workflows" |

## Recursion Patterns

### Backward Recursion Triggers
**Recurse to Stage 15 (Pricing)**:
- Campaign effectiveness below threshold (proposed GTM-001 trigger)
- Conversion rates indicate pricing misalignment
- Market feedback suggests value proposition adjustment

**Recurse to Stage 11 (Naming/Branding)**:
- Lead generation underperforming (proposed GTM-002 trigger)
- Messaging resonance metrics low
- Brand positioning unclear in campaigns

**Recurse to Stage 5 (Profitability Model)**:
- Campaign ROI negative
- Customer acquisition cost (CAC) exceeds lifetime value (LTV)
- Marketing spend allocation inefficient

### Forward Recursion Triggers
**Recurse from Stage 18 (Sales)**:
- Sales cycle length indicates marketing qualification issues
- Lead quality scores below threshold
- Sales team requests campaign adjustments

**Evidence Gap**: Current critique contains no recursion section (EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-17.md:1-72 "72 lines total, no recursion heading"). See 07_recursion-blueprint.md for proposed automation.

## Critical Path Analysis

### Stage 17 Duration Estimate
- **17.1 Strategy Configuration**: 2-3 days (encode strategy, configure channels, allocate budgets)
- **17.2 Campaign Development**: 3-5 days (create templates, generate content, set schedules)
- **17.3 Automation Setup**: 2-3 days (configure workflows, define triggers, test)
- **Total**: 7-11 days

### Bottleneck Risks
1. **Content Generation Delays** (17.2): Manual content creation if AI agents not fully operational
2. **Channel Integration** (17.1): API connectivity issues with marketing platforms
3. **Workflow Testing** (17.3): Complex automation debugging

### Mitigation Strategies
- Leverage CrewAI ContentGenerator agent for automated content production
- Use pre-built channel connectors from SD-INTEGRATION-FRAMEWORK-001
- Implement comprehensive workflow testing in 17.3 (EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:778 "Testing complete")

## Dependency Health Monitoring

### Upstream Health Checks
```sql
-- Verify Stage 16 completion
SELECT stage_id, status, exit_criteria_met
FROM workflow_stages
WHERE stage_id = 16
  AND status = 'completed'
  AND exit_criteria_met = true;
```

### Downstream Impact Assessment
```sql
-- Check if Stage 18 is blocked
SELECT stage_id, status, blocked_by
FROM workflow_stages
WHERE stage_id = 18
  AND blocked_by @> ARRAY[17];
```

### Data Availability Validation
```sql
-- Ensure required inputs exist
SELECT input_type, availability_status
FROM stage_inputs
WHERE stage_id = 17
  AND input_type IN ('Market strategy', 'Customer segments', 'Marketing channels');
```

---

**Key Takeaway**: Stage 17 sits in the middle of the revenue operations sequence (16→17→18), receiving pricing strategy from upstream and providing campaign infrastructure to downstream sales automation. Not on critical path, but essential for efficient revenue generation.

<!-- Generated by Claude Code Phase 8 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
