# Stage 29: Metrics & Monitoring

## Metrics Overview

**Metrics Defined** (from stages.yaml): 3 metrics
1. UI consistency
2. UX score
3. Performance metrics

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1300-1303

**Gap**: Critique line 38 notes missing threshold values and measurement frequency. This document proposes concrete implementations.

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-29.md:36-39

---

## Proposed Metrics Schema

### Table: `stage_29_metrics`

```sql
CREATE TABLE stage_29_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venture_id UUID REFERENCES ventures(id) NOT NULL,
    substage_id TEXT NOT NULL,  -- '29.1', '29.2', '29.3'
    recorded_at TIMESTAMPTZ DEFAULT NOW(),

    -- UI Refinement Metrics (Substage 29.1)
    design_token_compliance_percentage NUMERIC(5,2),  -- 0-100
    animation_avg_fps NUMERIC(5,2),  -- 0-120
    responsive_breakpoints_passed INTEGER,  -- Count
    visual_regression_count INTEGER,  -- Percy/Chromatic failures

    -- UX Optimization Metrics (Substage 29.2)
    accessibility_score NUMERIC(5,2),  -- 0-100 (Axe + Lighthouse)
    flow_completion_rate NUMERIC(5,2),  -- 0-100 percentage
    friction_point_count INTEGER,  -- Detected issues
    ux_score NUMERIC(5,2),  -- 0-100 composite

    -- Asset Preparation Metrics (Substage 29.3)
    main_bundle_size_kb NUMERIC(8,2),  -- KB (gzipped)
    vendor_bundle_size_kb NUMERIC(8,2),  -- KB (gzipped)
    total_bundle_size_kb NUMERIC(8,2),  -- KB (gzipped)
    image_compression_percentage NUMERIC(5,2),  -- 0-100
    cdn_cache_hit_rate NUMERIC(5,2),  -- 0-100 percentage
    cdn_p95_latency_ms NUMERIC(7,2),  -- Milliseconds

    -- Performance Metrics (Core Web Vitals)
    lcp_ms NUMERIC(7,2),  -- Largest Contentful Paint (ms)
    fid_ms NUMERIC(7,2),  -- First Input Delay (ms)
    cls NUMERIC(5,3),  -- Cumulative Layout Shift (0-1)
    lighthouse_performance_score NUMERIC(5,2),  -- 0-100

    -- Metadata
    agent_execution_id UUID,  -- Link to agent execution log
    gate_status TEXT,  -- 'pass', 'fail', 'pending'
    notes TEXT
);

CREATE INDEX idx_stage_29_metrics_venture ON stage_29_metrics(venture_id);
CREATE INDEX idx_stage_29_metrics_substage ON stage_29_metrics(substage_id);
CREATE INDEX idx_stage_29_metrics_recorded_at ON stage_29_metrics(recorded_at);
```

**Design Rationale**: Separate row per substage execution allows time-series tracking and recursion monitoring.

---

## Key Performance Indicators (KPIs)

### 1. UI Consistency (Substage 29.1)

**Metric**: `design_token_compliance_percentage`
**Threshold**: ≥95% (from `08_configurability-matrix.md`)
**Measurement Frequency**: Continuous during Substage 29.1 execution
**Measurement Method**: Automated design token audit (grep + AST parsing)

**Query** (current compliance):
```sql
SELECT
    v.title AS venture_name,
    m.design_token_compliance_percentage,
    m.recorded_at
FROM stage_29_metrics m
JOIN ventures v ON m.venture_id = v.id
WHERE m.substage_id = '29.1'
    AND m.venture_id = :venture_id
ORDER BY m.recorded_at DESC
LIMIT 1;
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1315 "Visual polish applied"

---

### 2. Animation Smoothness (Substage 29.1)

**Metric**: `animation_avg_fps`
**Threshold**: ≥60fps (desktop), ≥30fps (mobile)
**Measurement Frequency**: Per-animation during Substage 29.1 execution
**Measurement Method**: Puppeteer + Chrome DevTools Protocol (Performance API)

**Query** (animation performance):
```sql
SELECT
    AVG(m.animation_avg_fps) AS avg_fps,
    MIN(m.animation_avg_fps) AS worst_fps,
    COUNT(*) AS measurement_count
FROM stage_29_metrics m
WHERE m.substage_id = '29.1'
    AND m.venture_id = :venture_id
    AND m.recorded_at >= NOW() - INTERVAL '1 day';
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1316 "Animations smooth"

---

### 3. Responsive Design Coverage (Substage 29.1)

**Metric**: `responsive_breakpoints_passed`
**Threshold**: 5 breakpoints (320px, 768px, 1024px, 1440px, 1920px)
**Measurement Frequency**: Once per Substage 29.1 execution
**Measurement Method**: Percy visual regression tests

**Query** (breakpoint coverage):
```sql
SELECT
    m.responsive_breakpoints_passed,
    (m.responsive_breakpoints_passed::FLOAT / 5) * 100 AS coverage_percentage
FROM stage_29_metrics m
WHERE m.substage_id = '29.1'
    AND m.venture_id = :venture_id
ORDER BY m.recorded_at DESC
LIMIT 1;
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1317 "Responsive design verified"

---

### 4. Accessibility Score (Substage 29.2)

**Metric**: `accessibility_score`
**Threshold**: ≥95/100 (from `08_configurability-matrix.md`)
**Measurement Frequency**: Continuous during Substage 29.2 execution
**Measurement Method**: Axe-core + Lighthouse accessibility audit

**Query** (accessibility trend):
```sql
SELECT
    DATE_TRUNC('hour', m.recorded_at) AS hour,
    AVG(m.accessibility_score) AS avg_score,
    MIN(m.accessibility_score) AS min_score
FROM stage_29_metrics m
WHERE m.substage_id = '29.2'
    AND m.venture_id = :venture_id
    AND m.recorded_at >= NOW() - INTERVAL '7 days'
GROUP BY hour
ORDER BY hour DESC;
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1324 "Accessibility verified"

---

### 5. Flow Completion Rate (Substage 29.2)

**Metric**: `flow_completion_rate`
**Threshold**: ≥5% improvement from baseline (from `08_configurability-matrix.md`)
**Measurement Frequency**: Once per Substage 29.2 execution
**Measurement Method**: Google Analytics funnel reports

**Query** (flow improvement):
```sql
SELECT
    v.title AS venture_name,
    m_baseline.flow_completion_rate AS baseline_rate,
    m_current.flow_completion_rate AS current_rate,
    (m_current.flow_completion_rate - m_baseline.flow_completion_rate) AS improvement
FROM stage_29_metrics m_current
JOIN ventures v ON m_current.venture_id = v.id
LEFT JOIN LATERAL (
    SELECT flow_completion_rate
    FROM stage_29_metrics
    WHERE venture_id = m_current.venture_id
        AND substage_id = '29.2'
        AND recorded_at < m_current.recorded_at
    ORDER BY recorded_at DESC
    LIMIT 1
) m_baseline ON TRUE
WHERE m_current.venture_id = :venture_id
    AND m_current.substage_id = '29.2'
ORDER BY m_current.recorded_at DESC
LIMIT 1;
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1321 "Flows optimized"

---

### 6. UX Score (Substage 29.2)

**Metric**: `ux_score`
**Threshold**: ≥85/100, regression ≤10 points (from `08_configurability-matrix.md`)
**Measurement Frequency**: Continuous during Substage 29.2 execution
**Measurement Method**: Composite score (accessibility 40% + flow completion 30% + friction removal 30%)

**Calculation**:
```sql
SELECT
    (m.accessibility_score * 0.4) +
    (m.flow_completion_rate * 0.3) +
    ((100 - m.friction_point_count * 5) * 0.3) AS ux_score
FROM stage_29_metrics m
WHERE m.substage_id = '29.2'
    AND m.venture_id = :venture_id
ORDER BY m.recorded_at DESC
LIMIT 1;
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1302 "UX score"

---

### 7. Bundle Size (Substage 29.3)

**Metrics**:
- `main_bundle_size_kb`: ≤200KB (gzipped)
- `vendor_bundle_size_kb`: ≤300KB (gzipped)
- `total_bundle_size_kb`: ≤500KB (gzipped)

**Threshold**: Per `08_configurability-matrix.md`
**Measurement Frequency**: Continuous during Substage 29.3 execution
**Measurement Method**: webpack-bundle-analyzer

**Query** (bundle size trends):
```sql
SELECT
    DATE_TRUNC('day', m.recorded_at) AS day,
    AVG(m.main_bundle_size_kb) AS avg_main_bundle,
    AVG(m.vendor_bundle_size_kb) AS avg_vendor_bundle,
    AVG(m.total_bundle_size_kb) AS avg_total_bundle
FROM stage_29_metrics m
WHERE m.substage_id = '29.3'
    AND m.venture_id = :venture_id
    AND m.recorded_at >= NOW() - INTERVAL '30 days'
GROUP BY day
ORDER BY day DESC;
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1329 "Bundles minimized"

---

### 8. CDN Performance (Substage 29.3)

**Metrics**:
- `cdn_cache_hit_rate`: ≥90%
- `cdn_p95_latency_ms`: ≤100ms

**Threshold**: Per `08_configurability-matrix.md`
**Measurement Frequency**: Hourly during Substage 29.3 execution
**Measurement Method**: Cloudflare/CloudFront analytics API

**Query** (CDN health):
```sql
SELECT
    v.title AS venture_name,
    m.cdn_cache_hit_rate,
    m.cdn_p95_latency_ms,
    m.recorded_at
FROM stage_29_metrics m
JOIN ventures v ON m.venture_id = v.id
WHERE m.substage_id = '29.3'
    AND m.venture_id = :venture_id
ORDER BY m.recorded_at DESC
LIMIT 1;
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1328 "CDN configured"

---

### 9. Core Web Vitals (All Substages)

**Metrics**:
- `lcp_ms`: ≤2500ms (Largest Contentful Paint)
- `fid_ms`: ≤100ms (First Input Delay)
- `cls`: ≤0.1 (Cumulative Layout Shift)
- `lighthouse_performance_score`: ≥90/100

**Threshold**: Per `08_configurability-matrix.md`, based on Google's Core Web Vitals
**Measurement Frequency**: Continuous during all substages
**Measurement Method**: Lighthouse CI

**Query** (Web Vitals compliance):
```sql
SELECT
    v.title AS venture_name,
    m.lcp_ms,
    m.fid_ms,
    m.cls,
    m.lighthouse_performance_score,
    CASE
        WHEN m.lcp_ms <= 2500 AND m.fid_ms <= 100 AND m.cls <= 0.1 THEN 'PASS'
        ELSE 'FAIL'
    END AS vitals_status
FROM stage_29_metrics m
JOIN ventures v ON m.venture_id = v.id
WHERE m.venture_id = :venture_id
ORDER BY m.recorded_at DESC
LIMIT 1;
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1303 "Performance metrics"

---

## Dashboard Design

### Grafana Dashboard: Stage 29 Monitoring

**Dashboard URL**: `https://grafana.example.com/d/stage-29-polish`

#### Panel 1: Exit Gate Status

**Query**:
```sql
SELECT
    COUNT(*) FILTER (WHERE m.gate_status = 'pass') AS gates_passed,
    COUNT(*) FILTER (WHERE m.gate_status = 'fail') AS gates_failed,
    COUNT(*) FILTER (WHERE m.gate_status = 'pending') AS gates_pending
FROM stage_29_metrics m
WHERE m.venture_id = :venture_id
    AND m.recorded_at >= NOW() - INTERVAL '24 hours';
```

**Visualization**: Pie chart (green=pass, red=fail, yellow=pending)

---

#### Panel 2: UI Consistency Trend

**Query**:
```sql
SELECT
    m.recorded_at AS time,
    m.design_token_compliance_percentage AS compliance
FROM stage_29_metrics m
WHERE m.substage_id = '29.1'
    AND m.venture_id = :venture_id
    AND m.recorded_at >= NOW() - INTERVAL '7 days'
ORDER BY m.recorded_at;
```

**Visualization**: Line chart with 95% threshold line

---

#### Panel 3: Core Web Vitals

**Query**:
```sql
SELECT
    m.recorded_at AS time,
    m.lcp_ms,
    m.fid_ms,
    m.cls * 1000 AS cls_scaled
FROM stage_29_metrics m
WHERE m.venture_id = :venture_id
    AND m.recorded_at >= NOW() - INTERVAL '7 days'
ORDER BY m.recorded_at;
```

**Visualization**: Multi-line chart (LCP, FID, CLS on secondary axis)

---

#### Panel 4: Bundle Size Evolution

**Query**:
```sql
SELECT
    m.recorded_at AS time,
    m.main_bundle_size_kb,
    m.vendor_bundle_size_kb,
    m.total_bundle_size_kb
FROM stage_29_metrics m
WHERE m.substage_id = '29.3'
    AND m.venture_id = :venture_id
    AND m.recorded_at >= NOW() - INTERVAL '30 days'
ORDER BY m.recorded_at;
```

**Visualization**: Stacked area chart

---

#### Panel 5: Recursion Trigger Count

**Query** (from `stage_29_recursion_log` table, see `07_recursion-blueprint.md`):
```sql
SELECT
    r.trigger_type,
    COUNT(*) AS trigger_count
FROM stage_29_recursion_log r
WHERE r.venture_id = :venture_id
    AND r.triggered_at >= NOW() - INTERVAL '30 days'
GROUP BY r.trigger_type
ORDER BY trigger_count DESC;
```

**Visualization**: Bar chart

---

## Alerting Rules

### Critical Alerts (PagerDuty)

#### Alert 1: Exit Gate Failure

**Condition**:
```sql
SELECT COUNT(*)
FROM stage_29_metrics
WHERE venture_id = :venture_id
    AND gate_status = 'fail'
    AND recorded_at >= NOW() - INTERVAL '1 hour'
HAVING COUNT(*) > 0;
```

**Severity**: High
**Notification**: PagerDuty + Slack #stage-29-alerts
**Action**: Notify PLAN phase lead, trigger rollback procedure (see `05_professional-sop.md`)

---

#### Alert 2: Performance Degradation

**Condition**:
```sql
SELECT
    m.lcp_ms,
    m_baseline.lcp_ms AS baseline_lcp
FROM stage_29_metrics m
LEFT JOIN LATERAL (
    SELECT lcp_ms
    FROM stage_29_metrics
    WHERE venture_id = m.venture_id
        AND recorded_at < m.recorded_at
    ORDER BY recorded_at DESC
    LIMIT 1
) m_baseline ON TRUE
WHERE m.venture_id = :venture_id
    AND (m.lcp_ms - m_baseline.lcp_ms) / m_baseline.lcp_ms > 0.20  -- >20% degradation
    AND m.recorded_at >= NOW() - INTERVAL '1 hour';
```

**Severity**: Critical
**Notification**: PagerDuty + Slack #production-alerts
**Action**: Trigger POLISH-004 (see `07_recursion-blueprint.md`)

---

#### Alert 3: Accessibility Violation

**Condition**:
```sql
SELECT accessibility_score
FROM stage_29_metrics
WHERE venture_id = :venture_id
    AND substage_id = '29.2'
    AND accessibility_score < 95
    AND recorded_at >= NOW() - INTERVAL '1 hour'
LIMIT 1;
```

**Severity**: High (compliance risk)
**Notification**: Slack #accessibility-team
**Action**: Block Stage 29 exit, notify UX lead

---

### Warning Alerts (Slack Only)

#### Alert 4: Bundle Size Approaching Limit

**Condition**:
```sql
SELECT main_bundle_size_kb
FROM stage_29_metrics
WHERE venture_id = :venture_id
    AND substage_id = '29.3'
    AND main_bundle_size_kb > 180  -- 90% of 200KB threshold
    AND recorded_at >= NOW() - INTERVAL '1 hour'
LIMIT 1;
```

**Severity**: Warning
**Notification**: Slack #stage-29-warnings
**Action**: Proactive code-splitting recommendation

---

#### Alert 5: CDN Cache Hit Rate Low

**Condition**:
```sql
SELECT cdn_cache_hit_rate
FROM stage_29_metrics
WHERE venture_id = :venture_id
    AND substage_id = '29.3'
    AND cdn_cache_hit_rate < 85  -- 5% below 90% threshold
    AND recorded_at >= NOW() - INTERVAL '1 hour'
LIMIT 1;
```

**Severity**: Warning
**Notification**: Slack #devops-cdn
**Action**: Review CDN cache headers

---

## Agent Integration

### Metrics Collection (Agent Responsibility)

**UIRefinementSpecialist** (Agent 1):
```python
def record_ui_metrics(venture_id: str, audit_result: dict):
    """Record Substage 29.1 metrics."""
    query = """
        INSERT INTO stage_29_metrics (
            venture_id, substage_id,
            design_token_compliance_percentage,
            animation_avg_fps,
            responsive_breakpoints_passed,
            visual_regression_count,
            gate_status
        ) VALUES (%s, '29.1', %s, %s, %s, %s, %s)
    """
    db.execute(query, [
        venture_id,
        audit_result['compliance_percentage'],
        audit_result['avg_fps'],
        audit_result['breakpoints_passed'],
        audit_result['visual_regressions'],
        'pass' if audit_result['gate_passed'] else 'fail'
    ])
```

**UXOptimizationEngineer** (Agent 2):
```python
def record_ux_metrics(venture_id: str, optimization_result: dict):
    """Record Substage 29.2 metrics."""
    query = """
        INSERT INTO stage_29_metrics (
            venture_id, substage_id,
            accessibility_score,
            flow_completion_rate,
            friction_point_count,
            ux_score,
            gate_status
        ) VALUES (%s, '29.2', %s, %s, %s, %s, %s)
    """
    db.execute(query, [
        venture_id,
        optimization_result['accessibility_score'],
        optimization_result['flow_completion_rate'],
        optimization_result['friction_points'],
        optimization_result['ux_score'],
        'pass' if optimization_result['gate_passed'] else 'fail'
    ])
```

**AssetPreparationEngineer** (Agent 3):
```python
def record_asset_metrics(venture_id: str, preparation_result: dict):
    """Record Substage 29.3 metrics."""
    query = """
        INSERT INTO stage_29_metrics (
            venture_id, substage_id,
            main_bundle_size_kb,
            vendor_bundle_size_kb,
            total_bundle_size_kb,
            image_compression_percentage,
            cdn_cache_hit_rate,
            cdn_p95_latency_ms,
            gate_status
        ) VALUES (%s, '29.3', %s, %s, %s, %s, %s, %s, %s)
    """
    db.execute(query, [
        venture_id,
        preparation_result['main_bundle_size_kb'],
        preparation_result['vendor_bundle_size_kb'],
        preparation_result['total_bundle_size_kb'],
        preparation_result['image_compression_percentage'],
        preparation_result['cdn_cache_hit_rate'],
        preparation_result['cdn_p95_latency_ms'],
        'pass' if preparation_result['gate_passed'] else 'fail'
    ])
```

---

## Historical Analysis

### Venture Comparison

**Query** (compare Stage 29 performance across ventures):
```sql
SELECT
    v.title AS venture_name,
    AVG(m.design_token_compliance_percentage) AS avg_ui_compliance,
    AVG(m.accessibility_score) AS avg_accessibility,
    AVG(m.lighthouse_performance_score) AS avg_performance,
    AVG(m.total_bundle_size_kb) AS avg_bundle_size
FROM stage_29_metrics m
JOIN ventures v ON m.venture_id = v.id
WHERE m.recorded_at >= NOW() - INTERVAL '90 days'
GROUP BY v.id, v.title
ORDER BY avg_performance DESC;
```

**Use Case**: Identify best practices from high-performing ventures

---

### Time to Polish (Duration Tracking)

**Query**:
```sql
SELECT
    v.title AS venture_name,
    MIN(m.recorded_at) AS stage_29_start,
    MAX(m.recorded_at) AS stage_29_end,
    MAX(m.recorded_at) - MIN(m.recorded_at) AS duration
FROM stage_29_metrics m
JOIN ventures v ON m.venture_id = v.id
WHERE v.current_workflow_stage >= 30  -- Completed Stage 29
GROUP BY v.id, v.title
ORDER BY duration DESC;
```

**Use Case**: Estimate Stage 29 duration for new ventures

---

## Cross-References

- **SD-METRICS-FRAMEWORK-001** (P0 CRITICAL, status=queued): Universal metrics framework blocker
- **SD-GRAFANA-DASHBOARDS-001** (proposed): Automates dashboard generation
- **SD-PAGERDUTY-INTEGRATION-001** (proposed): Implements alerting rules

---

## Sources Table

| Source | Repo | Commit | Path | Lines | Evidence |
|--------|------|--------|------|-------|----------|
| Metrics defined | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1300-1303 | 3 metrics |
| Metrics thresholds gap | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-29.md | 36-39 | Missing thresholds |
| Substage 29.1 criteria | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1313-1318 | UI refinement metrics |
| Substage 29.2 criteria | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1319-1324 | UX optimization metrics |
| Substage 29.3 criteria | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1325-1330 | Asset preparation metrics |
| Rollback triggers | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-29.md | 47-50 | Performance degradation |

<!-- Generated by Claude Code Phase 11 | EHG_Engineer@6ef8cf4 | 2025-11-06 -->
