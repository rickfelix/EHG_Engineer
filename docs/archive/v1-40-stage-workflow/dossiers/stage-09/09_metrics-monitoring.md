---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# Stage 9: Metrics & Monitoring


## Table of Contents

- [Key Performance Indicators (KPIs)](#key-performance-indicators-kpis)
  - [Primary Metrics (from stages.yaml)](#primary-metrics-from-stagesyaml)
- [Secondary Metrics (Operational)](#secondary-metrics-operational)
- [SQL Queries](#sql-queries)
  - [Query 1: Gap Coverage Calculation](#query-1-gap-coverage-calculation)
  - [Query 2: Opportunity Size (SOM) Aggregation](#query-2-opportunity-size-som-aggregation)
  - [Query 3: Capability Score Calculation](#query-3-capability-score-calculation)
  - [Query 4: Gap Severity Distribution](#query-4-gap-severity-distribution)
  - [Query 5: Venture-Wide Stage 9 Performance](#query-5-venture-wide-stage-9-performance)
  - [Query 6: Gap Closure Cost Tracking](#query-6-gap-closure-cost-tracking)
- [Dashboard Design](#dashboard-design)
  - [Stage 9 Overview Dashboard](#stage-9-overview-dashboard)
  - [Venture-Wide Trends Dashboard](#venture-wide-trends-dashboard)
- [Alerting Rules](#alerting-rules)
  - [Critical Alerts (Immediate Action Required)](#critical-alerts-immediate-action-required)
  - [Warning Alerts (Review Recommended)](#warning-alerts-review-recommended)
  - [Info Alerts (FYI)](#info-alerts-fyi)
- [Alerting Implementation](#alerting-implementation)
  - [SQL Function: Check Alert Conditions](#sql-function-check-alert-conditions)
- [Monitoring Automation](#monitoring-automation)
  - [Trigger: Auto-Alert on Stage 9 Completion](#trigger-auto-alert-on-stage-9-completion)
- [Report Generation](#report-generation)
  - [Weekly Stage 9 Performance Report](#weekly-stage-9-performance-report)
- [Sources Table](#sources-table)

**Purpose**: Define KPIs, SQL queries, dashboard designs, and alerting rules for Stage 9.

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:379-382 "metrics: Gap coverage, Opportunity size, Capability score"

---

## Key Performance Indicators (KPIs)

### Primary Metrics (from stages.yaml)

#### 1. Gap Coverage

**Definition**: Percentage of identified capability gaps addressed in the capability roadmap.

**Formula**: `(Gaps in Roadmap / Total Gaps) × 100%`

**Target**: ≥80% (proposed)
**Blocker**: <60% (proposed)

**Measurement Frequency**: Once per Stage 9 completion

**Business Value**: Measures comprehensiveness of gap closure planning. High coverage = lower execution risk.

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:379 "metrics: Gap coverage"

#### 2. Opportunity Size

**Definition**: Total Serviceable Obtainable Market (SOM) for all prioritized market opportunities.

**Formula**: `SUM(opportunity.som) for opportunities in matrix`

**Target**: ≥$2M SOM (proposed)
**Blocker**: <$1M SOM (proposed)

**Measurement Frequency**: Once per Stage 9 completion

**Business Value**: Validates market is large enough to justify venture investment.

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:380 "metrics: Opportunity size"

#### 3. Capability Score

**Definition**: Average maturity rating across all required capabilities (1-5 scale).

**Formula**: `AVG(capability.current_maturity) for all required capabilities`

**Target**: ≥3.0/5.0 (proposed)
**Blocker**: <2.5/5.0 (proposed)

**Measurement Frequency**: Once per Stage 9 completion, updated after gap closure

**Business Value**: Composite organizational readiness score. Higher score = lower execution risk.

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:381 "metrics: Capability score"

---

## Secondary Metrics (Operational)

| Metric | Definition | Target | Purpose |
|--------|------------|--------|---------|
| **P0 Gap Count** | Number of CRITICAL priority gaps | ≤3 | Too many P0 gaps = venture may be infeasible |
| **Gap Closure Timeline** | Max weeks to close all P0/P1 gaps | ≤12 weeks | Longer timeline delays venture execution |
| **Gap Closure Cost** | Total cost to close P0/P1 gaps | ≤25% of Stage 7 budget | Higher cost triggers recursion to Stage 7 |
| **ROI Median** | Median ROI across all opportunities | ≥200% | Validates opportunities are profitable |
| **Market Size (TAM)** | Total Addressable Market | ≥$50M | Ensures market is large enough for growth |
| **Capability Gap Severity** | Distribution (CRITICAL/HIGH/MEDIUM/LOW) | ≤20% CRITICAL | Too many critical gaps = high risk |
| **Time in Stage 9** | Days from entry to exit | ≤7 days | Tracks efficiency of gap analysis process |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-09.md:35-38 "Missing: Threshold values, measurement frequency"

---

## SQL Queries

### Query 1: Gap Coverage Calculation

```sql
-- Calculate gap coverage percentage for a venture
WITH gaps AS (
    SELECT
        venture_id,
        jsonb_array_length(capability_gaps) AS total_gaps
    FROM stage_09_gap_analysis
    WHERE venture_id = $1
),
gaps_in_roadmap AS (
    SELECT
        venture_id,
        COUNT(*) AS addressed_gaps
    FROM stage_09_gap_analysis,
         jsonb_array_elements(capability_roadmap) AS milestone
    WHERE venture_id = $1
      AND milestone->>'gaps_addressed' IS NOT NULL
)
SELECT
    g.venture_id,
    g.total_gaps,
    COALESCE(gir.addressed_gaps, 0) AS gaps_in_roadmap,
    ROUND((COALESCE(gir.addressed_gaps, 0)::DECIMAL / NULLIF(g.total_gaps, 0)) * 100, 2) AS gap_coverage_pct
FROM gaps g
LEFT JOIN gaps_in_roadmap gir ON g.venture_id = gir.venture_id;
```

**Output**: `{venture_id, total_gaps, gaps_in_roadmap, gap_coverage_pct}`

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:379 "metrics: Gap coverage"

### Query 2: Opportunity Size (SOM) Aggregation

```sql
-- Calculate total SOM for all opportunities in a venture
SELECT
    venture_id,
    SUM((opp->>'som')::BIGINT) AS total_som_usd,
    COUNT(*) AS opportunity_count,
    AVG((opp->>'som')::BIGINT) AS avg_opportunity_size_usd
FROM stage_09_gap_analysis,
     jsonb_array_elements(opportunity_matrix) AS opp
WHERE venture_id = $1
GROUP BY venture_id;
```

**Output**: `{venture_id, total_som_usd, opportunity_count, avg_opportunity_size_usd}`

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:380 "metrics: Opportunity size"

### Query 3: Capability Score Calculation

```sql
-- Calculate average capability maturity score
SELECT
    venture_id,
    AVG((cap->>'maturity')::DECIMAL) AS capability_score,
    COUNT(*) AS total_capabilities,
    COUNT(CASE WHEN (cap->>'maturity')::DECIMAL < 3.0 THEN 1 END) AS low_maturity_count
FROM stage_09_gap_analysis,
     jsonb_array_elements(current_capabilities) AS cap
WHERE venture_id = $1
GROUP BY venture_id;
```

**Output**: `{venture_id, capability_score, total_capabilities, low_maturity_count}`

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:381 "metrics: Capability score"

### Query 4: Gap Severity Distribution

```sql
-- Analyze gap severity distribution
SELECT
    venture_id,
    COUNT(CASE WHEN gap->>'severity' = 'CRITICAL' THEN 1 END) AS critical_gaps,
    COUNT(CASE WHEN gap->>'severity' = 'HIGH' THEN 1 END) AS high_gaps,
    COUNT(CASE WHEN gap->>'severity' = 'MEDIUM' THEN 1 END) AS medium_gaps,
    COUNT(CASE WHEN gap->>'severity' = 'LOW' THEN 1 END) AS low_gaps,
    jsonb_array_length(capability_gaps) AS total_gaps
FROM stage_09_gap_analysis,
     jsonb_array_elements(capability_gaps) AS gap
WHERE venture_id = $1
GROUP BY venture_id, capability_gaps;
```

**Output**: `{venture_id, critical_gaps, high_gaps, medium_gaps, low_gaps, total_gaps}`

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:365-409 "Gap identification with severity"

### Query 5: Venture-Wide Stage 9 Performance

```sql
-- Aggregate Stage 9 metrics across all ventures
SELECT
    COUNT(*) AS total_ventures_stage_9,
    AVG(gap_coverage_pct) AS avg_gap_coverage_pct,
    AVG(opportunity_size_usd) AS avg_opportunity_size_usd,
    AVG(capability_score) AS avg_capability_score,
    COUNT(CASE WHEN gap_coverage_pct >= 80 THEN 1 END) AS ventures_above_target,
    COUNT(CASE WHEN opportunity_size_usd >= 2000000 THEN 1 END) AS ventures_large_market
FROM stage_09_gap_analysis
WHERE created_at >= NOW() - INTERVAL '90 days';
```

**Output**: Aggregate performance metrics for last 90 days

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-09.md:35-38 "Establish concrete KPIs with targets"

### Query 6: Gap Closure Cost Tracking

```sql
-- Calculate total cost to close P0/P1 gaps
SELECT
    venture_id,
    SUM(CASE WHEN gap->>'priority' IN ('P0', 'P1') THEN (gap->>'cost_usd')::INTEGER ELSE 0 END) AS p0_p1_closure_cost,
    SUM((gap->>'cost_usd')::INTEGER) AS total_closure_cost,
    MAX((gap->>'eta_weeks')::INTEGER) AS max_closure_timeline_weeks
FROM stage_09_gap_analysis,
     jsonb_array_elements(capability_gaps) AS gap
WHERE venture_id = $1
GROUP BY venture_id;
```

**Output**: `{venture_id, p0_p1_closure_cost, total_closure_cost, max_closure_timeline_weeks}`

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:375-378 "outputs: Capability roadmap"

---

## Dashboard Design

### Stage 9 Overview Dashboard

**Target Audience**: Chairman, Product Leads

**Panels**:

1. **Gap Coverage Gauge**
   - Visualization: Radial gauge (0-100%)
   - Thresholds: Red (<60%), Yellow (60-80%), Green (≥80%)
   - Data: Query 1 result

2. **Opportunity Size (SOM) Card**
   - Visualization: Large number card
   - Format: `$X.XM SOM`
   - Threshold indicator: Red (<$1M), Yellow ($1-2M), Green (≥$2M)
   - Data: Query 2 result

3. **Capability Score Gauge**
   - Visualization: Radial gauge (0-5.0 scale)
   - Thresholds: Red (<2.5), Yellow (2.5-3.0), Green (≥3.0)
   - Data: Query 3 result

4. **Gap Severity Breakdown**
   - Visualization: Stacked bar chart
   - Segments: CRITICAL (red), HIGH (orange), MEDIUM (yellow), LOW (green)
   - Data: Query 4 result

5. **Opportunity Matrix Table**
   - Visualization: Sortable table
   - Columns: Opportunity, TAM, SAM, SOM, ROI, Enabled By (capabilities)
   - Data: `opportunity_matrix` JSONB field

6. **Capability Roadmap Timeline**
   - Visualization: Gantt chart
   - Milestones: Gap closure activities with dates
   - Data: `capability_roadmap` JSONB field

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:375-382 "Outputs and metrics"

### Venture-Wide Trends Dashboard

**Target Audience**: Operations, Leadership

**Panels**:

1. **Stage 9 Completion Rate**
   - Visualization: Line chart (ventures per week completing Stage 9)
   - Filter: Last 90 days
   - Data: Query 5 + time series

2. **Average Gap Coverage Over Time**
   - Visualization: Line chart
   - Tracks: Improving gap coverage as process matures
   - Data: Query 5 (AVG gap_coverage_pct) over time

3. **Ventures by Risk Profile**
   - Visualization: Pie chart
   - Segments: Critical gaps ≥5, High gaps ≥10, Medium risk, Low risk
   - Data: Query 4 aggregated

4. **Top Capability Gaps Across Ventures**
   - Visualization: Bar chart
   - Lists: Most common capability gaps (aggregated across ventures)
   - Data: Custom query on `capability_gaps` JSONB

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-09.md:35-38 "Measurement frequency, establish concrete KPIs"

---

## Alerting Rules

### Critical Alerts (Immediate Action Required)

| Alert | Condition | Trigger | Recipient | Action |
|-------|-----------|---------|-----------|--------|
| **CRITICAL Gap Identified** | `gap.severity = 'CRITICAL'` | Stage 9.2 completion | Chairman, Product Lead | Review gap, decide on closure approach or scope reduction |
| **Opportunity Size Below Threshold** | `total_som_usd < $1M` | Stage 9.3 completion | Chairman | Consider killing venture or recursion to Stage 5 |
| **Gap Closure Cost Overrun** | `p0_p1_closure_cost > stage_7_budget * 1.25` | Stage 9.3 completion | Chairman | Approve budget increase or reduce scope |
| **Exit Gate Failure** | Any exit gate fails | Stage 9 exit validation | Chairman, Product Lead | Block Stage 10 entry, resolve blockers |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:387-391 "exit gates: Gaps identified, Opportunities prioritized"

### Warning Alerts (Review Recommended)

| Alert | Condition | Trigger | Recipient | Action |
|-------|-----------|---------|-----------|--------|
| **Low Gap Coverage** | `gap_coverage_pct < 80%` | Stage 9.3 completion | Product Lead | Review unaddressed gaps, update roadmap |
| **High Gap Closure Timeline** | `max_closure_timeline_weeks > 12` | Stage 9.3 completion | Product Lead | Consider timeline adjustment or scope reduction |
| **Low Capability Score** | `capability_score < 3.0` | Stage 9.1 completion | Product Lead | Consider hiring, training, or tooling investments |
| **Low ROI Opportunities** | `median_roi < 200%` | Stage 9.3 completion | Product Lead | Re-evaluate opportunity prioritization |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-09.md:35-38 "Missing threshold values"

### Info Alerts (FYI)

| Alert | Condition | Trigger | Recipient | Action |
|-------|-----------|---------|-----------|--------|
| **Stage 9 Complete** | Stage 9 exits successfully | Stage 9 exit | Product Lead | No action, informational |
| **Large Market Opportunity** | `total_som_usd > $10M` | Stage 9.3 completion | Chairman | Celebrate, consider accelerated timeline |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:387-391 "exit gates"

---

## Alerting Implementation

### SQL Function: Check Alert Conditions

```sql
-- Function to check Stage 9 alert conditions
CREATE OR REPLACE FUNCTION check_stage_9_alerts(p_venture_id UUID)
RETURNS TABLE(alert_type TEXT, alert_severity TEXT, alert_message TEXT) AS $$
BEGIN
    -- Critical: CRITICAL gaps identified
    RETURN QUERY
    SELECT
        'CRITICAL_GAP_IDENTIFIED'::TEXT,
        'CRITICAL'::TEXT,
        'CRITICAL gap identified: ' || gap->>'capability' AS alert_message
    FROM stage_09_gap_analysis,
         jsonb_array_elements(capability_gaps) AS gap
    WHERE venture_id = p_venture_id
      AND gap->>'severity' = 'CRITICAL';

    -- Critical: Opportunity size below threshold
    RETURN QUERY
    SELECT
        'OPPORTUNITY_SIZE_BELOW_THRESHOLD'::TEXT,
        'CRITICAL'::TEXT,
        'Total SOM ($' || opportunity_size_usd || ') is below $1M threshold'
    FROM stage_09_gap_analysis
    WHERE venture_id = p_venture_id
      AND opportunity_size_usd < 1000000;

    -- Warning: Low gap coverage
    RETURN QUERY
    SELECT
        'LOW_GAP_COVERAGE'::TEXT,
        'WARNING'::TEXT,
        'Gap coverage (' || gap_coverage_pct || '%) is below 80% target'
    FROM stage_09_gap_analysis
    WHERE venture_id = p_venture_id
      AND gap_coverage_pct < 80;

    -- Warning: Low capability score
    RETURN QUERY
    SELECT
        'LOW_CAPABILITY_SCORE'::TEXT,
        'WARNING'::TEXT,
        'Capability score (' || capability_score || ') is below 3.0 target'
    FROM stage_09_gap_analysis
    WHERE venture_id = p_venture_id
      AND capability_score < 3.0;

    -- Info: Large market opportunity
    RETURN QUERY
    SELECT
        'LARGE_MARKET_OPPORTUNITY'::TEXT,
        'INFO'::TEXT,
        'Large market opportunity identified ($' || opportunity_size_usd || ' SOM)'
    FROM stage_09_gap_analysis
    WHERE venture_id = p_venture_id
      AND opportunity_size_usd > 10000000;
END;
$$ LANGUAGE plpgsql;
```

**Usage**: `SELECT * FROM check_stage_9_alerts('venture-uuid-here');`

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-09.md:26 "No explicit error handling"

---

## Monitoring Automation

### Trigger: Auto-Alert on Stage 9 Completion

```sql
-- Trigger to check alerts after Stage 9 completion
CREATE OR REPLACE FUNCTION trigger_stage_9_alerts()
RETURNS TRIGGER AS $$
DECLARE
    alert RECORD;
BEGIN
    -- Check all alert conditions
    FOR alert IN SELECT * FROM check_stage_9_alerts(NEW.venture_id) LOOP
        -- Insert into alerts table
        INSERT INTO venture_alerts (venture_id, stage, alert_type, severity, message, created_at)
        VALUES (NEW.venture_id, 9, alert.alert_type, alert.alert_severity, alert.alert_message, NOW());

        -- Send notification (implement via pg_notify or external webhook)
        PERFORM pg_notify('stage_9_alert', json_build_object(
            'venture_id', NEW.venture_id,
            'alert_type', alert.alert_type,
            'severity', alert.alert_severity,
            'message', alert.alert_message
        )::text);
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER stage_09_alert_trigger
AFTER INSERT OR UPDATE ON stage_09_gap_analysis
FOR EACH ROW
EXECUTE FUNCTION trigger_stage_9_alerts();
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-09.md:30-33 "Build automation workflows"

---

## Report Generation

### Weekly Stage 9 Performance Report

**Generated**: Every Monday at 9:00 AM
**Recipients**: Chairman, Operations Lead
**Format**: PDF or Email

**Sections**:
1. **Summary Statistics** (from Query 5)
   - Ventures completed Stage 9 last week
   - Average gap coverage, opportunity size, capability score

2. **Top Opportunities** (from Query 2)
   - Ventures with largest SOM identified

3. **High-Risk Ventures** (from Query 4)
   - Ventures with ≥5 CRITICAL gaps

4. **Trend Analysis**
   - Gap coverage trend over last 4 weeks
   - Capability score trend over last 4 weeks

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-09.md:35-38 "Measurement frequency"

---

## Sources Table

| Source | Repo | Commit | Path | Lines | Purpose |
|--------|------|--------|------|-------|---------|
| stages.yaml | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 379-382 | Metrics definition |
| critique | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-09.md | 35-38 | Missing thresholds, measurement frequency |

---

<!-- Generated by Claude Code Phase 5 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
