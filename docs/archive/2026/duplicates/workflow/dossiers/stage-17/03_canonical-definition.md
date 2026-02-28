---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---

## Table of Contents

- [Metadata](#metadata)
- [Source Authority](#source-authority)
- [Complete YAML Definition](#complete-yaml-definition)
- [Field-by-Field Evidence Table](#field-by-field-evidence-table)
- [Substage Breakdown](#substage-breakdown)
  - [Substage 17.1: Strategy Configuration](#substage-171-strategy-configuration)
  - [Substage 17.2: Campaign Development](#substage-172-campaign-development)
  - [Substage 17.3: Automation Setup](#substage-173-automation-setup)
- [Semantic Interpretation](#semantic-interpretation)
  - [Stage Purpose](#stage-purpose)
  - [Success Criteria](#success-criteria)
  - [Integration Points](#integration-points)
  - [Criticality Assessment](#criticality-assessment)
- [Change History](#change-history)
- [Validation Checklist](#validation-checklist)

<!-- ARCHIVED: 2026-01-26T16:26:38.931Z
     Reason: Duplicate of canonical file
     Original location: docs\workflow\dossiers\stage-17\03_canonical-definition.md
     See: docs/fixes/duplicate-consolidation-manifest.json for details
-->

# Stage 17: Canonical Definition


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: database, api, testing, schema

## Source Authority

**Primary Source**: `docs/workflow/stages.yaml`
**Line Range**: 735-780
**Commit**: 6ef8cf4
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:735-780 "id: 17, GTM Strategist Agent Development"

## Complete YAML Definition

```yaml
- id: 17
  title: GTM Strategist Agent Development
  description: Deploy go-to-market strategist agent for marketing automation.
  depends_on:
    - 16
  inputs:
    - Market strategy
    - Customer segments
    - Marketing channels
  outputs:
    - GTM agent config
    - Campaign templates
    - Automation workflows
  metrics:
    - Campaign effectiveness
    - Lead generation
    - Conversion rates
  gates:
    entry:
      - Market strategy defined
      - Segments identified
    exit:
      - GTM agent deployed
      - Campaigns configured
      - Workflows active
  substages:
    - id: '17.1'
      title: Strategy Configuration
      done_when:
        - GTM strategy encoded
        - Channels configured
        - Budgets allocated
    - id: '17.2'
      title: Campaign Development
      done_when:
        - Templates created
        - Content generated
        - Schedules set
    - id: '17.3'
      title: Automation Setup
      done_when:
        - Workflows configured
        - Triggers defined
        - Testing complete
  notes:
```

## Field-by-Field Evidence Table

| Field | Value | Evidence Citation | Interpretation |
|-------|-------|-------------------|----------------|
| **id** | 17 | EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:735 "id: 17" | Unique stage identifier |
| **title** | GTM Strategist Agent Development | EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:736 "title: GTM Strategist Agent Development" | Official stage name |
| **description** | Deploy go-to-market strategist agent for marketing automation. | EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:737 "Deploy go-to-market strategist agent" | Core purpose statement |
| **depends_on** | [16] | EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:738-739 "depends_on: - 16" | Requires Stage 16 completion |
| **inputs[0]** | Market strategy | EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:741 "Market strategy" | First required input |
| **inputs[1]** | Customer segments | EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:742 "Customer segments" | Second required input |
| **inputs[2]** | Marketing channels | EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:743 "Marketing channels" | Third required input |
| **outputs[0]** | GTM agent config | EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:745 "GTM agent config" | Primary output artifact |
| **outputs[1]** | Campaign templates | EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:746 "Campaign templates" | Reusable campaign structures |
| **outputs[2]** | Automation workflows | EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:747 "Automation workflows" | Executable workflow definitions |
| **metrics[0]** | Campaign effectiveness | EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:749 "Campaign effectiveness" | Primary performance metric |
| **metrics[1]** | Lead generation | EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:750 "Lead generation" | Lead quantity/quality metric |
| **metrics[2]** | Conversion rates | EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:751 "Conversion rates" | Conversion funnel metric |
| **gates.entry[0]** | Market strategy defined | EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:754 "Market strategy defined" | First entry condition |
| **gates.entry[1]** | Segments identified | EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:755 "Segments identified" | Second entry condition |
| **gates.exit[0]** | GTM agent deployed | EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:757 "GTM agent deployed" | First exit condition |
| **gates.exit[1]** | Campaigns configured | EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:758 "Campaigns configured" | Second exit condition |
| **gates.exit[2]** | Workflows active | EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:759 "Workflows active" | Third exit condition |
| **notes** | (empty) | EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:779 "notes:" | No additional notes |

## Substage Breakdown

### Substage 17.1: Strategy Configuration

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:761-766 "id: '17.1', Strategy Configuration"

| Attribute | Value | Citation |
|-----------|-------|----------|
| **ID** | 17.1 | EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:761 "id: '17.1'" |
| **Title** | Strategy Configuration | EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:762 "title: Strategy Configuration" |
| **done_when[0]** | GTM strategy encoded | EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:764 "GTM strategy encoded" |
| **done_when[1]** | Channels configured | EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:765 "Channels configured" |
| **done_when[2]** | Budgets allocated | EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:766 "Budgets allocated" |

**Purpose**: Translate high-level market strategy into executable GTM configuration, including channel selection and budget distribution.

### Substage 17.2: Campaign Development

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:767-772 "id: '17.2', Campaign Development"

| Attribute | Value | Citation |
|-----------|-------|----------|
| **ID** | 17.2 | EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:767 "id: '17.2'" |
| **Title** | Campaign Development | EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:768 "title: Campaign Development" |
| **done_when[0]** | Templates created | EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:770 "Templates created" |
| **done_when[1]** | Content generated | EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:771 "Content generated" |
| **done_when[2]** | Schedules set | EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:772 "Schedules set" |

**Purpose**: Create reusable campaign templates with AI-generated content and scheduling logic.

### Substage 17.3: Automation Setup

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:773-778 "id: '17.3', Automation Setup"

| Attribute | Value | Citation |
|-----------|-------|----------|
| **ID** | 17.3 | EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:773 "id: '17.3'" |
| **Title** | Automation Setup | EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:774 "title: Automation Setup" |
| **done_when[0]** | Workflows configured | EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:776 "Workflows configured" |
| **done_when[1]** | Triggers defined | EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:777 "Triggers defined" |
| **done_when[2]** | Testing complete | EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:778 "Testing complete" |

**Purpose**: Implement workflow automation with event triggers and comprehensive testing validation.

## Semantic Interpretation

### Stage Purpose
Deploy an autonomous AI agent (GTM Strategist) capable of:
1. Encoding market strategies into executable configurations
2. Generating campaign content and templates
3. Automating marketing workflow execution
4. Optimizing channel performance through metrics tracking

### Success Criteria
**Entry Gates** (must be true before starting):
- Market strategy document exists and is validated
- Customer segmentation complete (from Stage 11 or earlier)

**Exit Gates** (must be true before completing):
- GTM agent operational and responding to commands
- At least one campaign configured and ready to launch
- Automation workflows active and tested

### Integration Points

**Upstream Integration** (Stage 16):
- Receives: Pricing strategy, value propositions, competitive positioning
- Format: JSON configuration files or database records
- Validation: Market strategy must reference pricing models

**Downstream Integration** (Stage 18):
- Provides: Campaign templates for sales enablement
- Provides: Lead scoring and qualification workflows
- Provides: GTM agent API for sales agent coordination

### Criticality Assessment

**Business Impact**: High
**Technical Complexity**: Medium
**Resource Intensity**: Medium
**Timeline Sensitivity**: Low (not on critical path)

**Rationale**: Marketing automation significantly improves revenue efficiency but is not a hard blocker for initial product launch. Can be deployed post-MVP to enhance scalability.

## Change History

**Version**: 1.0 (as of commit 6ef8cf4)
**Last Modified**: Unknown (stages.yaml git blame required)
**Schema Stability**: High (no known pending changes)

**Known Variations**: None identified in current commit.

## Validation Checklist

- [x] All 4 top-level fields documented (id, title, description, depends_on)
- [x] All 3 inputs enumerated with evidence
- [x] All 3 outputs enumerated with evidence
- [x] All 3 metrics enumerated with evidence
- [x] Both entry gates documented (2 gates)
- [x] All exit gates documented (3 gates)
- [x] All substages documented (3 substages: 17.1, 17.2, 17.3)
- [x] Each substage's `done_when` criteria enumerated (3 per substage)
- [x] Evidence citations use correct format (EHG_Engineer@6ef8cf4:path:lines "excerpt")
- [x] No fields omitted from YAML source

**Completeness Score**: 100% (all fields from lines 735-780 documented)

<!-- Generated by Claude Code Phase 8 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
