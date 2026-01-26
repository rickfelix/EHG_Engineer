<!-- ARCHIVED: 2026-01-26T16:26:52.488Z
     Reason: Duplicate of canonical file
     Original location: docs\workflow\dossiers\stage-06\09_metrics-monitoring.md
     See: docs/fixes/duplicate-consolidation-manifest.json for details
-->

# Stage 6: Metrics & Monitoring


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: sd, reference, typescript, workflow

**Purpose**: Document KPIs, measurement queries, dashboard visualizations, and alerting for Stage 6 (Risk Evaluation).

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:241-244 "metrics: Risk coverage"

---

## Defined Metrics (from stages.yaml)

**Total Metrics**: 3 standard + 3 recursion-specific = 6 total

### Standard Metrics

| Metric | Definition | Target | Source |
|--------|------------|--------|--------|
| **Risk coverage** | % of identified risks with defined mitigation plans | 100% | ventures.risk_matrix + mitigation_plans |
| **Mitigation effectiveness** | Average % risk reduction from mitigation strategies | ≥70% | ventures.mitigation_plans |
| **Risk score** | Composite score (Σ probability × impact for all risks) | <50 | ventures.risk_matrix |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:241-244 "Risk coverage, Mitigation effectiveness, Risk score"

---

### Recursion Metrics (Proposed)

| Metric | Definition | Target | Source |
|--------|------------|--------|--------|
| **Hidden cost discovery rate** | % of ventures where Stage 6 discovers hidden costs | Monitor only | recursion_events (from_stage = 6) |
| **Recursion trigger rate** | % of ventures triggering FIN-001 from Stage 6 | <20% | recursion_events (from_stage = 6, trigger_type = 'FIN-001') |
| **Average hidden cost %** | Average hidden costs as % of OpEx | <10% | recursion_events.trigger_data |

**Evidence**: Inferred from Stage 5 recursion pattern (EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-05.md:91)

---

## Metric Definitions & Measurement

### Metric 1: Risk Coverage

**Formula**:
```sql
Risk Coverage % = (COUNT(risks with mitigation) / COUNT(total risks)) × 100
```

**Query**:
```sql
-- Risk Coverage for specific venture
SELECT
  v.id AS venture_id,
  v.title AS venture_name,
  COALESCE(
    jsonb_array_length(v.risk_matrix->'risks'),
    0
  ) AS total_risks,
  COALESCE(
    jsonb_array_length(v.mitigation_plans->'plans'),
    0
  ) AS mitigated_risks,
  CASE
    WHEN jsonb_array_length(v.risk_matrix->'risks') > 0
    THEN (jsonb_array_length(v.mitigation_plans->'plans')::NUMERIC /
          jsonb_array_length(v.risk_matrix->'risks')::NUMERIC) * 100
    ELSE 0
  END AS risk_coverage_pct
FROM ventures v
WHERE v.id = $1;
```

**Target**: 100% (all risks must have mitigation plans)

**Alert Threshold**: <95% (flag for review)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:241 "Risk coverage"

---

### Metric 2: Mitigation Effectiveness

**Formula**:
```sql
Mitigation Effectiveness % = AVG(mitigation_effectiveness for all mitigation plans)
```

**Query**:
```sql
-- Mitigation Effectiveness for specific venture
SELECT
  v.id AS venture_id,
  v.title AS venture_name,
  AVG(
    (plan->>'effectiveness_pct')::NUMERIC
  ) AS avg_mitigation_effectiveness_pct
FROM ventures v,
     jsonb_array_elements(v.mitigation_plans->'plans') AS plan
WHERE v.id = $1
GROUP BY v.id, v.title;
```

**Target**: ≥70% (average risk reduction across all mitigation strategies)

**Alert Threshold**: <60% (flag for review)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:242 "Mitigation effectiveness"

---

### Metric 3: Risk Score

**Formula**:
```sql
Risk Score = Σ (probability × impact) for all risks
```

**Query**:
```sql
-- Risk Score for specific venture
SELECT
  v.id AS venture_id,
  v.title AS venture_name,
  SUM(
    ((risk->>'probability_pct')::NUMERIC / 100) *
    (risk->>'impact_usd')::NUMERIC
  ) AS risk_score
FROM ventures v,
     jsonb_array_elements(v.risk_matrix->'risks') AS risk
WHERE v.id = $1
GROUP BY v.id, v.title;
```

**Target**: <50 (acceptable overall risk)

**Alert Threshold**: ≥50 (requires Chairman approval)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:244 "Risk score"

---

### Metric 4: Hidden Cost Discovery Rate (Recursion)

**Formula**:
```sql
Hidden Cost Discovery Rate % = (COUNT(ventures with hidden costs discovered) / COUNT(total ventures at Stage 6)) × 100
```

**Query**:
```sql
-- Hidden Cost Discovery Rate (all ventures)
SELECT
  COUNT(DISTINCT CASE WHEN re.id IS NOT NULL THEN v.id END) AS ventures_with_hidden_costs,
  COUNT(DISTINCT v.id) AS total_ventures_stage_6,
  (COUNT(DISTINCT CASE WHEN re.id IS NOT NULL THEN v.id END)::NUMERIC /
   NULLIF(COUNT(DISTINCT v.id), 0)::NUMERIC) * 100 AS hidden_cost_discovery_rate_pct
FROM ventures v
LEFT JOIN recursion_events re ON re.venture_id = v.id
  AND re.from_stage = 6
  AND re.trigger_type = 'FIN-001'
WHERE v.current_stage_id >= 6;  -- Only ventures that reached Stage 6
```

**Target**: Monitor only (no fixed target; measure process quality)

**Alert Threshold**: >30% (may indicate poor Stage 5 financial modeling)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-05.md:91 "Risk assessment uncovers hidden costs"

---

### Metric 5: Recursion Trigger Rate (from Stage 6)

**Formula**:
```sql
Recursion Trigger Rate % = (COUNT(FIN-001 triggers from Stage 6) / COUNT(total ventures at Stage 6)) × 100
```

**Query**:
```sql
-- Recursion Trigger Rate (all ventures)
SELECT
  COUNT(re.id) AS recursion_count,
  COUNT(DISTINCT v.id) AS total_ventures_stage_6,
  (COUNT(re.id)::NUMERIC / NULLIF(COUNT(DISTINCT v.id), 0)::NUMERIC) * 100 AS recursion_trigger_rate_pct
FROM ventures v
LEFT JOIN recursion_events re ON re.venture_id = v.id
  AND re.from_stage = 6
  AND re.trigger_type = 'FIN-001'
WHERE v.current_stage_id >= 6;
```

**Target**: <20% (ideally, Stage 5 financial model should be accurate; hidden costs should be rare)

**Alert Threshold**: >30% (indicates systemic issue with Stage 5 modeling or Stage 6 risk identification process)

**Evidence**: Pattern from Stage 5 recursion metrics (EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-05.md:116-120)

---

### Metric 6: Average Hidden Cost %

**Formula**:
```sql
Average Hidden Cost % = AVG(hidden costs / OpEx × 100) for all FIN-001 triggers from Stage 6
```

**Query**:
```sql
-- Average Hidden Cost % (all ventures with hidden costs)
SELECT
  AVG(
    (re.trigger_data->>'hidden_cost_pct')::NUMERIC
  ) AS avg_hidden_cost_pct
FROM recursion_events re
WHERE re.from_stage = 6
  AND re.trigger_type = 'FIN-001'
  AND re.trigger_data->>'hidden_cost_pct' IS NOT NULL;
```

**Target**: <10% (hidden costs should be small % of OpEx if Stage 5 modeling accurate)

**Alert Threshold**: >15% (indicates significant financial modeling gaps)

**Evidence**: Proposed threshold based on recursion pattern (EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-05.md:91)

---

## Dashboard Visualizations (Proposed)

### Dashboard 1: Risk Assessment Health

**Purpose**: Monitor quality of risk assessments across all ventures

**Metrics**:
- Risk coverage % (gauge: 0-100%, target 100%)
- Mitigation effectiveness % (gauge: 0-100%, target 70%)
- Risk score distribution (histogram: 0-100, target <50)

**Filters**:
- Industry (SaaS, hardware, healthcare)
- Date range
- Venture status (Active, Complete, Killed)

**Query**:
```sql
-- Risk Assessment Health Dashboard
SELECT
  v.industry,
  COUNT(v.id) AS venture_count,
  AVG(
    CASE
      WHEN jsonb_array_length(v.risk_matrix->'risks') > 0
      THEN (jsonb_array_length(v.mitigation_plans->'plans')::NUMERIC /
            jsonb_array_length(v.risk_matrix->'risks')::NUMERIC) * 100
      ELSE 0
    END
  ) AS avg_risk_coverage_pct,
  AVG(
    (SELECT AVG((plan->>'effectiveness_pct')::NUMERIC)
     FROM jsonb_array_elements(v.mitigation_plans->'plans') AS plan)
  ) AS avg_mitigation_effectiveness_pct,
  AVG(
    (SELECT SUM(((risk->>'probability_pct')::NUMERIC / 100) * (risk->>'impact_usd')::NUMERIC)
     FROM jsonb_array_elements(v.risk_matrix->'risks') AS risk)
  ) AS avg_risk_score
FROM ventures v
WHERE v.current_stage_id >= 6
GROUP BY v.industry
ORDER BY v.industry;
```

---

### Dashboard 2: Hidden Cost Discovery Analysis

**Purpose**: Track recursion triggers from Stage 6 to identify financial modeling gaps

**Metrics**:
- Hidden cost discovery rate % (line chart over time)
- Recursion trigger rate % (line chart over time)
- Average hidden cost % (gauge: 0-25%, target <10%)
- Top 3 hidden cost categories (bar chart: GDPR, insurance, legal, etc.)

**Filters**:
- Industry
- Date range
- Severity (HIGH, CRITICAL)

**Query**:
```sql
-- Hidden Cost Discovery Analysis
SELECT
  DATE_TRUNC('month', re.created_at) AS month,
  COUNT(re.id) AS recursion_count,
  COUNT(DISTINCT re.venture_id) AS unique_ventures_with_hidden_costs,
  AVG((re.trigger_data->>'hidden_cost_pct')::NUMERIC) AS avg_hidden_cost_pct,
  jsonb_object_agg(
    category,
    category_cost
  ) AS hidden_cost_breakdown
FROM recursion_events re,
     LATERAL (
       SELECT
         elem->>'risk_description' AS category,
         SUM((elem->>'cost_per_year')::NUMERIC) AS category_cost
       FROM jsonb_array_elements(re.trigger_data->'hidden_cost_breakdown') AS elem
       GROUP BY elem->>'risk_description'
     ) AS breakdown
WHERE re.from_stage = 6
  AND re.trigger_type = 'FIN-001'
GROUP BY DATE_TRUNC('month', re.created_at)
ORDER BY month DESC;
```

---

### Dashboard 3: Risk Matrix Heatmap

**Purpose**: Visualize all risks for a specific venture in probability × impact grid

**Metrics**:
- 2D heatmap: Probability (Y-axis: Low/Medium/High) × Impact (X-axis: Low/Medium/High)
- Color coding: Red (Critical), Orange (High), Yellow (Medium), Green (Low)
- Risk count per cell (e.g., "3 risks" in High Probability + High Impact cell)

**Filters**:
- Venture ID
- Risk type (Technical, Market, Operational)

**Query**:
```sql
-- Risk Matrix Heatmap for specific venture
SELECT
  CASE
    WHEN (risk->>'probability_pct')::NUMERIC >= 67 THEN 'High'
    WHEN (risk->>'probability_pct')::NUMERIC >= 34 THEN 'Medium'
    ELSE 'Low'
  END AS probability_category,
  CASE
    WHEN (risk->>'impact_usd')::NUMERIC >= 100000 THEN 'High'
    WHEN (risk->>'impact_usd')::NUMERIC >= 10000 THEN 'Medium'
    ELSE 'Low'
  END AS impact_category,
  risk->>'type' AS risk_type,
  COUNT(*) AS risk_count,
  jsonb_agg(
    jsonb_build_object(
      'id', risk->>'id',
      'description', risk->>'description',
      'probability', risk->>'probability_pct',
      'impact', risk->>'impact_usd'
    )
  ) AS risks
FROM ventures v,
     jsonb_array_elements(v.risk_matrix->'risks') AS risk
WHERE v.id = $1
GROUP BY probability_category, impact_category, risk_type
ORDER BY
  CASE probability_category WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END,
  CASE impact_category WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END;
```

---

## Alerting Rules (Proposed)

### Alert 1: Low Risk Coverage

**Condition**: Risk coverage < 95%

**Severity**: MEDIUM

**Notification**: Email to EXEC team

**Message**: "Venture {venture_name} has {coverage}% risk coverage. {unmitigated_count} risks remain unmitigated. Review required."

**Query**:
```sql
-- Check Risk Coverage
SELECT v.id, v.title,
  (jsonb_array_length(v.mitigation_plans->'plans')::NUMERIC /
   NULLIF(jsonb_array_length(v.risk_matrix->'risks'), 0)::NUMERIC) * 100 AS coverage_pct
FROM ventures v
WHERE v.current_stage_id = 6
  AND (jsonb_array_length(v.mitigation_plans->'plans')::NUMERIC /
       NULLIF(jsonb_array_length(v.risk_matrix->'risks'), 0)::NUMERIC) * 100 < 95;
```

---

### Alert 2: High Risk Score

**Condition**: Risk score ≥ 50

**Severity**: HIGH

**Notification**: Email to Chairman + EXEC team

**Message**: "Venture {venture_name} has risk score {risk_score} (threshold: 50). Chairman approval required to proceed."

**Query**:
```sql
-- Check Risk Score
SELECT v.id, v.title,
  SUM(((risk->>'probability_pct')::NUMERIC / 100) * (risk->>'impact_usd')::NUMERIC) AS risk_score
FROM ventures v,
     jsonb_array_elements(v.risk_matrix->'risks') AS risk
WHERE v.current_stage_id = 6
GROUP BY v.id, v.title
HAVING SUM(((risk->>'probability_pct')::NUMERIC / 100) * (risk->>'impact_usd')::NUMERIC) >= 50;
```

---

### Alert 3: High Recursion Trigger Rate

**Condition**: Recursion trigger rate > 30% (calculated monthly)

**Severity**: HIGH

**Notification**: Email to PLAN team (indicates systemic issue with Stage 5 financial modeling)

**Message**: "Recursion trigger rate from Stage 6 is {rate}% this month (threshold: 30%). Review Stage 5 financial modeling process."

**Query**:
```sql
-- Check Monthly Recursion Trigger Rate
SELECT
  DATE_TRUNC('month', re.created_at) AS month,
  (COUNT(re.id)::NUMERIC / NULLIF(COUNT(DISTINCT v.id), 0)::NUMERIC) * 100 AS trigger_rate_pct
FROM ventures v
LEFT JOIN recursion_events re ON re.venture_id = v.id
  AND re.from_stage = 6
  AND re.trigger_type = 'FIN-001'
  AND DATE_TRUNC('month', re.created_at) = DATE_TRUNC('month', CURRENT_DATE)
WHERE v.current_stage_id >= 6
  AND v.created_at >= DATE_TRUNC('month', CURRENT_DATE)
GROUP BY DATE_TRUNC('month', re.created_at)
HAVING (COUNT(re.id)::NUMERIC / NULLIF(COUNT(DISTINCT v.id), 0)::NUMERIC) * 100 > 30;
```

---

## Real-Time Monitoring (Proposed)

### Real-Time Metric 1: Hidden Cost Indicator

**Purpose**: Show real-time hidden cost % as user enters mitigation costs in Substage 6.3

**Update Frequency**: On every mitigation cost input change

**Calculation**:
```typescript
const totalMitigationCost = mitigationPlans.reduce((sum, plan) => sum + plan.cost_per_year, 0);
const opex = financialModel.costs.opex;
const hiddenCostPct = (totalMitigationCost / opex) * 100;

// Color coding
const color = hiddenCostPct > 25 ? 'red' :
              hiddenCostPct > 10 ? 'yellow' :
              'green';
```

**Display**:
```
Hidden Costs: $100,000/year (20.0% of OpEx) [🟡 YELLOW]
⚠️ Warning: Exceeds 10% threshold. Chairman approval required for recursion.
```

**Evidence**: Pattern from Stage 5 real-time ROI indicator (EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-05.md:122-127)

---

## Performance Monitoring (Proposed)

**Stage 6 Performance Targets**:

| Metric | Target | Purpose |
|--------|--------|---------|
| Risk identification time | <30 seconds | AI agent execution time (Substage 6.1) |
| Risk scoring time | <20 seconds | AI agent execution time (Substage 6.2) |
| Mitigation planning time | <40 seconds | AI agent execution time (Substage 6.3) |
| Total stage latency | <2 minutes | From entry gate to exit gate (automated path) |

**Query**:
```sql
-- Stage Performance Tracking
CREATE TABLE stage_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID REFERENCES ventures(id),
  stage_id INT NOT NULL,
  substage_id VARCHAR(10),
  operation VARCHAR(100),
  latency_ms INT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Average latency by operation
SELECT
  operation,
  AVG(latency_ms) AS avg_latency_ms,
  MAX(latency_ms) AS max_latency_ms,
  COUNT(*) AS execution_count
FROM stage_performance
WHERE stage_id = 6
  AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY operation
ORDER BY avg_latency_ms DESC;
```

---

## Sources Table

| Source | Repo | Commit | Path | Lines |
|--------|------|--------|------|-------|
| Metrics definition | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 241-244 |
| Recursion reference | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-05.md | 91 |
| Performance pattern | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-05.md | 116-120 |
| Real-time indicator pattern | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-05.md | 122-127 |

<!-- Generated by Claude Code Phase 3 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
