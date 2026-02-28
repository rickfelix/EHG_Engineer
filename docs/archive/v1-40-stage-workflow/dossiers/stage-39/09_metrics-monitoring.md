---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# Stage 39: Multi-Venture Coordination — Metrics & Monitoring


## Table of Contents

- [Purpose](#purpose)
- [Primary KPIs (Canonical)](#primary-kpis-canonical)
  - [1. Portfolio Performance](#1-portfolio-performance)
  - [2. Synergy Value](#2-synergy-value)
  - [3. Resource Efficiency](#3-resource-efficiency)
- [Secondary KPIs (Derived)](#secondary-kpis-derived)
  - [4. Synergy Capture Rate](#4-synergy-capture-rate)
  - [5. Coordination Overhead](#5-coordination-overhead)
  - [6. Conflict Resolution Time](#6-conflict-resolution-time)
  - [7. Initiative Success Rate](#7-initiative-success-rate)
- [Dashboard Architecture](#dashboard-architecture)
  - [Dashboard 1: Portfolio Performance Dashboard](#dashboard-1-portfolio-performance-dashboard)
  - [Dashboard 2: Synergy Value Dashboard](#dashboard-2-synergy-value-dashboard)
  - [Dashboard 3: Resource Efficiency Dashboard](#dashboard-3-resource-efficiency-dashboard)
  - [Dashboard 4: Initiative Tracking Dashboard](#dashboard-4-initiative-tracking-dashboard)
- [Alerting Rules](#alerting-rules)
  - [Alert 1: Portfolio Performance Degradation](#alert-1-portfolio-performance-degradation)
  - [Alert 2: Synergy Initiative Delayed](#alert-2-synergy-initiative-delayed)
  - [Alert 3: Resource Conflict Detected](#alert-3-resource-conflict-detected)
  - [Alert 4: Synergy Capture Rate Below Target](#alert-4-synergy-capture-rate-below-target)
  - [Alert 5: Coordination Overhead Exceeds Threshold](#alert-5-coordination-overhead-exceeds-threshold)
- [Monitoring SLAs](#monitoring-slas)
- [Data Sources](#data-sources)
  - [Source 1: `venture_metrics` table](#source-1-venture_metrics-table)
  - [Source 2: `value_capture_log` table](#source-2-value_capture_log-table)
  - [Source 3: `synergy_opportunities` table](#source-3-synergy_opportunities-table)
  - [Source 4: `resource_conflicts` table](#source-4-resource_conflicts-table)
- [Sources Table](#sources-table)

**Generated**: 2025-11-06
**Version**: 1.0

---

## Purpose

This document defines KPIs, monitoring dashboards, and alerting rules for Stage 39 (Multi-Venture Coordination) to ensure portfolio optimization and synergy capture.

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1762-1764 "metrics: Portfolio performance, Synergy value, Resource efficiency"

---

## Primary KPIs (Canonical)

### 1. Portfolio Performance

**Source**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1762

**Definition**: Aggregate value creation across all ventures in the portfolio, measured as improvement over baseline (pre-coordination).

**Calculation**:
```sql
WITH baseline AS (
  SELECT
    SUM(monthly_revenue) AS baseline_revenue,
    SUM(monthly_burn) AS baseline_burn,
    AVG(user_count) AS baseline_users
  FROM venture_metrics
  WHERE recorded_at = (SELECT MIN(recorded_at) FROM venture_metrics WHERE stage >= 39)
),
current AS (
  SELECT
    SUM(monthly_revenue) AS current_revenue,
    SUM(monthly_burn) AS current_burn,
    AVG(user_count) AS current_users
  FROM venture_metrics
  WHERE recorded_at = CURRENT_DATE
)
SELECT
  ((current.current_revenue - baseline.baseline_revenue) / baseline.baseline_revenue) * 100 AS revenue_improvement_pct,
  ((current.current_users - baseline.baseline_users) / baseline.baseline_users) * 100 AS user_growth_pct,
  (current.current_revenue - current.current_burn) AS portfolio_profit,
  (baseline.baseline_revenue - baseline.baseline_burn) AS baseline_profit,
  ((portfolio_profit - baseline_profit) / baseline_profit) * 100 AS profit_improvement_pct
FROM baseline, current;
```

**Targets** (proposed, not canonical):
- Revenue improvement: ≥20% vs. baseline
- User growth: ≥15% vs. baseline
- Profit improvement: ≥25% vs. baseline (if baseline was profitable)

**Frequency**: Monthly (aligned with portfolio performance review)

**Dashboard**: Portfolio Performance Dashboard (Grafana or Metabase)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-39.md:36-39 "Missing: Threshold values, measurement frequency"

---

### 2. Synergy Value

**Source**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1763

**Definition**: Total captured value from cross-venture coordination initiatives, measured in dollars, time saved, and risk reduced.

**Calculation**:
```sql
SELECT
  initiative_id,
  initiative_name,
  SUM(CASE WHEN value_type = 'COST_SAVED' THEN value_amount ELSE 0 END) AS cost_saved,
  SUM(CASE WHEN value_type = 'TIME_SAVED_HOURS' THEN value_amount ELSE 0 END) AS time_saved_hours,
  SUM(CASE WHEN value_type = 'REVENUE_GENERATED' THEN value_amount ELSE 0 END) AS revenue_generated,
  COUNT(DISTINCT value_capture_event_id) AS capture_events
FROM value_capture_log
WHERE captured_at BETWEEN CURRENT_DATE - INTERVAL '30 days' AND CURRENT_DATE
GROUP BY initiative_id, initiative_name
ORDER BY (cost_saved + revenue_generated) DESC;
```

**Targets** (proposed, not canonical):
- Total synergy value: ≥$50K per venture pair annually
- Value capture events: ≥10 events per month (if ≥3 initiatives active)
- Synergy ROI: ≥300% (value captured / implementation cost)

**Frequency**: Weekly (for active initiatives), Monthly (for portfolio-level totals)

**Dashboard**: Synergy Value Dashboard (Grafana)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-39.md:36-39 "Action: Establish concrete KPIs with targets"

---

### 3. Resource Efficiency

**Source**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1764

**Definition**: Reduction in duplicate efforts and optimized resource allocation across ventures, measured as % improvement in resource utilization.

**Calculation**:
```sql
WITH baseline AS (
  SELECT
    SUM(hours_spent) AS baseline_duplicate_hours,
    SUM(budget_spent) AS baseline_duplicate_budget
  FROM venture_resource_usage
  WHERE recorded_at < (SELECT MIN(recorded_at) FROM venture_metrics WHERE stage >= 39)
    AND resource_type IN ('duplicate_engineering', 'duplicate_design', 'duplicate_marketing')
),
current AS (
  SELECT
    SUM(hours_spent) AS current_duplicate_hours,
    SUM(budget_spent) AS current_duplicate_budget
  FROM venture_resource_usage
  WHERE recorded_at = CURRENT_DATE
    AND resource_type IN ('duplicate_engineering', 'duplicate_design', 'duplicate_marketing')
)
SELECT
  ((baseline.baseline_duplicate_hours - current.current_duplicate_hours) / baseline.baseline_duplicate_hours) * 100 AS duplicate_hours_reduction_pct,
  ((baseline.baseline_duplicate_budget - current.current_duplicate_budget) / baseline.baseline_duplicate_budget) * 100 AS duplicate_budget_reduction_pct,
  baseline.baseline_duplicate_hours - current.current_duplicate_hours AS hours_saved,
  baseline.baseline_duplicate_budget - current.current_duplicate_budget AS budget_saved
FROM baseline, current;
```

**Targets** (proposed, not canonical):
- Duplicate efforts reduction: ≥30% vs. baseline
- Resource utilization: ≥85% (allocated resources actually used)
- Conflict resolution rate: ≥80% (resolved conflicts / total detected)

**Frequency**: Monthly

**Dashboard**: Resource Efficiency Dashboard (Grafana)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-39.md:41-45 "Gap: Data transformation and validation rules"

---

## Secondary KPIs (Derived)

### 4. Synergy Capture Rate

**Definition**: % of identified synergy opportunities that are pursued (coordination plans created and initiatives launched).

**Calculation**:
```sql
SELECT
  COUNT(*) FILTER (WHERE status = 'LAUNCHED') AS launched_initiatives,
  COUNT(*) AS total_opportunities,
  (COUNT(*) FILTER (WHERE status = 'LAUNCHED') * 100.0 / COUNT(*)) AS capture_rate_pct
FROM synergy_opportunities
WHERE created_at >= CURRENT_DATE - INTERVAL '90 days';
```

**Target**: ≥30% capture rate (1 in 3 opportunities pursued)

**Frequency**: Monthly

**Evidence**: Referenced in `07_recursion-blueprint.md` PORTFOLIO-001 "Success Metric: Synergy capture rate ≥30%"

---

### 5. Coordination Overhead

**Definition**: Time and cost spent on portfolio coordination activities (meetings, planning, governance) as % of total portfolio resources.

**Calculation**:
```sql
SELECT
  SUM(hours_spent) AS coordination_hours,
  (SELECT SUM(hours_available) FROM venture_resource_allocations WHERE status = 'active') AS total_hours,
  (coordination_hours * 100.0 / total_hours) AS coordination_overhead_pct
FROM venture_resource_usage
WHERE resource_type = 'coordination'
  AND recorded_at = CURRENT_DATE;
```

**Target**: ≤10% coordination overhead (balance efficiency vs. coordination value)

**Frequency**: Monthly

**Evidence**: Derived from `05_professional-sop.md` governance framework

---

### 6. Conflict Resolution Time

**Definition**: Average time to resolve resource conflicts from detection to resolution.

**Calculation**:
```sql
SELECT
  AVG(EXTRACT(EPOCH FROM (resolved_at - detected_at)) / 3600) AS avg_resolution_hours,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (resolved_at - detected_at)) / 3600) AS median_resolution_hours,
  MAX(EXTRACT(EPOCH FROM (resolved_at - detected_at)) / 3600) AS max_resolution_hours
FROM resource_conflicts
WHERE detected_at >= CURRENT_DATE - INTERVAL '30 days'
  AND status = 'RESOLVED';
```

**Target**: ≤48 hours average resolution time

**Frequency**: Weekly (for conflict monitoring)

**Evidence**: Referenced in `07_recursion-blueprint.md` PORTFOLIO-002 "resolution time ≤48 hours"

---

### 7. Initiative Success Rate

**Definition**: % of launched synergy initiatives that achieve target value capture.

**Calculation**:
```sql
SELECT
  COUNT(*) FILTER (WHERE captured_value >= target_value) AS successful_initiatives,
  COUNT(*) AS total_launched_initiatives,
  (COUNT(*) FILTER (WHERE captured_value >= target_value) * 100.0 / COUNT(*)) AS success_rate_pct
FROM synergy_initiatives
WHERE status = 'COMPLETED'
  AND launched_at >= CURRENT_DATE - INTERVAL '90 days';
```

**Target**: ≥70% success rate

**Frequency**: Quarterly (initiatives need time to capture value)

**Evidence**: Derived from `05_professional-sop.md` Step 9 benefit measurement

---

## Dashboard Architecture

### Dashboard 1: Portfolio Performance Dashboard

**Owner**: Chairman (primary viewer), PortfolioOptimizationAdvisor (updater)

**Panels**:
1. **Portfolio Revenue Trend** (line chart, monthly)
   - Baseline revenue (dotted line)
   - Current revenue (solid line)
   - Target revenue (dashed line at +20% baseline)

2. **Portfolio Profit Margin** (area chart, monthly)
   - Revenue (green area)
   - Burn rate (red area)
   - Profit (green - red = profit line)

3. **Venture Scorecard** (table, updated monthly)
   - Venture name, Strategic Fit, Financial, Growth, Efficiency, Total Score, Trend

4. **Top 5 Performers / Bottom 5 Performers** (dual bar charts)
   - Ranked by total venture score

**Update Frequency**: Daily (data refresh), Monthly (comprehensive review)

**URL**: `/dashboards/portfolio-performance` (Grafana or Metabase)

---

### Dashboard 2: Synergy Value Dashboard

**Owner**: SynergyExecutionManager (primary updater), Chairman (viewer)

**Panels**:
1. **Total Synergy Value Captured** (big number, YTD)
   - Cost saved + Revenue generated + (Time saved × $hourly_rate)

2. **Value by Initiative** (horizontal bar chart, sorted by total value)
   - Initiative name, Cost saved, Revenue generated, Time saved

3. **Value Capture Timeline** (stacked area chart, monthly)
   - Cost saved (blue)
   - Revenue generated (green)
   - Time saved (orange)

4. **Synergy ROI by Initiative** (scatter plot)
   - X-axis: Implementation cost
   - Y-axis: Captured value
   - Size: Number of ventures involved
   - Color: Initiative status (active/completed)

5. **Value Capture Events Log** (table, last 30 days)
   - Date, Initiative, Value type, Amount, Evidence link

**Update Frequency**: Real-time (value capture events logged immediately)

**URL**: `/dashboards/synergy-value` (Grafana)

---

### Dashboard 3: Resource Efficiency Dashboard

**Owner**: CoordinationPlanner (primary updater), Chairman (viewer)

**Panels**:
1. **Resource Allocation Matrix** (heatmap)
   - Rows: Resources (people, budget, infrastructure)
   - Columns: Ventures
   - Color intensity: Allocation %

2. **Duplicate Efforts Trend** (line chart, monthly)
   - Baseline duplicate hours (dotted line)
   - Current duplicate hours (solid line)
   - Target duplicate hours (dashed line at -30% baseline)

3. **Conflict Status** (donut chart)
   - Resolved (green)
   - In Progress (yellow)
   - Unresolved (red)

4. **Resource Utilization** (gauge chart)
   - Current: 85%
   - Target: ≥85%
   - Max: 100%

5. **Conflict Resolution Time** (histogram)
   - X-axis: Resolution time (hours)
   - Y-axis: Number of conflicts
   - Target line at 48 hours

**Update Frequency**: Real-time (conflict detection), Daily (utilization updates)

**URL**: `/dashboards/resource-efficiency` (Grafana)

---

### Dashboard 4: Initiative Tracking Dashboard

**Owner**: SynergyExecutionManager (primary updater), Initiative Owners (contributors)

**Panels**:
1. **Active Initiatives** (table, real-time)
   - Initiative name, Status, Owner, Progress %, Next milestone, Deadline

2. **Initiative Timeline** (Gantt chart)
   - Rows: Initiatives
   - Bars: Milestones (completed, in progress, upcoming)

3. **Value Capture Progress** (progress bars per initiative)
   - Target value (100%)
   - Captured value (current %)

4. **Stalled Initiatives Alert** (list, red background)
   - Initiatives with no update in 14+ days

5. **Upcoming Milestones** (calendar view, next 30 days)
   - Date, Initiative, Milestone, Owner

**Update Frequency**: Real-time (initiative updates)

**URL**: `/dashboards/initiative-tracking` (Airtable or Linear)

---

## Alerting Rules

### Alert 1: Portfolio Performance Degradation

**Trigger**: Portfolio revenue or profit decreases by >10% vs. previous month

**Severity**: CRITICAL

**Recipient**: Chairman, PortfolioOptimizationAdvisor

**Actions**:
1. Send Slack alert with dashboard link
2. Trigger PORTFOLIO-003 recursion (performance review)
3. Generate root cause analysis report (PortfolioOptimizationAdvisor)
4. Schedule urgent Chairman review meeting

**Evidence**: Referenced in `05_professional-sop.md` rollback procedures

---

### Alert 2: Synergy Initiative Delayed

**Trigger**: Initiative milestone deadline passed by >3 days with no completion

**Severity**: HIGH

**Recipient**: Initiative Owner, SynergyExecutionManager, Chairman (if critical initiative)

**Actions**:
1. Send email alert with initiative details
2. Update dashboard to show red status
3. Request status update from Initiative Owner (48-hour deadline)
4. Escalate to Chairman if no response in 48 hours

**Evidence**: Referenced in `08_configurability-matrix.md` "delayed_milestone_alert_days: 3"

---

### Alert 3: Resource Conflict Detected

**Trigger**: Resource allocation >100% (over-allocated)

**Severity**: HIGH

**Recipient**: CoordinationPlanner, affected venture leads, Chairman

**Actions**:
1. Send Slack alert immediately (real-time)
2. Trigger PORTFOLIO-002 recursion (conflict resolution)
3. Generate conflict resolution proposal (CoordinationPlanner)
4. Await Chairman approval for resource reallocation

**Evidence**: Referenced in `07_recursion-blueprint.md` PORTFOLIO-002

---

### Alert 4: Synergy Capture Rate Below Target

**Trigger**: Synergy capture rate <20% (below 30% target) for 2 consecutive months

**Severity**: MEDIUM

**Recipient**: PortfolioAnalyst, Chairman

**Actions**:
1. Send monthly digest email
2. Generate synergy analysis report (why opportunities not pursued)
3. Recommend adjustments to synergy scoring or prioritization
4. Schedule portfolio strategy review meeting

**Evidence**: Referenced in `07_recursion-blueprint.md` PORTFOLIO-001 "Success Metric: Synergy capture rate ≥30%"

---

### Alert 5: Coordination Overhead Exceeds Threshold

**Trigger**: Coordination overhead >15% (well above 10% target) for 1 month

**Severity**: MEDIUM

**Recipient**: Chairman, CoordinationPlanner

**Actions**:
1. Send monthly digest email
2. Generate efficiency analysis report (where overhead is spent)
3. Recommend process optimizations or governance streamlining
4. Adjust meeting cadence or decision rights if needed

**Evidence**: Derived from coordination overhead KPI

---

## Monitoring SLAs

| Metric | Update Frequency | Acceptable Lag | Alert if Exceeded |
|--------|------------------|----------------|-------------------|
| Portfolio Performance | Daily | 24 hours | Yes (data staleness alert) |
| Synergy Value | Real-time | 1 hour | Yes (logging failure alert) |
| Resource Efficiency | Daily | 24 hours | No (monthly review sufficient) |
| Initiative Status | Real-time | 4 hours | Yes (dashboard unavailable alert) |
| Conflict Detection | Real-time | 5 minutes | Yes (critical system alert) |

**Evidence**: Derived from dashboard update frequencies

---

## Data Sources

### Source 1: `venture_metrics` table

**Schema** (proposed):
```sql
CREATE TABLE venture_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venture_id UUID NOT NULL REFERENCES ventures(id),
  recorded_at DATE NOT NULL,
  monthly_revenue DECIMAL(10, 2),
  monthly_burn DECIMAL(10, 2),
  user_count INTEGER,
  stage INTEGER,
  UNIQUE(venture_id, recorded_at)
);
```

**Update Frequency**: Daily (via scheduled job or manual entry)

---

### Source 2: `value_capture_log` table

**Schema** (proposed):
```sql
CREATE TABLE value_capture_log (
  value_capture_event_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  initiative_id UUID NOT NULL REFERENCES synergy_initiatives(id),
  value_type TEXT NOT NULL,  -- 'COST_SAVED', 'TIME_SAVED_HOURS', 'REVENUE_GENERATED', 'RISK_REDUCED'
  value_amount DECIMAL(10, 2) NOT NULL,
  captured_at TIMESTAMPTZ DEFAULT NOW(),
  evidence_link TEXT,  -- URL to supporting documentation
  logged_by TEXT       -- User or agent name
);
```

**Update Frequency**: Real-time (event-driven)

---

### Source 3: `synergy_opportunities` table

**Schema** (proposed):
```sql
CREATE TABLE synergy_opportunities (
  opportunity_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venture_1_id UUID NOT NULL REFERENCES ventures(id),
  venture_2_id UUID NOT NULL REFERENCES ventures(id),
  synergy_type TEXT NOT NULL,  -- 'TECHNOLOGY', 'CUSTOMER', 'TEAM', 'OPERATIONAL'
  value_potential_score INTEGER CHECK (value_potential_score BETWEEN 1 AND 5),
  implementation_effort_score INTEGER CHECK (implementation_effort_score BETWEEN 1 AND 5),
  strategic_importance_score INTEGER CHECK (strategic_importance_score BETWEEN 1 AND 5),
  net_score DECIMAL(3, 1),
  status TEXT DEFAULT 'IDENTIFIED',  -- 'IDENTIFIED', 'PLANNED', 'LAUNCHED', 'REJECTED'
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Update Frequency**: Daily (via PORTFOLIO-001 recursion)

---

### Source 4: `resource_conflicts` table

**Schema** (proposed):
```sql
CREATE TABLE resource_conflicts (
  conflict_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  resource_id UUID NOT NULL,
  resource_name TEXT NOT NULL,
  total_allocation_pct DECIMAL(5, 2) NOT NULL,  -- e.g., 120% = over-allocated
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  status TEXT DEFAULT 'DETECTED',  -- 'DETECTED', 'IN_PROGRESS', 'RESOLVED', 'ESCALATED'
  resolution_notes TEXT
);
```

**Update Frequency**: Real-time (via PORTFOLIO-002 recursion)

---

## Sources Table

| Source | Repo | Commit | Path | Lines | Purpose |
|--------|------|--------|------|-------|---------|
| Metrics | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1762-1764 | Canonical KPIs |
| Metric gaps | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-39.md | 36-39 | Missing thresholds |
| SOP steps | EHG_Engineer | 6ef8cf4 | docs/workflow/dossiers/stage-39/05_professional-sop.md | Various | Operational context |
| Recursion triggers | EHG_Engineer | 6ef8cf4 | docs/workflow/dossiers/stage-39/07_recursion-blueprint.md | Various | Automated monitoring |
| Config matrix | EHG_Engineer | 6ef8cf4 | docs/workflow/dossiers/stage-39/08_configurability-matrix.md | Various | Threshold parameters |

---

<!-- Generated by Claude Code Phase 13 | EHG_Engineer@6ef8cf4 | 2025-11-06 -->
