# Stage 10: Metrics & Monitoring


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: database, unit, security, authentication

**Purpose**: Track Stage 10 performance, recursion patterns, technical quality
**Owner**: EXEC, CTO
**Dashboard Location**: `/ventures/analytics/stage-10`

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:423-426 "metrics definition"

---

## Core Metrics (from stages.yaml)

### 1. Technical Debt Score

**Definition**: Weighted composite score (0-100) measuring code quality issues
**Target**: ≤ 70 (above 70 triggers recursion advisory)
**Frequency**: Per technical review (Stage 10 execution)

**Components**:
- Code complexity (20%)
- Deprecated dependencies (30%)
- Missing tests (20%)
- Documentation gaps (10%)
- Security vulnerabilities (20%)

**Trend Analysis**: Track over time to identify improving vs degrading ventures

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:424 "Technical debt score"

---

### 2. Scalability Rating

**Definition**: 5-star rating for load handling capability
**Target**: ≥ 3 stars (below 3 stars triggers architecture re-evaluation)
**Frequency**: Per technical review (Stage 10 execution)

**Rating Scale**:
- 5 stars: Scales to 100x expected load (<10% cost increase)
- 4 stars: Scales to 50x expected load (<20% cost increase)
- 3 stars: Scales to 10x expected load (<30% cost increase)
- 2 stars: Scales to 5x expected load (significant cost)
- 1 star: Does not scale beyond 2x expected load

**Trend Analysis**: Track correlation with venture success rates

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:425 "Scalability rating"

---

### 3. Security Score

**Definition**: Weighted composite score (0-100) measuring security posture
**Target**: ≥ 60 (below 60 triggers HIGH severity recursion to Stage 8)
**Frequency**: Per technical review (Stage 10 execution)

**Components**:
- Authentication/Authorization (25%)
- Data protection (25%)
- Vulnerability management (20%)
- Compliance controls (15%)
- Security monitoring (15%)

**Trend Analysis**: Track compliance readiness over time

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:426 "Security score"

---

## Recursion Metrics

### TECH-001 Trigger Rate

**Definition**: Percentage of Stage 10 executions that trigger TECH-001 recursion
**Formula**: `(TECH-001 triggers / Stage 10 completions) × 100`
**Target**: < 20% (indicates good upstream quality from Stages 1-9)
**Frequency**: Daily, weekly, monthly rollups

**Breakdown By**:
- Target stage (3, 5, 7, 8)
- Severity (CRITICAL, HIGH)
- Venture type (STRATEGIC, EXPERIMENTAL, ENTERPRISE)

**SQL Query**:
```sql
-- Daily TECH-001 trigger rate
SELECT
  DATE(created_at) as review_date,
  COUNT(*) FILTER (WHERE recursion_triggered = true) as recursion_count,
  COUNT(*) as total_reviews,
  ROUND(100.0 * COUNT(*) FILTER (WHERE recursion_triggered = true) / COUNT(*), 2) as trigger_rate_pct
FROM stage_10_technical_reviews
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY review_date DESC;
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-10.md:34-41 "Recursion Triggers FROM This Stage"

---

### TECH-001 Trigger Breakdown

**Definition**: Distribution of TECH-001 triggers by target stage
**Targets**:
- Stage 8 (blocking issues): Expected majority (60-70%)
- Stage 7 (timeline): Expected minority (15-20%)
- Stage 5 (cost): Expected minority (10-15%)
- Stage 3 (infeasible): Expected rare (<5%)

**SQL Query**:
```sql
-- TECH-001 trigger breakdown by target stage
SELECT
  to_stage,
  COUNT(*) as trigger_count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as percentage
FROM recursion_events
WHERE from_stage = 10
  AND trigger_type = 'TECH-001'
  AND created_at >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY to_stage
ORDER BY trigger_count DESC;
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-10.md:34-41 "Recursion Triggers table"

---

### Recursion Resolution Time

**Definition**: Time from TECH-001 trigger to resolution (recursion completed)
**Target**: < 3 days (median)
**Frequency**: Per recursion event

**Breakdown By**:
- Severity (CRITICAL: <1 day, HIGH: <3 days)
- Target stage (Stage 8: <2 days, Stage 3: <4 days)
- Auto-executed vs Chairman approval

**SQL Query**:
```sql
-- Median recursion resolution time by severity
SELECT
  severity,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600) as median_hours,
  PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600) as p90_hours
FROM recursion_events
WHERE from_stage = 10
  AND trigger_type = 'TECH-001'
  AND resolved_at IS NOT NULL
  AND created_at >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY severity;
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-10.md:163-167 "Performance Requirements"

---

### Chairman Approval Rate

**Definition**: Percentage of HIGH severity TECH-001 triggers approved by Chairman
**Formula**: `(Approvals / Total HIGH severity triggers) × 100`
**Target**: > 70% (indicates accurate recursion detection)
**Frequency**: Weekly, monthly rollups

**Breakdown By**:
- Approval action (APPROVE, SIMPLIFY, ALLOCATE, ACCEPT_DEBT)
- Target stage

**SQL Query**:
```sql
-- Chairman approval rate for HIGH severity TECH-001
SELECT
  resolution_action,
  COUNT(*) as action_count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as percentage
FROM recursion_events
WHERE from_stage = 10
  AND trigger_type = 'TECH-001'
  AND severity = 'HIGH'
  AND created_at >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY resolution_action;
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-10.md:147-158 "HIGH severity, Review panel"

---

## Issue Categorization Metrics

### Blocking Issues by Category

**Definition**: Distribution of blocking issues by technical category
**Target**: Identify most common blockers for process improvement
**Frequency**: Monthly analysis

**Categories**: architecture, scalability, security, tech_debt

**SQL Query**:
```sql
-- Blocking issues by category (last 90 days)
SELECT
  issue_category,
  COUNT(*) as issue_count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as percentage,
  ARRAY_AGG(DISTINCT issue_description ORDER BY issue_description) FILTER (WHERE RANDOM() < 0.1) as sample_descriptions
FROM (
  SELECT
    venture_id,
    jsonb_array_elements(trigger_data->'blocking_issues') as blocking_issue
  FROM recursion_events
  WHERE from_stage = 10
    AND trigger_type = 'TECH-001'
    AND created_at >= CURRENT_DATE - INTERVAL '90 days'
) AS issues,
LATERAL (
  SELECT
    blocking_issue->>'category' as issue_category,
    blocking_issue->>'description' as issue_description
) AS parsed
GROUP BY issue_category
ORDER BY issue_count DESC;
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-10.md:59-63 "category: architecture, scalability, security"

---

## Performance Metrics

### Technical Review Duration

**Definition**: Time to complete all 4 substages (10.1-10.4)
**Target**: < 5 seconds (automated), < 2 hours (manual)
**Frequency**: Per technical review

**Breakdown By**:
- Substage (10.1 architecture: <2s, 10.2 scalability: <1s, 10.3 security: <1.5s, 10.4 planning: <0.5s)
- Automation level (Manual, Assisted, Auto)

**SQL Query**:
```sql
-- Technical review duration by substage
SELECT
  substage_id,
  substage_name,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_seconds) as median_duration_sec,
  PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY duration_seconds) as p90_duration_sec,
  MAX(duration_seconds) as max_duration_sec
FROM stage_10_substage_executions
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY substage_id, substage_name
ORDER BY substage_id;
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-10.md:163-167 "Technical review analysis: <5 seconds"

---

### Recursion Detection Latency

**Definition**: Time from technical review complete to recursion trigger (if applicable)
**Target**: < 100ms
**Frequency**: Per recursion event

**SQL Query**:
```sql
-- Recursion detection latency
SELECT
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY detection_latency_ms) as median_ms,
  PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY detection_latency_ms) as p90_ms,
  MAX(detection_latency_ms) as max_ms
FROM (
  SELECT
    venture_id,
    EXTRACT(EPOCH FROM (recursion_triggered_at - review_completed_at)) * 1000 as detection_latency_ms
  FROM stage_10_technical_reviews
  WHERE recursion_triggered = true
    AND created_at >= CURRENT_DATE - INTERVAL '30 days'
) AS latencies;
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-10.md:165 "Recursion detection: <100ms"

---

## Quality Metrics

### First-Pass Success Rate

**Definition**: Percentage of ventures that pass Stage 10 without triggering recursion
**Formula**: `((Stage 10 completions - TECH-001 triggers) / Stage 10 completions) × 100`
**Target**: > 80% (indicates good upstream quality)
**Frequency**: Weekly, monthly rollups

**SQL Query**:
```sql
-- First-pass success rate by venture type
SELECT
  v.venture_type,
  COUNT(*) FILTER (WHERE r.recursion_triggered = false) as first_pass_success,
  COUNT(*) as total_reviews,
  ROUND(100.0 * COUNT(*) FILTER (WHERE r.recursion_triggered = false) / COUNT(*), 2) as success_rate_pct
FROM stage_10_technical_reviews r
JOIN ventures v ON r.venture_id = v.id
WHERE r.created_at >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY v.venture_type
ORDER BY success_rate_pct DESC;
```

**Evidence**: (Derived from recursion trigger rate inverse)

---

### Exit Gate Pass Rate

**Definition**: Percentage of ventures that pass all 3 exit gates on first attempt
**Exit Gates**: Architecture approved, Feasibility confirmed, Tech debt acceptable
**Target**: > 85%
**Frequency**: Per technical review

**SQL Query**:
```sql
-- Exit gate pass rate
SELECT
  DATE(created_at) as review_date,
  COUNT(*) FILTER (WHERE architecture_approved AND feasibility_confirmed AND tech_debt_acceptable) as gates_passed,
  COUNT(*) as total_reviews,
  ROUND(100.0 * COUNT(*) FILTER (WHERE architecture_approved AND feasibility_confirmed AND tech_debt_acceptable) / COUNT(*), 2) as pass_rate_pct
FROM stage_10_technical_reviews
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY review_date DESC;
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:431-434 "exit: Architecture approved, Feasibility confirmed"

---

## Dashboard Visualizations

### Technical Health Dashboard

**Purpose**: Real-time view of Stage 10 technical review status
**URL**: `/ventures/analytics/stage-10/dashboard`

**Widgets**:

1. **Technical Debt Gauge**
   - Current venture's technical debt score (0-100)
   - Color: Green (<40), Yellow (40-70), Red (>70)
   - Trend: Sparkline showing last 5 reviews

2. **Security Score Gauge**
   - Current venture's security score (0-100)
   - Color: Green (>80), Yellow (60-80), Red (<60)
   - Breakdown: 5 components with individual scores

3. **Scalability Rating**
   - 5-star rating display
   - Load multiplier (e.g., "Scales to 50x expected load")
   - Cost efficiency (e.g., "20% cost increase at max load")

4. **Blocking Issues Count**
   - Total blocking issues
   - Breakdown by category (architecture, scalability, security, tech_debt)
   - Click to expand issue details

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-10.md:169-174 "Technical Health Dashboard"

---

### Recursion Analytics Dashboard

**Purpose**: Monitor recursion patterns and optimization opportunities
**URL**: `/ventures/analytics/stage-10/recursion`

**Charts**:

1. **TECH-001 Trigger Rate Trend**
   - Line chart: Daily trigger rate over 90 days
   - Target line: 20% threshold
   - Breakdown: By venture type (STRATEGIC, EXPERIMENTAL, ENTERPRISE)

2. **Recursion Target Distribution**
   - Pie chart: Percentage of recursions to each stage (3, 5, 7, 8)
   - Expected vs actual distribution

3. **Recursion Resolution Time**
   - Box plot: Resolution time distribution by severity
   - Median, P90 markers
   - Target lines: CRITICAL <1 day, HIGH <3 days

4. **Chairman Approval Breakdown**
   - Stacked bar chart: Approval actions (APPROVE, SIMPLIFY, ALLOCATE, ACCEPT_DEBT)
   - By month, showing trends

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-10.md:34-41 "Recursion Triggers table"

---

### Quality Trends Dashboard

**Purpose**: Track Stage 10 quality improvements over time
**URL**: `/ventures/analytics/stage-10/quality`

**Charts**:

1. **First-Pass Success Rate**
   - Line chart: Monthly success rate (% passing without recursion)
   - By venture type
   - Target line: 80%

2. **Technical Debt Score Trend**
   - Line chart: Average technical debt score over time
   - Breakdown by venture stage (Ideation, Planning, Execution)
   - Target line: 70

3. **Security Score Trend**
   - Line chart: Average security score over time
   - Breakdown by venture type
   - Target line: 60

4. **Scalability Rating Distribution**
   - Histogram: Count of ventures by star rating (1-5 stars)
   - Over time, showing shift toward higher ratings

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:423-426 "metrics definition"

---

## Alert Configuration

### Critical Alerts

| Alert | Condition | Severity | Notification Channel | Action Required |
|-------|-----------|----------|---------------------|------------------|
| **Solution Infeasible** | Feasibility < 0.5 | CRITICAL | Chairman, CTO | TECH-001 auto-triggered to Stage 3, review required |
| **Security Score Critical** | Security < 50 | CRITICAL | Security Team, CTO | Immediate security review, block progression |
| **Max Recursions Reached** | TECH-001 count ≥ 3 | CRITICAL | Chairman | Decision required: Simplify/Kill/Acquire/Accept |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-10.md:100-111 "solutionFeasibility < 0.5"

---

### Warning Alerts

| Alert | Condition | Severity | Notification Channel | Action Required |
|-------|-----------|----------|---------------------|------------------|
| **Technical Debt High** | Technical debt > 70 | WARNING | Engineering Manager | Consider refactoring in WBS |
| **Blocking Issues Detected** | Blocking issues ≥ 1 | WARNING | Chairman, CTO | TECH-001 triggered to Stage 8, approval needed |
| **Timeline Impact High** | Timeline impact > 30% | WARNING | Chairman, PM | TECH-001 triggered to Stage 7, timeline adjustment |
| **Cost Impact High** | Cost impact > 25% | WARNING | Chairman, CFO | TECH-001 triggered to Stage 5, financial update |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-10.md:115-125 "Recursion Thresholds"

---

### Performance Alerts

| Alert | Condition | Severity | Notification Channel | Action Required |
|-------|-----------|----------|---------------------|------------------|
| **Review Timeout** | Review duration > 10s | WARNING | DevOps | Performance degradation, investigate |
| **Recursion Detection Slow** | Detection latency > 200ms | WARNING | DevOps | Recursion engine performance issue |
| **Database Logging Backlog** | Async logging queue > 100 | WARNING | DevOps | Database performance issue |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-10.md:163-167 "Performance Requirements"

---

## Reporting

### Weekly Stage 10 Report

**Recipients**: CTO, Engineering Manager, Chairman
**Delivery**: Every Monday 9 AM

**Contents**:
1. **Summary Stats**
   - Total technical reviews completed
   - TECH-001 trigger rate (vs target 20%)
   - First-pass success rate (vs target 80%)
   - Average resolution time (vs target 3 days)

2. **Quality Metrics**
   - Average technical debt score (trend: ↑ or ↓)
   - Average security score (trend: ↑ or ↓)
   - Scalability rating distribution

3. **Recursion Analysis**
   - TECH-001 triggers by target stage
   - Chairman approval breakdown
   - Top 3 blocking issue categories

4. **Action Items**
   - Ventures with max recursions reached (require Chairman decision)
   - Ventures with critical security scores (require immediate attention)
   - Upstream quality improvements (recommendations for Stages 1-9)

---

### Monthly Stage 10 Retrospective

**Recipients**: All stakeholders
**Delivery**: First Friday of month

**Contents**:
1. **Month-over-Month Trends**
   - All key metrics with MoM % change
   - Significant improvements or regressions

2. **Process Improvements**
   - Configuration changes made this month
   - Impact of configuration changes on metrics
   - Proposed configuration changes for next month

3. **Lessons Learned**
   - Case studies: Ventures that triggered multiple recursions
   - Root cause analysis of common blocking issues
   - Best practices identified

---

<!-- Generated by Claude Code Phase 5 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
