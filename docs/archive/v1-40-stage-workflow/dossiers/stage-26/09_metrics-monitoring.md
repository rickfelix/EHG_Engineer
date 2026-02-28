---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# Stage 26: Metrics & Monitoring


## Table of Contents

- [Defined Metrics](#defined-metrics)
- [Extended Metrics (Proposed)](#extended-metrics-proposed)
  - [Security Testing Metrics](#security-testing-metrics)
  - [Compliance Validation Metrics](#compliance-validation-metrics)
  - [Certification Process Metrics](#certification-process-metrics)
  - [Recursion Metrics](#recursion-metrics)
- [Database Schema (Proposed)](#database-schema-proposed)
  - [Table: `stage_26_metrics`](#table-stage_26_metrics)
  - [Table: `vulnerability_tracking`](#table-vulnerability_tracking)
- [Supabase Queries](#supabase-queries)
  - [Query 1: Get Security Score for Venture](#query-1-get-security-score-for-venture)
  - [Query 2: Get Compliance Rate for Venture](#query-2-get-compliance-rate-for-venture)
  - [Query 3: Get Open Vulnerabilities by Severity](#query-3-get-open-vulnerabilities-by-severity)
  - [Query 4: Get Average Time to Remediate](#query-4-get-average-time-to-remediate)
  - [Query 5: Get Metrics History](#query-5-get-metrics-history)
  - [Query 6: Get Expiring Certificates](#query-6-get-expiring-certificates)
  - [Query 7: Validate Exit Gates](#query-7-validate-exit-gates)
- [Dashboards](#dashboards)
  - [Dashboard 1: Security Overview](#dashboard-1-security-overview)
  - [Dashboard 2: Compliance Status](#dashboard-2-compliance-status)
  - [Dashboard 3: Certification Progress](#dashboard-3-certification-progress)
- [Alerting Rules](#alerting-rules)
  - [Alert 1: Critical Vulnerability Detected](#alert-1-critical-vulnerability-detected)
  - [Alert 2: Compliance Audit Failed](#alert-2-compliance-audit-failed)
  - [Alert 3: Certificate Expiring Soon](#alert-3-certificate-expiring-soon)
  - [Alert 4: Security Score Below Target](#alert-4-security-score-below-target)
- [Integration Points](#integration-points)
  - [Data Collection](#data-collection)
  - [Data Consumers](#data-consumers)
- [Gaps Identified](#gaps-identified)
- [Sources Table](#sources-table)

**Purpose**: Track security and compliance certification performance.

---

## Defined Metrics

**Source**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1162-1165

| Metric | Type | Unit | Target | Evidence |
|--------|------|------|--------|----------|
| Security score | Numeric | 0-100 | ≥ 85 (proposed) | Line 1163 |
| Compliance rate | Percentage | 0-100% | ≥ 95% (proposed) | Line 1164 |
| Vulnerability count | Integer | Count by severity | 0 critical, ≤3 high (proposed) | Line 1165 |

**Note**: Targets are PROPOSED; not defined in stages.yaml (EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-26.md:38)

---

## Extended Metrics (Proposed)

### Security Testing Metrics

| Metric | Type | Unit | Purpose | Reporting Frequency |
|--------|------|------|---------|---------------------|
| Penetration test pass rate | Percentage | % | Track test effectiveness | Per test run |
| OWASP Top 10 compliance score | Numeric | 0-10 | Track OWASP coverage | Per test run |
| Time to detect vulnerability | Duration | Hours | Measure detection speed | Per vulnerability |
| Time to remediate critical | Duration | Hours | Measure fix speed | Per critical vuln |
| Time to remediate high | Duration | Days | Measure fix speed | Per high vuln |
| False positive rate | Percentage | % | Track scanning accuracy | Weekly |
| Critical vulnerability count | Integer | Count | Track critical issues | Daily |
| High vulnerability count | Integer | Count | Track high issues | Daily |
| Medium vulnerability count | Integer | Count | Track medium issues | Daily |
| Low vulnerability count | Integer | Count | Track low issues | Weekly |

**Evidence**: Based on substage 26.1 requirements (EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1175-1180)

---

### Compliance Validation Metrics

| Metric | Type | Unit | Purpose | Reporting Frequency |
|--------|------|------|---------|---------------------|
| Compliance audit pass rate | Percentage | % | Track audit success | Per audit |
| Controls passed | Integer | Count | Track control compliance | Per audit |
| Controls failed | Integer | Count | Track control failures | Per audit |
| Evidence collection time | Duration | Hours | Measure efficiency | Per audit |
| Gap remediation time | Duration | Days | Measure fix speed | Per gap |
| Standards coverage | Percentage | % | Track multi-standard compliance | Monthly |

**Evidence**: Based on substage 26.2 requirements (EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1181-1186)

---

### Certification Process Metrics

| Metric | Type | Unit | Purpose | Reporting Frequency |
|--------|------|------|---------|---------------------|
| Time to certify | Duration | Days | Measure certification speed | Per certification |
| Certificate renewal success rate | Percentage | % | Track renewal effectiveness | Per renewal |
| Documentation preparation time | Duration | Hours | Measure efficiency | Per certification |
| Days until certificate expiry | Integer | Days | Track expiration risk | Daily |
| Archive storage size | Integer | GB | Track storage consumption | Weekly |

**Evidence**: Based on substage 26.3 requirements (EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1187-1192)

---

### Recursion Metrics

| Metric | Type | Unit | Purpose | Reporting Frequency |
|--------|------|------|---------|---------------------|
| Recursion trigger count | Integer | Count | Track security issues post-cert | Monthly |
| Time to detect recursion need | Duration | Hours | Measure monitoring effectiveness | Per trigger |
| Recursion resolution time | Duration | Days | Measure fix speed | Per recursion |
| False trigger rate | Percentage | % | Track accuracy | Monthly |

**Evidence**: Based on recursion blueprint (07_recursion-blueprint.md)

---

## Database Schema (Proposed)

### Table: `stage_26_metrics`

```sql
CREATE TABLE stage_26_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID REFERENCES ventures(id),
  metric_name TEXT NOT NULL,
  metric_value FLOAT NOT NULL,
  metric_unit TEXT NOT NULL,
  target_value FLOAT,
  pass_fail BOOLEAN,
  recorded_at TIMESTAMPTZ DEFAULT now(),
  substage TEXT, -- '26.1', '26.2', '26.3'
  notes TEXT
);

CREATE INDEX idx_stage_26_metrics_venture ON stage_26_metrics(venture_id);
CREATE INDEX idx_stage_26_metrics_name ON stage_26_metrics(metric_name);
CREATE INDEX idx_stage_26_metrics_recorded ON stage_26_metrics(recorded_at DESC);
```

---

### Table: `vulnerability_tracking`

```sql
CREATE TABLE vulnerability_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID REFERENCES ventures(id),
  vulnerability_id TEXT NOT NULL, -- CVE ID or internal ID
  severity TEXT NOT NULL, -- CRITICAL, HIGH, MEDIUM, LOW
  cvss_score FLOAT,
  description TEXT,
  affected_component TEXT,
  discovered_at TIMESTAMPTZ DEFAULT now(),
  remediated_at TIMESTAMPTZ,
  status TEXT DEFAULT 'open', -- open, in_progress, patched, verified, closed
  assigned_to TEXT,
  notes TEXT
);

CREATE INDEX idx_vulnerability_venture ON vulnerability_tracking(venture_id);
CREATE INDEX idx_vulnerability_severity ON vulnerability_tracking(severity);
CREATE INDEX idx_vulnerability_status ON vulnerability_tracking(status);
```

---

## Supabase Queries

### Query 1: Get Security Score for Venture

```sql
-- Get latest security score
SELECT metric_value AS security_score
FROM stage_26_metrics
WHERE venture_id = $1
  AND metric_name = 'security_score'
ORDER BY recorded_at DESC
LIMIT 1;
```

**Usage**: Dashboard display, gate validation

---

### Query 2: Get Compliance Rate for Venture

```sql
-- Get latest compliance rate
SELECT metric_value AS compliance_rate
FROM stage_26_metrics
WHERE venture_id = $1
  AND metric_name = 'compliance_rate'
ORDER BY recorded_at DESC
LIMIT 1;
```

**Usage**: Dashboard display, gate validation

---

### Query 3: Get Open Vulnerabilities by Severity

```sql
-- Count open vulnerabilities by severity
SELECT
  severity,
  COUNT(*) AS count
FROM vulnerability_tracking
WHERE venture_id = $1
  AND status IN ('open', 'in_progress')
GROUP BY severity
ORDER BY
  CASE severity
    WHEN 'CRITICAL' THEN 1
    WHEN 'HIGH' THEN 2
    WHEN 'MEDIUM' THEN 3
    WHEN 'LOW' THEN 4
  END;
```

**Usage**: Dashboard display, gate validation, alerting

---

### Query 4: Get Average Time to Remediate

```sql
-- Average time to remediate by severity
SELECT
  severity,
  AVG(EXTRACT(EPOCH FROM (remediated_at - discovered_at)) / 3600) AS avg_hours
FROM vulnerability_tracking
WHERE venture_id = $1
  AND status = 'closed'
  AND remediated_at IS NOT NULL
GROUP BY severity;
```

**Usage**: Performance tracking, SLA monitoring

---

### Query 5: Get Metrics History

```sql
-- Get metrics trend over time
SELECT
  metric_name,
  metric_value,
  recorded_at
FROM stage_26_metrics
WHERE venture_id = $1
  AND metric_name IN ('security_score', 'compliance_rate')
  AND recorded_at >= NOW() - INTERVAL '90 days'
ORDER BY metric_name, recorded_at;
```

**Usage**: Trend charts, historical analysis

---

### Query 6: Get Expiring Certificates

```sql
-- Find certificates expiring within 30 days
SELECT
  venture_id,
  metric_value AS days_until_expiry
FROM stage_26_metrics
WHERE metric_name = 'days_until_certificate_expiry'
  AND metric_value <= 30
  AND metric_value > 0
ORDER BY metric_value ASC;
```

**Usage**: Certificate renewal alerts (SECURITY-003 trigger)

---

### Query 7: Validate Exit Gates

```sql
-- Check if venture passes Stage 26 exit gates
WITH latest_metrics AS (
  SELECT DISTINCT ON (metric_name)
    metric_name,
    metric_value,
    pass_fail
  FROM stage_26_metrics
  WHERE venture_id = $1
  ORDER BY metric_name, recorded_at DESC
),
open_vulns AS (
  SELECT
    severity,
    COUNT(*) AS count
  FROM vulnerability_tracking
  WHERE venture_id = $1
    AND status IN ('open', 'in_progress')
  GROUP BY severity
)
SELECT
  (SELECT metric_value FROM latest_metrics WHERE metric_name = 'security_score') >= 85 AS security_verified,
  (SELECT metric_value FROM latest_metrics WHERE metric_name = 'compliance_rate') >= 95 AS compliance_achieved,
  (SELECT pass_fail FROM latest_metrics WHERE metric_name = 'certificates_issued') AS certificates_issued,
  (SELECT COALESCE(count, 0) FROM open_vulns WHERE severity = 'CRITICAL') = 0 AS no_critical_vulns,
  (SELECT COALESCE(count, 0) FROM open_vulns WHERE severity = 'HIGH') <= 3 AS acceptable_high_vulns;
```

**Usage**: Gate validation before Stage 27

---

## Dashboards

### Dashboard 1: Security Overview

**Widgets**:
1. Security score gauge (0-100)
2. Vulnerability count by severity (bar chart)
3. OWASP Top 10 compliance radar chart
4. Penetration test history (timeline)
5. Critical vulnerability alert banner

**Refresh**: Real-time (WebSocket)

**Evidence**: Based on metrics in EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1162-1165

---

### Dashboard 2: Compliance Status

**Widgets**:
1. Compliance rate gauge (0-100%)
2. Standards coverage matrix (SOC2, ISO27001, etc.)
3. Controls passed vs failed (pie chart)
4. Audit history (timeline)
5. Certificate expiration alerts (table)

**Refresh**: Daily

**Evidence**: Based on substage 26.2 outputs (EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1181-1186)

---

### Dashboard 3: Certification Progress

**Widgets**:
1. Stage 26 progress bar (26.1 → 26.2 → 26.3)
2. Time to certify (duration metric)
3. Certificate status (active/expiring/expired)
4. Documentation preparation status
5. Archive storage usage

**Refresh**: Hourly

**Evidence**: Based on substage 26.3 outputs (EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1187-1192)

---

## Alerting Rules

### Alert 1: Critical Vulnerability Detected

**Trigger**: New vulnerability with severity = CRITICAL
**Recipients**: Security team, CISO
**Channel**: Slack (urgent), Email
**Priority**: P0

**Evidence**: Based on SECURITY-001 recursion trigger (07_recursion-blueprint.md)

---

### Alert 2: Compliance Audit Failed

**Trigger**: Compliance rate < 95%
**Recipients**: Compliance officer, Security team
**Channel**: Email
**Priority**: P1

**Evidence**: Based on SECURITY-002 recursion trigger (07_recursion-blueprint.md)

---

### Alert 3: Certificate Expiring Soon

**Trigger**: Days until expiry <= 30
**Recipients**: Compliance officer, Certificate coordinator
**Channel**: Email, Dashboard notification
**Priority**: P2

**Evidence**: Based on SECURITY-003 recursion trigger (07_recursion-blueprint.md)

---

### Alert 4: Security Score Below Target

**Trigger**: Security score < 85
**Recipients**: Security team lead
**Channel**: Dashboard notification
**Priority**: P2

**Evidence**: Based on proposed threshold (08_configurability-matrix.md)

---

## Integration Points

### Data Collection

**Sources**:
- PenetrationTesterAgent → `vulnerability_tracking` table
- ComplianceAuditorAgent → `stage_26_metrics` table
- CertificateCoordinatorAgent → `stage_26_metrics` table
- VulnerabilityRemediationAgent → `vulnerability_tracking` table (status updates)

**Evidence**: Based on agent orchestration (06_agent-orchestration.md)

---

### Data Consumers

**Consumers**:
- Stage 27 (requires security clearance)
- Dashboard UI (real-time display)
- Alert system (threshold monitoring)
- Reporting system (historical analysis)
- Recursion triggers (monitoring for SECURITY-001 through SECURITY-004)

---

## Gaps Identified

1. **No metrics tables**: Must create `stage_26_metrics` and `vulnerability_tracking` tables
2. **No dashboard UI**: Must implement 3 dashboards
3. **No alerting system**: Must implement 4 alert rules
4. **No data collection**: Must instrument agents to collect metrics
5. **No threshold enforcement**: Must implement gate validation queries

**Action**: Add to 10_gaps-backlog.md

---

## Sources Table

| Source | Repo | Commit | Path | Lines | Excerpt |
|--------|------|--------|------|-------|---------|
| Defined metrics | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1162-1165 | "Security score, Compliance rate" |
| Threshold gap | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-26.md | 38 | "Missing: Threshold values" |
| Substage 26.1 | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1175-1180 | "Security Testing" |
| Substage 26.2 | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1181-1186 | "Compliance Validation" |
| Substage 26.3 | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1187-1192 | "Certification Process" |

<!-- Generated by Claude Code Phase 10 | EHG_Engineer@6ef8cf4 | 2025-11-06 -->
