---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# Stage 37: Strategic Risk Forecasting - Canonical Definition

## Source Reference

**File**: `docs/workflow/stages.yaml`
**Lines**: 1656-1701
**Commit**: 6ef8cf4
**Repository**: EHG_Engineer

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1656-1701 "Stage 37: Strategic Risk Forecasting"

## Full YAML Definition

```yaml
  - id: 37
    title: Strategic Risk Forecasting
    description: Forecast and prepare for strategic risks and market changes.
    depends_on:
      - 36
    inputs:
      - Market intelligence
      - Risk indicators
      - Scenario models
    outputs:
      - Risk forecasts
      - Mitigation strategies
      - Contingency plans
    metrics:
      - Forecast accuracy
      - Risk preparedness
      - Response time
    gates:
      entry:
        - Data sources connected
        - Models calibrated
      exit:
        - Risks forecasted
        - Strategies defined
        - Plans activated
    substages:
      - id: '37.1'
        title: Risk Modeling
        done_when:
          - Models built
          - Scenarios defined
          - Probabilities calculated
      - id: '37.2'
        title: Impact Assessment
        done_when:
          - Impacts quantified
          - Dependencies mapped
          - Thresholds set
      - id: '37.3'
        title: Contingency Planning
        done_when:
          - Plans created
          - Triggers defined
          - Resources reserved
    notes:
      progression_mode: Manual → Assisted → Auto (suggested)
```

## Structural Analysis

### Core Attributes

| Attribute | Value | Type | Purpose |
|-----------|-------|------|---------|
| `id` | 37 | Integer | Unique stage identifier |
| `title` | Strategic Risk Forecasting | String | Human-readable stage name |
| `description` | Forecast and prepare for strategic risks and market changes. | String | Stage purpose summary |
| `depends_on` | [36] | Array[Integer] | Upstream stage dependencies |

### Input/Output Specification

**Inputs** (3 defined):
1. Market intelligence
2. Risk indicators
3. Scenario models

**Outputs** (3 defined):
1. Risk forecasts
2. Mitigation strategies
3. Contingency plans

**Analysis**: Balanced I/O ratio (1:1) indicates well-scoped transformation process.

### Metrics Definition

**Three metrics specified**:
1. **Forecast accuracy** - Quantitative measure of prediction quality
2. **Risk preparedness** - Qualitative measure of readiness
3. **Response time** - Temporal measure of reaction speed

**Gap**: No target values or measurement methodology defined (see critique EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-37.md:38-39 "Missing: Threshold values")

### Gate Criteria

**Entry Gates** (2 criteria):
- Data sources connected
- Models calibrated

**Exit Gates** (3 criteria):
- Risks forecasted
- Strategies defined
- Plans activated

**Analysis**: Clear entry/exit conditions enable automated gate enforcement.

### Substage Structure

**Three sequential substages**:

#### 37.1 Risk Modeling
- Models built
- Scenarios defined
- Probabilities calculated

#### 37.2 Impact Assessment
- Impacts quantified
- Dependencies mapped
- Thresholds set

#### 37.3 Contingency Planning
- Plans created
- Triggers defined
- Resources reserved

**Pattern**: Each substage has 3 "done_when" criteria (9 total completion checkpoints)

### Progression Mode

**Notation**: `Manual → Assisted → Auto (suggested)`

**Interpretation**:
- **Current**: Manual execution by Chairman
- **Target**: Automated with AI assistance
- **Status**: Suggested but not implemented

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1701 "progression_mode: Manual → Assisted → Auto"

## Schema Compliance

**Validation**: Definition follows stages.yaml schema patterns:
- ✅ Required fields present (id, title, description)
- ✅ Arrays properly formatted (inputs, outputs, metrics)
- ✅ Nested objects valid (gates, substages)
- ✅ Consistent indentation (2 spaces)

**Version**: Schema version not explicitly stated in file

## Comparison with Other Stages

### Similar Stages (Chairman-owned strategic)
- **Stage 36**: Competitive Intelligence Gathering (upstream)
- **Stage 28**: Strategic Pivot (related decision-making)

### Unique Characteristics
- Only stage explicitly focused on **forecasting**
- One of few stages with probabilistic outputs (risk probabilities)
- Explicit contingency planning substage (37.3)

## Known Ambiguities

1. **"Models calibrated"** (entry gate) - No specification of calibration methodology
2. **"Plans activated"** (exit gate) - Unclear if activation is actual deployment or approval
3. **"Risk indicators"** (input) - Format and source not specified
4. **Progression mode timing** - No timeline for moving from Manual to Auto

**Reference**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-37.md:7 "Some ambiguity in requirements"

## Change History

**Note**: This is the current definition as of commit 6ef8cf4. No historical versions tracked in this dossier.

**Last Verification**: 2025-11-06

---

<!-- Generated by Claude Code Phase 13 | EHG_Engineer@6ef8cf4 | 2025-11-06 -->
