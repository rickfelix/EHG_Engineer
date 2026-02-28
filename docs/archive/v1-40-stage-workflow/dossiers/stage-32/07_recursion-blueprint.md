---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# Stage 32: Customer Success & Retention Engineering — Recursion Blueprint


## Table of Contents

- [Purpose](#purpose)
- [Recursion Architecture](#recursion-architecture)
  - [Integration Points](#integration-points)
- [RETENTION-001: Customer Health Score Drops](#retention-001-customer-health-score-drops)
  - [Trigger Condition](#trigger-condition)
  - [Automated Response](#automated-response)
  - [Recursion Depth](#recursion-depth)
- [RETENTION-002: Retention Rate Below Target](#retention-002-retention-rate-below-target)
  - [Trigger Condition](#trigger-condition)
  - [Automated Response](#automated-response)
  - [Recursion Depth](#recursion-depth)
- [RETENTION-003: NPS Negative](#retention-003-nps-negative)
  - [Trigger Condition](#trigger-condition)
  - [Automated Response](#automated-response)
  - [Recursion Depth](#recursion-depth)
- [RETENTION-004: Success System Active](#retention-004-success-system-active)
  - [Trigger Condition](#trigger-condition)
  - [Automated Response](#automated-response)
  - [Recursion Depth](#recursion-depth)
- [Recursion Metrics](#recursion-metrics)
- [Chairman Override Scenarios](#chairman-override-scenarios)
- [Implementation Blockers](#implementation-blockers)
- [Precedent: Stage 16 & 24 Recursion Patterns](#precedent-stage-16-24-recursion-patterns)
- [Sources Table](#sources-table)

**Generated**: 2025-11-06
**Version**: 1.0

---

## Purpose

This blueprint proposes 4 recursion triggers (RETENTION-001 through RETENTION-004) to enable self-healing customer success operations aligned with Stage 32 objectives.

**Context**: Stage 32 scored 2/5 on Recursion Readiness (EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-32.md:15 "Generic recursion support pending")

---

## Recursion Architecture

### Integration Points

**Database Tables**:
- `recursion_triggers` - Define trigger conditions
- `recursion_executions` - Log execution history
- `recursion_metrics` - Track effectiveness

**Agent Crew**: CustomerSuccessCrew (see `06_agent-orchestration.md`)
- SuccessInfrastructureArchitect
- HealthMonitoringSpecialist
- RetentionProgramDesigner
- NPSTracker

**Oversight**: EVA-owned with Chairman escalation capability

---

## RETENTION-001: Customer Health Score Drops

### Trigger Condition

```sql
-- Query: customer_health_scores materialized view (updated daily)
SELECT user_id, total_health_score, previous_health_score
FROM customer_health_scores
WHERE total_health_score < 40  -- Critical threshold
  AND previous_health_score >= 40  -- Dropped from higher state
  AND last_intervention IS NULL OR last_intervention < NOW() - INTERVAL '7 days';
```

**Threshold**: Health score drops below 40 (Critical range: 0-39)
**Frequency**: Daily check (aligned with health score refresh schedule)
**Cooldown**: 7 days between interventions for same customer

**Evidence**: Health score metric defined in EHG_Engineer@468a959:docs/workflow/stages.yaml:1440 "Customer health score"

---

### Automated Response

**Agent**: HealthMonitoringSpecialist

**Actions**:
1. Generate critical customer alert (Slack + email to success team)
2. Trigger critical customer playbook (immediate outreach)
3. Update CRM with health score change and intervention timestamp
4. Schedule follow-up check (48 hours)
5. Escalate to Chairman if no response within 48 hours

**Expected Outcome**:
- Customer contacted within 24 hours
- Issue identified (lack of engagement, unresolved support ticket, missing feature)
- Intervention plan executed (feature training, priority support, special offer)

**Success Metric**: Health score increases to ≥40 within 30 days (recovery rate target: ≥30%)

---

### Recursion Depth

**Max Depth**: 3 iterations
- **Iteration 1**: Critical customer playbook execution
- **Iteration 2**: Chairman escalation (if no response)
- **Iteration 3**: Win-back campaign (if churned)

**Termination Conditions**:
1. Health score recovers to ≥40
2. Customer responds to intervention
3. Customer churns (subscription canceled)
4. Max depth reached (3 iterations)

---

## RETENTION-002: Retention Rate Below Target

### Trigger Condition

```sql
-- Query: Monthly retention rate calculation
WITH retention_cohort AS (
  SELECT
    DATE_TRUNC('month', created_at) AS cohort_month,
    COUNT(DISTINCT user_id) AS cohort_size,
    COUNT(DISTINCT CASE WHEN last_login > NOW() - INTERVAL '30 days' THEN user_id END) AS retained_users
  FROM users
  WHERE created_at >= NOW() - INTERVAL '3 months'
  GROUP BY cohort_month
)
SELECT
  cohort_month,
  cohort_size,
  retained_users,
  (retained_users::FLOAT / cohort_size) * 100 AS retention_rate
FROM retention_cohort
WHERE retention_rate < 85;  -- Target threshold (adjust based on industry)
```

**Threshold**: Retention rate <85% (baseline to be established in first 30 days post-launch)
**Frequency**: Monthly check
**Cooldown**: None (campaign adjustments can be made each month)

**Evidence**: Retention rate metric defined in EHG_Engineer@468a959:docs/workflow/stages.yaml:1441 "Retention rate"

⚠️ **Threshold Gap**: No specific target in stages.yaml (proposed 85% subject to SD-METRICS-FRAMEWORK-001)

---

### Automated Response

**Agent**: RetentionProgramDesigner

**Actions**:
1. Analyze churn reasons (exit surveys, support tickets)
2. Identify patterns (feature gaps, onboarding friction, pricing concerns)
3. Adjust retention campaigns:
   - Increase touchpoint frequency for at-risk customers
   - A/B test new messaging focused on identified pain points
   - Offer feature training or priority support
4. Report findings to Stage 33 (Post-MVP Expansion) for product improvements
5. Re-evaluate retention rate after 30 days

**Expected Outcome**:
- Retention rate improves by ≥5% within 60 days
- Churn reasons documented and addressed
- Product roadmap informed by customer feedback

**Success Metric**: Retention rate increases to ≥85% (exit gate: "Retention improving")

---

### Recursion Depth

**Max Depth**: 6 iterations (monthly for 6 months)
- **Iterations 1-3**: Campaign adjustments, A/B testing
- **Iterations 4-6**: Product changes (if feature gaps identified), pricing adjustments

**Termination Conditions**:
1. Retention rate reaches ≥85%
2. Max depth reached (6 months of adjustments)
3. Chairman intervention (strategic pivot required)

---

## RETENTION-003: NPS Negative

### Trigger Condition

```sql
-- Query: NPS score calculation
WITH nps_responses AS (
  SELECT
    survey_id,
    user_id,
    score,  -- 0-10 scale
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
  COUNT(*) FILTER (WHERE category = 'detractor') AS detractors,
  ((COUNT(*) FILTER (WHERE category = 'promoter')::FLOAT / COUNT(*)) -
   (COUNT(*) FILTER (WHERE category = 'detractor')::FLOAT / COUNT(*))) * 100 AS nps_score
FROM nps_responses
HAVING nps_score < 0;  -- Negative NPS (exit gate failure)
```

**Threshold**: NPS score <0 (more detractors than promoters)
**Frequency**: Weekly check (after ≥100 responses collected)
**Cooldown**: None (escalation required for negative NPS)

**Evidence**: NPS metric defined in EHG_Engineer@468a959:docs/workflow/stages.yaml:1442 "NPS score"
**Exit Gate**: EHG_Engineer@468a959:docs/workflow/stages.yaml:1450 "NPS positive"

---

### Automated Response

**Agent**: NPSTracker

**Actions**:
1. **Immediate Escalation**: Notify Chairman via Slack/email (negative NPS is critical)
2. Analyze detractor feedback:
   - Categorize by issue type (product, support, pricing, onboarding)
   - Identify top 3 pain points
3. Generate emergency action plan:
   - Product issues → Escalate to Stage 33 (Post-MVP Expansion)
   - Support issues → Increase support team capacity, training
   - Pricing issues → Chairman decision on pricing adjustments
4. Deploy urgent feedback surveys to detractors (understand root causes)
5. Track NPS recovery over next 30 days

**Expected Outcome**:
- Root causes identified within 7 days
- Action plan executed within 14 days
- NPS recovers to ≥0 within 60 days

**Success Metric**: NPS score ≥0 (exit gate requirement)

---

### Recursion Depth

**Max Depth**: 1 iteration (Chairman takes control after trigger)
- **Iteration 1**: NPSTracker analyzes and generates action plan → Chairman reviews and directs response

**Termination Conditions**:
1. NPS recovers to ≥0
2. Chairman authorizes strategic pivot (product repositioning, pricing overhaul)

---

## RETENTION-004: Success System Active

### Trigger Condition

```sql
-- Query: Success system health check
SELECT
  (SELECT COUNT(*) FROM customer_health_scores WHERE calculated_at > NOW() - INTERVAL '2 days') AS active_health_scores,
  (SELECT COUNT(*) FROM crm_sync_log WHERE synced_at > NOW() - INTERVAL '1 day' AND status = 'success') AS successful_crm_syncs,
  (SELECT COUNT(*) FROM retention_campaigns WHERE status = 'active') AS active_campaigns,
  (SELECT COUNT(*) FROM nps_surveys WHERE deployed_at > NOW() - INTERVAL '7 days') AS recent_nps_surveys
HAVING
  active_health_scores > 0 AND
  successful_crm_syncs > 0 AND
  active_campaigns > 0 AND
  recent_nps_surveys > 0;
```

**Threshold**: All 4 system components operational
**Frequency**: Hourly health check
**Cooldown**: None (continuous monitoring)

**Evidence**: Exit gate defined in EHG_Engineer@468a959:docs/workflow/stages.yaml:1448 "Success system active"

---

### Automated Response

**Agent**: SuccessInfrastructureArchitect

**Actions**:
1. Monitor system health every hour
2. If any component fails:
   - **Health score calculation failure** → Re-run materialized view refresh, alert on repeated failures
   - **CRM sync failure** → Retry API call, check credentials, alert if persistent
   - **Campaign execution failure** → Check CRM workflow status, restart if stalled
   - **NPS survey deployment failure** → Verify survey tool integration, redeploy
3. Log all failures in `system_health_log` table
4. Escalate to EVA if ≥3 consecutive failures
5. Generate weekly uptime report (target: ≥99.5%)

**Expected Outcome**:
- System downtime <0.5% (≥99.5% uptime)
- Failures detected and resolved within 1 hour
- No manual intervention required for transient issues

**Success Metric**: "Success system active" exit gate maintained continuously

---

### Recursion Depth

**Max Depth**: Unlimited (continuous monitoring)
- **Iteration N**: Detect failure → Retry → Log → Escalate if persistent

**Termination Conditions**:
1. System fully operational (all 4 components active)
2. EVA intervention required (infrastructure-level issue)

---

## Recursion Metrics

**Tracking Table**: `recursion_metrics`

| Trigger | Metric | Target | Actual | Status |
|---------|--------|--------|--------|--------|
| RETENTION-001 | Recovery rate (health score ≥40 within 30 days) | ≥30% | TBD | ⚠️ Not Implemented |
| RETENTION-002 | Retention rate improvement (within 60 days) | ≥5% | TBD | ⚠️ Not Implemented |
| RETENTION-003 | NPS recovery time (to ≥0) | ≤60 days | TBD | ⚠️ Not Implemented |
| RETENTION-004 | System uptime | ≥99.5% | TBD | ⚠️ Not Implemented |

**Dashboard**: Customer Success Recursion Dashboard (proposed)
- Real-time trigger status
- Historical execution logs
- Effectiveness trends

---

## Chairman Override Scenarios

**When Chairman intervention required**:
1. RETENTION-001: No customer response within 48 hours (high-value account)
2. RETENTION-002: Retention rate not improving after 3 months of adjustments
3. RETENTION-003: NPS negative (immediate escalation)
4. RETENTION-004: System failures >3 consecutive times

**Override Capabilities**:
- Authorize special offers (discounts, extended trials)
- Schedule executive calls with at-risk customers
- Direct product roadmap changes (input to Stage 33)
- Approve pricing adjustments
- Pause retention campaigns if causing negative feedback

---

## Implementation Blockers

**Current Status**: ❌ Not Implemented

**Blocking Dependencies**:
1. **SD-METRICS-FRAMEWORK-001** (P0 CRITICAL, status=queued)
   - No standardized thresholds for health score, retention rate, NPS
   - See `10_gaps-backlog.md` for details

2. **SD-CUSTOMER-SUCCESS-AUTOMATION-001** (PROPOSED, P0 CRITICAL)
   - EVA infrastructure for Stage 32 not built
   - CustomerSuccessCrew agents not implemented
   - Recursion trigger system not integrated

3. **Recursion Infrastructure** (from Stage 16)
   - Generic recursion support pending (2/5 Recursion Readiness)
   - Evidence: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-32.md:15

---

## Precedent: Stage 16 & 24 Recursion Patterns

**Stage 16 (AI CEO Agent)**: First EVA-owned stage with self-directed decision-making
**Stage 24 (MVP Engine)**: Second EVA-owned stage with build automation

**Stage 32 Pattern**: Third EVA-owned stage with customer success automation
- Extends EVA capabilities to post-launch operations
- Introduces customer-facing recursion (RETENTION-001, RETENTION-003)
- Maintains Chairman oversight for strategic decisions

---

## Sources Table

| Source | Repo | Commit | Path | Lines | Purpose |
|--------|------|--------|------|-------|---------|
| Recursion score | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-32.md | 15 | 2/5 Recursion Readiness |
| Health score metric | EHG_Engineer | 468a959 | docs/workflow/stages.yaml | 1440 | Customer health score |
| Retention rate metric | EHG_Engineer | 468a959 | docs/workflow/stages.yaml | 1441 | Retention rate |
| NPS metric | EHG_Engineer | 468a959 | docs/workflow/stages.yaml | 1442 | NPS score |
| Exit gates | EHG_Engineer | 468a959 | docs/workflow/stages.yaml | 1448-1450 | Success system active, Retention improving, NPS positive |
| EVA ownership | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-32.md | 19 | Clear ownership (EVA) |

---

**Next**: See `08_configurability-matrix.md` for tunable parameters.

<!-- Generated by Claude Code Phase 11 | EHG_Engineer@6ef8cf4 | 2025-11-06 -->
