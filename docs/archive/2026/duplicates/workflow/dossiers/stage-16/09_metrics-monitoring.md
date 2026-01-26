<!-- ARCHIVED: 2026-01-26T16:26:51.723Z
     Reason: Duplicate of canonical file
     Original location: docs\workflow\dossiers\stage-16\09_metrics-monitoring.md
     See: docs/fixes/duplicate-consolidation-manifest.json for details
-->

# Stage 16 Metrics & Monitoring


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: database, api, security, feature

## Overview

This document defines KPIs, monitoring queries, dashboard specifications, and alerting rules for Stage 16 (AI CEO Agent Development). It provides comprehensive observability for AI CEO performance, safety, and operational health.

**Stage**: 16 - AI CEO Agent Development
**Owner**: EVA (AI Agent Owner)
**Monitoring Philosophy**: Proactive detection and automated response

Evidence: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:713 "Oversight configured"

---

## Key Performance Indicators (KPIs)

### Primary Metrics (Stage Definition)

Evidence: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:702-705 "metrics: Decision accuracy, Automation rate, S"

#### 1. Decision Accuracy

**Definition**: Percentage of AI CEO decisions that align with expected/optimal outcomes

**Measurement**:
```sql
-- Decision accuracy by stakes level (PostgreSQL)
SELECT
  stakes_level,
  COUNT(CASE WHEN decision_correct = TRUE THEN 1 END)::FLOAT /
  COUNT(*)::FLOAT * 100 AS accuracy_percentage
FROM ai_ceo_decisions
WHERE decision_timestamp >= NOW() - INTERVAL '7 days'
GROUP BY stakes_level;
```

**Target Thresholds**:
- High stakes decisions: ≥90%
- Medium stakes decisions: ≥80%
- Low stakes decisions: ≥70%

**Collection Frequency**: Real-time (per decision)
**Aggregation Intervals**: 1 hour, 1 day, 7 days, 30 days
**Alert Conditions**:
- Warning: Accuracy < 85% (high), <75% (medium), <65% (low) for 24 hours
- Critical: Accuracy < 80% (high), <70% (medium), <60% (low) for 24 hours

**Dashboard Widget**: Line chart showing accuracy over time by stakes level

Evidence: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:703 "Decision accuracy"

#### 2. Automation Rate

**Definition**: Percentage of decisions made autonomously without human intervention

**Measurement**:
```sql
-- Automation rate by decision type (PostgreSQL)
SELECT
  decision_type,
  COUNT(CASE WHEN decision_mode = 'autonomous' THEN 1 END)::FLOAT /
  COUNT(*)::FLOAT * 100 AS automation_rate_percentage
FROM ai_ceo_decisions
WHERE decision_timestamp >= NOW() - INTERVAL '7 days'
GROUP BY decision_type;
```

**Target Threshold**: ≥80%

**Collection Frequency**: Real-time (per decision)
**Aggregation Intervals**: 1 hour, 1 day, 7 days, 30 days
**Alert Conditions**:
- Warning: Automation rate < 75% for 48 hours
- Critical: Automation rate < 65% for 48 hours

**Dashboard Widget**: Gauge showing current automation rate vs. 80% target

Evidence: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:704 "Automation rate"
Evidence: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-16.md:34 "Target State: 80% automation"

#### 3. Strategic Alignment

**Definition**: Correlation between AI CEO decisions and business strategy objectives

**Measurement**:
```sql
-- Strategic alignment score (PostgreSQL)
SELECT
  AVG(strategic_alignment_score) AS avg_alignment_score,
  STDDEV(strategic_alignment_score) AS alignment_stddev
FROM ai_ceo_decisions
WHERE decision_timestamp >= NOW() - INTERVAL '30 days';
```

**Target Threshold**: ≥85% (≥0.85 alignment score)

**Collection Frequency**: Daily (computed per decision, aggregated daily)
**Aggregation Intervals**: 1 day, 7 days, 30 days, 90 days
**Alert Conditions**:
- Warning: Alignment < 80% for 7 days
- Critical: Alignment < 75% for 7 days

**Dashboard Widget**: Bar chart showing alignment by strategic objective

Evidence: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:705 "Strategic alignment"

---

### Secondary Metrics (Operational Health)

#### 4. Decision Latency

**Definition**: Time from decision request to decision response (milliseconds)

**Measurement**:
```sql
-- Decision latency percentiles (PostgreSQL)
SELECT
  PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY decision_latency_ms) AS p50_latency_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY decision_latency_ms) AS p95_latency_ms,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY decision_latency_ms) AS p99_latency_ms
FROM ai_ceo_decisions
WHERE decision_timestamp >= NOW() - INTERVAL '1 hour';
```

**Target Thresholds**:
- P50: <500ms
- P95: <2000ms (2 seconds)
- P99: <5000ms (5 seconds)

**Collection Frequency**: Real-time (per decision)
**Aggregation Intervals**: 1 minute, 5 minutes, 1 hour
**Alert Conditions**:
- Warning: P95 > 2500ms for 10 minutes
- Critical: P95 > 5000ms for 10 minutes

**Dashboard Widget**: Line chart showing P50, P95, P99 latency over time

#### 5. Decision Volume

**Definition**: Number of decisions made per hour/day

**Measurement**:
```sql
-- Decision volume over time (PostgreSQL)
SELECT
  DATE_TRUNC('hour', decision_timestamp) AS hour,
  COUNT(*) AS decision_count
FROM ai_ceo_decisions
WHERE decision_timestamp >= NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour;
```

**Target**: Based on business requirements (e.g., 100-1000 decisions/hour)

**Collection Frequency**: Real-time (count per decision)
**Aggregation Intervals**: 1 hour, 1 day, 7 days
**Alert Conditions**:
- Warning: Volume deviates >50% from historical average
- Critical: Volume drops to 0 (system down)

**Dashboard Widget**: Area chart showing decision volume over time

#### 6. Error Rate

**Definition**: Percentage of decisions that result in errors or exceptions

**Measurement**:
```sql
-- Error rate by error type (PostgreSQL)
SELECT
  error_type,
  COUNT(*)::FLOAT / (SELECT COUNT(*) FROM ai_ceo_decisions WHERE decision_timestamp >= NOW() - INTERVAL '1 hour')::FLOAT * 100 AS error_rate_percentage
FROM ai_ceo_decisions
WHERE decision_timestamp >= NOW() - INTERVAL '1 hour'
  AND error_occurred = TRUE
GROUP BY error_type;
```

**Target Threshold**: <5% overall error rate

**Collection Frequency**: Real-time (per decision)
**Aggregation Intervals**: 5 minutes, 1 hour, 1 day
**Alert Conditions**:
- Warning: Error rate > 5% for 10 minutes
- Critical: Error rate > 10% for 10 minutes (triggers circuit breaker)

**Dashboard Widget**: Stacked bar chart showing errors by type

Evidence: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:732 "Failsafes verified"

#### 7. Escalation Rate

**Definition**: Percentage of decisions escalated to humans

**Measurement**:
```sql
-- Escalation rate by reason (PostgreSQL)
SELECT
  escalation_reason,
  COUNT(*)::FLOAT / (SELECT COUNT(*) FROM ai_ceo_decisions WHERE decision_timestamp >= NOW() - INTERVAL '1 day')::FLOAT * 100 AS escalation_rate_percentage
FROM ai_ceo_decisions
WHERE decision_timestamp >= NOW() - INTERVAL '1 day'
  AND escalated = TRUE
GROUP BY escalation_reason;
```

**Target Threshold**: <20% (inverse of 80% automation rate)

**Collection Frequency**: Real-time (per decision)
**Aggregation Intervals**: 1 hour, 1 day, 7 days
**Alert Conditions**:
- Warning: Escalation rate > 25% for 48 hours
- Critical: Escalation rate > 35% for 48 hours

**Dashboard Widget**: Pie chart showing escalation reasons

---

### Safety Metrics (Failsafes)

#### 8. Circuit Breaker Activations

**Definition**: Count of circuit breaker triggers

**Measurement**:
```sql
-- Circuit breaker activation count (PostgreSQL)
SELECT
  circuit_breaker_id,
  COUNT(*) AS activation_count,
  MAX(activation_timestamp) AS last_activation
FROM circuit_breaker_events
WHERE activation_timestamp >= NOW() - INTERVAL '24 hours'
GROUP BY circuit_breaker_id;
```

**Target Threshold**: <1 activation per week

**Collection Frequency**: Real-time (per activation)
**Aggregation Intervals**: 1 hour, 1 day, 7 days
**Alert Conditions**:
- Warning: 1+ activation in 24 hours
- Critical: 3+ activations in 24 hours

**Dashboard Widget**: Table showing circuit breaker status and last activation

Evidence: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:732 "Failsafes verified"

#### 9. Constraint Violations

**Definition**: Count of constraint violations (hard and soft)

**Measurement**:
```sql
-- Constraint violations by type (PostgreSQL)
SELECT
  constraint_id,
  constraint_type,
  COUNT(*) AS violation_count
FROM constraint_violations
WHERE violation_timestamp >= NOW() - INTERVAL '7 days'
GROUP BY constraint_id, constraint_type
ORDER BY violation_count DESC;
```

**Target Threshold**: 0 hard constraint violations, <10 soft constraint warnings per day

**Collection Frequency**: Real-time (per violation)
**Aggregation Intervals**: 1 day, 7 days, 30 days
**Alert Conditions**:
- Warning: >10 soft violations in 1 day
- Critical: ANY hard constraint violation (immediate block)

**Dashboard Widget**: Bar chart showing violations by constraint type

Evidence: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:720 "Constraints configured"

#### 10. Model Drift Detection

**Definition**: Statistical distance between current data distribution and training data

**Measurement**:
```python
# Python code for model drift detection (not SQL)
from scipy.stats import ks_2samp

# Compare current week vs. training data distributions
current_data = get_decision_features(days=7)
training_data = get_training_features()

# Kolmogorov-Smirnov test for each feature
drift_scores = {}
for feature in features:
    ks_stat, p_value = ks_2samp(training_data[feature], current_data[feature])
    drift_scores[feature] = ks_stat

# Alert if significant drift detected
if max(drift_scores.values()) > 0.3:  # Threshold
    trigger_model_retraining()
```

**Target Threshold**: KS statistic <0.3 (no significant drift)

**Collection Frequency**: Daily
**Aggregation Intervals**: 1 day, 7 days, 30 days
**Alert Conditions**:
- Warning: KS stat > 0.2 for 7 days
- Critical: KS stat > 0.3 for 7 days (triggers retraining)

**Dashboard Widget**: Heatmap showing drift scores by feature

Evidence: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:725 "Decision models trained"

---

## Dashboard Specifications

### Dashboard 1: AI CEO Executive Summary

**Purpose**: High-level overview for executives and stakeholders

**Widgets**:
1. **Decision Accuracy Gauge** (high/medium/low stakes) - Current vs. Target
2. **Automation Rate Gauge** - Current vs. 80% target
3. **Strategic Alignment Gauge** - Current vs. 85% target
4. **Decision Volume Line Chart** - Last 7 days
5. **Error Rate Trend** - Last 24 hours
6. **Circuit Breaker Status Table** - Current status (green/yellow/red)

**Refresh Rate**: 1 minute
**Access**: Public (all team members)

**Implementation** (Grafana JSON):
```json
{
  "dashboard": {
    "title": "AI CEO Executive Summary",
    "panels": [
      {
        "type": "gauge",
        "title": "Decision Accuracy (High Stakes)",
        "targets": [{"expr": "ai_ceo_decision_accuracy{stakes='high'}"}],
        "threshold": {"mode": "absolute", "steps": [{"value": 0, "color": "red"}, {"value": 0.85, "color": "yellow"}, {"value": 0.90, "color": "green"}]}
      }
      // ... additional panels
    ]
  }
}
```

### Dashboard 2: AI CEO Operational Metrics

**Purpose**: Detailed operational monitoring for AI operations team

**Widgets**:
1. **Decision Latency Percentiles** (P50, P95, P99) - Last 24 hours
2. **Decision Volume by Type** - Stacked area chart
3. **Error Rate by Type** - Stacked bar chart
4. **Escalation Rate by Reason** - Pie chart
5. **Model Inference Time** - Histogram
6. **API Response Times** - Line chart (by API endpoint)
7. **Database Query Performance** - Table (slowest queries)
8. **Memory/CPU Usage** - Line chart

**Refresh Rate**: 30 seconds
**Access**: AI Operations Team

### Dashboard 3: AI CEO Safety & Compliance

**Purpose**: Safety monitoring and compliance verification

**Widgets**:
1. **Circuit Breaker Activations** - Timeline with annotations
2. **Constraint Violations** - Table (ordered by severity)
3. **Failsafe Test Results** - Status table (last test date, pass/fail)
4. **Model Drift Detection** - Heatmap (features vs. drift score)
5. **Bias Detection Scores** - Bar chart (by demographic/category)
6. **Audit Log Sample** - Table (recent high-stakes decisions)
7. **Security Alerts** - Timeline (access violations, anomalies)

**Refresh Rate**: 5 minutes
**Access**: Security/Compliance Team

Evidence: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:713 "Oversight configured"

---

## Alerting Rules

### Alert Channels

**Email**: For non-urgent warnings and daily summaries
**Slack**: For real-time warnings and critical alerts
**PagerDuty**: For critical alerts requiring immediate response

### Alert Definitions

#### Alert 1: Decision Accuracy Degradation

**Condition**:
```yaml
alert: AIDecisionAccuracyLow
expr: ai_ceo_decision_accuracy{stakes="high"} < 0.85
for: 24h
labels:
  severity: warning
annotations:
  summary: "High stakes decision accuracy below threshold"
  description: "Accuracy: {{ $value }}% (target: ≥90%)"
actions:
  - send_email: ["ai-ops-team@example.com"]
  - send_slack: ["#ai-ceo-alerts"]
```

**Escalation**: If accuracy <80% for 24h, escalate to PagerDuty

Evidence: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:703 "Decision accuracy"

#### Alert 2: Automation Rate Decline

**Condition**:
```yaml
alert: AIAutomationRateLow
expr: ai_ceo_automation_rate < 0.75
for: 48h
labels:
  severity: warning
annotations:
  summary: "Automation rate below target"
  description: "Current: {{ $value }}% (target: ≥80%)"
actions:
  - send_email: ["ai-ops-team@example.com"]
  - send_slack: ["#ai-ceo-alerts"]
```

**Escalation**: If automation rate <65% for 48h, escalate to PagerDuty

Evidence: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:704 "Automation rate"

#### Alert 3: Circuit Breaker Activated

**Condition**:
```yaml
alert: AICircuitBreakerActivated
expr: increase(ai_ceo_circuit_breaker_activations[1h]) > 0
for: 0s  # Immediate alert
labels:
  severity: critical
annotations:
  summary: "Circuit breaker activated - AI CEO stopped"
  description: "Circuit breaker {{ $labels.circuit_breaker_id }} triggered"
actions:
  - send_pagerduty: ["ai-ceo-oncall"]
  - send_slack: ["#ai-ceo-critical"]
  - execute_runbook: ["circuit-breaker-response.md"]
```

**Escalation**: Immediate PagerDuty alert, execute emergency runbook

Evidence: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:732 "Failsafes verified"

#### Alert 4: High Error Rate

**Condition**:
```yaml
alert: AIHighErrorRate
expr: ai_ceo_error_rate > 0.10
for: 10m
labels:
  severity: critical
annotations:
  summary: "Error rate exceeds threshold"
  description: "Error rate: {{ $value }}% (threshold: 10%)"
actions:
  - send_pagerduty: ["ai-ceo-oncall"]
  - send_slack: ["#ai-ceo-critical"]
  - auto_action: ["trigger_circuit_breaker"]
```

**Escalation**: Automatic circuit breaker trigger at 10% error rate

#### Alert 5: Model Drift Detected

**Condition**:
```yaml
alert: AIModelDriftDetected
expr: ai_ceo_model_drift_score > 0.3
for: 7d
labels:
  severity: warning
annotations:
  summary: "Significant model drift detected"
  description: "KS stat: {{ $value }} (threshold: 0.3)"
actions:
  - send_email: ["ai-ops-team@example.com", "data-science-team@example.com"]
  - send_slack: ["#ai-ceo-alerts"]
  - auto_action: ["schedule_model_retraining"]
```

**Escalation**: Automatic model retraining scheduled (Trigger AI-001)

Evidence: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:725 "Decision models trained"

---

## Monitoring Queries Library

### Query 1: Decision Accuracy Trend

**Purpose**: Track decision accuracy over time

```sql
-- PostgreSQL query
SELECT
  DATE_TRUNC('day', decision_timestamp) AS day,
  stakes_level,
  AVG(CASE WHEN decision_correct THEN 1 ELSE 0 END) * 100 AS accuracy_percentage
FROM ai_ceo_decisions
WHERE decision_timestamp >= NOW() - INTERVAL '30 days'
GROUP BY day, stakes_level
ORDER BY day, stakes_level;
```

**Output**: Daily accuracy by stakes level (last 30 days)

### Query 2: Automation Rate by Decision Type

**Purpose**: Identify decision types with low automation

```sql
-- PostgreSQL query
SELECT
  decision_type,
  COUNT(*) AS total_decisions,
  COUNT(CASE WHEN decision_mode = 'autonomous' THEN 1 END) AS autonomous_decisions,
  COUNT(CASE WHEN decision_mode = 'autonomous' THEN 1 END)::FLOAT / COUNT(*)::FLOAT * 100 AS automation_rate_percentage
FROM ai_ceo_decisions
WHERE decision_timestamp >= NOW() - INTERVAL '7 days'
GROUP BY decision_type
ORDER BY automation_rate_percentage ASC;
```

**Output**: Automation rate by decision type (sorted lowest first)

### Query 3: Top Escalation Reasons

**Purpose**: Identify why decisions are being escalated

```sql
-- PostgreSQL query
SELECT
  escalation_reason,
  COUNT(*) AS escalation_count,
  COUNT(*)::FLOAT / (SELECT COUNT(*) FROM ai_ceo_decisions WHERE escalated = TRUE AND decision_timestamp >= NOW() - INTERVAL '7 days')::FLOAT * 100 AS percentage_of_escalations
FROM ai_ceo_decisions
WHERE escalated = TRUE
  AND decision_timestamp >= NOW() - INTERVAL '7 days'
GROUP BY escalation_reason
ORDER BY escalation_count DESC
LIMIT 10;
```

**Output**: Top 10 escalation reasons (last 7 days)

### Query 4: Decision Latency by Stakes Level

**Purpose**: Understand performance characteristics

```sql
-- PostgreSQL query
SELECT
  stakes_level,
  PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY decision_latency_ms) AS p50_latency_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY decision_latency_ms) AS p95_latency_ms,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY decision_latency_ms) AS p99_latency_ms,
  AVG(decision_latency_ms) AS avg_latency_ms
FROM ai_ceo_decisions
WHERE decision_timestamp >= NOW() - INTERVAL '24 hours'
GROUP BY stakes_level;
```

**Output**: Latency percentiles by stakes level (last 24 hours)

### Query 5: Constraint Violation Analysis

**Purpose**: Identify frequent constraint violations

```sql
-- PostgreSQL query
SELECT
  constraint_id,
  constraint_type,
  COUNT(*) AS violation_count,
  MAX(violation_timestamp) AS last_violation,
  COUNT(DISTINCT decision_id) AS affected_decisions
FROM constraint_violations
WHERE violation_timestamp >= NOW() - INTERVAL '30 days'
GROUP BY constraint_id, constraint_type
ORDER BY violation_count DESC;
```

**Output**: Constraint violations summary (last 30 days)

Evidence: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:720 "Constraints configured"

---

## Metrics Storage & Retention

### Time-Series Database (Prometheus)

**Metrics Stored**:
- Decision accuracy (by stakes level)
- Automation rate (by decision type)
- Decision latency (percentiles)
- Error rate (by error type)
- Circuit breaker activations
- Constraint violations

**Retention Policy**:
- Raw data: 15 days
- 1-minute aggregates: 30 days
- 5-minute aggregates: 90 days
- 1-hour aggregates: 1 year
- 1-day aggregates: Forever

### Relational Database (PostgreSQL)

**Tables**:
- `ai_ceo_decisions`: Full decision records (all attributes)
- `circuit_breaker_events`: Circuit breaker activations
- `constraint_violations`: Constraint violation events
- `model_training_runs`: Model training metadata and results
- `audit_log`: Audit trail for compliance

**Retention Policy**:
- Hot storage (SSD): 90 days
- Warm storage (HDD): 1 year
- Cold storage (S3): Forever (compressed)

### Log Aggregation (ELK Stack)

**Logs Stored**:
- Decision request/response logs
- Model inference logs
- Integration API logs (database, external APIs)
- Error and exception logs
- Security audit logs

**Retention Policy**:
- Hot storage: 30 days
- Warm storage: 90 days
- Cold storage: 1 year

---

## Monitoring Best Practices

### 1. Proactive vs. Reactive Monitoring

**Proactive**: Use leading indicators (model drift, soft constraint warnings) to prevent issues
**Reactive**: Use lagging indicators (error rate, circuit breaker activations) to detect issues

**Balance**: 70% proactive, 30% reactive

### 2. Alert Fatigue Prevention

**Techniques**:
- Set appropriate thresholds (not too sensitive)
- Use time windows (e.g., `for: 24h`) to avoid transient alerts
- Group related alerts (consolidate similar alerts)
- Use severity levels (warning vs. critical)
- Implement alert suppression during maintenance windows

### 3. Dashboard Usability

**Principles**:
- Most important metrics at the top (decision accuracy, automation rate, strategic alignment)
- Use color coding (green/yellow/red) for quick status assessment
- Include context (targets, thresholds) on all widgets
- Provide drill-down capabilities (click to see details)

### 4. Continuous Improvement

**Process**:
1. Review metrics weekly (AI operations team meeting)
2. Identify trends and anomalies
3. Adjust thresholds and alerts based on operational experience
4. Add new metrics as needed
5. Deprecate unused or misleading metrics

---

## Runbooks for Common Scenarios

### Runbook: Decision Accuracy Degradation

**Trigger**: Alert "AIDecisionAccuracyLow" fires

**Steps**:
1. Check dashboard for accuracy trend (is it gradual or sudden?)
2. Query top error reasons: Run Query 2 (automation rate by decision type)
3. Investigate model drift: Check model drift detection dashboard
4. If drift detected: Schedule model retraining (Trigger AI-001)
5. If no drift: Investigate data quality issues or business context changes
6. Document findings and actions taken

### Runbook: Circuit Breaker Activated

**Trigger**: Alert "AICircuitBreakerActivated" fires

**Steps**:
1. **IMMEDIATE**: Verify AI CEO has stopped making autonomous decisions
2. Check error logs for root cause (last 1 hour)
3. Identify pattern: Specific decision type? API failure? Data issue?
4. If transient issue (e.g., API downtime): Wait for cooldown, resume
5. If systemic issue: Revert to previous stable version, investigate
6. Execute Stage 16.1 (tighten constraints) and 16.2 (retrain) if needed
7. Document incident in post-mortem

Evidence: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:732 "Failsafes verified"

### Runbook: High Error Rate

**Trigger**: Alert "AIHighErrorRate" fires

**Steps**:
1. Check if circuit breaker has triggered (should auto-trigger at 10%)
2. Query error breakdown: Run Query (error rate by type)
3. Identify dominant error type (API failure, validation error, timeout, etc.)
4. For API failures: Check external API status pages
5. For validation errors: Review recent constraint or model changes
6. For timeouts: Check database and API latency
7. Implement hotfix if possible, otherwise schedule recursion
8. Monitor error rate after fix (should drop below 5%)

---

<!-- Generated by Claude Code Phase 7 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
