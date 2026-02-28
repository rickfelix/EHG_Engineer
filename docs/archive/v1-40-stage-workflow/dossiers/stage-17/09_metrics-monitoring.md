---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# Stage 17: Metrics and Monitoring


## Table of Contents

- [Overview](#overview)
- [Metric Definitions](#metric-definitions)
  - [Metric 1: Campaign Effectiveness](#metric-1-campaign-effectiveness)
  - [Metric 2: Lead Generation](#metric-2-lead-generation)
  - [Metric 3: Conversion Rates](#metric-3-conversion-rates)
- [Secondary Metrics (Supporting)](#secondary-metrics-supporting)
  - [Metric 4: Cost Per Lead (CPL)](#metric-4-cost-per-lead-cpl)
  - [Metric 5: Return on Ad Spend (ROAS)](#metric-5-return-on-ad-spend-roas)
  - [Metric 6: Email Open Rate](#metric-6-email-open-rate)
  - [Metric 7: Email Click-Through Rate (CTR)](#metric-7-email-click-through-rate-ctr)
- [Monitoring Dashboard Specification](#monitoring-dashboard-specification)
  - [Dashboard 1: GTM Performance Overview](#dashboard-1-gtm-performance-overview)
  - [Dashboard 2: Recursion Monitoring](#dashboard-2-recursion-monitoring)
- [Alerting Rules](#alerting-rules)
  - [Alert 1: Campaign Effectiveness Below Threshold](#alert-1-campaign-effectiveness-below-threshold)
  - [Alert 2: Lead Generation Miss](#alert-2-lead-generation-miss)
  - [Alert 3: Conversion Rate Drop](#alert-3-conversion-rate-drop)
  - [Alert 4: ROAS Below Target](#alert-4-roas-below-target)
- [Data Collection Requirements](#data-collection-requirements)
  - [Database Tables](#database-tables)
  - [Data Ingestion](#data-ingestion)

## Overview

Stage 17 (GTM Strategist Agent Development) defines three primary metrics for tracking marketing automation performance. This document provides SQL queries, dashboard specifications, and monitoring procedures for each metric.

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:748-751 "Metrics: Campaign effectiveness, Lead generation, Conversion rates"

## Metric Definitions

### Metric 1: Campaign Effectiveness

#### Definition
Composite score measuring overall campaign performance across click-through, engagement, and conversion dimensions.

**Formula**:
```
Campaign Effectiveness = (0.4 × CTR_normalized) + (0.3 × Engagement_normalized) + (0.3 × CR_normalized)
```

Where:
- `CTR_normalized` = Click-through rate / industry_benchmark_CTR (0.0-1.0)
- `Engagement_normalized` = Engagement rate / industry_benchmark_engagement (0.0-1.0)
- `CR_normalized` = Conversion rate / target_conversion_rate (0.0-1.0)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:749 "Campaign effectiveness"

#### Target Values

| Venture Segment | Target Score | Threshold (50%) | Alert Level |
|----------------|--------------|-----------------|-------------|
| B2B Enterprise | 0.70 | 0.35 | <0.40 |
| B2B SMB | 0.65 | 0.33 | <0.35 |
| B2C Mass | 0.60 | 0.30 | <0.35 |
| B2C Premium | 0.65 | 0.33 | <0.35 |

**Evidence**: Target values derived from critique recommendation (EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-17.md:38 "Threshold values, measurement frequency")

#### SQL Query: Daily Campaign Effectiveness

```sql
-- Calculate daily campaign effectiveness score
WITH campaign_metrics AS (
  SELECT
    c.campaign_id,
    c.campaign_name,
    c.venture_id,
    p.measurement_date,
    -- Click-through rate (CTR)
    (p.clicks::FLOAT / NULLIF(p.impressions, 0)) AS ctr,
    -- Engagement rate (time spent, shares, comments)
    ((p.time_spent_seconds / p.impressions) / 60.0) AS engagement_minutes_per_impression,
    -- Conversion rate
    (p.conversions::FLOAT / NULLIF(p.clicks, 0)) AS conversion_rate,
    -- Industry benchmarks (from config)
    v.industry_benchmark_ctr,
    v.industry_benchmark_engagement,
    v.target_conversion_rate
  FROM campaigns c
  JOIN campaign_performance p ON c.campaign_id = p.campaign_id
  JOIN ventures v ON c.venture_id = v.venture_id
  WHERE p.measurement_date >= CURRENT_DATE - INTERVAL '30 days'
),
normalized_metrics AS (
  SELECT
    campaign_id,
    campaign_name,
    venture_id,
    measurement_date,
    -- Normalize to 0.0-1.0 scale (cap at 1.0 if exceeds benchmark)
    LEAST((ctr / NULLIF(industry_benchmark_ctr, 0)), 1.0) AS ctr_normalized,
    LEAST((engagement_minutes_per_impression / NULLIF(industry_benchmark_engagement, 0)), 1.0) AS engagement_normalized,
    LEAST((conversion_rate / NULLIF(target_conversion_rate, 0)), 1.0) AS cr_normalized
  FROM campaign_metrics
)
SELECT
  campaign_id,
  campaign_name,
  venture_id,
  measurement_date,
  -- Campaign effectiveness score
  ROUND(
    (0.4 * ctr_normalized) +
    (0.3 * engagement_normalized) +
    (0.3 * cr_normalized),
    3
  ) AS effectiveness_score,
  -- Component scores for debugging
  ROUND(ctr_normalized, 3) AS ctr_score,
  ROUND(engagement_normalized, 3) AS engagement_score,
  ROUND(cr_normalized, 3) AS conversion_score,
  -- Alert flag
  CASE
    WHEN ((0.4 * ctr_normalized) + (0.3 * engagement_normalized) + (0.3 * cr_normalized)) < 0.35
    THEN 'ALERT'
    ELSE 'OK'
  END AS status
FROM normalized_metrics
ORDER BY measurement_date DESC, effectiveness_score ASC;
```

**Query Performance**: <500ms (with proper indexes on `campaign_performance.campaign_id`, `campaign_performance.measurement_date`)

#### SQL Query: Trigger GTM-001 (Recursion)

```sql
-- Detect campaigns triggering recursion condition (effectiveness <50% target for 14 days)
WITH effectiveness_trend AS (
  SELECT
    c.campaign_id,
    c.venture_id,
    p.measurement_date,
    ROUND(
      (0.4 * LEAST((p.clicks::FLOAT / NULLIF(p.impressions, 0)) / NULLIF(v.industry_benchmark_ctr, 0), 1.0)) +
      (0.3 * LEAST(((p.time_spent_seconds / p.impressions) / 60.0) / NULLIF(v.industry_benchmark_engagement, 0), 1.0)) +
      (0.3 * LEAST((p.conversions::FLOAT / NULLIF(p.clicks, 0)) / NULLIF(v.target_conversion_rate, 0), 1.0)),
      3
    ) AS effectiveness_score,
    v.effectiveness_threshold
  FROM campaigns c
  JOIN campaign_performance p ON c.campaign_id = p.campaign_id
  JOIN ventures v ON c.venture_id = v.venture_id
  WHERE p.measurement_date >= CURRENT_DATE - INTERVAL '14 days'
)
SELECT
  venture_id,
  campaign_id,
  AVG(effectiveness_score) AS avg_effectiveness,
  MIN(effectiveness_score) AS min_effectiveness,
  MAX(effectiveness_score) AS max_effectiveness,
  COUNT(*) AS days_below_threshold,
  'GTM-001' AS trigger_type,
  'Campaign effectiveness below 50% target for 14 days' AS trigger_reason
FROM effectiveness_trend
WHERE effectiveness_score < (effectiveness_threshold * 0.5)
GROUP BY venture_id, campaign_id, effectiveness_threshold
HAVING COUNT(*) >= 14
ORDER BY avg_effectiveness ASC;
```

**Execution Frequency**: Daily (via scheduled job)
**Evidence**: Referenced in 07_recursion-blueprint.md (Trigger GTM-001)

#### Dashboard Visualization

**Chart Type**: Time-series line chart
**X-Axis**: Date (last 30 days)
**Y-Axis**: Effectiveness score (0.0-1.0)
**Series**: One line per campaign (max 5 campaigns, filter by top/bottom performers)
**Thresholds**: Horizontal lines at target (0.65), alert (0.35), recursion trigger (0.33)

**Additional Elements**:
- Tooltip: Show component scores (CTR, engagement, conversion)
- Alert badge: Red flag icon if any campaign in ALERT status
- Export: CSV download of raw data

---

### Metric 2: Lead Generation

#### Definition
Count of qualified leads generated from marketing campaigns per time period (weekly).

**Qualification Criteria**:
- Lead score ≥70 (if lead scoring enabled)
- Required fields complete (email, company, role for B2B; email, name for B2C)
- Not a duplicate (deduplicated by email)
- Not a bot/spam (passes validation)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:750 "Lead generation"

#### Target Values

| Venture Segment | Weekly Target | Threshold (50%) | Alert Level |
|----------------|---------------|-----------------|-------------|
| B2B Enterprise | 20 leads/week | 10 leads/week | <12 leads/week |
| B2B SMB | 50 leads/week | 25 leads/week | <30 leads/week |
| B2C Mass | 200 leads/week | 100 leads/week | <120 leads/week |
| B2C Premium | 100 leads/week | 50 leads/week | <60 leads/week |

**Evidence**: Targets derived from critique recommendation (EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-17.md:39 "Establish concrete KPIs with targets")

#### SQL Query: Weekly Lead Generation

```sql
-- Calculate weekly lead generation count
WITH weekly_leads AS (
  SELECT
    l.venture_id,
    v.venture_name,
    DATE_TRUNC('week', l.created_at) AS week_start,
    COUNT(DISTINCT l.lead_id) AS lead_count,
    -- Lead quality distribution
    SUM(CASE WHEN l.lead_score >= 90 THEN 1 ELSE 0 END) AS high_quality_leads,
    SUM(CASE WHEN l.lead_score >= 70 AND l.lead_score < 90 THEN 1 ELSE 0 END) AS medium_quality_leads,
    SUM(CASE WHEN l.lead_score < 70 THEN 1 ELSE 0 END) AS low_quality_leads,
    -- Lead source breakdown
    COUNT(DISTINCT CASE WHEN l.lead_source = 'email' THEN l.lead_id END) AS email_leads,
    COUNT(DISTINCT CASE WHEN l.lead_source = 'linkedin' THEN l.lead_id END) AS linkedin_leads,
    COUNT(DISTINCT CASE WHEN l.lead_source = 'google_ads' THEN l.lead_id END) AS google_ads_leads,
    COUNT(DISTINCT CASE WHEN l.lead_source = 'organic' THEN l.lead_id END) AS organic_leads
  FROM leads l
  JOIN ventures v ON l.venture_id = v.venture_id
  WHERE l.created_at >= CURRENT_DATE - INTERVAL '12 weeks'
    AND l.status = 'qualified'
  GROUP BY l.venture_id, v.venture_name, DATE_TRUNC('week', l.created_at)
),
venture_targets AS (
  SELECT
    venture_id,
    lead_target_weekly,
    (lead_target_weekly * 0.5) AS threshold_50_percent
  FROM ventures
)
SELECT
  wl.venture_id,
  wl.venture_name,
  wl.week_start,
  wl.lead_count,
  vt.lead_target_weekly AS target,
  vt.threshold_50_percent AS threshold,
  ROUND((wl.lead_count::FLOAT / NULLIF(vt.lead_target_weekly, 0)) * 100, 1) AS target_attainment_pct,
  -- Quality metrics
  wl.high_quality_leads,
  wl.medium_quality_leads,
  wl.low_quality_leads,
  ROUND((wl.high_quality_leads::FLOAT / NULLIF(wl.lead_count, 0)) * 100, 1) AS high_quality_pct,
  -- Source breakdown
  wl.email_leads,
  wl.linkedin_leads,
  wl.google_ads_leads,
  wl.organic_leads,
  -- Alert status
  CASE
    WHEN wl.lead_count < vt.threshold_50_percent THEN 'ALERT'
    WHEN wl.lead_count < vt.lead_target_weekly THEN 'WARNING'
    ELSE 'OK'
  END AS status
FROM weekly_leads wl
JOIN venture_targets vt ON wl.venture_id = vt.venture_id
ORDER BY wl.week_start DESC, wl.lead_count ASC;
```

**Query Performance**: <300ms (with indexes on `leads.venture_id`, `leads.created_at`, `leads.status`)

#### SQL Query: Trigger GTM-002 (Recursion)

```sql
-- Detect ventures triggering recursion condition (lead generation <10/week for 2 weeks)
WITH weekly_lead_counts AS (
  SELECT
    venture_id,
    DATE_TRUNC('week', created_at) AS week_start,
    COUNT(DISTINCT lead_id) AS lead_count
  FROM leads
  WHERE status = 'qualified'
    AND created_at >= CURRENT_DATE - INTERVAL '14 days'
  GROUP BY venture_id, DATE_TRUNC('week', created_at)
),
venture_thresholds AS (
  SELECT
    venture_id,
    lead_target_weekly,
    (lead_target_weekly * 0.5) AS threshold_50_percent
  FROM ventures
)
SELECT
  wlc.venture_id,
  COUNT(*) AS weeks_below_threshold,
  AVG(wlc.lead_count) AS avg_weekly_leads,
  vt.threshold_50_percent AS threshold,
  'GTM-002' AS trigger_type,
  'Lead generation below threshold for 2 consecutive weeks' AS trigger_reason
FROM weekly_lead_counts wlc
JOIN venture_thresholds vt ON wlc.venture_id = vt.venture_id
WHERE wlc.lead_count < vt.threshold_50_percent
GROUP BY wlc.venture_id, vt.threshold_50_percent
HAVING COUNT(*) >= 2
ORDER BY avg_weekly_leads ASC;
```

**Execution Frequency**: Weekly (Monday mornings)
**Evidence**: Referenced in 07_recursion-blueprint.md (Trigger GTM-002)

#### Dashboard Visualization

**Chart Type**: Stacked bar chart
**X-Axis**: Week (last 12 weeks)
**Y-Axis**: Lead count (0-max)
**Stacks**: High quality, Medium quality, Low quality (color-coded)
**Target Line**: Horizontal line at weekly target

**Additional Elements**:
- Trend indicator: Arrow showing week-over-week change (%, green/red)
- Source pie chart: Show lead source distribution for current week
- Quality score: Average lead score for current week

---

### Metric 3: Conversion Rates

#### Definition
Percentage of leads that convert to paying customers within a defined time window (30 days for B2B, 7 days for B2C).

**Formula**:
```
Conversion Rate = (Paying Customers / Total Qualified Leads) × 100
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:751 "Conversion rates"

#### Target Values

| Venture Segment | Target CR | Threshold (50%) | Alert Level |
|----------------|-----------|-----------------|-------------|
| B2B Enterprise | 3.0% | 1.5% | <1.8% |
| B2B SMB | 5.0% | 2.5% | <3.0% |
| B2C Mass | 2.0% | 1.0% | <1.2% |
| B2C Premium | 3.5% | 1.75% | <2.1% |

**Evidence**: Targets derived from industry benchmarks and critique recommendation (EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-17.md:69 "Define concrete success metrics with thresholds")

#### SQL Query: Daily Conversion Rate

```sql
-- Calculate daily conversion rate with funnel breakdown
WITH lead_funnel AS (
  SELECT
    l.venture_id,
    v.venture_name,
    v.target_segment,
    DATE(l.created_at) AS lead_date,
    COUNT(DISTINCT l.lead_id) AS total_leads,
    -- Funnel stages
    COUNT(DISTINCT CASE WHEN l.status IN ('qualified', 'contacted', 'demo_scheduled', 'converted') THEN l.lead_id END) AS qualified_leads,
    COUNT(DISTINCT CASE WHEN l.status IN ('contacted', 'demo_scheduled', 'converted') THEN l.lead_id END) AS contacted_leads,
    COUNT(DISTINCT CASE WHEN l.status IN ('demo_scheduled', 'converted') THEN l.lead_id END) AS demo_leads,
    COUNT(DISTINCT CASE WHEN l.status = 'converted' THEN l.lead_id END) AS converted_leads,
    -- Time to conversion
    AVG(CASE WHEN l.status = 'converted' THEN EXTRACT(EPOCH FROM (l.converted_at - l.created_at)) / 86400.0 END) AS avg_days_to_conversion
  FROM leads l
  JOIN ventures v ON l.venture_id = v.venture_id
  WHERE l.created_at >= CURRENT_DATE - INTERVAL '90 days'
  GROUP BY l.venture_id, v.venture_name, v.target_segment, DATE(l.created_at)
),
venture_targets AS (
  SELECT
    venture_id,
    conversion_target,
    (conversion_target * 0.5) AS threshold_50_percent
  FROM ventures
)
SELECT
  lf.venture_id,
  lf.venture_name,
  lf.target_segment,
  lf.lead_date,
  lf.total_leads,
  lf.qualified_leads,
  lf.contacted_leads,
  lf.demo_leads,
  lf.converted_leads,
  -- Conversion rate
  ROUND((lf.converted_leads::FLOAT / NULLIF(lf.qualified_leads, 0)) * 100, 2) AS conversion_rate_pct,
  vt.conversion_target * 100 AS target_pct,
  vt.threshold_50_percent * 100 AS threshold_pct,
  -- Funnel metrics
  ROUND((lf.contacted_leads::FLOAT / NULLIF(lf.qualified_leads, 0)) * 100, 1) AS contact_rate_pct,
  ROUND((lf.demo_leads::FLOAT / NULLIF(lf.contacted_leads, 0)) * 100, 1) AS demo_rate_pct,
  ROUND((lf.converted_leads::FLOAT / NULLIF(lf.demo_leads, 0)) * 100, 1) AS demo_to_close_pct,
  -- Time metrics
  ROUND(lf.avg_days_to_conversion, 1) AS avg_days_to_conversion,
  -- Alert status
  CASE
    WHEN (lf.converted_leads::FLOAT / NULLIF(lf.qualified_leads, 0)) < vt.threshold_50_percent THEN 'ALERT'
    WHEN (lf.converted_leads::FLOAT / NULLIF(lf.qualified_leads, 0)) < vt.conversion_target THEN 'WARNING'
    ELSE 'OK'
  END AS status
FROM lead_funnel lf
JOIN venture_targets vt ON lf.venture_id = vt.venture_id
ORDER BY lf.lead_date DESC, conversion_rate_pct ASC;
```

**Query Performance**: <600ms (with indexes on `leads.venture_id`, `leads.created_at`, `leads.status`, `leads.converted_at`)

#### SQL Query: Trigger GTM-003 (Recursion)

```sql
-- Detect ventures triggering recursion condition (conversion rate <1% for 30 days)
WITH daily_conversion_rates AS (
  SELECT
    l.venture_id,
    DATE(l.created_at) AS metric_date,
    COUNT(DISTINCT CASE WHEN l.status = 'converted' THEN l.lead_id END)::FLOAT /
      NULLIF(COUNT(DISTINCT CASE WHEN l.status IN ('qualified', 'contacted', 'demo_scheduled', 'converted') THEN l.lead_id END), 0) * 100 AS conversion_rate_pct
  FROM leads l
  WHERE l.created_at >= CURRENT_DATE - INTERVAL '30 days'
  GROUP BY l.venture_id, DATE(l.created_at)
)
SELECT
  venture_id,
  AVG(conversion_rate_pct) AS avg_conversion_rate_pct,
  MIN(conversion_rate_pct) AS min_conversion_rate_pct,
  MAX(conversion_rate_pct) AS max_conversion_rate_pct,
  COUNT(*) AS days_below_1_percent,
  'GTM-003' AS trigger_type,
  'Conversion rate <1% for 30 consecutive days' AS trigger_reason
FROM daily_conversion_rates
WHERE conversion_rate_pct < 1.0
GROUP BY venture_id
HAVING COUNT(*) >= 30
ORDER BY avg_conversion_rate_pct ASC;
```

**Execution Frequency**: Daily (via scheduled job)
**Evidence**: Referenced in 07_recursion-blueprint.md (Trigger GTM-003)

#### Dashboard Visualization

**Chart Type**: Funnel chart
**Stages**: Qualified Leads → Contacted → Demo Scheduled → Converted
**Metrics**: Count and conversion rate (%) at each stage

**Additional Elements**:
- Conversion rate trend: 30-day moving average line chart
- Bottleneck identifier: Highlight stage with lowest conversion rate (red)
- Time to conversion: Average days from lead to customer

---

## Secondary Metrics (Supporting)

### Metric 4: Cost Per Lead (CPL)

**Formula**: `CPL = Total Campaign Spend / Total Leads Generated`

**SQL Query**:
```sql
SELECT
  c.venture_id,
  c.campaign_id,
  c.campaign_name,
  SUM(p.spend) AS total_spend_usd,
  COUNT(DISTINCT l.lead_id) AS total_leads,
  ROUND(SUM(p.spend) / NULLIF(COUNT(DISTINCT l.lead_id), 0), 2) AS cpl_usd
FROM campaigns c
JOIN campaign_performance p ON c.campaign_id = p.campaign_id
LEFT JOIN leads l ON c.campaign_id = l.campaign_id
WHERE p.measurement_date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY c.venture_id, c.campaign_id, c.campaign_name
ORDER BY cpl_usd DESC;
```

### Metric 5: Return on Ad Spend (ROAS)

**Formula**: `ROAS = Revenue from Campaigns / Campaign Spend`

**SQL Query**:
```sql
WITH campaign_revenue AS (
  SELECT
    c.campaign_id,
    c.venture_id,
    SUM(p.spend) AS total_spend,
    SUM(o.order_value) AS total_revenue
  FROM campaigns c
  JOIN campaign_performance p ON c.campaign_id = p.campaign_id
  LEFT JOIN leads l ON c.campaign_id = l.campaign_id AND l.status = 'converted'
  LEFT JOIN orders o ON l.lead_id = o.lead_id
  WHERE p.measurement_date >= CURRENT_DATE - INTERVAL '30 days'
  GROUP BY c.campaign_id, c.venture_id
)
SELECT
  campaign_id,
  venture_id,
  total_spend,
  total_revenue,
  ROUND(total_revenue / NULLIF(total_spend, 0), 2) AS roas
FROM campaign_revenue
ORDER BY roas DESC;
```

**Evidence**: ROAS referenced in 07_recursion-blueprint.md (Trigger GTM-004)

### Metric 6: Email Open Rate

**Formula**: `Open Rate = (Emails Opened / Emails Delivered) × 100`

**SQL Query**:
```sql
SELECT
  campaign_id,
  email_subject,
  COUNT(*) AS emails_sent,
  SUM(CASE WHEN opened_at IS NOT NULL THEN 1 ELSE 0 END) AS emails_opened,
  ROUND((SUM(CASE WHEN opened_at IS NOT NULL THEN 1 ELSE 0 END)::FLOAT / COUNT(*)) * 100, 1) AS open_rate_pct
FROM email_sends
WHERE sent_at >= CURRENT_DATE - INTERVAL '7 days'
  AND delivery_status = 'delivered'
GROUP BY campaign_id, email_subject
ORDER BY open_rate_pct DESC;
```

### Metric 7: Email Click-Through Rate (CTR)

**Formula**: `CTR = (Link Clicks / Emails Delivered) × 100`

**SQL Query**:
```sql
SELECT
  campaign_id,
  email_subject,
  COUNT(*) AS emails_delivered,
  SUM(CASE WHEN clicked_at IS NOT NULL THEN 1 ELSE 0 END) AS emails_clicked,
  ROUND((SUM(CASE WHEN clicked_at IS NOT NULL THEN 1 ELSE 0 END)::FLOAT / COUNT(*)) * 100, 1) AS ctr_pct
FROM email_sends
WHERE sent_at >= CURRENT_DATE - INTERVAL '7 days'
  AND delivery_status = 'delivered'
GROUP BY campaign_id, email_subject
ORDER BY ctr_pct DESC;
```

## Monitoring Dashboard Specification

### Dashboard 1: GTM Performance Overview

**URL**: `/dashboards/gtm-performance`
**Refresh Rate**: Every 5 minutes (real-time)
**Access Control**: LEAD, PLAN, EXEC agents (read-only)

**Layout**:
```
┌─────────────────────────────────────────────────────┐
│ GTM Performance Dashboard                           │
│ Venture: [Dropdown]   Date Range: [Last 30 Days ▼] │
├─────────────────────────────────────────────────────┤
│ KPI Summary                                         │
│ ┌──────────┬──────────┬──────────┬──────────┐      │
│ │Effectiveness│ Leads  │ Conv Rate│  ROAS    │      │
│ │   0.68     │  127   │  3.2%    │  4.1x    │      │
│ │  ▲ +5%     │ ▼ -8%  │ ▲ +12%   │ ▲ +15%   │      │
│ └──────────┴──────────┴──────────┴──────────┘      │
├─────────────────────────────────────────────────────┤
│ Campaign Effectiveness Trend (Last 30 Days)         │
│ [Line chart: 3 campaigns, threshold lines]          │
├─────────────────────────────────────────────────────┤
│ Lead Generation (Last 12 Weeks)                     │
│ [Stacked bar chart: quality breakdown]              │
├─────────────────────────────────────────────────────┤
│ Conversion Funnel (Current Week)                    │
│ [Funnel chart: Qualified → Contacted → Demo → Conv] │
└─────────────────────────────────────────────────────┘
```

### Dashboard 2: Recursion Monitoring

**URL**: `/dashboards/recursion-monitoring`
**Refresh Rate**: Every hour
**Access Control**: LEAD agent only

**Layout**:
```
┌─────────────────────────────────────────────────────┐
│ Recursion Health Dashboard                          │
├─────────────────────────────────────────────────────┤
│ Active Triggers (Last 30 Days)                      │
│ ┌──────────┬───────────┬──────────┬──────────┐     │
│ │ GTM-001  │  GTM-002  │ GTM-003  │ GTM-004  │     │
│ │   3      │    1      │    0     │    2     │     │
│ └──────────┴───────────┴──────────┴──────────┘     │
├─────────────────────────────────────────────────────┤
│ Recursion Flow (Sankey Diagram)                     │
│ [Stage 17 → Stage 5/11/15/16/18 flows]              │
├─────────────────────────────────────────────────────┤
│ Recent Recursions                                    │
│ │ Venture   │ Trigger │ Target │ Status    │ Date  ││
│ │ VENT-001  │ GTM-001 │   15   │Completed  │11/03 ││
│ │ VENT-003  │ GTM-002 │   11   │Executing  │11/04 ││
│ │ VENT-007  │ GTM-004 │    5   │Pending    │11/05 ││
└─────────────────────────────────────────────────────┘
```

## Alerting Rules

### Alert 1: Campaign Effectiveness Below Threshold
**Condition**: Effectiveness score <0.35 for 7 consecutive days
**Recipients**: LEAD agent, PLAN agent
**Severity**: HIGH
**Action**: Review campaign configuration, consider pausing

### Alert 2: Lead Generation Miss
**Condition**: Weekly leads <50% target for 2 consecutive weeks
**Recipients**: LEAD agent, EXEC agent
**Severity**: CRITICAL
**Action**: Trigger GTM-002 recursion (automatic)

### Alert 3: Conversion Rate Drop
**Condition**: Conversion rate <1% for 14 consecutive days
**Recipients**: LEAD agent, PLAN agent, Sales team
**Severity**: CRITICAL
**Action**: Investigate sales funnel, consider GTM-003 recursion

### Alert 4: ROAS Below Target
**Condition**: ROAS <2.0 for 21 consecutive days
**Recipients**: LEAD agent, CFO
**Severity**: HIGH
**Action**: Trigger GTM-004 recursion, reduce ad spend

## Data Collection Requirements

### Database Tables

```sql
-- Campaign performance data (populated by marketing platforms)
CREATE TABLE campaign_performance (
  performance_id UUID PRIMARY KEY,
  campaign_id UUID REFERENCES campaigns(campaign_id),
  measurement_date DATE NOT NULL,
  impressions INT DEFAULT 0,
  clicks INT DEFAULT 0,
  conversions INT DEFAULT 0,
  spend DECIMAL(10,2) DEFAULT 0.00,
  revenue DECIMAL(10,2) DEFAULT 0.00,
  time_spent_seconds INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_campaign_performance_date ON campaign_performance(measurement_date);
CREATE INDEX idx_campaign_performance_campaign ON campaign_performance(campaign_id);

-- Email tracking data
CREATE TABLE email_sends (
  send_id UUID PRIMARY KEY,
  campaign_id UUID REFERENCES campaigns(campaign_id),
  lead_id UUID REFERENCES leads(lead_id),
  email_subject VARCHAR(200),
  sent_at TIMESTAMP,
  delivered_at TIMESTAMP,
  opened_at TIMESTAMP,
  clicked_at TIMESTAMP,
  delivery_status VARCHAR(20),  -- 'sent', 'delivered', 'bounced', 'failed'
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_email_sends_campaign ON email_sends(campaign_id);
CREATE INDEX idx_email_sends_lead ON email_sends(lead_id);
CREATE INDEX idx_email_sends_sent_at ON email_sends(sent_at);
```

### Data Ingestion

**Source Systems**:
- HubSpot API: Campaign performance, email tracking
- LinkedIn Campaign Manager API: Ad performance
- Google Ads API: Search/display ad metrics
- Analytics (GA4/Segment): Website conversion tracking

**Ingestion Frequency**:
- Real-time: Email events (opens, clicks)
- Hourly: Ad platform metrics (impressions, clicks, spend)
- Daily: Conversion data, revenue attribution

**ETL Pipeline**: Use Airbyte or Fivetran for automated data sync to `campaign_performance` table.

---

**Implementation Priority**: CRITICAL (metrics enable performance tracking and recursion triggers)
**Estimated Implementation Time**: 2-3 sprints (4-6 weeks including data pipeline setup)
**Cross-Reference**: 07_recursion-blueprint.md (trigger thresholds), 08_configurability-matrix.md (metric targets)

<!-- Generated by Claude Code Phase 8 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
