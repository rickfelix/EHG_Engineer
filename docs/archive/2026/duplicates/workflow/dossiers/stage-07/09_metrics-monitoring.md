<!-- ARCHIVED: 2026-01-26T16:26:52.406Z
     Reason: Duplicate of canonical file
     Original location: docs\workflow\dossiers\stage-07\09_metrics-monitoring.md
     See: docs/fixes/duplicate-consolidation-manifest.json for details
-->

# Stage 7: Metrics & Monitoring


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: sd, validation, architecture, workflow

**Purpose**: Track Stage 7 (Comprehensive Planning Suite) performance, quality, and outcomes

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:287-290 "metrics: Plan completeness, Timeline feasibility, Resource efficiency"

---

## Stage-Specific Metrics

### Metric 1: Plan Completeness

**Definition**: Percentage of required sections completed in business, technical, and resource plans

**Source**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:288 "Plan completeness"

**Formula**:
```sql
-- Assuming plans stored in structured format
SELECT
  venture_id,
  (completed_sections::FLOAT / total_required_sections::FLOAT) * 100 AS plan_completeness_pct
FROM (
  SELECT
    v.id AS venture_id,
    -- Business plan sections (7)
    CASE WHEN vp.business_model_json IS NOT NULL THEN 1 ELSE 0 END +
    CASE WHEN vp.revenue_streams_json IS NOT NULL THEN 1 ELSE 0 END +
    CASE WHEN vp.cost_structure_json IS NOT NULL THEN 1 ELSE 0 END +
    CASE WHEN vp.go_to_market_json IS NOT NULL THEN 1 ELSE 0 END +
    CASE WHEN vp.operations_design_json IS NOT NULL THEN 1 ELSE 0 END +
    -- Technical plan sections (5)
    CASE WHEN vp.architecture_diagram_url IS NOT NULL THEN 1 ELSE 0 END +
    CASE WHEN vp.tech_stack_json IS NOT NULL THEN 1 ELSE 0 END +
    CASE WHEN vp.development_roadmap_json IS NOT NULL THEN 1 ELSE 0 END +
    -- Resource plan sections (3)
    CASE WHEN vp.team_requirements_json IS NOT NULL THEN 1 ELSE 0 END +
    CASE WHEN vp.budget_allocation_json IS NOT NULL THEN 1 ELSE 0 END +
    CASE WHEN vp.timeline_json IS NOT NULL THEN 1 ELSE 0 END
    AS completed_sections,
    15 AS total_required_sections  -- 7 + 5 + 3
  FROM ventures v
  LEFT JOIN venture_plans vp ON v.id = vp.venture_id
  WHERE v.current_stage = 7
) AS plan_data;
```

**Target**: ≥ 90% (all sections complete)
**Warning**: 70-89% (some sections missing)
**Critical**: < 70% (major sections missing)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-07.md:35 "Missing threshold values"

---

### Metric 2: Timeline Feasibility

**Definition**: Whether planned timeline is realistic compared to historical benchmarks

**Source**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:289 "Timeline feasibility"

**Formula**:
```sql
-- Compare planned timeline to benchmark for similar ventures
SELECT
  v.id AS venture_id,
  vp.planned_timeline_months,
  AVG(vp_hist.actual_timeline_months) AS benchmark_timeline_months,
  vp.planned_timeline_months::FLOAT / NULLIF(AVG(vp_hist.actual_timeline_months), 0) AS timeline_feasibility_ratio
FROM ventures v
JOIN venture_plans vp ON v.id = vp.venture_id
LEFT JOIN ventures v_hist ON v_hist.category = v.category
  AND v_hist.current_stage >= 30  -- Completed ventures only
LEFT JOIN venture_plans vp_hist ON v_hist.id = vp_hist.venture_id
WHERE v.current_stage = 7
GROUP BY v.id, vp.planned_timeline_months;
```

**Interpretation**:
- **Ratio ≥ 1.0**: Planned timeline matches or exceeds benchmark (feasible)
- **Ratio 0.8-0.99**: Planned timeline 80-99% of benchmark (optimistic but achievable)
- **Ratio < 0.8**: Planned timeline < 80% of benchmark (likely infeasible)

**Target**: Ratio ≥ 0.8
**Warning**: Ratio 0.6-0.79
**Critical**: Ratio < 0.6

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-07.md:36 "Missing threshold values"

---

### Metric 3: Resource Efficiency

**Definition**: Whether budgeted resources (cost, team size) are efficient compared to benchmarks

**Source**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:290 "Resource efficiency"

**Formula**:
```sql
-- Compare planned budget to benchmark for similar ventures
SELECT
  v.id AS venture_id,
  vp.planned_budget_usd,
  AVG(vp_hist.actual_budget_usd) AS benchmark_budget_usd,
  vp.planned_budget_usd::FLOAT / NULLIF(AVG(vp_hist.actual_budget_usd), 0) AS resource_efficiency_ratio
FROM ventures v
JOIN venture_plans vp ON v.id = vp.venture_id
LEFT JOIN ventures v_hist ON v_hist.category = v.category
  AND v_hist.current_stage >= 30  -- Completed ventures only
LEFT JOIN venture_plans vp_hist ON v_hist.id = vp_hist.venture_id
WHERE v.current_stage = 7
GROUP BY v.id, vp.planned_budget_usd;
```

**Interpretation**:
- **Ratio ≤ 1.0**: Planned budget at or below benchmark (efficient)
- **Ratio 1.0-1.2**: Planned budget 0-20% above benchmark (acceptable)
- **Ratio > 1.2**: Planned budget > 20% above benchmark (inefficient)

**Target**: Ratio ≤ 1.2
**Warning**: Ratio 1.2-1.5
**Critical**: Ratio > 1.5

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-07.md:37 "Missing measurement frequency"

---

## Performance Metrics

### Metric 4: Stage Completion Time

**Definition**: Time (in days) to complete Stage 7 (all 3 substages)

**Formula**:
```sql
SELECT
  venture_id,
  EXTRACT(EPOCH FROM (completed_at - started_at)) / 86400 AS completion_time_days
FROM venture_stage_history
WHERE stage_id = 7
  AND status = 'completed';
```

**Target**: ≤ 10 days (manual) or ≤ 3 days (AI-assisted)
**Warning**: 10-15 days (manual) or 3-5 days (AI-assisted)
**Critical**: > 15 days (manual) or > 5 days (AI-assisted)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-07.md:61 "Primary Risk: Process delays"

---

### Metric 5: Revision Cycles

**Definition**: Number of times plans sent back for revision before Chairman approval

**Formula**:
```sql
SELECT
  venture_id,
  COUNT(*) AS revision_cycles
FROM venture_stage_history
WHERE stage_id = 7
  AND status = 'in_progress'  -- Each return to "in_progress" is a revision cycle
GROUP BY venture_id;
```

**Target**: ≤ 1 revision cycle
**Warning**: 2-3 revision cycles
**Critical**: > 3 revision cycles

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-07.md:25 "Unclear rollback procedures"

---

## Recursion Metrics

### Metric 6: Inbound Recursion Rate

**Definition**: % of ventures that receive recursion from Stage 8 or 10 (planning assumptions invalidated)

**Formula**:
```sql
SELECT
  COUNT(DISTINCT re.venture_id)::FLOAT / COUNT(DISTINCT v.id)::FLOAT * 100 AS inbound_recursion_rate_pct
FROM ventures v
LEFT JOIN recursion_events re ON v.id = re.venture_id
  AND re.to_stage = 7
  AND re.trigger_type IN ('RESOURCE-001', 'TIMELINE-001', 'TECH-001')
WHERE v.current_stage >= 8;  -- Only ventures that reached Stage 8+
```

**Target**: ≤ 20% (most plans accurate)
**Warning**: 20-40%
**Critical**: > 40% (plans consistently inaccurate)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:62-63 "Stage 7 | RESOURCE-001, TIMELINE-001"

---

### Metric 7: Recursion Trigger Distribution

**Definition**: Breakdown of recursion triggers (RESOURCE-001, TIMELINE-001, TECH-001)

**Formula**:
```sql
SELECT
  trigger_type,
  COUNT(*) AS trigger_count,
  COUNT(*)::FLOAT / SUM(COUNT(*)) OVER () * 100 AS trigger_pct
FROM recursion_events
WHERE to_stage = 7
GROUP BY trigger_type
ORDER BY trigger_count DESC;
```

**Expected Distribution** (based on critique analysis):
- **RESOURCE-001**: 40-50% (most common: resource estimates too low)
- **TIMELINE-001**: 30-40% (timeline too optimistic)
- **TECH-001**: 10-20% (architecture complexity underestimated)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:62-63 "RESOURCE-001, TIMELINE-001"
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-10.md:39 "TECH-001"

---

### Metric 8: Average Recursion Resolution Time

**Definition**: Time (in days) to resolve recursion (update plans, re-submit for approval)

**Formula**:
```sql
SELECT
  trigger_type,
  AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 86400) AS avg_resolution_time_days
FROM recursion_events
WHERE to_stage = 7
  AND resolved_at IS NOT NULL
GROUP BY trigger_type;
```

**Target**: ≤ 3 days per recursion
**Warning**: 3-7 days per recursion
**Critical**: > 7 days per recursion

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-07.md:61 "Primary Risk: Process delays"

---

## Quality Metrics

### Metric 9: Chairman Approval Rate

**Definition**: % of Stage 7 completions approved on first submission (no revisions)

**Formula**:
```sql
SELECT
  COUNT(CASE WHEN revision_cycles = 0 THEN 1 END)::FLOAT / COUNT(*)::FLOAT * 100 AS approval_rate_pct
FROM (
  SELECT
    venture_id,
    COUNT(*) - 1 AS revision_cycles  -- -1 because first "in_progress" is not a revision
  FROM venture_stage_history
  WHERE stage_id = 7
  GROUP BY venture_id
) AS revision_data;
```

**Target**: ≥ 70% (most plans approved on first submission)
**Warning**: 50-69%
**Critical**: < 50%

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:295-298 "exit: Business plan approved"

---

### Metric 10: Plan Consistency Score

**Definition**: Automated consistency check score (0-100%) for internal plan consistency

**Examples of Inconsistencies**:
- Timeline in Resource Plan (7.3) doesn't match Development Roadmap (7.2)
- Budget in Resource Plan (7.3) doesn't match Cost Structure in Business Plan (7.1)
- Team size in Resource Plan (7.3) doesn't support Dev Roadmap scope (7.2)

**Formula**:
```sql
-- Assuming consistency checks implemented in validation framework
SELECT
  venture_id,
  consistency_score
FROM venture_plan_validation
WHERE stage_id = 7
  AND validation_type = 'consistency';
```

**Target**: ≥ 90% (highly consistent)
**Warning**: 70-89%
**Critical**: < 70%

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-07.md:12 "Data Readiness: data flow unclear"
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-07.md:40-44 "Improve Data Flow"

---

## Outcome Metrics (Post-Launch)

### Metric 11: Plan Accuracy (Post-Launch)

**Definition**: Compare planned vs actual outcomes (timeline, budget, team size) after launch

**Formula**:
```sql
-- For ventures that have launched (Stage 30+)
SELECT
  v.id AS venture_id,
  vp.planned_timeline_months,
  va.actual_timeline_months,
  (va.actual_timeline_months - vp.planned_timeline_months) AS timeline_variance_months,
  vp.planned_budget_usd,
  va.actual_budget_usd,
  (va.actual_budget_usd - vp.planned_budget_usd) AS budget_variance_usd
FROM ventures v
JOIN venture_plans vp ON v.id = vp.venture_id
JOIN venture_actuals va ON v.id = va.venture_id
WHERE v.current_stage >= 30;  -- Launched ventures
```

**Target**:
- Timeline variance: ±10% (within 10% of planned)
- Budget variance: ±15% (within 15% of planned)

**Warning**:
- Timeline variance: ±10-30%
- Budget variance: ±15-30%

**Critical**:
- Timeline variance: > ±30%
- Budget variance: > ±30%

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-07.md:9 "Testability: validation criteria unclear"

---

## Dashboard Queries

### Query 1: Stage 7 Health Dashboard

**Purpose**: Real-time overview of all ventures in Stage 7

```sql
SELECT
  v.id,
  v.title,
  v.category,
  vp.plan_completeness_pct,
  vp.timeline_feasibility_ratio,
  vp.resource_efficiency_ratio,
  EXTRACT(EPOCH FROM (NOW() - vsh.started_at)) / 86400 AS days_in_stage,
  CASE
    WHEN vp.plan_completeness_pct >= 90 AND vp.timeline_feasibility_ratio >= 0.8 AND vp.resource_efficiency_ratio <= 1.2 THEN 'GREEN'
    WHEN vp.plan_completeness_pct >= 70 AND vp.timeline_feasibility_ratio >= 0.6 AND vp.resource_efficiency_ratio <= 1.5 THEN 'YELLOW'
    ELSE 'RED'
  END AS health_status
FROM ventures v
JOIN venture_plans vp ON v.id = vp.venture_id
JOIN venture_stage_history vsh ON v.id = vsh.venture_id AND vsh.stage_id = 7 AND vsh.status = 'in_progress'
WHERE v.current_stage = 7
ORDER BY days_in_stage DESC;
```

**Output**: List of ventures in Stage 7 with health status (GREEN/YELLOW/RED)

---

### Query 2: Recursion Heatmap

**Purpose**: Identify which triggers are most common and which ventures are recursion-prone

```sql
SELECT
  re.trigger_type,
  COUNT(*) AS total_recursions,
  AVG(EXTRACT(EPOCH FROM (re.resolved_at - re.created_at)) / 86400) AS avg_resolution_days,
  COUNT(DISTINCT re.venture_id) AS ventures_affected,
  STRING_AGG(DISTINCT v.category, ', ') AS affected_categories
FROM recursion_events re
JOIN ventures v ON re.venture_id = v.id
WHERE re.to_stage = 7
GROUP BY re.trigger_type
ORDER BY total_recursions DESC;
```

**Output**: Recursion trigger breakdown with resolution time and affected venture categories

---

### Query 3: Planning Efficiency Trends

**Purpose**: Track planning efficiency over time (are we getting better at estimating?)

```sql
SELECT
  DATE_TRUNC('month', vsh.completed_at) AS month,
  AVG(EXTRACT(EPOCH FROM (vsh.completed_at - vsh.started_at)) / 86400) AS avg_completion_days,
  AVG(vp.plan_completeness_pct) AS avg_completeness_pct,
  COUNT(*) AS ventures_completed,
  COUNT(CASE WHEN re.id IS NOT NULL THEN 1 END)::FLOAT / COUNT(*) * 100 AS recursion_rate_pct
FROM venture_stage_history vsh
JOIN ventures v ON vsh.venture_id = v.id
JOIN venture_plans vp ON v.id = vp.venture_id
LEFT JOIN recursion_events re ON v.id = re.venture_id AND re.to_stage = 7
WHERE vsh.stage_id = 7
  AND vsh.status = 'completed'
GROUP BY DATE_TRUNC('month', vsh.completed_at)
ORDER BY month DESC;
```

**Output**: Monthly trend of completion time, plan quality, and recursion rate

---

### Query 4: Resource Estimation Accuracy

**Purpose**: Compare planned vs actual resource usage (post-launch ventures only)

```sql
SELECT
  v.category,
  AVG(vp.planned_budget_usd) AS avg_planned_budget,
  AVG(va.actual_budget_usd) AS avg_actual_budget,
  AVG((va.actual_budget_usd - vp.planned_budget_usd)::FLOAT / vp.planned_budget_usd * 100) AS avg_budget_variance_pct,
  AVG(vp.planned_timeline_months) AS avg_planned_timeline,
  AVG(va.actual_timeline_months) AS avg_actual_timeline,
  AVG((va.actual_timeline_months - vp.planned_timeline_months)::FLOAT / vp.planned_timeline_months * 100) AS avg_timeline_variance_pct
FROM ventures v
JOIN venture_plans vp ON v.id = vp.venture_id
JOIN venture_actuals va ON v.id = va.venture_id
WHERE v.current_stage >= 30  -- Launched ventures
GROUP BY v.category
ORDER BY avg_budget_variance_pct DESC;
```

**Output**: By category, how accurate are our resource estimates? (identifies categories that need adjustment)

---

## Alerting Rules

### Alert 1: Stage Duration Exceeded

**Trigger**: Venture in Stage 7 for > 15 days (manual) or > 5 days (AI-assisted)
**Severity**: Warning
**Recipient**: Chairman, PLAN agent
**Action**: Review venture, identify blockers, escalate if needed

---

### Alert 2: Low Plan Completeness

**Trigger**: Plan completeness < 70% and venture in Stage 7 for > 5 days
**Severity**: Critical
**Recipient**: Chairman, PLAN agent
**Action**: Identify missing sections, request completion

---

### Alert 3: High Recursion Rate

**Trigger**: Inbound recursion rate > 40% (rolling 30-day average)
**Severity**: Warning
**Recipient**: Chairman, System Admin
**Action**: Review planning process, adjust benchmarks or thresholds

---

### Alert 4: Recursion Loop Approaching Max

**Trigger**: Venture has 2 recursions of same type (approaching max of 3)
**Severity**: Critical
**Recipient**: Chairman
**Action**: Review venture viability, consider Kill/Revise decision

---

## Sources Table

| Source | Repo | Commit | Path | Lines |
|--------|------|--------|------|-------|
| Metrics definition | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 287-290 |
| Threshold gap | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-07.md | 35-38 |
| Process delay risk | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-07.md | 61-64 |
| Recursion triggers | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-08.md | 62-63 |
| Tech complexity | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-10.md | 39, 121 |
| Data flow gap | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-07.md | 40-44 |

---

<!-- Generated by Claude Code Phase 3 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
