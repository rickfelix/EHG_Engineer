# Stage 40: Configurability Matrix

**Source**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1794-1839

---

## Overview

This document identifies tunable parameters for Stage 40 (Venture Active) to support different venture profiles, market conditions, and Chairman preferences.

---

## Configuration Dimensions

### 1. Entry Gate Thresholds

| Parameter | Default | Range | Impact | Evidence |
|-----------|---------|-------|--------|----------|
| **Venture Maturity Score** | 85% | 70-100% | Higher threshold delays Stage 40 entry | stages.yaml:1813 |
| **Minimum Metrics Period** | 12 months | 6-24 months | Longer period increases confidence | stages.yaml:1814 |
| **Metrics Positive Threshold** | All 3 positive | 2/3 - 3/3 | Stricter requires all metrics positive | stages.yaml:1814 |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1812-1815 (entry gates)

---

### 2. Exit Gate Thresholds

| Parameter | Default | Range | Impact | Evidence |
|-----------|---------|-------|--------|----------|
| **Growth Optimization Target** | 20% YoY | 10-50% | Higher target delays exit | stages.yaml:1817 |
| **Exit Readiness Score** | 90% | 70-100% | Higher score ensures better preparation | stages.yaml:1810 |
| **Minimum Valuation** | $5M | $1M-$50M+ | Chairman-specific threshold | stages.yaml:1809 |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1816-1819 (exit gates)

---

### 3. Substage Timing

| Substage | Default Duration | Range | Configurability | Evidence |
|----------|------------------|-------|-----------------|----------|
| **40.1 Growth Management** | 12 months | 6-36 months | Market-dependent | stages.yaml:1820-1826 |
| **40.2 Exit Preparation** | 9 months | 6-18 months | Complexity-dependent | stages.yaml:1827-1832 |
| **40.3 Value Realization** | 6 months | 3-12 months | Transaction-dependent | stages.yaml:1833-1838 |

**Concurrency**: Substages 40.1 and 40.2 can overlap (growth continues during exit prep)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1820-1838

---

### 4. Automation Level

| Mode | Description | Use Case | Recommended For | Evidence |
|------|-------------|----------|-----------------|----------|
| **Manual** | Chairman reviews all decisions | Early-stage ventures, high-risk | First-time venture managers | stages.yaml:1839 |
| **Assisted** | AI provides recommendations | Mid-stage ventures, proven track record | Experienced managers | stages.yaml:1839 |
| **Auto** | AI executes with exception escalation | Late-stage ventures, stable operations | Portfolio managers (10+ ventures) | stages.yaml:1839 |

**Progression**: Manual → Assisted → Auto (suggested path)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1838-1839 (progression_mode note)

---

### 5. Growth Strategy Parameters

| Parameter | Default | Range | Impact | Evidence |
|-----------|---------|-------|--------|----------|
| **Max Growth Initiatives** | 5 | 3-10 | More initiatives = higher complexity | stages.yaml:1823 |
| **Strategy Review Frequency** | Quarterly | Monthly-Annually | More frequent = more responsive | stages.yaml:1824 |
| **Minimum ROI Threshold** | 3x | 2x-10x | Higher threshold = fewer initiatives | 05_professional-sop.md |
| **Growth Budget Cap** | 20% revenue | 10-50% | Higher cap = more aggressive growth | stages.yaml:1822 |

**Evidence**: Derived from EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1820-1826 (Substage 40.1)

---

### 6. Exit Preparation Parameters

| Parameter | Default | Range | Impact | Evidence |
|-----------|---------|-------|--------|----------|
| **Target Buyer Pool Size** | 15 | 5-30 | Larger pool = more competition | stages.yaml:1829 |
| **Due Diligence Lead Time** | 6 months | 3-12 months | Longer time = better preparation | stages.yaml:1830 |
| **Valuation Optimization Period** | 9 months | 6-18 months | Longer period = higher valuation | stages.yaml:1831 |
| **Investment Banker Threshold** | $10M | $5M-$50M | Engage banker above threshold | 05_professional-sop.md |

**Evidence**: Derived from EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1827-1832 (Substage 40.2)

---

### 7. Value Realization Parameters

| Parameter | Default | Range | Impact | Evidence |
|-----------|---------|-------|--------|----------|
| **Negotiation Timeline** | 2 months | 1-6 months | Longer = better terms (usually) | stages.yaml:1835 |
| **Transaction Closing Period** | 4 months | 3-12 months | Faster = less risk of deal break | stages.yaml:1836 |
| **Earnout Period** | 12 months | 0-36 months | Longer earnout = deferred value | stages.yaml:1837 |
| **Escrow Percentage** | 10% | 5-20% | Higher escrow = more risk mitigation | 05_professional-sop.md |

**Evidence**: Derived from EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1833-1838 (Substage 40.3)

---

### 8. Monitoring & Alerting

| Parameter | Default | Range | Impact | Evidence |
|-----------|---------|-------|--------|----------|
| **Growth Rate Alert Threshold** | <5% YoY | 0-20% | Triggers growth strategy review | stages.yaml:1808 |
| **Valuation Drop Alert** | >15% decline | 10-30% | Escalates to Chairman | stages.yaml:1809 |
| **Exit Readiness Check Frequency** | Monthly | Weekly-Quarterly | More frequent = earlier exit detection | stages.yaml:1810 |
| **Market Timing Alert Sensitivity** | High | Low-High | High = more exit timing alerts | 07_recursion-blueprint.md |

**Evidence**: Derived from EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1808-1811 (metrics)

---

## Configuration Profiles

### Profile 1: Conservative Approach

**Use Case**: First venture, risk-averse Chairman, uncertain market

```yaml
profile_name: conservative
entry_gates:
  venture_maturity_score: 90%
  minimum_metrics_period: 18 months
  metrics_positive_threshold: 3/3
exit_gates:
  growth_optimization_target: 15% YoY
  exit_readiness_score: 95%
  minimum_valuation: $10M
automation_level: Manual
growth_strategy:
  max_initiatives: 3
  review_frequency: Monthly
  roi_threshold: 5x
exit_preparation:
  target_buyer_pool: 20
  due_diligence_lead_time: 12 months
  investment_banker_threshold: $5M
```

---

### Profile 2: Balanced Approach (Default)

**Use Case**: Experienced manager, normal market conditions

```yaml
profile_name: balanced
entry_gates:
  venture_maturity_score: 85%
  minimum_metrics_period: 12 months
  metrics_positive_threshold: 3/3
exit_gates:
  growth_optimization_target: 20% YoY
  exit_readiness_score: 90%
  minimum_valuation: $5M
automation_level: Assisted
growth_strategy:
  max_initiatives: 5
  review_frequency: Quarterly
  roi_threshold: 3x
exit_preparation:
  target_buyer_pool: 15
  due_diligence_lead_time: 6 months
  investment_banker_threshold: $10M
```

---

### Profile 3: Aggressive Approach

**Use Case**: Portfolio manager, hot market, rapid growth opportunity

```yaml
profile_name: aggressive
entry_gates:
  venture_maturity_score: 75%
  minimum_metrics_period: 6 months
  metrics_positive_threshold: 2/3
exit_gates:
  growth_optimization_target: 30% YoY
  exit_readiness_score: 80%
  minimum_valuation: $3M
automation_level: Auto
growth_strategy:
  max_initiatives: 10
  review_frequency: Monthly
  roi_threshold: 2x
exit_preparation:
  target_buyer_pool: 30
  due_diligence_lead_time: 3 months
  investment_banker_threshold: $5M
```

---

## Configuration Management

### Storage Location

**Proposed**: `ventures` table in EHG database

```sql
ALTER TABLE ventures ADD COLUMN stage_40_config JSONB;

-- Example:
UPDATE ventures
SET stage_40_config = '{
  "profile": "balanced",
  "entry_gates": {"venture_maturity_score": 85},
  "automation_level": "Assisted",
  "growth_strategy": {"max_initiatives": 5}
}'
WHERE id = [VENTURE_ID];
```

### Configuration Override

Chairman can override any parameter via UI:
1. Navigate to Venture Settings > Stage 40 Configuration
2. Select profile (Conservative/Balanced/Aggressive) or Custom
3. Adjust individual parameters as needed
4. Save configuration (applies to current venture only)

---

## Validation Rules

**Configuration Constraints**:
1. `minimum_valuation` ≤ `current_valuation` (can't exit below current value)
2. `growth_optimization_target` ≥ 0 (can't have negative growth requirement)
3. `exit_readiness_score` ≥ 70% (minimum threshold for safe exit)
4. `max_initiatives` ≤ 10 (cognitive load limit)

**Evidence**: Based on practical venture management constraints

---

## Sources Table

| Source | Repo | Commit | Path | Lines |
|--------|------|--------|------|-------|
| Entry gates | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1812-1815 |
| Exit gates | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1816-1819 |
| Substage 40.1 | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1820-1826 |
| Substage 40.2 | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1827-1832 |
| Substage 40.3 | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1833-1838 |
| Metrics | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1808-1811 |
| Progression mode | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1838-1839 |
| Professional SOP | EHG_Engineer | 6ef8cf4 | docs/workflow/dossiers/stage-40/05_professional-sop.md | N/A |

<!-- Generated by Claude Code Phase 13 | EHG_Engineer@6ef8cf4 | 2025-11-06 -->
