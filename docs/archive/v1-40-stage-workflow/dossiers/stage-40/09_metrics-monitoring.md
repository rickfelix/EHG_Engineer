---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# Stage 40: Metrics & Monitoring


## Table of Contents

- [Primary Metrics (From stages.yaml)](#primary-metrics-from-stagesyaml)
  - [Metric 1: Growth Rate](#metric-1-growth-rate)
  - [Metric 2: Valuation](#metric-2-valuation)
  - [Metric 3: Exit Readiness Score](#metric-3-exit-readiness-score)
- [Secondary Metrics (Derived/Supporting)](#secondary-metrics-derivedsupporting)
  - [Supporting Metric: Cash Runway](#supporting-metric-cash-runway)
  - [Supporting Metric: Customer Concentration](#supporting-metric-customer-concentration)
  - [Supporting Metric: Team Retention Rate](#supporting-metric-team-retention-rate)
- [Monitoring Infrastructure](#monitoring-infrastructure)
  - [Real-Time Dashboard (Proposed)](#real-time-dashboard-proposed)
  - [Alert Configuration](#alert-configuration)
- [Historical Tracking](#historical-tracking)
- [Reporting Cadence](#reporting-cadence)
  - [Daily (Automated)](#daily-automated)
  - [Weekly (Automated)](#weekly-automated)
  - [Monthly (Semi-Automated + Manual)](#monthly-semi-automated-manual)
  - [Quarterly (Manual)](#quarterly-manual)
- [Metric Quality Assessment](#metric-quality-assessment)
- [Improvement Roadmap](#improvement-roadmap)
  - [Phase 1: Basic Tracking (Month 1-2)](#phase-1-basic-tracking-month-1-2)
  - [Phase 2: Alerting (Month 3-4)](#phase-2-alerting-month-3-4)
  - [Phase 3: Advanced Analytics (Month 5-6)](#phase-3-advanced-analytics-month-5-6)
  - [Phase 4: Automation (Month 7-12)](#phase-4-automation-month-7-12)
- [Sources Table](#sources-table)

**Source**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1808-1811

---

## Primary Metrics (From stages.yaml)

### Metric 1: Growth Rate

**Definition**: Year-over-year revenue/user growth percentage

**Formula**: `((Current Period - Previous Period) / Previous Period) * 100`

**Data Source**: `ventures` table, financial records

**Measurement Frequency**: Monthly (reported quarterly)

**Thresholds**:
- 🔴 **Critical**: <5% YoY (triggers growth strategy review)
- 🟡 **Warning**: 5-15% YoY (below target, monitor closely)
- 🟢 **Healthy**: 15-30% YoY (on track)
- 🔵 **Excellent**: >30% YoY (exceeding targets)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1808

**Proposed Query**:
```sql
SELECT
  id,
  title,
  ((current_metrics->>'revenue')::numeric - (previous_metrics->>'revenue')::numeric) /
    NULLIF((previous_metrics->>'revenue')::numeric, 0) * 100 AS growth_rate_pct
FROM ventures
WHERE current_workflow_stage = 40
  AND id = [VENTURE_ID];
```

**Dashboard Visualization**: Line chart with 12-month rolling window, threshold markers

---

### Metric 2: Valuation

**Definition**: Current estimated venture value (in millions)

**Calculation Methods**:
1. **Revenue Multiple**: Current ARR × Industry Multiple (3-10x)
2. **DCF Model**: Discounted cash flow analysis
3. **Comparable Transactions**: Similar company acquisitions
4. **Book Value**: Assets - Liabilities (floor valuation)

**Data Source**: Financial models, market comparables, investor feedback

**Measurement Frequency**: Quarterly (or on significant events)

**Thresholds**:
- 🔴 **Critical**: >15% decline in single quarter (investigate immediately)
- 🟡 **Warning**: 5-15% decline (monitor trends)
- 🟢 **Stable**: ±5% change (normal fluctuation)
- 🔵 **Excellent**: >15% increase (capitalize on momentum)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1809

**Proposed Query**:
```sql
SELECT
  id,
  title,
  (current_metrics->>'valuation')::numeric AS current_valuation_usd,
  (current_metrics->>'valuation')::numeric -
    (previous_metrics->>'valuation')::numeric AS valuation_change_usd,
  ((current_metrics->>'valuation')::numeric -
    (previous_metrics->>'valuation')::numeric) /
    NULLIF((previous_metrics->>'valuation')::numeric, 0) * 100 AS valuation_change_pct
FROM ventures
WHERE current_workflow_stage = 40
  AND id = [VENTURE_ID];
```

**Dashboard Visualization**: Gauge chart with target zones, historical trend line

---

### Metric 3: Exit Readiness Score

**Definition**: Composite score measuring preparedness for exit transaction (0-100)

**Components**:
1. **Financial Readiness** (30%): Clean financials, audit-ready books, positive cash flow
2. **Operational Maturity** (25%): Documented processes, scalable operations, minimal founder dependency
3. **Legal/IP Compliance** (20%): Clear ownership, contracts in order, no litigation
4. **Market Positioning** (15%): Competitive advantage, customer retention, growth trajectory
5. **Due Diligence Prep** (10%): Data room complete, materials organized, questions anticipated

**Data Source**: Checklist completion, document audits, advisor assessments

**Measurement Frequency**: Monthly (updated as items completed)

**Thresholds**:
- 🔴 **Not Ready**: <70 (significant gaps, exit not advisable)
- 🟡 **Approaching Ready**: 70-85 (minor gaps, continue preparation)
- 🟢 **Ready**: 85-95 (exit-ready, opportunistic timing)
- 🔵 **Optimal**: >95 (fully prepared, proactive outreach)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1810

**Proposed Query**:
```sql
SELECT
  id,
  title,
  (current_metrics->>'exit_readiness_score')::numeric AS exit_readiness_score,
  (current_metrics->>'exit_readiness_components')::jsonb AS component_scores
FROM ventures
WHERE current_workflow_stage = 40
  AND id = [VENTURE_ID];
```

**Dashboard Visualization**: Radial/spider chart showing 5 components, overall score gauge

---

## Secondary Metrics (Derived/Supporting)

### Supporting Metric: Cash Runway

**Definition**: Months of operation funded by current cash reserves

**Formula**: `Current Cash / Monthly Burn Rate`

**Why Track**: Critical for exit timing (longer runway = stronger negotiating position)

**Threshold**: 🟢 >12 months (safe), 🟡 6-12 months (monitor), 🔴 <6 months (urgent)

---

### Supporting Metric: Customer Concentration

**Definition**: Percentage of revenue from top 3 customers

**Formula**: `(Top 3 Customer Revenue / Total Revenue) * 100`

**Why Track**: Affects valuation (high concentration = risk discount)

**Threshold**: 🟢 <30% (diversified), 🟡 30-50% (moderate risk), 🔴 >50% (concentrated)

---

### Supporting Metric: Team Retention Rate

**Definition**: Percentage of key team members retained over 12 months

**Formula**: `(Employees at Year End / Employees at Year Start) * 100`

**Why Track**: Buyer concern (high turnover = integration risk)

**Threshold**: 🟢 >85% (stable), 🟡 70-85% (acceptable), 🔴 <70% (concerning)

---

## Monitoring Infrastructure

### Real-Time Dashboard (Proposed)

**Platform**: Grafana, Metabase, or custom React dashboard

**Data Pipeline**:
1. **Source**: `ventures` table, financial systems, CRM
2. **ETL**: Nightly batch + real-time critical metrics
3. **Storage**: TimescaleDB or metrics table
4. **Visualization**: Dashboard with drill-down capabilities

**Dashboard Sections**:
- **Overview**: 3 primary metrics, current substage, days in Stage 40
- **Growth**: Revenue/user trends, growth initiatives status, ROI tracking
- **Exit**: Buyer pipeline, due diligence checklist, market timing indicators
- **Alerts**: Active warnings, escalations, Chairman action items

---

### Alert Configuration

**Alert Channels**:
- 🔴 **Critical**: SMS + Email to Chairman (immediate action required)
- 🟡 **Warning**: Email to Chairman + Dashboard notification (review within 24h)
- 🔵 **Info**: Dashboard notification only (FYI, no action needed)

**Alert Rules**:

```yaml
alerts:
  - name: Growth Rate Critical
    condition: growth_rate < 5% AND months_in_stage_40 > 6
    severity: critical
    channel: sms_email
    message: "Growth rate below 5% YoY - immediate strategy review required"

  - name: Valuation Decline
    condition: valuation_change_pct < -15%
    severity: critical
    channel: sms_email
    message: "Valuation dropped 15%+ - investigate causes immediately"

  - name: Exit Readiness Achieved
    condition: exit_readiness_score >= 90
    severity: info
    channel: dashboard
    message: "Exit readiness achieved - consider proactive buyer outreach"

  - name: Cash Runway Low
    condition: cash_runway_months < 6
    severity: warning
    channel: email
    message: "Cash runway <6 months - review burn rate or accelerate exit"
```

---

## Historical Tracking

**Data Retention**: 5 years (full venture lifecycle + post-exit analysis)

**Storage Schema**:
```sql
CREATE TABLE venture_metrics_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID REFERENCES ventures(id),
  recorded_at TIMESTAMPTZ DEFAULT NOW(),
  workflow_stage INTEGER,
  growth_rate NUMERIC(5,2),
  valuation_usd NUMERIC(12,2),
  exit_readiness_score INTEGER,
  additional_metrics JSONB,
  notes TEXT
);

CREATE INDEX idx_metrics_venture_time
  ON venture_metrics_history(venture_id, recorded_at DESC);
```

**Use Cases**:
1. **Trend Analysis**: Identify patterns across multiple ventures
2. **Benchmarking**: Compare current venture to historical performance
3. **Predictive Modeling**: Train ML models for exit timing optimization
4. **Post-Exit Review**: Analyze what led to successful exits

---

## Reporting Cadence

### Daily (Automated)
- Dashboard refresh
- Critical alerts (if triggered)

### Weekly (Automated)
- Growth Management Specialist summary
- Active initiative status updates

### Monthly (Semi-Automated + Manual)
- Chairman report (1-page summary)
- Metrics trend analysis
- Exit Preparation Advisor assessment

### Quarterly (Manual)
- Comprehensive Stage 40 review
- Strategic planning session
- Configuration adjustment (if needed)

---

## Metric Quality Assessment

| Metric | Implementation Status | Data Availability | Calculation Complexity | Evidence Quality |
|--------|----------------------|-------------------|------------------------|------------------|
| Growth Rate | ⚠️ Proposed | 🟢 High (financial records) | 🟢 Low (simple formula) | 🟢 High |
| Valuation | ⚠️ Proposed | 🟡 Medium (manual updates) | 🟡 Medium (models required) | 🟡 Medium |
| Exit Readiness Score | ⚠️ Proposed | 🔴 Low (checklist not built) | 🟡 Medium (weighted scoring) | 🟡 Medium |

**Overall Metrics Status**: ⚠️ **Proposed but Not Implemented**

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-40.md:37-40 (Missing threshold values, measurement frequency)

---

## Improvement Roadmap

### Phase 1: Basic Tracking (Month 1-2)
- [ ] Add `current_metrics` JSONB column to `ventures` table
- [ ] Implement Growth Rate calculation
- [ ] Create simple dashboard with 3 primary metrics

### Phase 2: Alerting (Month 3-4)
- [ ] Configure alert rules
- [ ] Set up notification channels (email, SMS)
- [ ] Test critical alert workflow

### Phase 3: Advanced Analytics (Month 5-6)
- [ ] Implement historical tracking table
- [ ] Build trend analysis reports
- [ ] Create predictive models for exit timing

### Phase 4: Automation (Month 7-12)
- [ ] Integrate VentureActiveCrew agent outputs
- [ ] Automate metric collection from external systems
- [ ] Enable Chairman self-service analytics

---

## Sources Table

| Source | Repo | Commit | Path | Lines |
|--------|------|--------|------|-------|
| Primary metrics | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1808-1811 |
| Metrics gap | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-40.md | 37-40 |
| Substage 40.1 (growth) | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1820-1826 |
| Substage 40.2 (exit) | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1827-1832 |

<!-- Generated by Claude Code Phase 13 | EHG_Engineer@6ef8cf4 | 2025-11-06 -->
