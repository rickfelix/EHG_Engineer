# Stage 27: Gaps & Backlog

**Stage**: Actor Model & Saga Transaction Integration
**Overall Score**: 2.9/5.0 (58% maturity)
**Purpose**: Identify gaps, reference universal blockers, propose strategic directives

---

## Identified Gaps (from Critique)

### Gap 1: Limited Automation

**Current State**: Manual implementation process (progression mode: Manual → Assisted → Auto)
- Evidence: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-27.md:24 "Limited automation for manual processes"`
- Evidence: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1240 "progression_mode: Manual → Assisted → Auto (suggested)"`

**Target State**: 80% automation
- Evidence: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-27.md:32-34 "Target State: 80% automation"`

**Impact**:
- Automation Leverage scored 3/5 (moderate)
- Manual implementation is time-consuming (2-4 weeks per actor/saga system)
- High risk of human error in supervision configuration and compensation logic

**Proposed Solution**: Implement ActorSagaCrew (see `06_agent-orchestration.md`)
- 4 specialized agents: Actor Architect, Saga Orchestrator, Event Sourcing Specialist, Consistency Validator
- Auto-generate actor scaffolding, saga flowcharts, event schemas, and consistency validation queries
- Estimated automation level: 70-80%

---

### Gap 2: Missing Metric Thresholds

**Current State**: Metrics defined but thresholds and measurement frequency missing
- Evidence: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-27.md:38 "Missing: Threshold values, measurement frequency"`
- Evidence: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-27.md:9 "Testability: 3, Metrics defined but validation criteria unclear"`

**Defined Metrics** (from stages.yaml):
1. Transaction success rate
2. Latency metrics
3. Consistency score

**Impact**:
- Cannot determine when Stage 27 is "done" (no exit criteria thresholds)
- Cannot trigger alerts or recursion automatically
- Testability scored 3/5 (moderate) due to unclear validation criteria

**Proposed Solution**: Define concrete thresholds (see `08_configurability-matrix.md` and `09_metrics-monitoring.md`)
- Transaction success rate: ≥99.5% (prod), ≥90% (dev)
- Latency metrics: p95 ≤200ms, p99 ≤500ms (saga steps)
- Consistency score: ≥99.9% (prod), ≥95% (dev)

---

### Gap 3: Unclear Rollback Procedures

**Current State**: No rollback defined for failed sagas or compensation failures
- Evidence: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-27.md:25 "Unclear rollback procedures"`
- Evidence: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-27.md:48 "Current: No rollback defined"`

**Impact**:
- Risk Exposure scored 2/5 (below average)
- Failed compensations may leave system in inconsistent state
- No clear guidance for operators during incidents

**Proposed Solution**: Define rollback decision tree (see `05_professional-sop.md` Rollback Procedures section)
- **Trigger Conditions**: Compensation failure after 3 retries, consistency score <95%, transaction success rate <95%
- **Rollback Steps**: Pause new sagas, allow in-flight sagas to complete, revert actor system, restore from snapshot
- **Validation**: Re-run consistency validation before resuming saga executions

---

### Gap 4: Missing Tool Integrations

**Current State**: No specific actor framework or saga library specified
- Evidence: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-27.md:26 "Missing specific tool integrations"`

**Impact**:
- Cannot scaffold actors or sagas without framework choice
- Delays implementation (requires upfront architecture decision)
- Feasibility scored 3/5 (moderate) due to resource requirements

**Proposed Solution**: Recommend default frameworks (see `06_agent-orchestration.md` Crew Configuration)
- **Actor Framework**: Dapr (polyglot, cloud-native) or Akka (JVM, mature)
- **Saga Library**: MassTransit (.NET) or custom implementation (if using Node.js/Python)
- **Event Store**: EventStoreDB or Supabase with event sourcing extension

**Decision Point**: Architecture team should select frameworks during entry gate "Patterns selected"

---

### Gap 5: No Explicit Error Handling

**Current State**: Error handling patterns not documented
- Evidence: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-27.md:27 "No explicit error handling"`

**Impact**:
- Actors may crash without proper supervision recovery
- Sagas may timeout without retries
- Compensations may fail silently

**Proposed Solution**: Document error handling patterns (see `05_professional-sop.md` Step 1.3 and Step 2.2)
- **Actor Errors**: Supervision strategies (restart, resume, stop, escalate)
- **Saga Errors**: Retry with exponential backoff, compensation on timeout, dead letter queue after max retries
- **Compensation Errors**: Log to dead letter queue, alert on-call, escalate to human

---

### Gap 6: No Customer Touchpoint

**Current State**: Stage 27 has no customer interaction
- Evidence: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-27.md:14 "UX/Customer Signal: 1, No customer touchpoint"`
- Evidence: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-27.md:53 "Current: No customer interaction"`

**Impact**:
- UX/Customer Signal scored 1/5 (poorest criterion)
- Cannot validate that actor/saga implementation meets customer needs
- Risk of over-engineering without user feedback

**Proposed Solution**: Add optional customer validation checkpoint (see `04_current-assessment.md` Improvement #5)
- **Opportunity**: Expose saga execution status to customers (e.g., "Order processing: 2 of 5 steps complete")
- **Benefit**: Transparency builds trust, early feedback on transaction workflows
- **Implementation**: Add API endpoint `/api/sagas/{saga_id}/status` for customer-facing apps

**Priority**: Low (nice-to-have, not blocking)

---

### Gap 7: Generic Recursion Support

**Current State**: Recursion support is generic/pending
- Evidence: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-27.md:15 "Recursion Readiness: 2, Generic recursion support pending"`

**Impact**:
- Recursion Readiness scored 2/5 (below average)
- Cannot automatically remediate common failures (transaction failures, compensation failures, actor crashes)
- Manual intervention required for all incidents

**Proposed Solution**: Implement SAGA-001 through SAGA-004 recursion triggers (see `07_recursion-blueprint.md`)
- **SAGA-001**: Transaction failure detected (auto-diagnose and remediate saga failures)
- **SAGA-002**: Compensation required (auto-fix failed compensations)
- **SAGA-003**: Actor supervision failure (auto-fix actor crashes)
- **SAGA-004**: Consistency verified (auto-advance to Stage 28)

**Estimated Impact**: 80% of incidents auto-remediated without human intervention

---

## Universal Blocker Reference

### SD-METRICS-FRAMEWORK-001 (P0 CRITICAL)

**Title**: Universal Metrics Framework & Gate Enforcement
**Status**: ❌ Not Implemented (universal blocker for all stages)
**Priority**: P0 CRITICAL

**Impact on Stage 27**:
- Gap 2 (Missing Metric Thresholds) cannot be fully resolved without universal metrics framework
- Metrics listed in stages.yaml (transaction success rate, latency, consistency score) lack consistent schema
- No automated enforcement of exit gates ("Consistency verified" gate cannot be validated)

**Mitigation** (proposed in `09_metrics-monitoring.md`):
- Interim solution: Define Stage 27-specific metrics schema in Supabase
- Tables: `saga_executions`, `saga_step_log`, `actor_message_log`, `consistency_validations`
- Queries: Provided in `09_metrics-monitoring.md` for manual validation

**Long-term Dependency**: Wait for SD-METRICS-FRAMEWORK-001 implementation, then migrate Stage 27 metrics to universal schema.

**Evidence**: SD-METRICS-FRAMEWORK-001 is documented as universal blocker in Phase 9/10 dossiers (e.g., Stage 1, 2, 3, etc.)

---

## Proposed Strategic Directives

### SD-ACTOR-SAGA-AUTOMATION-001

**Title**: Automated Actor & Saga Pattern Generation
**Priority**: High (addresses Gaps 1, 5, 7)
**Estimated Effort**: 3-4 weeks (PLAN + EXEC)
**Depends On**: None (standalone)

**Objective**: Implement ActorSagaCrew to automate 70-80% of actor/saga implementation.

**Scope**:
1. **Actor Architect Agent**:
   - Auto-generate actor types from domain model
   - Auto-generate supervision tree
   - Auto-scaffold message handlers
   - Output: Actor catalog, state schemas, supervision config

2. **Saga Orchestrator Agent**:
   - Auto-generate saga flowcharts from transaction boundaries
   - Auto-generate compensation logic from CRUD operations
   - Auto-configure timeouts and retry policies
   - Output: Saga orchestrator implementation, compensation logic

3. **Event Sourcing Specialist Agent**:
   - Auto-generate event schemas from state changes
   - Auto-configure snapshot management
   - Implement event replay mechanism
   - Output: Event store integration, snapshot config

4. **Consistency Validator Agent**:
   - Auto-generate consistency validation queries
   - Auto-inject failures for chaos testing
   - Auto-alert on consistency violations
   - Output: Test suite, metrics dashboard

**Success Criteria**:
- 70-80% automation level achieved (measured by % of code auto-generated)
- ActorSagaCrew successfully scaffolds actor/saga system for 3 pilot use cases
- Manual implementation time reduced from 2-4 weeks to 1-2 weeks

**Exit Gates**:
- ActorSagaCrew integrated into Stage 27 workflow
- All 4 agents operational and tested
- Documentation updated with automation instructions

**Related Gaps**: Gap 1, Gap 5, Gap 7

**Evidence**: Proposed based on critique improvement "Enhance Automation - Target State: 80% automation" (`EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-27.md:32-34`)

---

### SD-SAGA-RECURSION-TRIGGERS-002

**Title**: Implement SAGA-001 through SAGA-004 Recursion Triggers
**Priority**: Medium (addresses Gap 7)
**Estimated Effort**: 2-3 weeks (PLAN + EXEC)
**Depends On**: SD-ACTOR-SAGA-AUTOMATION-001 (requires ActorSagaCrew agents)

**Objective**: Enable automated incident remediation for actor/saga failures.

**Scope**:
1. **SAGA-001: Transaction Failure Detected**:
   - Prometheus alert on transaction success rate <95%
   - Consistency Validator diagnoses root cause
   - Saga Orchestrator proposes and applies fix
   - Validate recovery, log incident report

2. **SAGA-002: Compensation Required**:
   - Event store triggers on compensation failure
   - Saga Orchestrator reviews compensation logic
   - Event Sourcing Specialist updates compensation handler
   - Replay failed saga, confirm compensation succeeds

3. **SAGA-003: Actor Supervision Failure**:
   - Actor framework metrics trigger on restart limit exceeded
   - Actor Architect analyzes crash logs
   - Actor Architect updates actor implementation
   - Inject failure scenario, confirm recovery

4. **SAGA-004: Consistency Verified**:
   - Prometheus query for consistency score ≥99.9% for 24h
   - Consistency Validator generates completion report
   - Auto-advance to Stage 28

**Success Criteria**:
- 80% of incidents auto-remediated without human intervention (measured by recursion success rate)
- Mean Time to Remediate (MTTR) <30 minutes for P0 incidents
- False positive rate <10%

**Exit Gates**:
- All 4 recursion triggers implemented and tested
- Recursion success rate ≥80% over 1-month pilot
- Runbooks updated with recursion trigger documentation

**Related Gaps**: Gap 7

**Evidence**: Proposed based on critique weakness "Recursion Readiness: 2, Generic recursion support pending" (`EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-27.md:15`)

---

### SD-STAGE-27-METRICS-THRESHOLDS-003

**Title**: Define and Enforce Stage 27 Metric Thresholds
**Priority**: High (addresses Gap 2)
**Estimated Effort**: 1 week (PLAN + EXEC)
**Depends On**: SD-METRICS-FRAMEWORK-001 (ideally, but can proceed with interim solution)

**Objective**: Establish concrete thresholds and measurement frequency for Stage 27 metrics.

**Scope**:
1. **Threshold Definition**:
   - Transaction success rate: ≥99.5% (prod), ≥90% (dev)
   - Latency metrics: p95 ≤200ms, p99 ≤500ms (saga steps)
   - Consistency score: ≥99.9% (prod), ≥95% (dev)

2. **Measurement Frequency**:
   - Transaction success rate: Real-time, aggregated over 5-minute windows
   - Latency metrics: Real-time, aggregated over 1-minute windows
   - Consistency score: Hourly batch validation

3. **Enforcement**:
   - Update exit gates to reference thresholds
   - Implement automated validation queries (see `09_metrics-monitoring.md`)
   - Configure Prometheus alerts for threshold violations

**Success Criteria**:
- All 3 metrics have concrete thresholds documented
- Exit gates automated (no manual validation required)
- Alerts fire correctly under simulated failure conditions

**Exit Gates**:
- Thresholds added to stages.yaml or configuration table
- Validation queries operational in Supabase
- Grafana dashboard displays real-time threshold compliance

**Related Gaps**: Gap 2

**Evidence**: Proposed based on critique improvement "Define Clear Metrics - Missing: Threshold values, measurement frequency" (`EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-27.md:36-39`)

---

## Backlog Summary

| Item | Type | Priority | Effort | Depends On | Addresses Gaps |
|------|------|----------|--------|------------|----------------|
| SD-ACTOR-SAGA-AUTOMATION-001 | Strategic Directive | High | 3-4 weeks | None | Gap 1, 5, 7 |
| SD-SAGA-RECURSION-TRIGGERS-002 | Strategic Directive | Medium | 2-3 weeks | SD-ACTOR-SAGA-AUTOMATION-001 | Gap 7 |
| SD-STAGE-27-METRICS-THRESHOLDS-003 | Strategic Directive | High | 1 week | SD-METRICS-FRAMEWORK-001 (optional) | Gap 2 |
| Framework Selection | Architecture Decision | High | 1-2 days | None | Gap 4 |
| Rollback Procedure Documentation | Documentation | Medium | 3-5 days | None | Gap 3 |
| Customer Validation Checkpoint | Feature (Optional) | Low | 1 week | None | Gap 6 |

**Total Estimated Effort** (excluding optional items): 6-8 weeks across 3 strategic directives + 1 architecture decision.

---

## Priority Justification

**Top Priority** (P0/P1):
1. **SD-STAGE-27-METRICS-THRESHOLDS-003** (1 week) - Blocking exit gate validation
2. **Framework Selection** (1-2 days) - Blocking actor/saga implementation
3. **SD-ACTOR-SAGA-AUTOMATION-001** (3-4 weeks) - Addresses poorest-performing criterion (Automation Leverage: 3/5)

**Medium Priority** (P2):
4. **SD-SAGA-RECURSION-TRIGGERS-002** (2-3 weeks) - Improves Recursion Readiness from 2/5 to 4-5/5
5. **Rollback Procedure Documentation** (3-5 days) - Improves Risk Exposure from 2/5 to 3-4/5

**Low Priority** (P3):
6. **Customer Validation Checkpoint** (1 week) - Improves UX/Customer Signal from 1/5 to 2-3/5, but not blocking

---

## Sources Table

| Source | Repo | Commit | Path | Lines | Excerpt |
|--------|------|--------|------|-------|---------|
| Automation gap | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-27.md | 24 | "Limited automation for manual processes" |
| Automation target | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-27.md | 32-34 | "Target State: 80% automation" |
| Progression mode | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1240 | "progression_mode: Manual → Assisted → Auto (suggested)" |
| Missing thresholds | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-27.md | 38 | "Missing: Threshold values, measurement frequency" |
| Testability score | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-27.md | 9 | "Testability: 3, Metrics defined but validation criteria unclear" |
| Rollback gap | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-27.md | 25 | "Unclear rollback procedures" |
| Tool integration gap | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-27.md | 26 | "Missing specific tool integrations" |
| Error handling gap | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-27.md | 27 | "No explicit error handling" |
| UX/Customer Signal | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-27.md | 14 | "UX/Customer Signal: 1, No customer touchpoint" |
| Recursion readiness | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-27.md | 15 | "Recursion Readiness: 2, Generic recursion support pending" |
| Overall score | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-27.md | 16 | "Overall: 2.9, Functional but needs optimization" |

---

**Next**: See `11_acceptance-checklist.md` for dossier quality scoring (target ≥90/100).

<!-- Generated by Claude Code Phase 10 | EHG_Engineer@6ef8cf4 | 2025-11-06 -->
