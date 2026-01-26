# Stage 5: Metrics & Monitoring


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: database, validation, workflow, ci

**Source**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:196-199

---

## Defined Metrics (from stages.yaml)

| Metric | Definition | Threshold | Implementation Status |
|--------|------------|-----------|----------------------|
| **Model accuracy** | Variance between projected and actual financial results | ≥90% (target) | ⚠️ Post-launch measurement |
| **Revenue projections** | Forecasted monthly/yearly revenue for 3-5 years | Track vs actuals | ⚠️ Proposed |
| **Margin forecasts** | Gross and net margin percentages over time | Gross: ≥20%, Net: ≥15% | ⚠️ Proposed |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:196-199 "metrics: Model accuracy"

---

## Additional Recursion Metrics

**From critique recursion section**:

| Metric | Definition | Threshold | Purpose |
|--------|------------|-----------|---------|
| **ROI (Return on Investment)** | (Net Profit / Total Investment) × 100% | CRITICAL: ≥15%, HIGH: ≥20% | Recursion trigger |
| **Break-even timeline** | Months until cumulative revenue ≥ cumulative costs | MEDIUM: ≤36 months | Advisory warning |
| **Recursion count** | Number of times Stage 5 triggered FIN-001 recursion | ≤3 | Loop prevention |
| **Recursion resolution time** | Time to complete recursion cycle (Stage 5 → Stage 3 → Stage 5) | ≤5 days | Performance monitoring |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-05.md:79-86,96 "Recursion Thresholds table"

---

## Proposed Monitoring Queries

### 1. ROI Calculation (Primary Recursion Trigger)

**SQL** (proposed):
```sql
-- Calculate ROI for all ventures in Stage 5
SELECT
  venture_id,
  financial_model->>'net_profit' AS net_profit,
  financial_model->>'total_investment' AS total_investment,
  ((financial_model->>'net_profit')::NUMERIC /
   (financial_model->>'total_investment')::NUMERIC) * 100 AS roi_pct,
  CASE
    WHEN ((financial_model->>'net_profit')::NUMERIC /
          (financial_model->>'total_investment')::NUMERIC) * 100 < 15 THEN 'CRITICAL'
    WHEN ((financial_model->>'net_profit')::NUMERIC /
          (financial_model->>'total_investment')::NUMERIC) * 100 < 20 THEN 'HIGH'
    ELSE 'GREEN'
  END AS severity
FROM ventures
WHERE current_stage = 5
  AND stage_status = 'in_progress';
```

**Thresholds**:
- **CRITICAL**: ROI < 15% → Auto-trigger FIN-001 to Stage 3
- **HIGH**: ROI 15-20% → Chairman approval required
- **GREEN**: ROI ≥ 20% → Proceed to Stage 6

**Alert**: If ROI < 15%, automatically trigger recursion (no manual alert needed)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-05.md:49 "if (calculatedROI < 15)"

---

### 2. Margin Forecasts

**SQL** (proposed):
```sql
-- Calculate gross and net margins
SELECT
  venture_id,
  (financial_model->'projections'->>'year1_revenue')::NUMERIC AS revenue_y1,
  (financial_model->'projections'->>'year1_cogs')::NUMERIC AS cogs_y1,
  (financial_model->'projections'->>'year1_opex')::NUMERIC AS opex_y1,
  ((revenue_y1 - cogs_y1) / revenue_y1) * 100 AS gross_margin_pct,
  ((revenue_y1 - cogs_y1 - opex_y1) / revenue_y1) * 100 AS net_margin_pct,
  CASE
    WHEN ((revenue_y1 - cogs_y1) / revenue_y1) * 100 < 20 THEN 'HIGH'
    ELSE 'NORMAL'
  END AS margin_severity
FROM ventures
WHERE current_stage = 5;
```

**Thresholds**:
- **Gross Margin < 20%**: HIGH severity → Chairman approval to recurse to Stage 4
- **Net Margin < 15%**: HIGH severity → Chairman approval to recurse to Stage 3

**Alert**: If gross_margin < 20%, flag for Chairman review

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-05.md:85 "Margin | < 20% | HIGH"

---

### 3. Break-Even Timeline

**SQL** (proposed):
```sql
-- Calculate break-even timeline
SELECT
  venture_id,
  (financial_model->'break_even'->>'months_to_break_even')::INT AS break_even_months,
  CASE
    WHEN (financial_model->'break_even'->>'months_to_break_even')::INT <= 24 THEN 'EXCELLENT'
    WHEN (financial_model->'break_even'->>'months_to_break_even')::INT <= 36 THEN 'ACCEPTABLE'
    ELSE 'MEDIUM'
  END AS break_even_status
FROM ventures
WHERE current_stage = 5;
```

**Thresholds**:
- **≤24 months**: Excellent
- **24-36 months**: Acceptable
- **>36 months**: MEDIUM severity → Advisory warning only (no recursion)

**Alert**: If break_even > 36 months, show warning message but allow proceed

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-05.md:86 "Break-even | > 36 months | MEDIUM"

---

### 4. Model Accuracy (Post-Launch)

**SQL** (proposed):
```sql
-- Measure variance between projected and actual results
-- (Only applicable after venture launches and generates real data)
SELECT
  venture_id,
  ABS((actual_revenue - projected_revenue) / projected_revenue) * 100 AS revenue_variance_pct,
  ABS((actual_costs - projected_costs) / projected_costs) * 100 AS cost_variance_pct,
  ((100 - revenue_variance_pct) + (100 - cost_variance_pct)) / 2 AS model_accuracy_pct
FROM (
  SELECT
    v.id AS venture_id,
    (v.financial_model->'projections'->>'year1_revenue')::NUMERIC AS projected_revenue,
    SUM(t.amount) AS actual_revenue,
    (v.financial_model->'projections'->>'year1_costs')::NUMERIC AS projected_costs,
    SUM(e.amount) AS actual_costs
  FROM ventures v
  JOIN transactions t ON t.venture_id = v.id AND t.type = 'revenue'
  JOIN expenses e ON e.venture_id = v.id
  WHERE v.launch_date IS NOT NULL
    AND t.created_at BETWEEN v.launch_date AND v.launch_date + INTERVAL '1 year'
  GROUP BY v.id
) subquery;
```

**Threshold**: ≥90% accuracy (variance ≤10%)

**Alert**: If model_accuracy < 90%, review financial modeling assumptions for future ventures

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:197 "Model accuracy"

---

## Recursion Metrics

### 5. Recursion Count Tracking

**SQL** (proposed):
```sql
-- Track FIN-001 recursion count per venture
SELECT
  venture_id,
  COUNT(*) AS recursion_count,
  MAX(created_at) AS last_recursion_at,
  CASE
    WHEN COUNT(*) >= 3 THEN 'ESCALATE'
    ELSE 'NORMAL'
  END AS status
FROM recursion_events
WHERE from_stage = 5
  AND trigger_type = 'FIN-001'
GROUP BY venture_id;
```

**Threshold**: ≤3 recursions

**Alert**: If recursion_count ≥ 3, escalate to Chairman for decision (continue/kill/pivot)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-05.md:96 "Max recursions: 3 returns"

---

### 6. Recursion Resolution Time

**SQL** (proposed):
```sql
-- Measure time to complete recursion cycle
SELECT
  re.venture_id,
  re.trigger_type,
  re.created_at AS recursion_triggered_at,
  sh.created_at AS stage_5_resumed_at,
  EXTRACT(EPOCH FROM (sh.created_at - re.created_at)) / 86400 AS resolution_days
FROM recursion_events re
JOIN stage_history sh ON sh.venture_id = re.venture_id
  AND sh.stage_id = 5
  AND sh.created_at > re.created_at
WHERE re.from_stage = 5
  AND re.trigger_type = 'FIN-001'
ORDER BY resolution_days DESC;
```

**Threshold**: ≤5 days (target)

**Alert**: If resolution_days > 5, investigate bottlenecks in Stage 3 or Stage 4

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-05.md:116-120 "Performance Requirements"

---

### 7. ROI Delta After Recursion

**SQL** (proposed):
```sql
-- Track ROI improvement after recursion
SELECT
  re.venture_id,
  (re.trigger_data->>'calculated_roi')::NUMERIC AS original_roi,
  ((v.financial_model->'profitability'->>'roi')::NUMERIC) AS new_roi,
  ((v.financial_model->'profitability'->>'roi')::NUMERIC) -
    (re.trigger_data->>'calculated_roi')::NUMERIC AS roi_delta
FROM recursion_events re
JOIN ventures v ON v.id = re.venture_id
WHERE re.from_stage = 5
  AND re.trigger_type = 'FIN-001'
  AND re.resolved_at IS NOT NULL;
```

**Purpose**: Measure effectiveness of recursion (did ROI improve?)

**Analysis**: If roi_delta consistently negative or small, review recursion process effectiveness

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-05.md:65-69 "Re-validation required"

---

## Dashboard Visualizations (Proposed)

### Stage 5 Financial Health Dashboard

1. **ROI Distribution**: Histogram of ROI values for all ventures in Stage 5
   - Color-coded: Red (<15%), Yellow (15-20%), Green (≥20%)

2. **Recursion Trigger Heatmap**: Number of FIN-001 triggers per month
   - Identify patterns (e.g., all hardware ventures trigger recursion)

3. **Break-Even Timeline**: Box plot showing break-even timelines across ventures
   - Highlight outliers (>36 months)

4. **Margin Analysis**: Scatter plot of Gross Margin vs Net Margin
   - Identify ventures with high COGS (low gross margin) or high OpEx (low net margin)

5. **Recursion Resolution Time**: Bar chart of avg resolution time per recursion type
   - Track efficiency of recursion process

6. **Model Accuracy Over Time** (post-launch): Line chart comparing projected vs actual
   - Improve financial modeling assumptions based on historical variance

---

## Real-Time Alerts

**Implement in application**:

| Condition | Alert Type | Recipient | Action |
|-----------|------------|-----------|--------|
| ROI < 15% calculated | Auto-trigger | System | Trigger FIN-001 recursion to Stage 3 |
| ROI < 15% detected | Email | Chairman | Post-execution notification |
| ROI 15-20% | Dashboard | Chairman | Request approval to recurse or proceed |
| Margin < 20% | Dashboard | Chairman | Request approval to recurse to Stage 4 |
| Break-even > 36 months | Warning banner | User | Advisory only, no block |
| Recursion count ≥ 3 | Email | Chairman | Escalate for kill/continue decision |
| Resolution time > 5 days | Dashboard | PLAN team | Investigate bottleneck |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-05.md:122-131 "UI/UX Implications"

---

## Performance SLAs

**From critique performance requirements**:

| Metric | Target | Measurement |
|--------|--------|-------------|
| ROI calculation latency | <500ms | Time to compute ROI from financial model |
| Recursion detection latency | <100ms | Time to evaluate thresholds after ROI calculated |
| Total stage latency | <1s | From data entry to recursion decision |
| Database logging latency | Async | Non-blocking write to recursion_events |

**Monitoring Query**:
```sql
-- Track stage performance metrics
SELECT
  venture_id,
  (performance_metrics->>'roi_calculation_ms')::INT AS roi_calc_ms,
  (performance_metrics->>'recursion_detection_ms')::INT AS recursion_detect_ms,
  (performance_metrics->>'total_stage_ms')::INT AS total_stage_ms
FROM stage_performance
WHERE stage_id = 5
  AND (performance_metrics->>'total_stage_ms')::INT > 1000;  -- Violations
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-05.md:116-120 "Performance Requirements"

---

## Known Gaps (from critique)

⚠️ **Missing Threshold Values**: Critique notes "Metrics defined but validation criteria unclear" (Testability score: 3/5)

⚠️ **Missing Measurement Frequency**: No guidance on when to measure (real-time, daily rollup, post-launch)

⚠️ **No Metrics Implementation**: All queries proposed, none implemented yet

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-05.md:9 "Testability | 3"

---

## Implementation Priority

**P0 (Blockers)**:
1. Implement ROI calculation query (required for recursion trigger)
2. Build recursion_events table (required for loop prevention)
3. Implement recursion count tracking (required for Chairman escalation)

**P1 (High)**:
4. Build ROI real-time indicator UI (green/yellow/red)
5. Implement margin forecasts query
6. Build recursion dashboard (trigger heatmap, resolution time)

**P2 (Medium)**:
7. Build break-even timeline query and visualization
8. Implement post-launch model accuracy tracking
9. Build comprehensive financial health dashboard

---

## Sources Table

| Source | Repo | Commit | Path | Lines |
|--------|------|--------|------|-------|
| Metrics | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 196-199 |
| ROI thresholds | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-05.md | 79-86 |
| Loop prevention | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-05.md | 96 |
| Performance SLAs | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-05.md | 116-120 |
| UI/UX alerts | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-05.md | 122-131 |
| Testability gap | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-05.md | 9 |

<!-- Generated by Claude Code Phase 3 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
