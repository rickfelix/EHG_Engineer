# Stage 12: Metrics & Monitoring


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: database, api, testing, schema

## Overview

This file defines KPIs, measurement queries, and monitoring dashboards for **Stage 12: Adaptive Naming Module**. All metrics align with stages.yaml specification and critique recommendations.

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:519-522 "metrics:...Market acceptance"

---

## Primary Metrics (from stages.yaml)

### Metric 1: Adaptation Coverage
**Definition**: Percentage of target markets with finalized, approved name variations.

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:520 "Adaptation coverage"

**Formula**:
```
Adaptation Coverage = (Markets with Final Name / Total Target Markets) × 100%
```

**Measurement Query**:
```sql
SELECT
  COUNT(DISTINCT nv.market_id) FILTER (WHERE nv.is_final = TRUE) AS finalized_markets,
  COUNT(DISTINCT tm.id) AS total_markets,
  ROUND(
    (COUNT(DISTINCT nv.market_id) FILTER (WHERE nv.is_final = TRUE)::DECIMAL /
     COUNT(DISTINCT tm.id)) * 100,
    2
  ) AS adaptation_coverage_pct
FROM target_markets tm
LEFT JOIN name_variations nv ON tm.id = nv.market_id
WHERE tm.venture_id = {current_venture_id}
  AND tm.status = 'active';
```

**Thresholds**:
- **Excellent**: 100% (all markets covered)
- **Acceptable**: ≥90% (minor gaps acceptable)
- **Unacceptable**: <90% (incomplete localization)

**Decision Authority**: PLAN (approve 90-100% coverage), LEAD (approve <90%)

**Measurement Frequency**: Daily during Stage 12 execution, weekly post-completion

**Dashboard Widget**: Gauge chart (0-100%) with color-coded thresholds

---

### Metric 2: Cultural Fit Score
**Definition**: Average cultural appropriateness rating across all target markets (0-100 scale).

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:521 "Cultural fit score"

**Formula**:
```
Cultural Fit Score = AVG(per_market_cultural_scores)

Per-Market Score Components:
  - Phonetic appropriateness (30%): No offensive sounds, easy pronunciation
  - Connotation neutrality (40%): No negative meanings, positive associations
  - Legal compliance (20%): Trademark available, no restrictions
  - Naming convention fit (10%): Matches local naming norms
```

**Measurement Query**:
```sql
SELECT
  nv.market_id,
  tm.region,
  -- Component scores (0-100)
  cf.phonetic_score * 0.30 +
  cf.connotation_score * 0.40 +
  cf.legal_compliance_score * 0.20 +
  cf.naming_convention_score * 0.10 AS cultural_fit_score,
  -- Overall average
  AVG(
    cf.phonetic_score * 0.30 +
    cf.connotation_score * 0.40 +
    cf.legal_compliance_score * 0.20 +
    cf.naming_convention_score * 0.10
  ) OVER () AS overall_avg_cultural_fit
FROM name_variations nv
JOIN target_markets tm ON nv.market_id = tm.id
JOIN cultural_factors cf ON tm.id = cf.market_id
WHERE nv.is_final = TRUE
  AND tm.venture_id = {current_venture_id};
```

**Thresholds**:
- **Excellent**: ≥85/100 (high cultural fit)
- **Acceptable**: 70-84/100 (moderate fit)
- **Unacceptable**: 60-69/100 (requires variation revision)
- **Critical Failure**: <60/100 (escalate to LEAD for Stage 11 rollback)

**Decision Authority**: PLAN (60-85 range), LEAD (<60 escalations)

**Measurement Frequency**: Per market during Substage 12.1, aggregate at 12.3 completion

**Dashboard Widget**: Bar chart (per-market scores) + overall average line

---

### Metric 3: Market Acceptance
**Definition**: Average audience reception score from market testing (1-5 Likert scale).

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:522 "Market acceptance"

**Formula**:
```
Market Acceptance = AVG(survey_responses.acceptance_score)

Survey Question: "How appealing is the name '[localized_name]' for our product?"
Scale: 1 (Very Unappealing) to 5 (Very Appealing)
```

**Measurement Query**:
```sql
SELECT
  mtr.market_id,
  tm.region,
  nv.localized_name,
  -- Survey stats
  AVG(mtr.acceptance_score) AS avg_acceptance,
  STDDEV(mtr.acceptance_score) AS stddev_acceptance,
  COUNT(mtr.id) AS response_count,
  -- Percentage in each rating
  COUNT(*) FILTER (WHERE mtr.acceptance_score >= 4) / COUNT(*)::DECIMAL AS pct_positive,
  -- Overall average
  AVG(AVG(mtr.acceptance_score)) OVER () AS overall_avg_acceptance
FROM market_testing_results mtr
JOIN target_markets tm ON mtr.market_id = tm.id
JOIN name_variations nv ON mtr.variation_id = nv.id
WHERE nv.is_final = TRUE
  AND tm.venture_id = {current_venture_id}
GROUP BY mtr.market_id, tm.region, nv.localized_name;
```

**Thresholds**:
- **Excellent**: ≥4.0/5.0 (80% acceptance)
- **Acceptable**: 3.5-3.9/5.0 (70-79% acceptance)
- **Unacceptable**: 2.5-3.4/5.0 (50-69% acceptance, requires iteration)
- **Critical Failure**: <2.5/5.0 (escalate to LEAD)

**Decision Authority**: PLAN (2.5-4.0 range), LEAD (<2.5 escalations)

**Measurement Frequency**: After market testing completion (Substage 12.3)

**Dashboard Widget**: Box plot (per-market distributions) + overall average

---

## Secondary Metrics (Operational)

### Metric 4: Translation Success Rate
**Definition**: Percentage of translations verified on first attempt (no revisions needed).

**Formula**:
```
Translation Success Rate = (First-Attempt Verified / Total Translations) × 100%
```

**Measurement Query**:
```sql
SELECT
  COUNT(*) FILTER (WHERE nv.revision_count = 0 AND nv.translation_verified = TRUE) AS first_attempt_success,
  COUNT(*) AS total_translations,
  ROUND(
    (COUNT(*) FILTER (WHERE nv.revision_count = 0 AND nv.translation_verified = TRUE)::DECIMAL /
     COUNT(*)) * 100,
    2
  ) AS success_rate_pct
FROM name_variations nv
JOIN target_markets tm ON nv.market_id = tm.id
WHERE nv.translation_required = TRUE
  AND tm.venture_id = {current_venture_id};
```

**Thresholds**:
- **Excellent**: ≥80% (API quality high, minimal revisions)
- **Acceptable**: 60-79% (moderate revisions)
- **Unacceptable**: <60% (API quality low, switch providers)

**Decision Authority**: Translation Specialist (operational), PLAN (approve provider switch)

**Measurement Frequency**: Daily during Substage 12.2

---

### Metric 5: Phonetic Validation Score
**Definition**: Average phonetic quality score across all finalized variations (0-100 scale).

**Formula**: See File 08 (Configurability Matrix), Parameter 2.3 for scoring criteria.

**Measurement Query**:
```sql
SELECT
  nv.market_id,
  tm.region,
  nv.phonetic_score,
  AVG(nv.phonetic_score) OVER () AS overall_avg_phonetic_score
FROM name_variations nv
JOIN target_markets tm ON nv.market_id = tm.id
WHERE nv.is_final = TRUE
  AND nv.phonetics_validated = TRUE
  AND tm.venture_id = {current_venture_id};
```

**Thresholds**:
- **Excellent**: ≥85/100
- **Acceptable**: 70-84/100
- **Unacceptable**: <70/100

**Decision Authority**: Translation Specialist (operational)

**Measurement Frequency**: Per variation during Substage 12.2

---

### Metric 6: Market Testing Response Rate
**Definition**: Percentage of recruited participants who completed surveys.

**Formula**:
```
Response Rate = (Completed Surveys / Recruited Participants) × 100%
```

**Measurement Query**:
```sql
SELECT
  rp.market_id,
  tm.region,
  COUNT(rp.id) AS recruited_count,
  COUNT(rp.id) FILTER (WHERE rp.survey_completed = TRUE) AS completed_count,
  ROUND(
    (COUNT(rp.id) FILTER (WHERE rp.survey_completed = TRUE)::DECIMAL /
     COUNT(rp.id)) * 100,
    2
  ) AS response_rate_pct
FROM recruited_participants rp
JOIN target_markets tm ON rp.market_id = tm.id
WHERE tm.venture_id = {current_venture_id}
GROUP BY rp.market_id, tm.region;
```

**Thresholds**:
- **Excellent**: ≥70% (high engagement)
- **Acceptable**: 50-69% (moderate engagement)
- **Unacceptable**: <50% (low engagement, increase incentives)

**Decision Authority**: Market Research Analyst (operational)

**Measurement Frequency**: Daily during Substage 12.3 data collection

---

### Metric 7: Stage 12 Cycle Time
**Definition**: Total days from entry gate to exit gate completion.

**Formula**:
```
Cycle Time = exit_gate_passed_at - entry_gate_passed_at (in days)
```

**Measurement Query**:
```sql
SELECT
  s.id,
  s.entry_gate_passed_at,
  s.exit_gates_passed_at,
  EXTRACT(EPOCH FROM (s.exit_gates_passed_at - s.entry_gate_passed_at)) / 86400 AS cycle_time_days,
  -- Substage breakdowns
  EXTRACT(EPOCH FROM (ss1.completed_at - s.entry_gate_passed_at)) / 86400 AS substage_12_1_days,
  EXTRACT(EPOCH FROM (ss2.completed_at - ss1.completed_at)) / 86400 AS substage_12_2_days,
  EXTRACT(EPOCH FROM (s.exit_gates_passed_at - ss2.completed_at)) / 86400 AS substage_12_3_days
FROM stages s
LEFT JOIN substages ss1 ON s.id = ss1.stage_id AND ss1.substage_id = '12.1'
LEFT JOIN substages ss2 ON s.id = ss2.stage_id AND ss2.substage_id = '12.2'
WHERE s.id = 12
  AND s.venture_id = {current_venture_id};
```

**Thresholds**:
- **Excellent**: ≤14 days (target met)
- **Acceptable**: 15-21 days (minor delay)
- **Unacceptable**: >21 days (50%+ overrun, escalate)

**Decision Authority**: PLAN (15-21 days), LEAD (>21 days)

**Measurement Frequency**: Continuous (real-time dashboard)

---

### Metric 8: Stage 12 Budget Utilization
**Definition**: Percentage of allocated budget spent.

**Formula**:
```
Budget Utilization = (Actual Spend / Allocated Budget) × 100%
```

**Measurement Query**:
```sql
SELECT
  SUM(e.amount) FILTER (WHERE e.substage = '12.1') AS substage_12_1_spend,
  SUM(e.amount) FILTER (WHERE e.substage = '12.2') AS substage_12_2_spend,
  SUM(e.amount) FILTER (WHERE e.substage = '12.3') AS substage_12_3_spend,
  SUM(e.amount) AS total_spend,
  20000 AS allocated_budget,  -- From File 08, Parameter CS-1
  ROUND((SUM(e.amount) / 20000) * 100, 2) AS budget_utilization_pct
FROM expenses e
WHERE e.stage_id = 12
  AND e.venture_id = {current_venture_id};
```

**Thresholds**:
- **Excellent**: 80-100% (efficient spend)
- **Acceptable**: 100-150% (overrun <50%, PLAN approval)
- **Unacceptable**: >150% (overrun ≥50%, LEAD approval)

**Decision Authority**: PLAN (100-150%), LEAD (>150%)

**Measurement Frequency**: Daily during Stage 12 execution

---

### Metric 9: Recursion Frequency
**Definition**: Number of times Stage 12 triggered external recursion (to Stage 11 or from Stage 11).

**Formula**:
```
Recursion Frequency = COUNT(recursion_events WHERE stage = 12)
```

**Measurement Query**:
```sql
SELECT
  COUNT(*) FILTER (WHERE re.trigger_type = 'IN-1') AS stage_11_name_changes,
  COUNT(*) FILTER (WHERE re.trigger_type = 'OUT-1') AS cultural_fit_failures,
  COUNT(*) FILTER (WHERE re.trigger_type = 'OUT-2') AS market_acceptance_failures,
  COUNT(*) AS total_recursion_events
FROM recursion_events re
WHERE re.stage_id = 12
  AND re.venture_id = {current_venture_id};
```

**Thresholds**:
- **Excellent**: 0 (no recursion)
- **Acceptable**: 1 (single recursion event)
- **Unacceptable**: ≥2 (multiple recursions, process issue)

**Decision Authority**: LEAD (review if ≥2)

**Measurement Frequency**: Per venture (aggregate post-Stage 12 completion)

---

## Dashboard Specifications

### Dashboard 1: Stage 12 Executive Summary
**Audience**: LEAD, PLAN

**Widgets**:
1. **Adaptation Coverage Gauge**: 0-100% (Metric 1)
2. **Cultural Fit Score Bar Chart**: Per-market + average (Metric 2)
3. **Market Acceptance Box Plot**: Per-market distributions (Metric 3)
4. **Cycle Time Progress**: Days elapsed vs. target (Metric 7)
5. **Budget Utilization Gauge**: Spend vs. allocated (Metric 8)
6. **Alert Panel**: Red flags (cultural fit <60, acceptance <2.5, budget >150%)

**Refresh Rate**: Real-time (WebSocket updates)

**Access Control**: LEAD (full access), PLAN (full access), EXEC (read-only)

---

### Dashboard 2: Stage 12 Operational Details
**Audience**: Localization Strategist, Translation Specialist, Market Research Analyst

**Widgets**:
1. **Market Mapping Progress**: Markets assessed vs. total (Substage 12.1)
2. **Translation Success Rate**: First-attempt verifications (Metric 4)
3. **Phonetic Scores Heatmap**: Per-market phonetic quality (Metric 5)
4. **Market Testing Response Rates**: Per-market recruitment status (Metric 6)
5. **Variation Iteration Tracker**: Number of iterations per market (from File 08, Parameter 3.4)
6. **Substage Progress**: 12.1, 12.2, 12.3 completion percentages

**Refresh Rate**: Hourly

**Access Control**: PLAN (full access), Stage 12 agents (full access), QA (read-only)

---

### Dashboard 3: Stage 12 Quality Gates
**Audience**: QA Validator

**Widgets**:
1. **Entry Gate Status**: Primary name selected? Markets identified?
2. **Substage 12.1 Exit Criteria**: Markets mapped? Cultural factors assessed?
3. **Substage 12.2 Exit Criteria**: Variations created? Translations verified? Phonetics validated?
4. **Substage 12.3 Exit Criteria**: Testing complete? Feedback incorporated? Selections made?
5. **Exit Gate Status**: Variations approved? Localizations complete? Guidelines updated?
6. **Gate Pass/Fail Summary**: Red/green indicators for all gates

**Refresh Rate**: On-demand (manual refresh before gate validations)

**Access Control**: QA (full access), PLAN (read-only)

---

## Alerting & Notifications

### Alert 1: Cultural Fit Critical Failure
**Trigger**: Cultural fit score < 60 in any market

**Action**:
1. Send immediate notification to PLAN (Slack/email)
2. Escalate to LEAD (create escalation ticket)
3. Block Stage 12 progression (substage 12.3 cannot start)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-12.md:47-50 "Add Rollback Procedures"

**Priority**: P1 (critical)

### Alert 2: Market Acceptance Below Threshold
**Trigger**: Market acceptance < 3.5/5.0 in any market

**Action**:
1. Notify Market Research Analyst (feedback incorporation required)
2. Notify PLAN (may require iteration approval)
3. Do NOT block (allow feedback incorporation in Step 12.3.3)

**Priority**: P2 (high)

### Alert 3: Budget Overrun
**Trigger**: Budget utilization > 100%

**Action**:
1. Notify PLAN (approval required for continued spend)
2. If utilization > 150%: Escalate to LEAD
3. Block further expenses until approval obtained

**Priority**: P2 (high)

### Alert 4: Timeline Delay
**Trigger**: Cycle time > target + 50% (e.g., >21 days if target is 14 days)

**Action**:
1. Notify PLAN (timeline review required)
2. Generate delay report (identify bottleneck substage)
3. If delay > 100%: Escalate to LEAD

**Priority**: P3 (medium)

### Alert 5: Low Market Testing Response Rate
**Trigger**: Response rate < 50% after 5 days of data collection

**Action**:
1. Notify Market Research Analyst (increase incentives or extend timeline)
2. Notify PLAN (may impact statistical confidence)
3. Do NOT block (allow analyst to adjust recruitment strategy)

**Priority**: P3 (medium)

---

## Metric Reporting Schedule

### Daily Reports (During Stage 12 Execution)
**Audience**: PLAN, Stage 12 agents

**Contents**:
- Adaptation coverage progress (Metric 1)
- Translation success rate (Metric 4)
- Market testing response rates (Metric 6)
- Budget utilization (Metric 8)
- Cycle time status (Metric 7)

**Delivery**: Email summary + dashboard link (8am daily)

---

### Weekly Reports (During Stage 12 Execution)
**Audience**: LEAD, PLAN

**Contents**:
- All primary metrics (Metrics 1-3)
- Operational metrics summary (Metrics 4-9)
- Red flags and escalations
- Substage completion status
- Projected completion date

**Delivery**: PDF report + executive summary (Monday 8am)

---

### Final Report (Stage 12 Completion)
**Audience**: LEAD, PLAN, Stage 13 team

**Contents**:
- Final values for all metrics (Metrics 1-9)
- Per-market breakdowns (cultural fit, acceptance, variations)
- Lessons learned (recursion events, delays, budget variances)
- Localization guide (link to final deliverable)
- Handoff checklist (exit gates validation)

**Delivery**: Comprehensive PDF report + database export

---

## Metric Validation & Auditing

### Data Quality Checks
**Frequency**: Daily during Stage 12 execution

**Checks**:
1. **Completeness**: All markets have cultural factors records?
2. **Consistency**: Finalized variations match market testing results?
3. **Timeliness**: Cultural assessments completed before name adaptation?
4. **Accuracy**: Phonetic scores calculated using documented formula (File 08, Parameter 2.3)?

**Validation Script**: `scripts/validate-stage-12-metrics.js`

**Run validation**:
```bash
npm run validate:stage-12-metrics
```

---

### Audit Trail
**All metric calculations MUST be logged** in `stage_metrics_audit_log` table:

**Log Schema**:
```sql
CREATE TABLE stage_metrics_audit_log (
  id SERIAL PRIMARY KEY,
  venture_id INTEGER NOT NULL,
  stage_id INTEGER NOT NULL,
  metric_name VARCHAR(100) NOT NULL,
  metric_value DECIMAL(10, 2),
  calculation_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  calculated_by VARCHAR(50),  -- Agent or user ID
  query_used TEXT,            -- SQL query for reproducibility
  notes TEXT
);
```

**Retention**: 2 years (for historical analysis and improvement tracking)

---

## Continuous Improvement

### Metric Tuning Process
**After Stage 12 executes 3-5 times**, review metrics for optimization:

1. **Threshold Calibration**: Adjust thresholds based on actual outcomes
   - Example: If markets with acceptance 3.0-3.5 launch successfully, lower threshold to 3.0
2. **Weighting Adjustments**: Re-balance cultural fit score components (File 08, Parameter 2.3)
   - Example: If connotation issues are rare, reduce connotation weight from 40% → 30%
3. **New Metrics**: Add metrics for emerging patterns
   - Example: If recursion becomes frequent, add "Recursion Cost" metric (person-hours lost)

**Decision Authority**: PLAN (propose tuning), LEAD (approve changes)

**Proposed SD**: **SD-STAGE12-METRICS-TUNING-001** - Metric optimization based on empirical data

---

## Metric Benchmark Targets (Post-Phase 6)

**After 10+ Stage 12 executions**, establish benchmarks:

| Metric | Current Baseline | Target (6 months) | Target (1 year) |
|--------|------------------|-------------------|-----------------|
| Adaptation Coverage | TBD | ≥95% | ≥98% |
| Cultural Fit Score | TBD | ≥75 | ≥80 |
| Market Acceptance | TBD | ≥3.7 | ≥4.0 |
| Translation Success Rate | TBD | ≥70% | ≥80% |
| Cycle Time | TBD | ≤18 days | ≤14 days |
| Budget Utilization | TBD | 90-110% | 85-100% |
| Recursion Frequency | TBD | ≤0.5 events/venture | 0 events/venture |

**Evidence**: Baselines will be established from first 3-5 Stage 12 executions.

---

<!-- Generated by Claude Code Phase 6 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
