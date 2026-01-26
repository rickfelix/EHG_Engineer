<!-- ARCHIVED: 2026-01-26T16:26:51.890Z
     Reason: Duplicate of canonical file
     Original location: docs\workflow\dossiers\stage-13\09_metrics-monitoring.md
     See: docs/fixes/duplicate-consolidation-manifest.json for details
-->

# Metrics & Monitoring: Stage 13 Exit-Oriented Design


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: unit, sd, workflow, automation

## Overview
Comprehensive monitoring framework for tracking Stage 13 execution health, exit strategy quality, and value optimization progress.

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:564-567 "metrics: Exit readiness score, Valuation potential"

## Primary Stage Metrics (from stages.yaml)

### Metric 1: Exit Readiness Score
**Definition**: Composite score measuring venture preparedness for exit execution
**Unit**: Percentage (0-100)
**Target**: ≥80% (proposed threshold)
**Measurement Frequency**: Quarterly (proposed)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:564-565 "metrics: Exit readiness score"
**Gap Noted**: Threshold and frequency undefined in stages.yaml (critique:38-39)

**Calculation Formula**:
```sql
-- Exit Readiness Score Calculation
SELECT
    venture_id,
    (
        -- Component 1: Value Driver Achievement (40% weight)
        (COUNT(CASE WHEN current_value >= target_value THEN 1 END)::NUMERIC / COUNT(*)::NUMERIC) * 40 +

        -- Component 2: IP Protection Completeness (30% weight)
        (ip_assets_protected::NUMERIC / ip_assets_total::NUMERIC) * 30 +

        -- Component 3: Buyer Relationship Depth (30% weight)
        (AVG(relationship_quality_score) / 5.0) * 30
    ) AS exit_readiness_score
FROM (
    SELECT
        s13.venture_id,
        s13.id AS stage_13_execution_id,
        -- Value driver metrics
        (SELECT COUNT(*) FROM value_drivers vd WHERE vd.stage_13_execution_id = s13.id AND vd.current_value >= vd.target_value) AS metrics_achieved,
        (SELECT COUNT(*) FROM value_drivers vd WHERE vd.stage_13_execution_id = s13.id) AS metrics_total,
        -- IP protection (from ip_strategy JSONB)
        (s13.value_drivers->'ip_strategy'->>'assets_protected')::INTEGER AS ip_assets_protected,
        (s13.value_drivers->'ip_strategy'->>'assets_total')::INTEGER AS ip_assets_total,
        -- Buyer relationships
        (SELECT AVG(relationship_quality_score) FROM buyer_landscape bl WHERE bl.stage_13_execution_id = s13.id AND bl.on_shortlist = true) AS avg_relationship_score
    FROM stage_13_executions s13
    WHERE s13.status = 'in_progress'
) subquery
GROUP BY venture_id;
```

**Dashboard Visualization**: Gauge chart (0-100 scale) with color coding:
- Red (0-60): Not ready for exit
- Yellow (60-80): Approaching readiness
- Green (80-100): Exit ready

**Alerting Rules**:
- **Critical Alert**: Exit readiness score <60 after Substage 13.2 completion → Trigger EXIT-001 recursion consideration
- **Warning Alert**: Exit readiness score stagnant (no improvement for 2 consecutive quarters)

### Metric 2: Valuation Potential
**Definition**: Estimated enterprise value range based on industry multiples and venture metrics
**Unit**: USD (min/max range)
**Target**: ≥$XM (venture-specific, Chairman-defined)
**Measurement Frequency**: Semi-annual (proposed)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:565-566 "metrics: Valuation potential"
**Gap Noted**: Threshold undefined in stages.yaml (critique:38-39)

**Calculation Formula**:
```sql
-- Valuation Potential Calculation
WITH valuation_components AS (
    SELECT
        vd.stage_13_execution_id,
        vd.metric_name,
        vd.current_value,
        vd.target_value,
        vd.valuation_impact,
        -- Industry multiples (would come from external data source)
        CASE
            WHEN vd.metric_name = 'ARR' THEN current_value * 5.0  -- 5x ARR multiple (SaaS example)
            WHEN vd.metric_name = 'EBITDA' THEN current_value * 10.0  -- 10x EBITDA multiple
            WHEN vd.metric_name = 'Revenue' THEN current_value * 2.5  -- 2.5x revenue multiple
            ELSE vd.valuation_impact  -- Use pre-calculated impact if not standard metric
        END AS metric_valuation_contribution
    FROM value_drivers vd
)
SELECT
    s13.venture_id,
    SUM(vc.metric_valuation_contribution * 0.8) AS valuation_potential_min,  -- 80% of sum (conservative)
    SUM(vc.metric_valuation_contribution * 1.2) AS valuation_potential_max,  -- 120% of sum (optimistic)
    AVG(vc.metric_valuation_contribution) AS valuation_potential_midpoint
FROM stage_13_executions s13
JOIN valuation_components vc ON vc.stage_13_execution_id = s13.id
WHERE s13.status IN ('in_progress', 'completed')
GROUP BY s13.venture_id, s13.id;
```

**Dashboard Visualization**: Range chart showing min/max valuation potential with threshold line

**Alerting Rules**:
- **Critical Alert**: valuation_potential_max < Chairman threshold → Trigger EXIT-001 recursion to Stage 5
- **Warning Alert**: valuation_potential trending downward over 2+ measurements

### Metric 3: Strategic Fit
**Definition**: Average strategic fit score across shortlist acquirers
**Unit**: Score (0-5.0 scale)
**Target**: ≥3.5 (proposed threshold)
**Measurement Frequency**: Annual or as market conditions change (proposed)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:566-567 "metrics: Strategic fit"
**Gap Noted**: Threshold undefined in stages.yaml (critique:38-39)

**Calculation Formula**:
```sql
-- Strategic Fit Average Calculation
SELECT
    s13.venture_id,
    s13.id AS stage_13_execution_id,
    AVG(bl.strategic_fit_total) AS strategic_fit_avg,
    COUNT(*) FILTER (WHERE bl.on_shortlist = true) AS shortlist_count,
    MAX(bl.strategic_fit_total) AS best_fit_score,
    MIN(bl.strategic_fit_total) AS worst_fit_score
FROM stage_13_executions s13
JOIN buyer_landscape bl ON bl.stage_13_execution_id = s13.id
WHERE bl.on_shortlist = true  -- Only count shortlist acquirers
GROUP BY s13.venture_id, s13.id;
```

**Dashboard Visualization**: Bar chart showing strategic fit scores for each shortlist acquirer with average line

**Alerting Rules**:
- **Critical Alert**: strategic_fit_avg <2.5 → Trigger EXIT-003 recursion to Stage 6-7
- **Warning Alert**: No acquirers scored ≥4.0 (lack of excellent-fit options)

## Secondary Execution Metrics

### Execution Metric 1: Stage 13 Duration
**Definition**: Total time from Stage 13 start to exit gate approval
**Unit**: Weeks
**Target**: 16 weeks (4 months) for standard execution
**Measurement**: Calculated from stage_13_executions table

**Query**:
```sql
SELECT
    venture_id,
    id AS stage_13_execution_id,
    started_at,
    completed_at,
    EXTRACT(EPOCH FROM (completed_at - started_at)) / 604800 AS duration_weeks  -- 604800 seconds = 1 week
FROM stage_13_executions
WHERE status = 'completed';
```

**Dashboard Visualization**: Histogram showing distribution of Stage 13 durations across ventures

**Alerting Rules**:
- **Warning Alert**: Duration >24 weeks (1.5x target) → Chairman process bottleneck analysis

### Execution Metric 2: Substage Completion Rate
**Definition**: Percentage of substages (13.1, 13.2, 13.3) completed on time
**Unit**: Percentage (0-100)
**Target**: ≥85%
**Measurement**: Track substage start/end dates

**Query**:
```sql
WITH substage_tracking AS (
    SELECT
        stage_13_execution_id,
        substage_id,
        started_at,
        completed_at,
        target_duration_weeks,
        EXTRACT(EPOCH FROM (completed_at - started_at)) / 604800 AS actual_duration_weeks
    FROM stage_13_substage_executions  -- Proposed tracking table
)
SELECT
    stage_13_execution_id,
    COUNT(*) AS total_substages,
    COUNT(*) FILTER (WHERE actual_duration_weeks <= target_duration_weeks) AS on_time_substages,
    (COUNT(*) FILTER (WHERE actual_duration_weeks <= target_duration_weeks)::NUMERIC / COUNT(*)::NUMERIC * 100) AS on_time_rate
FROM substage_tracking
GROUP BY stage_13_execution_id;
```

**Alerting Rules**:
- **Warning Alert**: On-time rate <70% → Process inefficiency, resource constraints

### Execution Metric 3: Chairman Time Investment
**Definition**: Total hours Chairman spent on Stage 13 activities
**Unit**: Hours
**Target**: ≤10 hours (with 80% automation target)
**Measurement**: Track time spent on approval steps

**Query**:
```sql
SELECT
    s13.venture_id,
    s13.id AS stage_13_execution_id,
    SUM(aa.time_spent_minutes) / 60.0 AS chairman_hours_total
FROM stage_13_executions s13
JOIN approval_activities aa ON aa.stage_13_execution_id = s13.id AND aa.approver_role = 'Chairman'
GROUP BY s13.venture_id, s13.id;
```

**Dashboard Visualization**: Bar chart showing Chairman hours by substage

**Alerting Rules**:
- **Warning Alert**: Chairman hours >15 → Automation target not achieved, delegation opportunities

### Execution Metric 4: Automation Achievement Rate
**Definition**: Percentage of Stage 13 tasks automated vs. manual
**Unit**: Percentage (0-100)
**Target**: 80% (per critique recommendation)
**Measurement**: Track automated vs. manual task execution

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-13.md:32-34 "Target State: 80% automation"

**Query**:
```sql
SELECT
    stage_13_execution_id,
    COUNT(*) FILTER (WHERE execution_mode = 'automated') AS automated_tasks,
    COUNT(*) FILTER (WHERE execution_mode = 'manual') AS manual_tasks,
    (COUNT(*) FILTER (WHERE execution_mode = 'automated')::NUMERIC / COUNT(*)::NUMERIC * 100) AS automation_rate
FROM stage_13_task_executions  -- Proposed tracking table
GROUP BY stage_13_execution_id;
```

**Alerting Rules**:
- **Critical Alert**: Automation rate <50% → Automation tooling not deployed, process inefficiency

## Buyer Landscape Metrics

### Buyer Metric 1: Longlist to Shortlist Conversion
**Definition**: Percentage of longlist acquirers qualifying for shortlist
**Unit**: Percentage (0-100)
**Target**: 25-35% (e.g., 25 longlist → 8 shortlist = 32%)
**Measurement**: Calculated from buyer_landscape table

**Query**:
```sql
SELECT
    stage_13_execution_id,
    COUNT(*) AS longlist_total,
    COUNT(*) FILTER (WHERE on_shortlist = true) AS shortlist_total,
    (COUNT(*) FILTER (WHERE on_shortlist = true)::NUMERIC / COUNT(*)::NUMERIC * 100) AS conversion_rate
FROM buyer_landscape
GROUP BY stage_13_execution_id;
```

**Alerting Rules**:
- **Warning Alert**: Conversion rate <20% → Strategic fit criteria too strict, consider EXIT-003 recursion
- **Warning Alert**: Conversion rate >50% → Criteria too loose, shortlist not selective enough

### Buyer Metric 2: Shortlist Strategic Fit Quality
**Definition**: Average strategic fit score of shortlist acquirers
**Unit**: Score (0-5.0 scale)
**Target**: ≥3.8 (higher than overall strategic_fit_avg threshold of 3.5)
**Measurement**: Calculated from buyer_landscape table

**Query**:
```sql
SELECT
    stage_13_execution_id,
    AVG(strategic_fit_total) AS shortlist_fit_avg,
    STDDEV(strategic_fit_total) AS shortlist_fit_stddev,
    MIN(strategic_fit_total) AS shortlist_fit_min,
    MAX(strategic_fit_total) AS shortlist_fit_max
FROM buyer_landscape
WHERE on_shortlist = true
GROUP BY stage_13_execution_id;
```

**Alerting Rules**:
- **Critical Alert**: shortlist_fit_avg <3.5 → Shortlist quality insufficient, revisit Substage 13.3

### Buyer Metric 3: Relationship Coverage
**Definition**: Percentage of shortlist acquirers with existing 1st/2nd degree relationships
**Unit**: Percentage (0-100)
**Target**: ≥60% (majority of shortlist has warm intro path)
**Measurement**: Calculated from buyer_landscape.existing_relationships JSONB

**Query**:
```sql
SELECT
    stage_13_execution_id,
    COUNT(*) AS shortlist_total,
    COUNT(*) FILTER (
        WHERE (existing_relationships->'connections')::jsonb IS NOT NULL
        AND jsonb_array_length(existing_relationships->'connections') > 0
    ) AS acquirers_with_relationships,
    (COUNT(*) FILTER (
        WHERE (existing_relationships->'connections')::jsonb IS NOT NULL
        AND jsonb_array_length(existing_relationships->'connections') > 0
    )::NUMERIC / COUNT(*)::NUMERIC * 100) AS relationship_coverage_rate
FROM buyer_landscape
WHERE on_shortlist = true
GROUP BY stage_13_execution_id;
```

**Alerting Rules**:
- **Warning Alert**: Coverage <40% → Relationship cultivation plan critical (Substage 13.3 Step 3.3)

## Value Driver Metrics

### Value Driver Metric 1: Metric Achievement Rate
**Definition**: Percentage of value driver metrics achieving target values
**Unit**: Percentage (0-100)
**Target**: ≥70% (most metrics on track)
**Measurement**: Calculated from value_drivers table

**Query**:
```sql
SELECT
    stage_13_execution_id,
    COUNT(*) AS total_metrics,
    COUNT(*) FILTER (WHERE current_value >= target_value) AS achieved_metrics,
    (COUNT(*) FILTER (WHERE current_value >= target_value)::NUMERIC / COUNT(*)::NUMERIC * 100) AS achievement_rate
FROM value_drivers
GROUP BY stage_13_execution_id;
```

**Alerting Rules**:
- **Critical Alert**: Achievement rate <50% → Consider EXIT-001 recursion to Stage 5

### Value Driver Metric 2: Valuation Impact Potential
**Definition**: Total estimated valuation uplift from achieving all target metrics
**Unit**: USD
**Target**: ≥20% of current valuation potential_min
**Measurement**: Sum of valuation_impact for all metrics not yet achieved

**Query**:
```sql
SELECT
    vd.stage_13_execution_id,
    SUM(vd.valuation_impact) AS total_potential_uplift,
    SUM(vd.valuation_impact) FILTER (WHERE vd.current_value < vd.target_value) AS remaining_uplift,
    (SUM(vd.valuation_impact) FILTER (WHERE vd.current_value < vd.target_value) / s13.valuation_potential_min * 100) AS uplift_percentage
FROM value_drivers vd
JOIN stage_13_executions s13 ON s13.id = vd.stage_13_execution_id
GROUP BY vd.stage_13_execution_id, s13.valuation_potential_min;
```

**Alerting Rules**:
- **Warning Alert**: Remaining uplift <10% of current valuation → Limited optimization runway

### Value Driver Metric 3: Growth Lever ROI
**Definition**: Valuation impact per dollar invested in growth lever optimization
**Unit**: Ratio (valuation $ / investment $)
**Target**: ≥3.0x (e.g., $1M investment → $3M+ valuation increase)
**Measurement**: Compare valuation_impact to optimization cost estimates

**Query**:
```sql
SELECT
    stage_13_execution_id,
    metric_name,
    valuation_impact,
    (value_drivers->'optimization'->>'cost_estimate')::NUMERIC AS optimization_cost,
    valuation_impact / NULLIF((value_drivers->'optimization'->>'cost_estimate')::NUMERIC, 0) AS roi_ratio
FROM value_drivers
WHERE current_value < target_value  -- Only unachieved metrics
ORDER BY roi_ratio DESC;
```

**Alerting Rules**:
- **Warning Alert**: Top 3 growth levers all have ROI <2.0x → Optimization may not be cost-effective

## Recursion Metrics

### Recursion Metric 1: Recursion Trigger Rate
**Definition**: Percentage of Stage 13 executions triggering at least one recursion
**Unit**: Percentage (0-100)
**Target**: 10-20% (some ventures need iteration, but not majority)
**Measurement**: Calculated from stage_13_recursions table

**Query**:
```sql
SELECT
    COUNT(DISTINCT s13.id) AS total_stage_13_executions,
    COUNT(DISTINCT r.stage_13_execution_id) AS executions_with_recursion,
    (COUNT(DISTINCT r.stage_13_execution_id)::NUMERIC / COUNT(DISTINCT s13.id)::NUMERIC * 100) AS recursion_rate
FROM stage_13_executions s13
LEFT JOIN stage_13_recursions r ON r.stage_13_execution_id = s13.id
WHERE s13.status IN ('completed', 'rolled_back');
```

**Alerting Rules**:
- **Warning Alert**: Recursion rate >30% → Systemic issues in upstream stages (5, 12, 6-7)

### Recursion Metric 2: Recursion Resolution Rate
**Definition**: Percentage of recursions successfully resolving issue (vs. abandoned)
**Unit**: Percentage (0-100)
**Target**: ≥80% (most recursions should improve exit strategy)
**Measurement**: Calculated from stage_13_recursions table

**Query**:
```sql
SELECT
    trigger_type,
    COUNT(*) AS total_recursions,
    COUNT(*) FILTER (WHERE resolution_status = 'resolved') AS resolved_recursions,
    COUNT(*) FILTER (WHERE resolution_status = 'abandoned') AS abandoned_recursions,
    (COUNT(*) FILTER (WHERE resolution_status = 'resolved')::NUMERIC / COUNT(*)::NUMERIC * 100) AS resolution_rate
FROM stage_13_recursions
GROUP BY trigger_type;
```

**Alerting Rules**:
- **Critical Alert**: Resolution rate <60% for EXIT-001 → Recursion to Stage 5 not effective

### Recursion Metric 3: Recursion Cost
**Definition**: Average time (weeks) spent in recursion loop per trigger type
**Unit**: Weeks
**Target**: EXIT-001: ≤12 weeks, EXIT-002: ≤8 weeks, EXIT-003: ≤6 weeks, EXIT-004: ≤16 weeks
**Measurement**: Calculated from stage_13_recursions table

**Query**:
```sql
SELECT
    trigger_type,
    AVG(cost_weeks) AS avg_recursion_duration_weeks,
    MIN(cost_weeks) AS min_duration,
    MAX(cost_weeks) AS max_duration,
    STDDEV(cost_weeks) AS duration_stddev
FROM stage_13_recursions
WHERE resolution_status IN ('resolved', 'abandoned')
GROUP BY trigger_type;
```

**Alerting Rules**:
- **Warning Alert**: EXIT-001 avg duration >16 weeks → Stage 5 re-execution taking too long

## Dashboard Layout (Proposed)

### Dashboard 1: Exit Strategy Health (Chairman View)
**Refresh Frequency**: Daily
**Sections**:
1. **Top KPIs** (3 large tiles):
   - Exit Readiness Score (gauge chart)
   - Valuation Potential (range chart with threshold)
   - Strategic Fit Average (bar chart)
2. **Execution Progress** (timeline):
   - Substage 13.1 status (completed/in-progress)
   - Substage 13.2 status
   - Substage 13.3 status
   - Exit gate approval status
3. **Alerts** (list):
   - Critical alerts (red) - require immediate action
   - Warning alerts (yellow) - for review

### Dashboard 2: Buyer Landscape Analysis (CFO/BD View)
**Refresh Frequency**: Weekly
**Sections**:
1. **Buyer Funnel**:
   - Longlist count
   - Shortlist count
   - Conversion rate
2. **Strategic Fit Distribution** (histogram):
   - X-axis: Strategic fit score (0-5.0)
   - Y-axis: Number of acquirers
   - Color: Shortlist (green) vs. Longlist only (gray)
3. **Relationship Coverage** (map/network graph):
   - Nodes: Shortlist acquirers
   - Edges: Existing relationships
   - Color: Relationship quality score

### Dashboard 3: Value Driver Tracking (CFO View)
**Refresh Frequency**: Monthly
**Sections**:
1. **Metric Achievement** (progress bars):
   - Each value driver metric with current vs. target
   - Color coding: Achieved (green), On track (yellow), Behind (red)
2. **Valuation Impact** (waterfall chart):
   - Current valuation potential
   - + Uplift from metric 1 (if achieved)
   - + Uplift from metric 2 (if achieved)
   - ...
   - = Total potential valuation
3. **Growth Lever ROI** (scatter plot):
   - X-axis: Optimization cost
   - Y-axis: Valuation impact
   - Size: Priority rank
   - Quadrants: High ROI (top-left), Low ROI (bottom-right)

### Dashboard 4: Execution Efficiency (Operations View)
**Refresh Frequency**: Weekly
**Sections**:
1. **Stage 13 Duration Trends** (line chart):
   - X-axis: Time (months)
   - Y-axis: Average Stage 13 duration (weeks)
   - Trend line + target line (16 weeks)
2. **Automation Achievement** (gauge):
   - Current automation rate vs. 80% target
3. **Chairman Time Investment** (bar chart):
   - Hours spent by substage
   - Comparison to target (≤10 hours total)

## Monitoring Automation

### Automated Monitoring Workflows

#### Workflow 1: Daily Exit Readiness Check
```python
# Pseudocode for daily automated monitoring
def daily_exit_readiness_check():
    for execution in get_active_stage_13_executions():
        readiness_score = calculate_exit_readiness_score(execution.id)

        if readiness_score < 60 and execution.substage == '13.2_completed':
            send_alert(
                severity='critical',
                recipient=execution.chairman_user_id,
                subject='Stage 13: Exit readiness score below threshold',
                message=f'Venture {execution.venture_id} has exit readiness score {readiness_score}%. Consider EXIT-001 recursion to Stage 5.'
            )

        update_dashboard_metric('exit_readiness_score', execution.id, readiness_score)

# Schedule: Run daily at 6am
```

#### Workflow 2: Quarterly Valuation Refresh
```python
def quarterly_valuation_refresh():
    for execution in get_all_stage_13_executions(status=['in_progress', 'monitoring']):
        # Fetch latest industry multiples from external data source
        industry_multiples = fetch_industry_multiples(execution.industry)

        # Recalculate valuation potential
        valuation = calculate_valuation_potential(execution.id, industry_multiples)

        update_stage_13_execution(
            execution.id,
            valuation_potential_min=valuation['min'],
            valuation_potential_max=valuation['max']
        )

        if valuation['max'] < execution.chairman_min_threshold:
            trigger_recursion(execution.id, trigger_type='EXIT-001', reason='Valuation below threshold')

# Schedule: Run on 1st day of each quarter
```

#### Workflow 3: Weekly Buyer Intelligence Update
```python
def weekly_buyer_intelligence_update():
    for execution in get_active_stage_13_executions():
        shortlist = get_buyer_shortlist(execution.id)

        for buyer in shortlist:
            # Fetch latest M&A activity for buyer
            recent_acquisitions = fetch_buyer_ma_activity(buyer.acquirer_name, days=7)

            if recent_acquisitions:
                notify_stakeholders(
                    execution.venture_id,
                    f'Shortlist acquirer {buyer.acquirer_name} made new acquisition: {recent_acquisitions[0].target_company}. Review strategic fit implications.'
                )

# Schedule: Run every Monday at 9am
```

## Metrics Data Retention

**Short-term (90 days)**: Raw metric values, daily calculations
**Medium-term (2 years)**: Aggregated weekly/monthly metrics, dashboard snapshots
**Long-term (10 years)**: Stage 13 execution summaries, exit outcomes, recursion patterns

**Compliance Note**: Exit strategy data may contain material non-public information (MNPI) - ensure proper access controls and audit logging.

<!-- Generated by Claude Code Phase 6 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
