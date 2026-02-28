---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# Stage 39: Multi-Venture Coordination — Configurability Matrix


## Table of Contents

- [Purpose](#purpose)
- [Configuration Categories](#configuration-categories)
- [1. Venture Assessment Parameters](#1-venture-assessment-parameters)
  - [Scoring Rubric Weights](#scoring-rubric-weights)
  - [Assessment Thresholds](#assessment-thresholds)
- [2. Synergy Identification Parameters](#2-synergy-identification-parameters)
  - [Synergy Scoring Weights](#synergy-scoring-weights)
  - [Synergy Type Priorities](#synergy-type-priorities)
  - [Synergy Thresholds](#synergy-thresholds)
- [3. Resource Allocation Parameters](#3-resource-allocation-parameters)
  - [Allocation Constraints](#allocation-constraints)
  - [Resource Reallocation Triggers](#resource-reallocation-triggers)
- [4. Governance Parameters](#4-governance-parameters)
  - [Decision Rights Thresholds](#decision-rights-thresholds)
  - [Escalation Rules](#escalation-rules)
- [5. Initiative Tracking Parameters](#5-initiative-tracking-parameters)
  - [Progress Monitoring](#progress-monitoring)
  - [Value Capture Thresholds](#value-capture-thresholds)
- [6. Performance Metrics Parameters](#6-performance-metrics-parameters)
  - [Portfolio Performance Targets](#portfolio-performance-targets)
  - [Exit Gate Thresholds](#exit-gate-thresholds)
- [7. Recursion Parameters](#7-recursion-parameters)
  - [PORTFOLIO-001: Synergy Opportunity Detection](#portfolio-001-synergy-opportunity-detection)
  - [PORTFOLIO-002: Resource Conflict Detection](#portfolio-002-resource-conflict-detection)
  - [PORTFOLIO-003: Portfolio Performance Review](#portfolio-003-portfolio-performance-review)
  - [PORTFOLIO-004: Interdependency Risk Assessment](#portfolio-004-interdependency-risk-assessment)
- [Configuration Management](#configuration-management)
  - [Storage](#storage)
  - [Access Control](#access-control)
  - [Versioning](#versioning)
- [Tuning Playbook](#tuning-playbook)
  - [Scenario 1: Portfolio Growing Rapidly (3+ ventures added per month)](#scenario-1-portfolio-growing-rapidly-3-ventures-added-per-month)
  - [Scenario 2: Resource-Constrained Portfolio (Team <10 people)](#scenario-2-resource-constrained-portfolio-team-10-people)
  - [Scenario 3: Early-Stage Automation (First 3 months)](#scenario-3-early-stage-automation-first-3-months)
  - [Scenario 4: Mature Portfolio (10+ ventures, >2 years old)](#scenario-4-mature-portfolio-10-ventures-2-years-old)
- [Sources Table](#sources-table)

**Generated**: 2025-11-06
**Version**: 1.0

---

## Purpose

This matrix documents all tunable parameters for Stage 39 operations, enabling Chairman to customize portfolio coordination behavior without code changes.

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1793 "progression_mode: Manual → Assisted → Auto (suggested)" - configurability enables this progression.

---

## Configuration Categories

1. **Venture Assessment Parameters** - Scoring rubrics and thresholds
2. **Synergy Identification Parameters** - Matching algorithms and scoring
3. **Resource Allocation Parameters** - Optimization constraints
4. **Governance Parameters** - Decision rights and escalation rules
5. **Initiative Tracking Parameters** - Progress monitoring and alerts
6. **Performance Metrics Parameters** - KPI thresholds and targets
7. **Recursion Parameters** - Trigger conditions and frequencies

---

## 1. Venture Assessment Parameters

### Scoring Rubric Weights

**Source**: Referenced in `05_professional-sop.md` Step 1

| Parameter | Default Value | Range | Description |
|-----------|---------------|-------|-------------|
| `strategic_fit_weight` | 0.30 | 0.0 - 1.0 | Weight for strategic alignment in overall score |
| `financial_health_weight` | 0.30 | 0.0 - 1.0 | Weight for financial metrics in overall score |
| `growth_potential_weight` | 0.25 | 0.0 - 1.0 | Weight for growth projections in overall score |
| `resource_efficiency_weight` | 0.15 | 0.0 - 1.0 | Weight for resource utilization in overall score |

**Validation**: Sum of weights must equal 1.0

**Tuning Guidance**:
- **Early-stage portfolio** - Increase `growth_potential_weight` to 0.40 (prioritize upside)
- **Mature portfolio** - Increase `financial_health_weight` to 0.40 (prioritize profitability)
- **Resource-constrained** - Increase `resource_efficiency_weight` to 0.30 (prioritize ROI)

---

### Assessment Thresholds

| Parameter | Default Value | Range | Description |
|-----------|---------------|-------|-------------|
| `min_viable_score` | 2.5 | 1.0 - 5.0 | Minimum score to continue venture (below = sunset candidate) |
| `high_priority_score` | 4.0 | 3.0 - 5.0 | Score threshold for high-priority resource allocation |
| `excellent_score` | 4.5 | 4.0 - 5.0 | Score threshold for accelerated investment |

**Tuning Guidance**:
- **Aggressive growth** - Lower `min_viable_score` to 2.0 (higher risk tolerance)
- **Conservative growth** - Raise `min_viable_score` to 3.0 (lower risk tolerance)

---

## 2. Synergy Identification Parameters

### Synergy Scoring Weights

**Source**: Referenced in `05_professional-sop.md` Step 2

| Parameter | Default Value | Range | Description |
|-----------|---------------|-------|-------------|
| `value_potential_multiplier` | 2.0 | 1.0 - 5.0 | Multiplier for value potential in net score calculation |
| `strategic_importance_multiplier` | 1.5 | 1.0 - 3.0 | Multiplier for strategic importance in net score |
| `implementation_effort_divisor` | 1.0 | 0.5 - 2.0 | Divisor for implementation effort (higher = penalize complexity less) |

**Formula**: `net_score = (value_potential × value_multiplier × strategic_importance × strategic_multiplier) / (implementation_effort × effort_divisor)`

**Tuning Guidance**:
- **Quick wins focus** - Increase `implementation_effort_divisor` to 2.0 (favor easy projects)
- **Strategic bets focus** - Increase `strategic_importance_multiplier` to 3.0 (favor alignment)

---

### Synergy Type Priorities

| Parameter | Default Value | Range | Description |
|-----------|---------------|-------|-------------|
| `technology_synergy_priority` | HIGH | LOW/MEDIUM/HIGH | Priority for shared tech stack synergies |
| `customer_synergy_priority` | HIGH | LOW/MEDIUM/HIGH | Priority for cross-selling opportunities |
| `team_synergy_priority` | MEDIUM | LOW/MEDIUM/HIGH | Priority for talent sharing |
| `operational_synergy_priority` | MEDIUM | LOW/MEDIUM/HIGH | Priority for cost consolidation |

**Tuning Guidance**:
- **Technical founder** - Set `technology_synergy_priority` to HIGH (leverage tech expertise)
- **Sales-focused** - Set `customer_synergy_priority` to HIGH (maximize revenue synergies)

---

### Synergy Thresholds

| Parameter | Default Value | Range | Description |
|-----------|---------------|-------|-------------|
| `min_synergy_score` | 3.0 | 1.0 - 5.0 | Minimum net score to add synergy to register |
| `high_priority_synergy_score` | 4.0 | 3.0 - 5.0 | Score threshold for Chairman notification |
| `batch_planning_threshold` | 5 | 3 - 10 | Number of new synergies to trigger batch planning |

**Tuning Guidance**:
- **Portfolio with many ventures** - Increase `batch_planning_threshold` to 10 (reduce noise)
- **Small portfolio** - Decrease `batch_planning_threshold` to 3 (capture all opportunities)

---

## 3. Resource Allocation Parameters

### Allocation Constraints

**Source**: Referenced in `05_professional-sop.md` Step 5

| Parameter | Default Value | Range | Description |
|-----------|---------------|-------|-------------|
| `max_allocation_per_venture` | 50% | 20% - 100% | Maximum % of resource allocated to single venture |
| `min_allocation_per_venture` | 5% | 0% - 20% | Minimum % allocation to consider venture "resourced" |
| `capacity_buffer` | 90% | 70% - 100% | Target total allocation (buffer for flexibility) |

**Validation**: `capacity_buffer ≤ 100%`

**Tuning Guidance**:
- **Focused strategy** - Increase `max_allocation_per_venture` to 80% (concentrate resources)
- **Diversified strategy** - Decrease `max_allocation_per_venture` to 30% (spread risk)

---

### Resource Reallocation Triggers

| Parameter | Default Value | Range | Description |
|-----------|---------------|-------|-------------|
| `reallocation_approval_threshold` | 20% | 10% - 50% | % change requiring Chairman approval |
| `critical_resource_threshold` | 5 | 3 - 10 | Number of ventures using resource to classify as "critical" |
| `over_allocation_tolerance` | 0% | 0% - 10% | Allowed over-allocation before conflict triggered |

**Tuning Guidance**:
- **Agile portfolio** - Increase `over_allocation_tolerance` to 10% (allow temporary bursts)
- **Strict governance** - Keep `over_allocation_tolerance` at 0% (no conflicts allowed)

---

## 4. Governance Parameters

### Decision Rights Thresholds

**Source**: Referenced in `05_professional-sop.md` Step 6

| Parameter | Default Value | Range | Description |
|-----------|---------------|-------|-------------|
| `initiative_budget_auto_approve` | $10,000 | $0 - $100,000 | Budget threshold for auto-approval (below = no Chairman review) |
| `resource_reallocation_auto_approve` | 20% | 0% - 50% | Reallocation % threshold for auto-approval |
| `venture_sunset_approval_required` | TRUE | TRUE/FALSE | Whether Chairman must approve venture sunset |

**Tuning Guidance**:
- **High trust in agents** - Increase `initiative_budget_auto_approve` to $50K (reduce overhead)
- **Early automation phase** - Decrease `initiative_budget_auto_approve` to $5K (more oversight)

---

### Escalation Rules

| Parameter | Default Value | Range | Description |
|-----------|---------------|-------|-------------|
| `escalation_delay_hours` | 48 | 12 - 168 | Hours before escalating unresolved conflicts |
| `chairman_response_timeout_hours` | 72 | 24 - 168 | Hours to wait for Chairman approval before alert |
| `urgent_conflict_threshold` | 3 | 1 - 5 | Number of conflicts to classify as "urgent" |

**Tuning Guidance**:
- **Fast-moving portfolio** - Reduce `escalation_delay_hours` to 24 (quicker decisions)
- **Strategic deliberation** - Increase `chairman_response_timeout_hours` to 168 (weekly review)

---

## 5. Initiative Tracking Parameters

### Progress Monitoring

**Source**: Referenced in `05_professional-sop.md` Step 7-9

| Parameter | Default Value | Range | Description |
|-----------|---------------|-------|-------------|
| `initiative_update_frequency_days` | 7 | 1 - 30 | Required frequency for progress updates |
| `stalled_initiative_threshold_days` | 14 | 7 - 60 | Days without update to classify as "stalled" |
| `delayed_milestone_alert_days` | 3 | 1 - 14 | Days past deadline to trigger alert |

**Tuning Guidance**:
- **Fast-paced portfolio** - Set `initiative_update_frequency_days` to 3 (weekly updates)
- **Long-term initiatives** - Set `initiative_update_frequency_days` to 14 (biweekly updates)

---

### Value Capture Thresholds

| Parameter | Default Value | Range | Description |
|-----------|---------------|-------|-------------|
| `min_value_capture_to_log` | $1,000 | $0 - $10,000 | Minimum $ value to log capture event |
| `min_time_saved_to_log_hours` | 10 | 1 - 100 | Minimum hours saved to log capture event |
| `value_attribution_window_days` | 90 | 30 - 365 | Days to attribute value to initiative after launch |

**Tuning Guidance**:
- **High-value portfolio** - Increase `min_value_capture_to_log` to $5K (reduce noise)
- **Early-stage portfolio** - Decrease `min_value_capture_to_log` to $100 (capture all wins)

---

## 6. Performance Metrics Parameters

### Portfolio Performance Targets

**Source**: Referenced in `09_metrics-monitoring.md`

| Parameter | Default Value | Range | Description |
|-----------|---------------|-------|-------------|
| `portfolio_revenue_improvement_target` | 20% | 5% - 100% | Target % revenue improvement vs. baseline |
| `synergy_value_per_venture_pair_target` | $50,000 | $0 - $500,000 | Target annual synergy value per venture pair |
| `resource_efficiency_improvement_target` | 30% | 10% - 70% | Target % reduction in duplicate efforts |

**Evidence**: Proposed targets (not canonical) - see `04_current-assessment.md` recommendation #2

**Tuning Guidance**:
- **Ambitious portfolio** - Increase `portfolio_revenue_improvement_target` to 50% (stretch goal)
- **Conservative portfolio** - Decrease `portfolio_revenue_improvement_target` to 10% (achievable)

---

### Exit Gate Thresholds

**Source**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1769-1772

| Parameter | Default Value | Range | Description |
|-----------|---------------|-------|-------------|
| `coordination_established_threshold` | 80% | 50% - 100% | % of coordination plans operational to pass gate |
| `synergies_captured_min_initiatives` | 3 | 1 - 10 | Minimum synergy initiatives launched |
| `synergies_captured_min_value` | $10,000 | $0 - $100,000 | Minimum total value captured to pass gate |
| `portfolio_optimized_min_improvement` | 10% | 0% - 50% | Minimum portfolio performance improvement |

**⚠️ GAP**: These are proposed thresholds (not canonical). Chairman approval required.

**Tuning Guidance**:
- **Small portfolio** - Decrease `synergies_captured_min_initiatives` to 1 (feasible for 2 ventures)
- **Large portfolio** - Increase `synergies_captured_min_initiatives` to 5 (scale with size)

---

## 7. Recursion Parameters

### PORTFOLIO-001: Synergy Opportunity Detection

**Source**: Referenced in `07_recursion-blueprint.md` PORTFOLIO-001

| Parameter | Default Value | Range | Description |
|-----------|---------------|-------|-------------|
| `synergy_detection_frequency_hours` | 24 | 6 - 168 | Frequency of automated synergy detection |
| `synergy_min_score_to_trigger` | 3.0 | 1.0 - 5.0 | Minimum net score to trigger notification |
| `synergy_notification_cooldown_days` | 7 | 1 - 30 | Days between notifications for same venture pair |

**Tuning Guidance**:
- **Active portfolio** - Decrease `synergy_detection_frequency_hours` to 6 (4x daily checks)
- **Stable portfolio** - Increase `synergy_detection_frequency_hours` to 168 (weekly checks)

---

### PORTFOLIO-002: Resource Conflict Detection

**Source**: Referenced in `07_recursion-blueprint.md` PORTFOLIO-002

| Parameter | Default Value | Range | Description |
|-----------|---------------|-------|-------------|
| `conflict_detection_mode` | REALTIME | REALTIME/DAILY | When to check for resource conflicts |
| `conflict_over_allocation_threshold` | 100% | 90% - 120% | Allocation % to classify as conflict |
| `conflict_resolution_timeout_hours` | 48 | 12 - 168 | Hours to resolve conflict before escalation |

**Tuning Guidance**:
- **Strict resource management** - Set `conflict_over_allocation_threshold` to 90% (proactive)
- **Flexible resource management** - Set `conflict_over_allocation_threshold` to 110% (allow bursts)

---

### PORTFOLIO-003: Portfolio Performance Review

**Source**: Referenced in `07_recursion-blueprint.md` PORTFOLIO-003

| Parameter | Default Value | Range | Description |
|-----------|---------------|-------|-------------|
| `performance_review_frequency_days` | 30 | 7 - 90 | Days between automated portfolio reviews |
| `performance_report_delivery_day` | 5 | 1 - 28 | Day of month to send report (1-28) |
| `performance_recommendations_enabled` | TRUE | TRUE/FALSE | Whether to include optimization recommendations |

**Tuning Guidance**:
- **Fast-growing portfolio** - Set `performance_review_frequency_days` to 7 (weekly reviews)
- **Mature portfolio** - Set `performance_review_frequency_days` to 90 (quarterly reviews)

---

### PORTFOLIO-004: Interdependency Risk Assessment

**Source**: Referenced in `07_recursion-blueprint.md` PORTFOLIO-004

| Parameter | Default Value | Range | Description |
|-----------|---------------|-------|-------------|
| `interdependency_check_frequency_days` | 7 | 1 - 30 | Days between automated risk assessments |
| `critical_dependencies_threshold` | 2 | 1 - 5 | Number of critical dependencies to classify as high-risk |
| `interdependency_notification_cooldown_days` | 7 | 1 - 30 | Days between notifications for same venture |

**Tuning Guidance**:
- **Complex portfolio** - Decrease `interdependency_check_frequency_days` to 3 (more frequent)
- **Simple portfolio** - Increase `interdependency_check_frequency_days` to 14 (less noise)

---

## Configuration Management

### Storage

**Database Table**: `portfolio_coordination_config`

```sql
CREATE TABLE portfolio_coordination_config (
  parameter_name TEXT PRIMARY KEY,
  parameter_value TEXT NOT NULL,
  parameter_type TEXT NOT NULL,  -- 'NUMBER', 'BOOLEAN', 'TEXT', 'ENUM'
  valid_range TEXT,               -- JSON: {"min": 0, "max": 100} or ["LOW", "MEDIUM", "HIGH"]
  default_value TEXT NOT NULL,
  description TEXT,
  category TEXT,                  -- 'venture_assessment', 'synergy_identification', etc.
  last_modified_at TIMESTAMPTZ DEFAULT NOW(),
  modified_by TEXT                -- Chairman or agent name
);
```

**⚠️ BLOCKER**: Table not created, schema not validated.

---

### Access Control

**Read Access**: All agents (read-only)
**Write Access**: Chairman only (via admin UI or API)
**Validation**: Pre-commit hooks validate range constraints

---

### Versioning

**Change Log**: `portfolio_coordination_config_history`

```sql
CREATE TABLE portfolio_coordination_config_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  parameter_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT NOT NULL,
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  changed_by TEXT,
  reason TEXT                     -- Why the change was made
);
```

**Use Case**: Audit trail for performance tuning, rollback capability if changes degrade performance.

---

## Tuning Playbook

### Scenario 1: Portfolio Growing Rapidly (3+ ventures added per month)

**Adjustments**:
- Increase `synergy_detection_frequency_hours` to 6 (catch opportunities early)
- Increase `batch_planning_threshold` to 10 (reduce planning overhead)
- Decrease `performance_review_frequency_days` to 7 (weekly monitoring)

**Expected Impact**: More frequent monitoring, higher synergy capture rate, reduced planning overhead.

---

### Scenario 2: Resource-Constrained Portfolio (Team <10 people)

**Adjustments**:
- Increase `resource_efficiency_weight` to 0.30 (prioritize ROI)
- Decrease `max_allocation_per_venture` to 30% (spread thin resources)
- Set `conflict_over_allocation_threshold` to 90% (strict limits)

**Expected Impact**: Efficient resource use, fewer conflicts, focus on high-ROI ventures.

---

### Scenario 3: Early-Stage Automation (First 3 months)

**Adjustments**:
- Decrease `initiative_budget_auto_approve` to $5,000 (more oversight)
- Set `chairman_response_timeout_hours` to 48 (faster feedback loop)
- Set `performance_recommendations_enabled` to FALSE (manual decisions)

**Expected Impact**: Chairman maintains control, builds trust in agents, gradual automation increase.

---

### Scenario 4: Mature Portfolio (10+ ventures, >2 years old)

**Adjustments**:
- Increase `financial_health_weight` to 0.40 (prioritize profitability)
- Increase `initiative_budget_auto_approve` to $50,000 (reduce overhead)
- Set `performance_review_frequency_days` to 90 (quarterly reviews)

**Expected Impact**: Profitability focus, reduced manual overhead, strategic reviews only.

---

## Sources Table

| Source | Repo | Commit | Path | Lines | Purpose |
|--------|------|--------|------|-------|---------|
| Progression mode | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1793 | Manual → Assisted → Auto |
| SOP steps | EHG_Engineer | 6ef8cf4 | docs/workflow/dossiers/stage-39/05_professional-sop.md | Various | Parameter context |
| Recursion triggers | EHG_Engineer | 6ef8cf4 | docs/workflow/dossiers/stage-39/07_recursion-blueprint.md | Various | Recursion parameters |
| Metrics targets | EHG_Engineer | 6ef8cf4 | docs/workflow/dossiers/stage-39/09_metrics-monitoring.md | Various | Performance thresholds |

---

<!-- Generated by Claude Code Phase 13 | EHG_Engineer@6ef8cf4 | 2025-11-06 -->
