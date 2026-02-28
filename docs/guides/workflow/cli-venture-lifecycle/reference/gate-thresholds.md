
## Table of Contents

- [Threshold Categories](#threshold-categories)
- [Kill Gate Thresholds](#kill-gate-thresholds)
  - [Stage 3: Market Validation](#stage-3-market-validation)
  - [Stage 5: Profitability](#stage-5-profitability)
  - [Stage 13: Tech Stack Feasibility](#stage-13-tech-stack-feasibility)
  - [Stage 23: Production Launch](#stage-23-production-launch)
- [Promotion Gate Thresholds](#promotion-gate-thresholds)
  - [Stage 16: Schema Firewall](#stage-16-schema-firewall)
  - [Stage 17: Environment Ready](#stage-17-environment-ready)
  - [Stage 22: Go-to-Market Ready](#stage-22-go-to-market-ready)
- [Reality Gate Thresholds](#reality-gate-thresholds)
  - [Phase Boundaries](#phase-boundaries)
  - [Artifact Quality Thresholds](#artifact-quality-thresholds)
  - [Artifact Existence Validation](#artifact-existence-validation)
  - [URL Reachability (Build Phases)](#url-reachability-build-phases)
  - [Implementation](#implementation)
- [Decision Filter Thresholds](#decision-filter-thresholds)
  - [Trigger Threshold Summary](#trigger-threshold-summary)
  - [Evaluation Order](#evaluation-order)
  - [Detailed Trigger Thresholds](#detailed-trigger-thresholds)
- [Chairman Preference Overrides](#chairman-preference-overrides)
  - [Which Thresholds Can Chairman Customize](#which-thresholds-can-chairman-customize)
  - [Preference Resolution Order](#preference-resolution-order)
  - [Default Values When No Preference Set](#default-values-when-no-preference-set)
  - [Implementation](#implementation)

---
Category: Reference
Status: Approved
Version: 1.0.0
Author: DOCMON Sub-Agent
Last Updated: 2026-02-08
Tags: [cli-venture-lifecycle, eva, reference, gate-thresholds]
Related SDs: [SD-LEO-ORCH-CLI-VENTURE-LIFECYCLE-001, SD-LEO-INFRA-STAGE-GATES-EXT-001, SD-LEO-INFRA-FILTER-ENGINE-001]
---

# Gate Thresholds Reference

This document is the single source of truth for all quantitative thresholds used in gate evaluations across the CLI Venture Lifecycle. Thresholds are deterministic -- they use fixed numeric comparisons, not AI predictions (Chairman Decision D01).

## Threshold Categories

```
+-------------------+     +-------------------+     +-------------------+
|   KILL GATE       |     |   PROMOTION GATE  |     |   REALITY GATE    |
|   THRESHOLDS      |     |   THRESHOLDS      |     |   THRESHOLDS      |
|                   |     |                   |     |                   |
| Stage 3: score    |     | Stage 16: 80%     |     | Artifact quality  |
| Stage 5: margins  |     | Stage 17: 100%    |     | Artifact exists   |
| Stage 13: score   |     | Stage 22: 100%    |     | URL reachable     |
| Stage 23: multi   |     |                   |     |                   |
+--------+----------+     +--------+----------+     +--------+----------+
         |                         |                          |
         +------------+------------+-------------+------------+
                      |
              +-------+--------+
              |  DECISION      |
              |  FILTER        |
              |  THRESHOLDS    |
              |                |
              | 6 trigger      |
              | types with     |
              | configurable   |
              | thresholds     |
              +----------------+
```

## Kill Gate Thresholds

### Stage 3: Market Validation

| Threshold | Value | Scale | Pass Condition |
|-----------|-------|-------|----------------|
| validation_score | 6 | 1-10 | >= 6 to proceed |

**Composite score breakdown** (6 sub-metrics, each 0-100, averaged to 1-10):

| Sub-Metric | Weight | Min Score | Note |
|------------|--------|-----------|------|
| Market Fit | 1/6 | 0 | No individual minimum |
| Customer Need | 1/6 | 0 | No individual minimum |
| Momentum | 1/6 | 0 | No individual minimum |
| Revenue Potential | 1/6 | 0 | No individual minimum |
| Competitive Barrier | 1/6 | 0 | No individual minimum |
| Execution Feasibility | 1/6 | 0 | No individual minimum |

**Chairman override**: Can adjust the composite threshold (default 6) via preference key `gate.kill3.validation_score_min`.

### Stage 5: Profitability

| Threshold | Default Value | Unit | Pass Condition |
|-----------|---------------|------|----------------|
| Gross Margin | 40% | Percentage | >= threshold |
| Breakeven Months | 18 | Months | <= threshold |
| CAC:LTV Ratio | 1:3 | Ratio | LTV >= 3x CAC |
| ROI Threshold | 15% | Percentage | >= threshold |

All four thresholds must pass simultaneously. Failure on any single threshold triggers Chairman review.

**Chairman preference keys**:

| Preference Key | Default | Type |
|----------------|---------|------|
| `gate.kill5.gross_margin_min` | 0.40 | number |
| `gate.kill5.breakeven_months_max` | 18 | number |
| `gate.kill5.cac_ltv_min_ratio` | 3.0 | number |
| `gate.kill5.roi_threshold_min` | 0.15 | number |

**3-year model requirements**:

| Year | Required Projections |
|------|---------------------|
| Year 1 | Revenue, COGS, Gross Margin, OpEx, Net Income, Cash Flow |
| Year 2 | Same as Year 1, plus growth rate |
| Year 3 | Same as Year 1, plus growth rate and cumulative ROI |

### Stage 13: Tech Stack Feasibility

| Threshold | Value | Scale | Pass Condition |
|-----------|-------|-------|----------------|
| Average viability score | 3.0 | 1-5 | >= 3.0 (60%) |

**8 viability criteria** (each scored 1-5):

| Criterion | Score 1 (Worst) | Score 5 (Best) |
|-----------|-----------------|----------------|
| Scalability | Cannot scale past MVP | Handles 100x growth |
| Security | Major vulnerabilities | Enterprise-grade |
| Cost | Unsustainable | Below industry avg |
| Team Expertise | No experience | Deep expertise |
| Ecosystem Maturity | Bleeding edge | Production-proven |
| Integration Complexity | 6+ months integration | Plug and play |
| Vendor Lock-in Risk | Total lock-in | Fully portable |
| Time to Market | > 12 months to MVP | < 3 months to MVP |

**Risk level classification**:

```
Average Score     Risk Level     Default Action
  >= 4.0          LOW            Auto-proceed likely
  3.0 - 3.9      MEDIUM         Chairman review recommended
  2.0 - 2.9      HIGH           Chairman review required
  < 2.0           CRITICAL       Strong kill recommendation
```

**Chairman override**: Can adjust the composite threshold via preference key `gate.kill13.viability_score_min` (default 3.0).

### Stage 23: Production Launch

Stage 23 is a multi-dimensional gate. There is no single numeric threshold -- instead, three readiness categories must all pass:

**Deployment Readiness**:

| Check | Pass Condition |
|-------|----------------|
| All tests pass | 0 failing tests |
| No critical vulnerabilities | 0 critical/high CVEs open |
| Performance within SLA | Response time < SLA target |
| Stage 22 checklist complete | All 14 items passed |

**Operational Readiness**:

| Check | Pass Condition |
|-------|----------------|
| Monitoring configured | Health checks active |
| Incident plan defined | Escalation paths documented |
| Runbooks complete | All operational procedures written |
| On-call set up | Rotation schedule defined |

**Business Readiness**:

| Check | Pass Condition |
|-------|----------------|
| Financial projections viable | Updated numbers still pass Stage 5 thresholds |
| Market timing favorable | No adverse market changes detected |
| Team capacity sufficient | Team can support launch and operations |
| Support plan in place | Customer support processes defined |

**Post-launch monitoring thresholds** (evaluated after launch):

| Metric | Alert Threshold | Timeline |
|--------|-----------------|----------|
| MRR Growth | < 5% month-over-month | After month 3 |
| Churn Rate | > 10% monthly | Ongoing |
| Burn Rate | > 120% of projected | Ongoing |
| NPS Score | < 20 | After month 2 |

---

## Promotion Gate Thresholds

### Stage 16: Schema Firewall

| Threshold | Value | Pass Condition |
|-----------|-------|----------------|
| Checklist pass rate | 80% | >= 10 of 12 checks |

**12-check breakdown by category**:

| Category | Checks | Count |
|----------|--------|-------|
| Entity Completeness | Entities named, relationships explicit, fields typed | 3 |
| Constraint Coverage | PKs defined, FKs defined, RLS policies stated | 3 |
| API Contract | Endpoints generated, auth requirements, request/response schemas | 3 |
| Story Coverage | All epics have stories, stories have criteria, MoSCoW complete | 3 |

Each check is binary (PASS/FAIL). 10 of 12 must pass. Chairman approval is still required even at 12/12.

### Stage 17: Environment Ready

| Threshold | Value | Pass Condition |
|-----------|-------|----------------|
| Checklist pass rate | 100% | All 6 of 6 checks |

**6-check breakdown**:

| Check | Pass Condition |
|-------|----------------|
| Dev environment | Configured and functional |
| Staging environment | Provisioned and accessible |
| CI/CD pipeline | Build, test, deploy pipeline working |
| Secrets management | Credentials securely stored |
| System prompts | AI configurations defined (if applicable) |
| Monitoring baseline | Health checks and logging active |

All 6 must pass. No partial pass allowed.

### Stage 22: Go-to-Market Ready

| Threshold | Value | Pass Condition |
|-----------|-------|----------------|
| Checklist pass rate | 100% | All 14 of 14 items |

**14-item breakdown by category**:

| Category | Items | Count |
|----------|-------|-------|
| Infrastructure | Prod environment, database, CDN, DNS/SSL | 4 |
| Monitoring | Error tracking, performance monitoring, uptime monitoring | 3 |
| Operations | Runbooks, incident response, rollback procedure, deploy strategy | 4 |
| Compliance | Security scan, performance test, UAT sign-off | 3 |

All 14 must pass. No partial pass allowed. Chairman approval required even at 14/14.

---

## Reality Gate Thresholds

Reality Gates fire at 5 phase boundaries. They are "fail-closed" -- if artifacts are missing or below quality threshold, the transition is blocked (Chairman Decision D02).

### Phase Boundaries

| Boundary | From Stage | To Stage | Phase Transition |
|----------|------------|----------|------------------|
| 1 | 5 | 6 | THE TRUTH -> THE ENGINE |
| 2 | 9 | 10 | THE ENGINE -> THE IDENTITY |
| 3 | 12 | 13 | THE IDENTITY -> THE BLUEPRINT |
| 4 | 16 | 17 | THE BLUEPRINT -> THE BUILD LOOP |
| 5 | 20 | 21 | Within THE BUILD LOOP (pre-QA) |

### Artifact Quality Thresholds

| Artifact Type | Minimum Quality Score | Scale |
|---------------|----------------------|-------|
| problem_statement | 0.6 | 0.0 - 1.0 |
| market_analysis | 0.6 | 0.0 - 1.0 |
| financial_model | 0.7 | 0.0 - 1.0 |
| risk_matrix | 0.6 | 0.0 - 1.0 |
| business_model_canvas | 0.6 | 0.0 - 1.0 |
| brand_genome | 0.5 | 0.0 - 1.0 |
| data_model | 0.7 | 0.0 - 1.0 |
| user_stories | 0.6 | 0.0 - 1.0 |
| schema_definition | 0.7 | 0.0 - 1.0 |
| security_audit | 0.8 | 0.0 - 1.0 |
| performance_benchmark | 0.7 | 0.0 - 1.0 |

Higher thresholds for security/performance/schema artifacts reflect their higher risk if deficient.

### Artifact Existence Validation

Reality Gates check that required artifacts exist in `venture_artifacts` for the relevant stages:

```
Boundary 1 (5->6): Requires artifacts from stages 1-5
    - problem_statement (stage 1)
    - ai_review (stage 2)
    - validation_scores (stage 3)
    - competitive_analysis (stage 4)
    - financial_model (stage 5)

Boundary 2 (9->10): Requires artifacts from stages 6-9
    - risk_matrix (stage 6)
    - pricing_model (stage 7)
    - business_model_canvas (stage 8)
    - exit_strategy (stage 9)

Boundary 3 (12->13): Requires artifacts from stages 10-12
    - brand_genome (stage 10)
    - gtm_strategy (stage 11)
    - sales_logic (stage 12)

Boundary 4 (16->17): Requires artifacts from stages 13-16
    - tech_stack_evaluation (stage 13)
    - data_model (stage 14)
    - user_stories (stage 15)
    - schema_definition (stage 16)

Boundary 5 (20->21): Requires artifacts from stages 17-20
    - environment_config (stage 17)
    - sprint_plan (stage 18)
    - api_specifications (stage 19)
    - security_audit (stage 20)
    - performance_benchmark (stage 20)
```

### URL Reachability (Build Phases)

For stages 17+ (THE BUILD LOOP), Reality Gates optionally verify that deployed URLs are reachable:

| Check | Timeout | Retry |
|-------|---------|-------|
| HTTP GET to health endpoint | 10 seconds | 3 attempts |
| HTTPS certificate valid | 5 seconds | 1 attempt |
| Response status code | 200-299 | -- |

URL checks are only performed if the venture has deployed infrastructure. Pre-deployment stages skip URL validation.

### Implementation

- Reality Gate module: `lib/eva/reality-gates.js`
- Artifact quality lookup: Queries `venture_artifacts.quality_score`
- Boundary definitions: Hardcoded in reality-gates.js (Chairman Decision D02: always-on, not configurable)
- Fail behavior: Returns `{ status: 'FAIL', reasons: [...] }`, blocks stage transition

---

## Decision Filter Thresholds

The Decision Filter Engine uses 6 trigger types, each with configurable thresholds. When any trigger fires, `auto_proceed` is set to `false` and the Chairman must review.

### Trigger Threshold Summary

| # | Trigger Type | Default Threshold | Preference Key | Evaluation |
|---|-------------|-------------------|----------------|------------|
| 1 | cost_threshold | 10,000 USD | `filter.cost_max_usd` | stage_output.cost > threshold |
| 2 | new_tech_vendor | Approved list | `filter.approved_technologies` | tech not in list |
| 3 | strategic_pivot | Baseline comparison | (not configurable) | drift from Stage 1 |
| 4 | low_score | 6 (out of 10) | `filter.min_score_threshold` | stage score < threshold |
| 5 | novel_pattern | Cross-venture check | (not configurable) | no precedent found |
| 6 | constraint_drift | Severity threshold | `filter.max_drift_severity` | severity > threshold |

### Evaluation Order

Triggers are evaluated in fixed order (1 through 6). Evaluation stops short-circuiting ONLY if the system determines auto_proceed = false -- otherwise all 6 are checked. This is deterministic and does not involve AI (Chairman Decision D01).

```
Stage Output
     |
     v
[1] cost > cost_max_usd?
     |
     v
[2] unknown tech/vendor?
     |
     v
[3] strategic direction changed?
     |
     v
[4] score < min_score_threshold?
     |
     v
[5] no historical precedent?
     |
     v
[6] baseline assumptions contradicted?
     |
     v
Result: { auto_proceed, triggers[], recommendation }
```

### Detailed Trigger Thresholds

**1. cost_threshold**

| Parameter | Value |
|-----------|-------|
| Default | 10,000 USD |
| Preference key | `filter.cost_max_usd` |
| Data type | number |
| Source | stage_output.cost |
| Fires when | cost > threshold |

**2. new_tech_vendor**

| Parameter | Value |
|-----------|-------|
| Default | Empty list (all unknown) |
| Preference key | `filter.approved_technologies` |
| Data type | array of strings |
| Source | stage_output.technologies, stage_output.vendors |
| Fires when | Any tech/vendor not in approved list |

**3. strategic_pivot**

| Parameter | Value |
|-----------|-------|
| Default | Automatic comparison |
| Configurable | No |
| Source | Stage 1 vision vs current stage output |
| Fires when | Market position or value proposition fundamentally shifted |

**4. low_score**

| Parameter | Value |
|-----------|-------|
| Default | 6 (out of 10) |
| Preference key | `filter.min_score_threshold` |
| Data type | number |
| Source | stage_output.score |
| Fires when | score < threshold |

**5. novel_pattern**

| Parameter | Value |
|-----------|-------|
| Default | Automatic cross-venture check |
| Configurable | No |
| Source | Cross-venture learning module patterns |
| Fires when | No historical precedent found across completed ventures |

**6. constraint_drift**

| Parameter | Value |
|-----------|-------|
| Default | HIGH severity |
| Preference key | `filter.max_drift_severity` |
| Data type | string (NONE, LOW, MEDIUM, HIGH) |
| Source | Constraint drift detector output |
| Fires when | Detected severity > threshold |

---

## Chairman Preference Overrides

### Which Thresholds Can Chairman Customize

| Gate/Trigger | Threshold | Customizable | Scope |
|-------------|-----------|:------------:|-------|
| Kill Gate 3 | validation_score_min | Yes | Per-venture or global |
| Kill Gate 5 | gross_margin_min | Yes | Per-venture or global |
| Kill Gate 5 | breakeven_months_max | Yes | Per-venture or global |
| Kill Gate 5 | cac_ltv_min_ratio | Yes | Per-venture or global |
| Kill Gate 5 | roi_threshold_min | Yes | Per-venture or global |
| Kill Gate 13 | viability_score_min | Yes | Per-venture or global |
| Kill Gate 23 | (individual metrics) | Yes | Per-venture or global |
| Promotion Gate 16 | (pass rate fixed at 80%) | No | -- |
| Promotion Gate 17 | (pass rate fixed at 100%) | No | -- |
| Promotion Gate 22 | (pass rate fixed at 100%) | No | -- |
| Reality Gates | (artifact thresholds) | No | Fixed by D02 |
| Filter: cost_threshold | cost_max_usd | Yes | Per-venture or global |
| Filter: new_tech_vendor | approved_technologies | Yes | Per-venture or global |
| Filter: strategic_pivot | (automatic) | No | -- |
| Filter: low_score | min_score_threshold | Yes | Per-venture or global |
| Filter: novel_pattern | (automatic) | No | -- |
| Filter: constraint_drift | max_drift_severity | Yes | Per-venture or global |

### Preference Resolution Order

When evaluating a threshold, the system resolves preferences in this order:

```
1. Venture-specific preference (chairman_preferences WHERE venture_id = X)
     |
     +-- Found? Use it
     |
     +-- Not found? Fall through to:
         |
2. Global preference (chairman_preferences WHERE venture_id IS NULL)
     |
     +-- Found? Use it
     |
     +-- Not found? Fall through to:
         |
3. Hardcoded default (DEFAULTS object in decision-filter-engine.js)
```

This is Chairman Decision D03: scoped preference resolution.

### Default Values When No Preference Set

All hardcoded defaults are defined in the `DEFAULTS` object within `lib/eva/decision-filter-engine.js`:

```
DEFAULTS = {
  cost_max_usd: 10000,
  min_score_threshold: 6,
  max_drift_severity: 'HIGH',
  gross_margin_min: 0.40,
  breakeven_months_max: 18,
  cac_ltv_min_ratio: 3.0,
  roi_threshold_min: 0.15,
  viability_score_min: 3.0,
  approved_technologies: []
}
```

### Implementation

- Preference store: `lib/eva/chairman-preference-store.js`
- Preference table: `chairman_preferences`
- Resolution logic: `getPreference(chairmanId, ventureId, key)` with scoped fallback
- Filter engine defaults: `lib/eva/decision-filter-engine.js` (DEFAULTS constant)
