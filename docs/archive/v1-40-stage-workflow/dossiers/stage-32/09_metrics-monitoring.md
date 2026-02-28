---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# Stage 32: Customer Success & Retention Engineering — Metrics & Monitoring


## Table of Contents

- [Purpose](#purpose)
- [Stage 32 Core Metrics](#stage-32-core-metrics)
  - [Metric 1: Customer Health Score](#metric-1-customer-health-score)
  - [Metric 2: Retention Rate](#metric-2-retention-rate)
  - [Metric 3: NPS Score](#metric-3-nps-score)
- [Supporting Metrics](#supporting-metrics)
  - [4. Campaign Effectiveness](#4-campaign-effectiveness)
  - [5. System Health](#5-system-health)
  - [6. Customer Segmentation](#6-customer-segmentation)
- [Dashboard Specifications](#dashboard-specifications)
  - [Dashboard 1: Executive Overview](#dashboard-1-executive-overview)
  - [Dashboard 2: Campaign Performance](#dashboard-2-campaign-performance)
  - [Dashboard 3: System Health](#dashboard-3-system-health)
  - [Dashboard 4: Customer Insights (for Stage 33 handoff)](#dashboard-4-customer-insights-for-stage-33-handoff)
- [Supabase Integration](#supabase-integration)
  - [Table Schemas (Proposed)](#table-schemas-proposed)
  - [Real-Time Alerts (via pg_notify)](#real-time-alerts-via-pg_notify)
- [Monitoring Best Practices](#monitoring-best-practices)
  - [1. Proactive Monitoring (Daily)](#1-proactive-monitoring-daily)
  - [2. Weekly Review (Every Monday)](#2-weekly-review-every-monday)
  - [3. Monthly Business Review (First Monday of month)](#3-monthly-business-review-first-monday-of-month)
- [Alert Routing Configuration](#alert-routing-configuration)
- [Sources Table](#sources-table)

**Generated**: 2025-11-06
**Version**: 1.0

---

## Purpose

This document defines KPIs, Supabase queries, and dashboard specifications for Stage 32 customer success operations.

---

## Stage 32 Core Metrics

### Metric 1: Customer Health Score

**Definition**: Composite indicator (0-100) of customer account health
**Source**: EHG_Engineer@468a959:docs/workflow/stages.yaml:1440 "Customer health score"

**Calculation**:
```sql
-- Materialized view (refreshes daily via pg_cron)
CREATE MATERIALIZED VIEW customer_health_scores AS
SELECT
  u.user_id,
  u.email,
  u.created_at AS onboarded_at,

  -- Engagement Score (40 points max)
  CASE
    WHEN u.last_login > NOW() - INTERVAL '1 day' THEN 40
    WHEN u.last_login > NOW() - INTERVAL '7 days' THEN 30
    WHEN u.last_login > NOW() - INTERVAL '30 days' THEN 20
    ELSE 0
  END AS engagement_score,

  -- Support Score (30 points max)
  GREATEST(0, 30 - (COALESCE(st.open_ticket_count, 0) * 10)) AS support_score,

  -- Value Score (30 points max)
  LEAST(30, COALESCE(um.feature_adoption_count, 0) * 5) AS value_score,

  -- Total Health Score
  (engagement_score + support_score + value_score) AS total_health_score,

  -- Health Status
  CASE
    WHEN total_health_score >= 70 THEN 'Healthy'
    WHEN total_health_score >= 40 THEN 'At-Risk'
    ELSE 'Critical'
  END AS health_status,

  -- Metadata
  NOW() AS calculated_at,
  u.last_login AS last_activity,
  DATE_PART('day', NOW() - u.last_login) AS days_since_activity

FROM users u
LEFT JOIN (
  SELECT user_id, COUNT(*) AS feature_adoption_count
  FROM usage_events
  WHERE event_type = 'feature_adopted'
  GROUP BY user_id
) um ON u.user_id = um.user_id
LEFT JOIN (
  SELECT user_id, COUNT(*) AS open_ticket_count
  FROM support_tickets
  WHERE status IN ('open', 'pending')
  GROUP BY user_id
) st ON u.user_id = st.user_id
WHERE u.status = 'active';

-- Schedule daily refresh (2 AM UTC)
SELECT cron.schedule(
  'refresh-customer-health-scores',
  '0 2 * * *',
  $$REFRESH MATERIALIZED VIEW customer_health_scores$$
);
```

**Evidence**: `05_professional-sop.md` Step 5 (scoring implementation)

**Targets**:
- **Exit Gate**: No specific target (monitoring only)
- **Operational Target**: Average health score ≥70
- **Alert Threshold**: Individual score <40 triggers intervention

⚠️ **Blocker**: SD-METRICS-FRAMEWORK-001 (P0 CRITICAL, status=queued) - No standardized targets

---

### Metric 2: Retention Rate

**Definition**: Percentage of customers remaining active over time (monthly cohort analysis)
**Source**: EHG_Engineer@468a959:docs/workflow/stages.yaml:1441 "Retention rate"

**Calculation**:
```sql
-- Monthly cohort retention query
WITH cohorts AS (
  SELECT
    user_id,
    DATE_TRUNC('month', created_at) AS cohort_month
  FROM users
  WHERE created_at >= NOW() - INTERVAL '12 months'
),
activity AS (
  SELECT
    user_id,
    DATE_TRUNC('month', last_login) AS activity_month
  FROM users
  WHERE last_login >= NOW() - INTERVAL '12 months'
)
SELECT
  c.cohort_month,
  COUNT(DISTINCT c.user_id) AS cohort_size,
  COUNT(DISTINCT CASE WHEN a.activity_month >= c.cohort_month + INTERVAL '1 month' THEN c.user_id END) AS retained_1m,
  COUNT(DISTINCT CASE WHEN a.activity_month >= c.cohort_month + INTERVAL '3 months' THEN c.user_id END) AS retained_3m,
  COUNT(DISTINCT CASE WHEN a.activity_month >= c.cohort_month + INTERVAL '6 months' THEN c.user_id END) AS retained_6m,

  -- Retention rates
  ROUND((retained_1m::FLOAT / cohort_size) * 100, 2) AS retention_rate_1m,
  ROUND((retained_3m::FLOAT / cohort_size) * 100, 2) AS retention_rate_3m,
  ROUND((retained_6m::FLOAT / cohort_size) * 100, 2) AS retention_rate_6m

FROM cohorts c
LEFT JOIN activity a ON c.user_id = a.user_id
GROUP BY c.cohort_month
ORDER BY c.cohort_month DESC;
```

**Evidence**: `07_recursion-blueprint.md` RETENTION-002 (retention rate trigger)

**Targets**:
- **Exit Gate**: EHG_Engineer@468a959:docs/workflow/stages.yaml:1449 "Retention improving" (≥5% increase over baseline)
- **Operational Target**: 1-month retention ≥85%, 3-month retention ≥70%, 6-month retention ≥60%
- **Alert Threshold**: Month-over-month decline >15% triggers recursion (RETENTION-002)

⚠️ **Threshold Gap**: "Retention improving" is exit gate, but no specific baseline or target percentage defined

---

### Metric 3: NPS Score

**Definition**: Net Promoter Score (promoters % - detractors %)
**Source**: EHG_Engineer@468a959:docs/workflow/stages.yaml:1442 "NPS score"

**Calculation**:
```sql
-- NPS score calculation (rolling 30-day window)
WITH nps_responses AS (
  SELECT
    survey_id,
    user_id,
    score,  -- 0-10 scale
    feedback_text,
    created_at,
    CASE
      WHEN score >= 9 THEN 'promoter'
      WHEN score >= 7 THEN 'passive'
      ELSE 'detractor'
    END AS category
  FROM nps_surveys
  WHERE created_at >= NOW() - INTERVAL '30 days'
)
SELECT
  COUNT(*) AS total_responses,
  COUNT(*) FILTER (WHERE category = 'promoter') AS promoters,
  COUNT(*) FILTER (WHERE category = 'passive') AS passives,
  COUNT(*) FILTER (WHERE category = 'detractor') AS detractors,

  -- NPS calculation
  ROUND(
    ((COUNT(*) FILTER (WHERE category = 'promoter')::FLOAT / COUNT(*)) -
     (COUNT(*) FILTER (WHERE category = 'detractor')::FLOAT / COUNT(*))) * 100,
    2
  ) AS nps_score,

  -- Distribution percentages
  ROUND((COUNT(*) FILTER (WHERE category = 'promoter')::FLOAT / COUNT(*)) * 100, 2) AS promoter_percent,
  ROUND((COUNT(*) FILTER (WHERE category = 'passive')::FLOAT / COUNT(*)) * 100, 2) AS passive_percent,
  ROUND((COUNT(*) FILTER (WHERE category = 'detractor')::FLOAT / COUNT(*)) * 100, 2) AS detractor_percent

FROM nps_responses
HAVING COUNT(*) >= 100;  -- Minimum response threshold for statistical significance
```

**Evidence**: `05_professional-sop.md` Exit Gate 3 (≥100 responses, NPS ≥0)

**Targets**:
- **Exit Gate**: EHG_Engineer@468a959:docs/workflow/stages.yaml:1450 "NPS positive" (≥0)
- **Target NPS**: 30 (sustainable growth)
- **Excellent NPS**: 50 (world-class)
- **Alert Threshold**: NPS <0 triggers Chairman escalation (RETENTION-003)

---

## Supporting Metrics

### 4. Campaign Effectiveness

**Purpose**: Track retention program performance

```sql
-- Retention campaign metrics
SELECT
  campaign_type,  -- 'at_risk', 'critical', 'win_back'
  COUNT(*) AS total_sent,
  COUNT(*) FILTER (WHERE opened_at IS NOT NULL) AS emails_opened,
  COUNT(*) FILTER (WHERE clicked_at IS NOT NULL) AS emails_clicked,
  COUNT(*) FILTER (WHERE responded_at IS NOT NULL) AS responses_received,

  -- Response rates
  ROUND((COUNT(*) FILTER (WHERE opened_at IS NOT NULL)::FLOAT / COUNT(*)) * 100, 2) AS open_rate,
  ROUND((COUNT(*) FILTER (WHERE clicked_at IS NOT NULL)::FLOAT / COUNT(*)) * 100, 2) AS click_rate,
  ROUND((COUNT(*) FILTER (WHERE responded_at IS NOT NULL)::FLOAT / COUNT(*)) * 100, 2) AS response_rate,

  -- Health score recovery (for at-risk/critical campaigns)
  AVG(
    CASE WHEN h2.total_health_score > h1.total_health_score THEN 1 ELSE 0 END
  ) AS recovery_rate

FROM retention_campaigns rc
LEFT JOIN customer_health_scores h1 ON rc.user_id = h1.user_id AND h1.calculated_at = rc.sent_at
LEFT JOIN customer_health_scores h2 ON rc.user_id = h2.user_id AND h2.calculated_at = rc.sent_at + INTERVAL '30 days'
WHERE rc.sent_at >= NOW() - INTERVAL '90 days'
GROUP BY campaign_type;
```

**Targets**:
- At-Risk Campaign: Response rate ≥20%, Recovery rate ≥30%
- Critical Campaign: Response rate 100% (all contacted), Recovery rate ≥50%
- Win-Back Campaign: Response rate ≥10%, Conversion rate ≥5%

**Evidence**: `06_agent-orchestration.md` Agent 3 success criteria

---

### 5. System Health

**Purpose**: Monitor success system uptime and reliability

```sql
-- System health dashboard
SELECT
  -- Health score system
  (SELECT calculated_at FROM customer_health_scores ORDER BY calculated_at DESC LIMIT 1) AS last_health_score_update,
  EXTRACT(EPOCH FROM (NOW() - (SELECT calculated_at FROM customer_health_scores ORDER BY calculated_at DESC LIMIT 1))) / 3600 AS hours_since_last_update,

  -- CRM sync status
  (SELECT COUNT(*) FROM crm_sync_log WHERE synced_at > NOW() - INTERVAL '24 hours' AND status = 'success') AS successful_crm_syncs_24h,
  (SELECT COUNT(*) FROM crm_sync_log WHERE synced_at > NOW() - INTERVAL '24 hours' AND status = 'error') AS failed_crm_syncs_24h,
  ROUND((successful_crm_syncs_24h::FLOAT / (successful_crm_syncs_24h + failed_crm_syncs_24h)) * 100, 2) AS crm_sync_success_rate,

  -- Campaign execution
  (SELECT COUNT(*) FROM retention_campaigns WHERE status = 'active') AS active_campaigns,
  (SELECT COUNT(*) FROM retention_campaigns WHERE status = 'paused') AS paused_campaigns,

  -- NPS survey deployment
  (SELECT COUNT(*) FROM nps_surveys WHERE deployed_at > NOW() - INTERVAL '7 days') AS nps_surveys_deployed_7d,

  -- Overall system status
  CASE
    WHEN hours_since_last_update > 48 THEN 'Degraded'
    WHEN crm_sync_success_rate < 95 THEN 'Degraded'
    WHEN active_campaigns = 0 THEN 'Warning'
    ELSE 'Healthy'
  END AS system_status;
```

**Targets**:
- Health score update lag: <24 hours
- CRM sync success rate: ≥95%
- Active campaigns: ≥1
- System uptime: ≥99.5%

**Evidence**: `07_recursion-blueprint.md` RETENTION-004 (system health check)

---

### 6. Customer Segmentation

**Purpose**: Break down metrics by customer segment

```sql
-- Segmented health scores
SELECT
  CASE
    WHEN u.subscription_tier = 'enterprise' THEN 'Enterprise'
    WHEN u.subscription_tier = 'professional' THEN 'Professional'
    WHEN u.subscription_tier = 'basic' THEN 'Basic'
    ELSE 'Free'
  END AS segment,

  COUNT(*) AS total_customers,
  AVG(chs.total_health_score) AS avg_health_score,
  COUNT(*) FILTER (WHERE chs.health_status = 'Healthy') AS healthy_count,
  COUNT(*) FILTER (WHERE chs.health_status = 'At-Risk') AS at_risk_count,
  COUNT(*) FILTER (WHERE chs.health_status = 'Critical') AS critical_count,

  -- Distribution percentages
  ROUND((healthy_count::FLOAT / COUNT(*)) * 100, 2) AS healthy_percent,
  ROUND((at_risk_count::FLOAT / COUNT(*)) * 100, 2) AS at_risk_percent,
  ROUND((critical_count::FLOAT / COUNT(*)) * 100, 2) AS critical_percent

FROM users u
JOIN customer_health_scores chs ON u.user_id = chs.user_id
WHERE u.status = 'active'
GROUP BY segment
ORDER BY avg_health_score DESC;
```

**Use Case**: Identify which customer segments need most attention

---

## Dashboard Specifications

### Dashboard 1: Executive Overview

**Purpose**: High-level KPIs for Chairman and EVA monitoring

**Panels**:
1. **Overall Health Score** (gauge: 0-100, target ≥70)
2. **Retention Rate Trend** (line chart: last 6 months, target ≥85%)
3. **NPS Score** (gauge: -100 to 100, target ≥0, stretch ≥30)
4. **Customer Distribution** (donut chart: Healthy/At-Risk/Critical %)
5. **Alert Summary** (table: critical alerts in last 24h, at-risk customers)

**Refresh Frequency**: Daily (aligned with health score refresh at 2 AM UTC)

**Access**: Chairman, EVA, Success Team Leads

---

### Dashboard 2: Campaign Performance

**Purpose**: Track retention program effectiveness

**Panels**:
1. **Campaign Response Rates** (bar chart: at-risk/critical/win-back)
2. **Recovery Rate Trend** (line chart: % of at-risk → healthy over time)
3. **Email Engagement** (table: open/click/response rates by campaign)
4. **Health Score Recovery** (before/after histogram for intervened customers)
5. **ROI Analysis** (cost per intervention vs. prevented churn value)

**Refresh Frequency**: Weekly

**Access**: EVA, Success Team, Marketing Team

---

### Dashboard 3: System Health

**Purpose**: Monitor success system uptime and reliability

**Panels**:
1. **System Status** (status indicator: Healthy/Warning/Degraded)
2. **Health Score Update Lag** (time series: hours since last update)
3. **CRM Sync Success Rate** (gauge: target ≥95%)
4. **Active Campaigns** (count: should be ≥1)
5. **Error Log** (table: recent failures with timestamps and error messages)

**Refresh Frequency**: Hourly

**Access**: EVA, Engineering Team, Success Ops

---

### Dashboard 4: Customer Insights (for Stage 33 handoff)

**Purpose**: Feed customer feedback into Post-MVP Expansion planning

**Panels**:
1. **Top Churn Reasons** (bar chart: categorized exit survey feedback)
2. **Most Requested Features** (table: support ticket analysis)
3. **Feature Adoption Rates** (bar chart: % of customers using each feature)
4. **NPS Feedback Themes** (word cloud: sentiment analysis of open-ended responses)
5. **Segment Health Comparison** (table: health scores by subscription tier)

**Refresh Frequency**: Monthly

**Access**: Chairman, Product Team (Stage 33), EVA

---

## Supabase Integration

### Table Schemas (Proposed)

```sql
-- Customer health scores (materialized view, already defined above)

-- CRM sync log
CREATE TABLE IF NOT EXISTS crm_sync_log (
  id SERIAL PRIMARY KEY,
  synced_at TIMESTAMP DEFAULT NOW(),
  record_count INTEGER,
  status VARCHAR(20) CHECK (status IN ('success', 'error', 'partial')),
  error_message TEXT,
  sync_duration_seconds INTEGER
);

-- Retention campaigns
CREATE TABLE IF NOT EXISTS retention_campaigns (
  id SERIAL PRIMARY KEY,
  campaign_type VARCHAR(50) CHECK (campaign_type IN ('at_risk', 'critical', 'win_back')),
  user_id UUID REFERENCES users(user_id),
  sent_at TIMESTAMP DEFAULT NOW(),
  opened_at TIMESTAMP,
  clicked_at TIMESTAMP,
  responded_at TIMESTAMP,
  status VARCHAR(20) CHECK (status IN ('active', 'paused', 'completed')),
  health_score_before INTEGER,
  health_score_after INTEGER
);

-- NPS surveys
CREATE TABLE IF NOT EXISTS nps_surveys (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(user_id),
  score INTEGER CHECK (score BETWEEN 0 AND 10),
  feedback_text TEXT,
  category VARCHAR(20) CHECK (category IN ('promoter', 'passive', 'detractor')),
  deployed_at TIMESTAMP,
  responded_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- System health log
CREATE TABLE IF NOT EXISTS system_health_log (
  id SERIAL PRIMARY KEY,
  check_timestamp TIMESTAMP DEFAULT NOW(),
  component VARCHAR(50),  -- 'health_scores', 'crm_sync', 'campaigns', 'nps'
  status VARCHAR(20) CHECK (status IN ('healthy', 'warning', 'degraded')),
  details JSONB,
  resolved_at TIMESTAMP
);
```

---

### Real-Time Alerts (via pg_notify)

```sql
-- Function to send critical customer alerts
CREATE OR REPLACE FUNCTION notify_critical_customer()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.total_health_score < 40 AND (OLD.total_health_score IS NULL OR OLD.total_health_score >= 40) THEN
    PERFORM pg_notify(
      'critical_customer_alert',
      json_build_object(
        'user_id', NEW.user_id,
        'email', NEW.email,
        'health_score', NEW.total_health_score,
        'last_activity', NEW.last_activity
      )::text
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger on health score refresh
CREATE TRIGGER critical_customer_trigger
AFTER INSERT OR UPDATE ON customer_health_scores
FOR EACH ROW
EXECUTE FUNCTION notify_critical_customer();
```

**Evidence**: `05_professional-sop.md` Step 6 (real-time alerts for critical customers)

---

## Monitoring Best Practices

### 1. Proactive Monitoring (Daily)

**EVA Tasks**:
- Check system health dashboard at 2:30 AM UTC (after health score refresh)
- Review critical customer alerts (should trigger automatically)
- Verify CRM sync success rate ≥95%

**Success Team Tasks**:
- Review weekly at-risk digest (every Monday, 9 AM)
- Triage critical customer tasks in CRM
- Schedule check-in calls for high-value at-risk customers

---

### 2. Weekly Review (Every Monday)

**Agenda**:
1. Review retention rate trend (month-over-month comparison)
2. Analyze campaign performance (response rates, recovery rates)
3. Discuss top 5 at-risk customers (health score <50, high ARR)
4. Share success stories (critical → healthy recoveries)
5. Adjust campaign parameters if needed (see `08_configurability-matrix.md`)

**Attendees**: Success Team Lead, EVA (via report), Chairman (optional)

---

### 3. Monthly Business Review (First Monday of month)

**Agenda**:
1. NPS score analysis (trend, segment breakdown, feedback themes)
2. Retention rate cohort analysis (1m/3m/6m retention)
3. Churn reasons deep-dive (exit surveys, support tickets)
4. Customer insights for Stage 33 (feature requests, product gaps)
5. System health review (uptime, reliability, incidents)

**Attendees**: Chairman, Success Team, Product Team (Stage 33), EVA

**Deliverable**: Customer Insights Report for Stage 33 handoff (see `05_professional-sop.md` Exit Validation)

---

## Alert Routing Configuration

| Alert Type | Severity | Destination | Response SLA |
|------------|----------|-------------|--------------|
| Critical Customer (score <40) | 🔴 High | Slack (#customer-success-urgent) | 24 hours |
| NPS Negative | 🔴 High | Slack (@chairman) | Immediate |
| System Degraded | 🟡 Medium | Slack (#eng-ops) | 1 hour |
| CRM Sync Failure (3+ consecutive) | 🟡 Medium | Email (ops@company.com) | 4 hours |
| Retention Rate Decline (>15% MoM) | 🟡 Medium | Slack (#customer-success) | 1 week |
| Weekly At-Risk Digest | 🟢 Low | Email (success@company.com) | None (informational) |

**Evidence**: `05_professional-sop.md` Step 6 (alert configuration), `08_configurability-matrix.md` Category 3

---

## Sources Table

| Source | Repo | Commit | Path | Lines | Purpose |
|--------|------|--------|------|-------|---------|
| Health score metric | EHG_Engineer | 468a959 | docs/workflow/stages.yaml | 1440 | Canonical metric definition |
| Retention rate metric | EHG_Engineer | 468a959 | docs/workflow/stages.yaml | 1441 | Canonical metric definition |
| NPS metric | EHG_Engineer | 468a959 | docs/workflow/stages.yaml | 1442 | Canonical metric definition |
| Exit gates | EHG_Engineer | 468a959 | docs/workflow/stages.yaml | 1448-1450 | Completion criteria |
| Scoring SOP | Dossier | 6ef8cf4 | stage-32/05_professional-sop.md | Step 5 | Implementation details |
| Alert SOP | Dossier | 6ef8cf4 | stage-32/05_professional-sop.md | Step 6 | Notification setup |
| Campaign metrics | Dossier | 6ef8cf4 | stage-32/06_agent-orchestration.md | Agent 3 | Success criteria |
| System health | Dossier | 6ef8cf4 | stage-32/07_recursion-blueprint.md | RETENTION-004 | Monitoring logic |

---

**Next**: See `10_gaps-backlog.md` for identified gaps and proposed strategic directives.

<!-- Generated by Claude Code Phase 11 | EHG_Engineer@6ef8cf4 | 2025-11-06 -->
