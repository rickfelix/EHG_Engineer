---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---

## Table of Contents

- [Metadata](#metadata)
- [Current State Analysis](#current-state-analysis)
  - [Critique Recursion Section: DOES NOT EXIST](#critique-recursion-section-does-not-exist)
- [Gap Assessment](#gap-assessment)
- [Proposed Recursion Architecture](#proposed-recursion-architecture)
  - [Framework Reference](#framework-reference)
  - [Recursion Trigger Definitions](#recursion-trigger-definitions)
  - [Forward Recursion (Stage 19 → Stage 20)](#forward-recursion-stage-19-stage-20)
- [Implementation Requirements](#implementation-requirements)
  - [Database Schema Extensions](#database-schema-extensions)
  - [Integration with SD-RECURSION-ENGINE-001](#integration-with-sd-recursion-engine-001)
  - [Monitoring Dashboard Requirements](#monitoring-dashboard-requirements)
- [Testing Strategy](#testing-strategy)
  - [Unit Tests (per trigger)](#unit-tests-per-trigger)
  - [Integration Tests (with SD-RECURSION-ENGINE-001)](#integration-tests-with-sd-recursion-engine-001)
  - [End-to-End Tests (full recursion cycle)](#end-to-end-tests-full-recursion-cycle)
- [Success Metrics for Recursion System](#success-metrics-for-recursion-system)
- [Rollback and Safety Mechanisms](#rollback-and-safety-mechanisms)
  - [Recursion Limits](#recursion-limits)
  - [Manual Override](#manual-override)
  - [Rollback Triggers](#rollback-triggers)
- [Future Enhancements](#future-enhancements)

<!-- ARCHIVED: 2026-01-26T16:26:47.290Z
     Reason: Duplicate of canonical file
     Original location: docs\workflow\dossiers\stage-19\07_recursion-blueprint.md
     See: docs/fixes/duplicate-consolidation-manifest.json for details
-->

# Stage 19: Recursion Blueprint


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: database, api, testing, unit

## Current State Analysis

### Critique Recursion Section: DOES NOT EXIST

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-19.md:1-72 "72 lines total"

**Observation**: Current critique file contains NO recursion section. This is consistent with the gap pattern identified in Stages 14-18 dossiers.

**Line Count Verification**:
- Stage 19 critique: 72 lines
- Pattern: Identical to Stages 14, 15, 16, 17, 18 (all 72 lines, no recursion)
- Conclusion: Recursion analysis missing from current workflow documentation

## Gap Assessment

**Critical Gap**: No automated triggers for recursive workflow loops
**Impact**:
- Failed integrations cannot automatically trigger corrective actions
- Manual intervention required for integration errors (API failures, latency SLAs not met, fallback configuration missing)
- Delays in integration resolution reduce venture velocity (block Stage 20 start)

**Evidence from Critique**:
- Weakness: "No explicit error handling" (EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-19.md:26)
- Risk: "Primary Risk: Process delays" (EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-19.md:63)
- Recommendation: "Define concrete metrics with thresholds" (EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-19.md:69) - essential for recursion triggers

## Proposed Recursion Architecture

### Framework Reference

**Strategic Directive**: SD-RECURSION-ENGINE-001
**Purpose**: Automate recursive workflow loops for self-healing integration systems
**Status**: Active (per dossier specification)

**Evidence**: SD-RECURSION-ENGINE-001 provides the infrastructure for automated recursion triggers, eliminating manual escalation for known failure patterns.

### Recursion Trigger Definitions

#### Trigger INTEGRATION-001: Integration Success Rate Recursion

**Condition**: Integration success rate <90% after initial Stage 19 execution

**Metric Definition**:
- **Integration Success Rate**: (Passing integration tests / Total integration tests) × 100%
- **Target**: ≥90% (all critical APIs passing)
- **Threshold**: <90% indicates failing integrations (missing error handling, incorrect API configuration)

**Recursion Targets**:
1. **Stage 19 (self-recursion, Substage 19.1)**: If integration failures due to transient errors or test configuration
   - Evidence: Network timeout, API rate limit (temporary issues)
   - Action: Re-execute Substage 19.1 (Integration Testing) with retry logic
2. **Stage 14 (Development Prep)**: If integration failures due to missing error handling or circuit breakers
   - Evidence: API errors not handled gracefully (crashes, no retry logic)
   - Action: Recurse to Stage 14 to implement error handling, then re-run Stage 19

**Automation Logic**:
```sql
-- Trigger query (runs immediately after Stage 19 completion)
SELECT venture_id,
       integration_success_rate,
       total_tests - passing_tests AS failing_tests
FROM stage_19_integration_metrics
WHERE integration_success_rate < 90;

-- If returned rows > 0, invoke SD-RECURSION-ENGINE-001 with target_stage = 19 or 14
```

**Expected Outcome**:
- Automated recursion to Stage 19 (Substage 19.1) or Stage 14
- Integration errors fixed (error handling implemented, API configuration corrected)
- Integration success rate raised to ≥90%

**Evidence Mapping**:
- Integration success rate metric: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:841 "Integration success rate"
- Integration testing substage: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:853-858 "Integration Testing"

#### Trigger INTEGRATION-002: API Reliability Recursion

**Condition**: API reliability <99% after Stage 19 completion

**Metric Definition**:
- **API Reliability**: (Successful API calls / Total API calls) × 100%
- **Measurement**: Monitor API calls over 24-hour period
- **Target**: ≥99% (99% uptime SLA)
- **Threshold**: <99% indicates unreliable API (high error rate, transient failures)

**Recursion Targets**:
1. **Stage 19 (self-recursion, Substage 19.3)**: If reliability issues due to missing fallbacks
   - Evidence: No circuit breakers configured, no retry logic implemented
   - Action: Re-execute Substage 19.3 (Fallback Configuration) to implement circuit breakers
2. **Stage 10 (Technical Review)**: If reliability issues due to architectural problems
   - Evidence: API architecture fundamentally broken (wrong API version, incorrect endpoints)
   - Action: Recurse to Stage 10 for architecture review, redesign API integration

**Automation Logic**:
```sql
-- Trigger query (runs daily via cron)
WITH api_calls AS (
  SELECT venture_id,
         api_name,
         COUNT(*) FILTER (WHERE status_code BETWEEN 200 AND 299)::FLOAT /
           NULLIF(COUNT(*), 0) * 100 AS reliability_percentage
  FROM api_call_logs
  WHERE venture_id = 'VENTURE-001'
    AND called_at >= NOW() - INTERVAL '24 hours'
  GROUP BY venture_id, api_name
)
SELECT venture_id, api_name, reliability_percentage
FROM api_calls
WHERE reliability_percentage < 99;

-- If returned rows > 0, invoke SD-RECURSION-ENGINE-001 with target_stage = 19 or 10
```

**Expected Outcome**:
- Automated recursion to Stage 19 (Substage 19.3) or Stage 10
- Fallback strategies implemented (circuit breakers, retry logic, cached data)
- API reliability raised to ≥99%

**Evidence Mapping**:
- API reliability metric: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:842 "API reliability"
- Fallback configuration substage: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:866-870 "Fallback Configuration"

#### Trigger INTEGRATION-003: Latency SLA Recursion

**Condition**: API latency p95 >1000ms after Stage 19 completion

**Metric Definition**:
- **Latency Metrics**: API response time (p50, p95, p99 latency)
- **Measurement**: Load testing (k6, JMeter)
- **Target**: p95 <1000ms (95% of requests complete in <1 second)
- **Threshold**: p95 >1000ms indicates performance issues (slow API, network latency)

**Recursion Targets**:
1. **Stage 10 (Technical Review)**: If latency issues due to architectural problems
   - Evidence: No caching layer, inefficient API usage (N+1 queries)
   - Action: Recurse to Stage 10 for architecture review, add caching strategy
2. **Stage 19 (self-recursion, Substage 19.2)**: If latency issues due to incorrect performance testing
   - Evidence: Performance tests configured incorrectly (wrong load profile)
   - Action: Re-execute Substage 19.2 (Performance Validation) with corrected tests

**Automation Logic**:
```sql
-- Trigger query (runs after Substage 19.2 completion)
SELECT venture_id,
       api_name,
       latency_p95_ms
FROM stage_19_performance_metrics
WHERE latency_p95_ms > 1000;

-- If returned rows > 0, invoke SD-RECURSION-ENGINE-001 with target_stage = 10 or 19
```

**Expected Outcome**:
- Automated recursion to Stage 10 (architecture review) or Stage 19 (Substage 19.2)
- Caching strategy implemented (Redis, CDN) or performance tests corrected
- API latency p95 reduced to <1000ms

**Evidence Mapping**:
- Latency metrics: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:843 "Latency metrics"
- Performance validation substage: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:859-864 "Performance Validation"
- SLAs met exit gate: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:851 "SLAs met"

#### Trigger INTEGRATION-004: Circuit Breaker Activation Recursion

**Condition**: Circuit breaker activation detected (API failures exceed threshold)

**Metric Definition**:
- **Circuit Breaker Activation**: Circuit breaker opens (blocks API calls after N consecutive failures)
- **Threshold**: Immediate (any circuit breaker activation triggers recursion)
- **Detection**: Real-time (during production monitoring)

**Recursion Targets**:
1. **Stage 19 (self-recursion, Substage 19.3)**: Immediate fallback, log for Stage 19 re-execution
   - Evidence: Circuit breaker opened due to API failures (API server down, network issues)
   - Action: Activate fallback data source (cached data), log incident, schedule Stage 19 re-execution (after API recovery)
2. **Stage 14 (Development Prep)**: If circuit breaker activation due to code errors
   - Evidence: Code bugs causing API failures (incorrect API calls, authentication errors)
   - Action: Recurse to Stage 14 to fix code, then re-run Stage 19

**Automation Logic**:
```sql
-- Trigger query (runs hourly via cron)
SELECT venture_id,
       api_name,
       circuit_breaker_status,
       opened_at
FROM circuit_breaker_events
WHERE venture_id = 'VENTURE-001'
  AND circuit_breaker_status = 'open'
  AND opened_at >= NOW() - INTERVAL '1 hour';

-- If returned rows > 0, activate fallback, invoke SD-RECURSION-ENGINE-001 with target_stage = 19 or 14
```

**Expected Outcome**:
- Immediate fallback activation (use cached data, degraded mode)
- Automated recursion to Stage 19 (Substage 19.3) or Stage 14 (after API recovery or code fix)
- Circuit breaker reset, API calls resume

**Evidence Mapping**:
- Circuit breakers set done_when: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:869 "Circuit breakers set"
- Critique weakness: "No explicit error handling" (EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-19.md:26) - this trigger provides automated error handling

### Forward Recursion (Stage 19 → Stage 20)

**Trigger**: All exit gates passed + integration success rate ≥90% + API reliability ≥99% + latency p95 <1000ms

**Condition**: Normal progression (no errors in Stage 19)

**Action**: Forward-recurse to Stage 20 (Enhanced Context Loading)

**Automation Logic**:
```sql
-- Trigger query (runs immediately after Stage 19 validation)
SELECT venture_id
FROM stage_19_completion_status
WHERE integration_success_rate >= 90
  AND api_reliability >= 99
  AND latency_p95_ms < 1000
  AND fallbacks_configured = true;

-- If returned rows > 0, trigger Stage 20 start (not recursion, normal progression)
```

**Evidence Mapping**:
- Downstream impact: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-19.md:59 "Downstream Impact: Stages 20"
- Exit gates: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:849-851 "All integrations verified, Fallbacks configured, SLAs met"

## Implementation Requirements

### Database Schema Extensions

```sql
-- Recursion trigger log for Stage 19
CREATE TABLE stage_19_recursion_triggers (
  trigger_id UUID PRIMARY KEY,
  venture_id VARCHAR(50),
  trigger_type VARCHAR(50),  -- 'INTEGRATION-001', 'INTEGRATION-002', etc.
  trigger_condition TEXT,
  metric_value FLOAT,
  threshold_value FLOAT,
  target_stage INT,  -- 19 (self), 14, or 10
  target_substage VARCHAR(10),  -- '19.1', '19.2', '19.3' (if self-recursion)
  triggered_at TIMESTAMP DEFAULT NOW(),
  recursion_status VARCHAR(20)  -- 'pending', 'executing', 'completed', 'failed'
);

-- Stage 19 integration metrics (for trigger queries)
CREATE TABLE stage_19_integration_metrics (
  metric_id UUID PRIMARY KEY,
  venture_id VARCHAR(50),
  total_tests INT,
  passing_tests INT,
  failing_tests INT,
  integration_success_rate FLOAT,  -- Calculated: (passing_tests / total_tests) * 100
  measured_at TIMESTAMP DEFAULT NOW()
);

-- Stage 19 performance metrics (for INTEGRATION-003 trigger)
CREATE TABLE stage_19_performance_metrics (
  metric_id UUID PRIMARY KEY,
  venture_id VARCHAR(50),
  api_name VARCHAR(100),
  latency_p50_ms FLOAT,
  latency_p95_ms FLOAT,
  latency_p99_ms FLOAT,
  throughput_req_sec FLOAT,
  measured_at TIMESTAMP DEFAULT NOW()
);

-- Circuit breaker events (for INTEGRATION-004 trigger)
CREATE TABLE circuit_breaker_events (
  event_id UUID PRIMARY KEY,
  venture_id VARCHAR(50),
  api_name VARCHAR(100),
  circuit_breaker_status VARCHAR(20),  -- 'open', 'closed', 'half-open'
  error_threshold_exceeded BOOLEAN,
  opened_at TIMESTAMP,
  reset_at TIMESTAMP
);
```

### Integration with SD-RECURSION-ENGINE-001

**Required API Endpoints**:
1. `POST /api/recursion/trigger`: Initiate recursion
   - Parameters: `venture_id`, `source_stage` (19), `target_stage` (19/14/10), `trigger_type` (INTEGRATION-001, etc.), `context_data` (metric values)
   - Response: `recursion_execution_id`

2. `GET /api/recursion/status/{execution_id}`: Check recursion status
   - Response: `status` (pending/executing/completed/failed), `progress_percentage`, `estimated_completion`

3. `POST /api/recursion/approve`: Manual approval gate (if required for destructive operations)
   - Parameters: `execution_id`, `approved_by`, `approval_notes`

**Evidence**: These endpoints enable automated recursion while maintaining EXEC oversight (per EXEC agent responsibilities in Stage 19, EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-19.md:18 "Clear ownership (EXEC)").

### Monitoring Dashboard Requirements

**Dashboard: Stage 19 Recursion Health**
- **Metrics**:
  - Recursion trigger count (last 30 days) by type (INTEGRATION-001, INTEGRATION-002, etc.)
  - Most common trigger (identify systematic issues)
  - Average time to recursion completion
  - Recursion success rate (% of executions that resolved the issue)

- **Alerts**:
  - >5 INTEGRATION-001 triggers for same venture in 7 days (persistent integration failures)
  - >3 INTEGRATION-004 triggers in 24 hours (circuit breakers constantly opening)
  - Recursion execution >4 hours (investigate delays, should be <2 hours)

**Visualization**: Sankey diagram showing recursion flows (Stage 19 → Stage 19, Stage 19 → Stage 14, Stage 19 → Stage 10)

## Testing Strategy

### Unit Tests (per trigger)
1. Test trigger condition detection (mock integration metrics below thresholds)
2. Validate threshold calculations (ensure correct formulas)
3. Test target stage selection logic (INTEGRATION-001 → Stage 19 vs Stage 14)

### Integration Tests (with SD-RECURSION-ENGINE-001)
1. Trigger recursion via API (test POST /api/recursion/trigger)
2. Verify recursion execution starts (check status endpoint)
3. Simulate target stage completion (mock corrected integration metrics)
4. Validate Stage 19 re-execution with fixes

### End-to-End Tests (full recursion cycle)
1. Deploy venture with intentionally failing API integration (invalid API key)
2. Run Stage 19, expect INTEGRATION-001 trigger (success rate <90%)
3. Verify automated recursion to Stage 14 (add error handling)
4. Re-run Stage 19, validate integration success rate improvement (≥90%)

**Evidence**: Testing strategy aligns with substage 19.1 requirement "Error handling confirmed" (implicitly, via error simulation tests).

## Success Metrics for Recursion System

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| **Time to Detect Issue** | <5 minutes | Trigger query execution frequency (immediate post-Stage 19) |
| **Time to Initiate Recursion** | <1 minute | API call latency |
| **Time to Complete Recursion** | <2 hours | End-to-end cycle time (substage re-execution) |
| **Recursion Success Rate** | >95% | % of recursions that resolve issue (raise metric above threshold) |
| **False Positive Rate** | <5% | % of triggered recursions deemed unnecessary by EXEC |

**Evidence**: These targets address critique weakness "Process delays" (EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-19.md:63) by automating corrective actions.

## Rollback and Safety Mechanisms

### Recursion Limits
- **Max Recursions per Venture**: 10 per Stage 19 execution (prevent infinite loops)
- **Max Recursive Depth**: 2 levels (Stage 19 → Stage 14 → Stage 19 only, no deeper)
- **Cooldown Period**: 1 hour between recursions to same target stage (avoid thrashing)

### Manual Override
- EXEC agent can:
  1. Pause automated recursion for specific venture (manual fix in progress)
  2. Override trigger thresholds (adjust <90% to <80%, etc., for exceptional cases)
  3. Force recursion to non-standard stage (e.g., Stage 10 when INTEGRATION-001 triggers)
  4. Cancel in-progress recursion (abort if taking too long)

### Rollback Triggers
If recursion WORSENS metrics (e.g., integration success rate drops further after Stage 19 self-recursion):
1. Automatically revert to previous API configuration (stored in `api_config_snapshots` table)
2. Pause automated recursion for this venture
3. Escalate to EXEC for manual intervention

**Evidence**: Addresses critique weakness "Unclear rollback procedures" (EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-19.md:24).

## Future Enhancements

1. **Predictive Recursion**: Trigger recursion BEFORE metrics fall below thresholds (ML model predicts integration failures based on API error rate trends)
2. **Multi-Stage Recursion**: Recurse to multiple stages simultaneously (Stage 14 + Stage 10 in parallel if both error handling and architecture need fixes)
3. **Recursion Recommendations**: AI suggests optimal target stage based on error logs and historical data
4. **Cross-Venture Learning**: Apply successful recursion patterns from one venture to others (e.g., if INTEGRATION-001 common for payment ventures, pre-implement Stripe error handling)

**Evidence**: These enhancements further automate Stage 19, exceeding the "80% automation" target (EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-19.md:33).

---

**Implementation Priority**: HIGH (recursion is critical for self-healing integration system)
**Estimated Implementation Time**: 2-3 sprints (4-6 weeks)
**Cross-Reference**: SD-RECURSION-ENGINE-001, 09_metrics-monitoring.md (trigger thresholds), 10_gaps-backlog.md (related SDs)

<!-- Generated by Claude Code Phase 8 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
