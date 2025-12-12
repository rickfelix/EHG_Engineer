# Stage 37: Strategic Risk Forecasting - Metrics & Monitoring

## Executive Summary

This document defines the Key Performance Indicators (KPIs), measurement methodologies, monitoring cadence, and alerting thresholds for Stage 37: Strategic Risk Forecasting.

**Primary Metrics** (from stages.yaml):
1. **Forecast accuracy**: How well predictions match actual outcomes
2. **Risk preparedness**: Coverage of contingency plans across identified risks
3. **Response time**: Speed of action from trigger detection to mitigation

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1670-1672 "Forecast accuracy, Risk preparedness, Response time"

---

## Metric 1: Forecast Accuracy

### Definition

**What it measures**: The percentage of risk forecasts that correctly predicted actual outcomes over a given period.

**Formula**:
```
Forecast Accuracy = (Correct Predictions) / (Total Predictions) × 100%

Where:
- Correct Prediction: Risk materialized as forecasted (within confidence interval)
- Total Predictions: All risk scenarios forecasted for the period
```

**Target**: ≥75% (quarterly measurement)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-37.md:38 "Threshold values"

### Measurement Methodology

**Step 1: Define Prediction Correctness**

A prediction is "correct" if:
1. **Risk occurred**: Event happened, probability was >30% in forecast → ✓
2. **Risk did not occur**: Event didn't happen, probability was <30% in forecast → ✓
3. **Impact within bounds**: Actual impact within 95% confidence interval of forecast → ✓

A prediction is "incorrect" if:
1. **False positive**: Event didn't happen, probability was >50% → ✗
2. **False negative**: Event happened, probability was <10% → ✗
3. **Impact out of bounds**: Actual impact outside confidence interval → ✗

**Step 2: Data Collection**

**Quarterly Process**:
1. Extract all risk scenarios forecasted in previous quarter (from `risk_forecasts` table)
2. For each scenario, determine actual outcome (from `risk_outcomes` table or manual entry)
3. Compare forecast (probability + impact) to actual outcome
4. Classify as correct/incorrect per criteria above

**Step 3: Calculate Accuracy**

```python
def calculate_forecast_accuracy(forecasts, actuals):
    correct = 0
    total = len(forecasts)

    for forecast, actual in zip(forecasts, actuals):
        # Check probability correctness
        if actual.occurred and forecast.probability >= 0.3:
            prob_correct = True
        elif not actual.occurred and forecast.probability < 0.3:
            prob_correct = True
        else:
            prob_correct = False

        # Check impact correctness (if risk occurred)
        if actual.occurred:
            lower_bound = forecast.impact * (1 - forecast.confidence_interval)
            upper_bound = forecast.impact * (1 + forecast.confidence_interval)
            impact_correct = lower_bound <= actual.impact <= upper_bound
        else:
            impact_correct = True  # N/A if risk didn't occur

        if prob_correct and impact_correct:
            correct += 1

    return (correct / total) * 100
```

### Monitoring Cadence

| Frequency | Activity | Owner | Output |
|-----------|----------|-------|--------|
| **Quarterly** | Calculate forecast accuracy for previous quarter | Risk Analyst | Accuracy report (1-2 pages) |
| **Monthly** | Mid-quarter check on risk outcome tracking | Risk Analyst | Progress update |
| **Weekly** | Log actual risk outcomes as they occur | Strategic Planning Team | Risk outcome entries |

### Alerting Thresholds

| Threshold | Severity | Action | Owner |
|-----------|----------|--------|-------|
| **<50%** for 2 consecutive quarters | 🔴 Critical | Trigger rollback procedure, recalibrate models | Chairman |
| **50-65%** for 1 quarter | 🟡 Warning | Investigate root cause, review methodology | Risk Analyst |
| **65-75%** for 1 quarter | 🟢 Monitor | Continue monitoring, minor adjustments | Risk Analyst |
| **≥75%** | ✅ On Target | Maintain current approach | - |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-37.md:47-50 "Rollback trigger: accuracy <50%"

### Dimensions of Analysis

**Breakdown by Risk Category**:
- Market risks accuracy
- Operational risks accuracy
- Regulatory risks accuracy
- Financial risks accuracy

**Goal**: Identify which categories need methodology improvements

**Breakdown by Probability Range**:
- High-probability risks (>50%) accuracy
- Medium-probability risks (20-50%) accuracy
- Low-probability risks (<20%) accuracy

**Goal**: Understand calibration quality at different probability levels

**Breakdown by Venture Type**:
- Strategic ventures accuracy
- Incremental improvement ventures accuracy
- Infrastructure ventures accuracy

**Goal**: Tailor forecasting approach to venture context

### Visualization

**Dashboard Component** (for RISK-FORECAST-002):
- **Line chart**: Forecast accuracy trend over 8 quarters
- **Bar chart**: Accuracy by risk category (current quarter)
- **Heatmap**: Probability vs actual occurrence (calibration plot)

---

## Metric 2: Risk Preparedness

### Definition

**What it measures**: The percentage of identified Critical and High severity risks that have documented, approved contingency plans.

**Formula**:
```
Risk Preparedness = (Risks with Contingency Plans) / (Total Critical + High Risks) × 100%

Where:
- Risks with Contingency Plans: Risks with complete plan (trigger, actions, resources)
- Total Critical + High Risks: All risks classified as Critical or High severity
```

**Target**: 100% (all Critical/High risks have plans)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1671 "Risk preparedness"

### Measurement Methodology

**Step 1: Identify Critical/High Risks**

Query `risk_forecasts` table:
```sql
SELECT COUNT(*) AS critical_high_risks
FROM risk_forecasts
WHERE severity IN ('critical', 'high')
  AND forecast_period = CURRENT_QUARTER;
```

**Step 2: Count Risks with Plans**

Query `contingency_plans` table:
```sql
SELECT COUNT(DISTINCT risk_id) AS risks_with_plans
FROM contingency_plans
WHERE risk_id IN (
  SELECT risk_id FROM risk_forecasts
  WHERE severity IN ('critical', 'high')
    AND forecast_period = CURRENT_QUARTER
)
AND plan_status = 'approved';
```

**Step 3: Calculate Preparedness**

```python
def calculate_risk_preparedness(critical_high_risks, risks_with_plans):
    if critical_high_risks == 0:
        return 100.0  # No risks = fully prepared
    return (risks_with_plans / critical_high_risks) * 100
```

### Quality Criteria for "Complete Plan"

A contingency plan is "complete" if it has:
1. ✅ **Trigger definition**: Observable condition that activates plan
2. ✅ **Action list**: ≥3 specific actions (not vague intentions)
3. ✅ **Resource allocation**: Budget/personnel quantified
4. ✅ **Timeline**: Execution timeline defined
5. ✅ **Success criteria**: Measurable outcome for plan effectiveness
6. ✅ **Chairman approval**: Signed off by Chairman

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1697-1699 "Plans created, Triggers defined"

### Monitoring Cadence

| Frequency | Activity | Owner | Output |
|-----------|----------|-------|--------|
| **Monthly** | Calculate risk preparedness for current quarter | Risk Analyst | Preparedness report + gap analysis |
| **Weekly** | Track new Critical/High risks identified | Risk Analyst | New risk alerts |
| **Daily** (automation) | Auto-calculate preparedness after plan approvals | Dashboard | Real-time preparedness score |

### Alerting Thresholds

| Threshold | Severity | Action | Owner |
|-----------|----------|--------|-------|
| **<80%** | 🔴 Critical | Immediate planning sprint for uncovered risks | Chairman + Strategic Planning Team |
| **80-95%** | 🟡 Warning | Prioritize plan creation for remaining gaps | Strategic Planning Team |
| **95-100%** | 🟢 Monitor | Maintain current planning pace | - |
| **100%** | ✅ On Target | Celebrate, review plan quality | - |

### Dimensions of Analysis

**Breakdown by Risk Category**:
- Market risks preparedness
- Operational risks preparedness
- Regulatory risks preparedness
- Financial risks preparedness

**Breakdown by Venture**:
- Venture A preparedness (e.g., 3/3 Critical risks covered)
- Venture B preparedness (e.g., 5/7 High risks covered)

**Breakdown by Plan Age**:
- Plans created <30 days ago (fresh)
- Plans created 30-90 days ago (current)
- Plans created >90 days ago (may need refresh)

**Goal**: Ensure plans stay relevant and up-to-date

### Visualization

**Dashboard Component**:
- **Gauge chart**: Current preparedness percentage (0-100%)
- **Table**: List of uncovered Critical/High risks with owners
- **Bar chart**: Preparedness by risk category

---

## Metric 3: Response Time

### Definition

**What it measures**: Time elapsed from trigger detection to action initiation for risk mitigation or contingency plan activation.

**Formula**:
```
Response Time = Action Initiation Timestamp - Trigger Detection Timestamp

Where:
- Trigger Detection: Automated alert or manual identification of trigger condition
- Action Initiation: First action taken (notification sent, resource allocated, etc.)
```

**Target**:
- **Critical risks**: ≤24 hours
- **High risks**: ≤1 week (168 hours)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1672 "Response time"

### Measurement Methodology

**Step 1: Log Trigger Detection**

When trigger condition met:
```sql
INSERT INTO risk_trigger_log (
  risk_id,
  trigger_timestamp,
  trigger_type,  -- 'quantitative', 'qualitative', 'time_based'
  trigger_value,
  detection_method  -- 'automated', 'manual'
)
VALUES (...);
```

**Step 2: Log Action Initiation**

When first action taken:
```sql
INSERT INTO risk_action_log (
  risk_id,
  action_timestamp,
  action_type,  -- 'notification', 'resource_allocation', 'technical_procedure'
  action_description
)
VALUES (...);
```

**Step 3: Calculate Response Time**

```sql
SELECT
  r.risk_id,
  r.risk_title,
  r.severity,
  t.trigger_timestamp,
  a.action_timestamp,
  EXTRACT(EPOCH FROM (a.action_timestamp - t.trigger_timestamp)) / 3600 AS response_time_hours
FROM risk_trigger_log t
JOIN risk_action_log a ON t.risk_id = a.risk_id
  AND a.action_timestamp > t.trigger_timestamp
JOIN risk_forecasts r ON t.risk_id = r.risk_id
WHERE a.action_timestamp = (
  SELECT MIN(action_timestamp)
  FROM risk_action_log
  WHERE risk_id = t.risk_id
    AND action_timestamp > t.trigger_timestamp
);
```

### Monitoring Cadence

| Frequency | Activity | Owner | Output |
|-----------|----------|-------|--------|
| **Real-time** (automation) | Calculate response time after each action | Dashboard | Real-time response time display |
| **Weekly** | Review response times for all triggered risks | Risk Analyst | Response time summary |
| **Monthly** | Aggregate statistics (mean, median, P95) | Risk Analyst | Response time report |
| **Quarterly** | Trend analysis + target achievement review | Chairman | Quarterly business review section |

### Alerting Thresholds

| Risk Severity | Target | Warning | Critical | Action |
|---------------|--------|---------|----------|--------|
| **Critical** | ≤24h | 12-24h | >24h | Alert Chairman, investigate delay |
| **High** | ≤168h (1 week) | 120-168h | >168h | Alert Strategic Planning Team |
| **Medium** | ≤720h (1 month) | - | - | Monitor only |

**Escalation**:
- If response time consistently exceeds target, investigate root cause:
  - Manual process bottleneck? → Implement RISK-FORECAST-004 (auto-activation)
  - Trigger detection delay? → Implement RISK-FORECAST-002 (real-time monitoring)
  - Unclear action plan? → Improve contingency plan quality

### Dimensions of Analysis

**Breakdown by Detection Method**:
- Automated detection response time (expected: faster)
- Manual detection response time (expected: slower)

**Breakdown by Risk Severity**:
- Critical risk response time
- High risk response time
- Medium risk response time

**Breakdown by Time of Day**:
- Business hours (9am-5pm) response time
- After-hours response time
- Weekend response time

**Goal**: Identify coverage gaps (e.g., slow response on weekends → need on-call rotation)

**Breakdown by Action Type**:
- Notification response time (fastest)
- Resource allocation response time
- Technical procedure response time (slowest)

### Visualization

**Dashboard Component**:
- **Histogram**: Distribution of response times (all triggered risks)
- **Line chart**: Mean response time trend over 12 weeks
- **Table**: Recent triggered risks with response times (sortable)
- **Heatmap**: Response time by day of week + hour of day

---

## Secondary Metrics

### Metric 4: Model Calibration Quality

**Definition**: R² (coefficient of determination) for probabilistic risk models against historical outcomes.

**Target**: ≥0.7 (high quality), warning <0.5

**Formula**: Standard R² calculation from statistics

**Measurement**: Quarterly backtest (Agent 1 output)

**Purpose**: Validate quantitative probability estimation methodology

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1676 "Models calibrated"

---

### Metric 5: Contingency Plan Effectiveness

**Definition**: Percentage reduction in risk impact after contingency plan activation.

**Target**: ≥30% impact reduction on average

**Formula**:
```
Effectiveness = (Forecasted Impact - Actual Impact) / Forecasted Impact × 100%
```

**Measurement**: Quarterly review of all activated plans

**Purpose**: Validate that contingency plans actually reduce risk impact (not just theater)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-37.md:52-55 "Customer Integration"

---

### Metric 6: Chairman Time Investment

**Definition**: Hours per week spent by Chairman on Stage 37 activities.

**Target**:
- **Current** (manual): 15h/week
- **Phase 1** (RISK-FORECAST-001): 10h/week
- **Phase 3** (full automation): 3h/week

**Formula**: Time tracking (manual or automated)

**Measurement**: Weekly time logs

**Purpose**: Measure automation ROI

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-37.md:33 "80% automation"

---

### Metric 7: False Positive Rate (Triggers)

**Definition**: Percentage of trigger activations that did not require action (false alarms).

**Target**: <10%

**Formula**:
```
False Positive Rate = (False Alarms) / (Total Triggers) × 100%

Where:
- False Alarm: Trigger activated but action deemed unnecessary
- Total Triggers: All trigger activations
```

**Measurement**: Monthly review of all triggers

**Purpose**: Optimize trigger thresholds (reduce noise without missing real risks)

---

## Monitoring Dashboard Design

### Page 1: Executive Summary

**Audience**: Chairman

**Components**:
1. **3 Primary Metrics** (large display):
   - Forecast Accuracy: 78% ✅ (target: ≥75%)
   - Risk Preparedness: 95% 🟡 (target: 100%)
   - Response Time (Critical): 18h ✅ (target: ≤24h)
2. **Trend Indicators**: ↑↓→ (improving, declining, stable)
3. **Top 3 Risks Requiring Attention**: Table with risk title, severity, action needed

**Update Frequency**: Real-time (auto-refresh every 5 minutes)

---

### Page 2: Forecast Accuracy Deep Dive

**Audience**: Risk Analyst, Data Scientist

**Components**:
1. **Quarterly Accuracy Trend** (line chart, 8 quarters)
2. **Accuracy by Risk Category** (bar chart)
3. **Calibration Plot** (heatmap: forecasted probability vs actual occurrence)
4. **Error Analysis** (table: top 5 incorrect predictions with root cause)

**Update Frequency**: Quarterly (refreshed after accuracy calculation)

---

### Page 3: Risk Preparedness Status

**Audience**: Strategic Planning Team

**Components**:
1. **Preparedness Gauge** (0-100%, color-coded)
2. **Uncovered Risks Table**: List of Critical/High risks without plans
   - Columns: Risk ID, Title, Severity, Owner, Days Since Identified
   - Sort: Highest severity first, then oldest
3. **Plan Creation Velocity** (line chart: plans created per week)
4. **Plan Quality Score** (percentage of plans meeting all 6 quality criteria)

**Update Frequency**: Daily

---

### Page 4: Response Time Analytics

**Audience**: Risk Analyst, Operations Team

**Components**:
1. **Response Time Distribution** (histogram: <6h, 6-12h, 12-24h, >24h)
2. **Mean Response Time Trend** (line chart, 12 weeks)
3. **Recent Triggers** (table with response times)
4. **Coverage Heatmap** (day of week × hour → mean response time)

**Update Frequency**: Real-time

---

### Page 5: Model Performance

**Audience**: Data Scientist

**Components**:
1. **Model Calibration R²** (gauge chart)
2. **Backtest Results** (table: scenario × predicted vs actual)
3. **Confidence Interval Analysis** (chart: % of actuals within CI)
4. **Feature Importance** (bar chart: which risk indicators most predictive)

**Update Frequency**: Quarterly

---

## Alerting Configuration

### Critical Alerts (Immediate Action)

**Delivery**: Email + SMS + Slack to Chairman

**Conditions**:
1. Forecast accuracy <50% for 2 consecutive quarters → Trigger rollback
2. Risk preparedness <80% → Planning sprint required
3. Critical risk response time >24h → Investigate delay
4. Model calibration R² <0.5 → Methodology review

---

### Warning Alerts (Action Within 1 Week)

**Delivery**: Email to Strategic Planning Team

**Conditions**:
1. Forecast accuracy 50-65% for 1 quarter
2. Risk preparedness 80-95%
3. High risk response time >168h
4. False positive rate >10% for 1 month

---

### Informational Alerts (FYI)

**Delivery**: Dashboard notification (no email)

**Conditions**:
1. New Critical/High risk identified
2. Contingency plan activated
3. Forecast accuracy improves above 80%

---

## Reporting Cadence

### Weekly Report

**Audience**: Risk Analyst, Strategic Planning Team

**Contents**:
- New risks identified this week
- Triggers activated and response times
- Progress on uncovered risks

**Format**: 1-page email summary + link to dashboard

---

### Monthly Report

**Audience**: Chairman

**Contents**:
- Risk preparedness status
- Response time statistics (mean, median, P95)
- Contingency plan activations and effectiveness
- Action items for next month

**Format**: 2-3 page PDF

---

### Quarterly Report

**Audience**: Chairman, Board (if applicable)

**Contents**:
- Forecast accuracy calculation and trend
- Model calibration quality
- Top 5 risks over quarter
- ROI analysis (time saved, impact reduced)
- Recommendations for next quarter

**Format**: 5-10 page presentation

---

## Continuous Improvement Process

### Quarterly Retrospective

**Participants**: Chairman, Risk Analyst, Strategic Planning Team

**Agenda**:
1. Review primary metrics (target achievement)
2. Analyze forecast errors (what went wrong?)
3. Evaluate contingency plan effectiveness (did plans work?)
4. Discuss process improvements (automation, methodology)
5. Update configuration parameters (thresholds, frequencies)

**Output**: Action items for next quarter

---

### Annual Review

**Participants**: Chairman, Leadership Team

**Agenda**:
1. Year-over-year metric trends
2. Automation roadmap progress (RISK-FORECAST family)
3. ROI analysis (investment vs savings)
4. Strategic alignment (are we forecasting the right risks?)
5. Next year's targets and priorities

**Output**: Strategic plan for Stage 37 evolution

---

<!-- Generated by Claude Code Phase 13 | EHG_Engineer@6ef8cf4 | 2025-11-06 -->
