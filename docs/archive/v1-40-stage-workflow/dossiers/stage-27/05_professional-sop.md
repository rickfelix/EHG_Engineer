---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# Stage 27: Professional Standard Operating Procedure (SOP)


## Table of Contents

- [Purpose](#purpose)
- [Scope](#scope)
- [Prerequisites](#prerequisites)
  - [Entry Gates (from stages.yaml)](#entry-gates-from-stagesyaml)
  - [Required Inputs (from stages.yaml)](#required-inputs-from-stagesyaml)
- [Substage 27.1: Actor Implementation](#substage-271-actor-implementation)
  - [Step 1.1: Define Actors](#step-11-define-actors)
  - [Step 1.2: Design Messages](#step-12-design-messages)
  - [Step 1.3: Configure Supervision](#step-13-configure-supervision)
- [Substage 27.2: Saga Orchestration](#substage-272-saga-orchestration)
  - [Step 2.1: Design Sagas](#step-21-design-sagas)
  - [Step 2.2: Define Compensations](#step-22-define-compensations)
  - [Step 2.3: Build Orchestrator](#step-23-build-orchestrator)
- [Substage 27.3: Testing & Validation](#substage-273-testing-validation)
  - [Step 3.1: Test Failure Scenarios](#step-31-test-failure-scenarios)
  - [Step 3.2: Verify Recovery](#step-32-verify-recovery)
  - [Step 3.3: Validate Performance](#step-33-validate-performance)
- [Exit Gates](#exit-gates)
- [Outputs](#outputs)
- [Rollback Procedures](#rollback-procedures)
- [Metrics & Monitoring](#metrics-monitoring)
- [Sources Table](#sources-table)

**Stage**: Actor Model & Saga Transaction Integration
**Phase**: Execution (EXEC)
**Version**: 1.0
**Last Updated**: 2025-11-06

---

## Purpose

This SOP defines the step-by-step process for implementing distributed transaction patterns using the actor model and saga orchestration, ensuring consistency, reliability, and performance in complex distributed workflows.

---

## Scope

**In Scope**:
- Actor system implementation with supervision
- Saga pattern orchestration with compensations
- Event sourcing infrastructure
- Distributed transaction coordination
- Failure recovery mechanisms

**Out of Scope**:
- Security validation (handled in Stage 26)
- Performance optimization (deferred to Stage 28)
- Database schema design (covered in earlier stages)

---

## Prerequisites

### Entry Gates (from stages.yaml)

- [ ] **Architecture approved**
  - Actor patterns documented
  - Saga patterns documented
  - Supervision hierarchy designed
  - Evidence: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1214 "Architecture approved"`

- [ ] **Patterns selected**
  - Actor framework chosen (e.g., Akka, Orleans, Dapr)
  - Saga coordination strategy chosen (orchestration vs. choreography)
  - Event sourcing library selected
  - Evidence: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1215 "Patterns selected"`

### Required Inputs (from stages.yaml)

1. **Architecture design**
   - Actor supervision hierarchy
   - Message routing topology
   - State partitioning strategy
   - Evidence: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1201 "Architecture design"`

2. **Transaction requirements**
   - Business transaction boundaries
   - Consistency requirements (eventual vs. strong)
   - Timeout thresholds
   - Evidence: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1202 "Transaction requirements"`

3. **State management needs**
   - State persistence requirements
   - Event replay requirements
   - Snapshot frequency
   - Evidence: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1203 "State management needs"`

---

## Substage 27.1: Actor Implementation

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1221-1226 "Actor Implementation"`

### Step 1.1: Define Actors

**Objective**: Identify and document all actor types in the system.

**Actions**:
1. Map domain entities to actors (1 entity = 1 actor type)
2. Define actor state schema for each type
3. Document actor lifecycle (creation, passivation, termination)
4. Specify actor identity and addressing scheme

**Deliverables**:
- Actor catalog (markdown or diagram)
- State schemas (JSON Schema or TypeScript interfaces)

**Done When**: "Actors defined" (substage 27.1 exit criterion)

---

### Step 1.2: Design Messages

**Objective**: Define all message types exchanged between actors.

**Actions**:
1. Identify command messages (tell pattern)
2. Identify query messages (ask pattern)
3. Identify event messages (pub/sub pattern)
4. Define message serialization format (JSON, Protobuf, etc.)
5. Document message routing rules

**Deliverables**:
- Message catalog with schemas
- Message routing diagram

**Done When**: "Messages designed" (substage 27.1 exit criterion)

---

### Step 1.3: Configure Supervision

**Objective**: Implement fault tolerance through actor supervision.

**Actions**:
1. Design supervision hierarchy (parent-child relationships)
2. Define restart strategies per actor type:
   - Restart (default): Restart actor on failure
   - Resume: Continue with same state
   - Stop: Terminate actor permanently
   - Escalate: Propagate failure to parent
3. Configure restart throttling (max restarts per time window)
4. Implement dead letter handling

**Deliverables**:
- Supervision tree diagram
- Restart strategy configuration

**Done When**: "Supervision configured" (substage 27.1 exit criterion)

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1223-1226 "done_when: - Actors defined - Messages designed - Supervision configured"`

---

## Substage 27.2: Saga Orchestration

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1227-1232 "Saga Orchestration"`

### Step 2.1: Design Sagas

**Objective**: Define distributed transaction workflows as sagas.

**Actions**:
1. Identify business transactions requiring distributed coordination
2. Break each transaction into steps (local transactions)
3. Define saga execution order (sequential, parallel, or mixed)
4. Choose saga coordination pattern:
   - **Orchestration**: Centralized coordinator (recommended for complex flows)
   - **Choreography**: Decentralized event-driven (for simple flows)

**Deliverables**:
- Saga flowcharts (one per business transaction)
- Saga step catalog

**Done When**: "Sagas designed" (substage 27.2 exit criterion)

---

### Step 2.2: Define Compensations

**Objective**: Implement rollback logic for failed sagas.

**Actions**:
1. For each saga step, define compensating transaction:
   - **Compensable**: Can be undone (e.g., cancel order)
   - **Pivot**: Point of no return (e.g., charge credit card)
   - **Retriable**: Guaranteed to succeed eventually (e.g., send email)
2. Document compensation execution order (reverse of saga steps)
3. Handle compensation failures:
   - Retry with exponential backoff
   - Log to dead letter queue after max retries
4. Define saga timeout thresholds

**Deliverables**:
- Compensation logic per saga step
- Timeout configuration

**Done When**: "Compensations defined" (substage 27.2 exit criterion)

---

### Step 2.3: Build Orchestrator

**Objective**: Implement saga orchestrator to coordinate distributed transactions.

**Actions**:
1. Implement saga orchestrator as stateful actor or service
2. Persist saga state (in-progress steps, completed steps, failed steps)
3. Implement saga execution logic:
   - Execute steps in order
   - Handle step success (proceed to next)
   - Handle step failure (execute compensations in reverse)
4. Implement idempotency for saga steps (prevent duplicate execution)
5. Integrate with event sourcing for audit trail

**Deliverables**:
- Saga orchestrator implementation
- Integration tests for happy path and failure scenarios

**Done When**: "Orchestrator built" (substage 27.2 exit criterion)

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1229-1232 "done_when: - Sagas designed - Compensations defined - Orchestrator built"`

---

## Substage 27.3: Testing & Validation

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1233-1238 "Testing & Validation"`

### Step 3.1: Test Failure Scenarios

**Objective**: Validate system behavior under failure conditions.

**Actions**:
1. **Actor failure scenarios**:
   - Actor crashes mid-processing
   - Actor restart triggers state recovery
   - Supervision escalation to parent
   - Dead letter queue accumulation

2. **Saga failure scenarios**:
   - Step timeout triggers compensation
   - Compensation failure after max retries
   - Network partition during saga execution
   - Concurrent saga execution (race conditions)

3. **Chaos engineering**:
   - Inject random failures into actors/sagas
   - Measure recovery time
   - Validate no data loss

**Deliverables**:
- Failure scenario test suite (automated)
- Chaos engineering report

**Done When**: "Failure scenarios tested" (substage 27.3 exit criterion)

---

### Step 3.2: Verify Recovery

**Objective**: Confirm system recovers to consistent state after failures.

**Actions**:
1. **Actor recovery**:
   - Validate state restored from event log after restart
   - Confirm message replay after crash
   - Verify supervision tree rebuilds correctly

2. **Saga recovery**:
   - Validate compensations execute in correct order
   - Confirm idempotency prevents duplicate compensations
   - Verify saga state persisted correctly

3. **Data consistency checks**:
   - Run consistency queries across distributed state
   - Validate eventual consistency achieved within SLA
   - Confirm no orphaned transactions

**Deliverables**:
- Recovery validation test suite
- Consistency verification report

**Done When**: "Recovery verified" (substage 27.3 exit criterion)

---

### Step 3.3: Validate Performance

**Objective**: Ensure actor and saga performance meets requirements.

**Actions**:
1. **Measure transaction success rate**:
   - Target: ≥99.5% (proposed threshold)
   - Method: Saga execution telemetry

2. **Measure latency metrics**:
   - Target: p95 ≤200ms, p99 ≤500ms (proposed thresholds)
   - Method: Actor message processing time + saga step duration

3. **Measure consistency score**:
   - Target: ≥99.9% (proposed threshold)
   - Method: Consistency validation queries

4. **Load testing**:
   - Simulate peak load (actors + sagas)
   - Validate no degradation under load
   - Identify bottlenecks

**Deliverables**:
- Performance test report
- Metrics dashboard (Grafana or equivalent)

**Done When**: "Performance validated" (substage 27.3 exit criterion)

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1235-1238 "done_when: - Failure scenarios tested - Recovery verified - Performance validated"`

---

## Exit Gates

All exit gates must be satisfied before progressing to Stage 28:

- [ ] **Actors implemented**
  - All actor types implemented
  - Supervision configured
  - Message handlers complete
  - Evidence: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1217 "Actors implemented"`

- [ ] **Sagas tested**
  - All failure scenarios pass
  - Compensations execute correctly
  - Performance meets thresholds
  - Evidence: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1218 "Sagas tested"`

- [ ] **Consistency verified**
  - Eventual consistency achieved
  - No orphaned transactions
  - Consistency score ≥99.9%
  - Evidence: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1219 "Consistency verified"`

---

## Outputs

Upon successful completion, deliver:

1. **Actor system**
   - Actor implementations (code)
   - Supervision configuration
   - Message routing rules
   - Evidence: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1205 "Actor system"`

2. **Saga orchestration**
   - Saga orchestrator implementation
   - Compensation logic
   - Saga state persistence
   - Evidence: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1206 "Saga orchestration"`

3. **Event sourcing**
   - Event store integration
   - Event replay mechanism
   - Snapshot management
   - Evidence: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1207 "Event sourcing"`

---

## Rollback Procedures

**Trigger Conditions** (proposed):
- Saga compensation failure after 3 retries
- Consistency score drops below 95%
- Transaction success rate drops below 95%
- Performance degradation >50%

**Rollback Steps**:
1. Pause new saga executions
2. Allow in-flight sagas to complete or compensate
3. Revert actor system to previous version
4. Restore event sourcing from backup snapshot
5. Re-run consistency validation
6. Resume saga executions if consistent

**Evidence**: Proposed based on critique weakness "Unclear rollback procedures" (`EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-27.md:25`)

---

## Metrics & Monitoring

See `09_metrics-monitoring.md` for detailed KPI definitions and dashboard specifications.

**Key Metrics** (from stages.yaml):
- Transaction success rate (target: ≥99.5%)
- Latency metrics (target: p95 ≤200ms, p99 ≤500ms)
- Consistency score (target: ≥99.9%)

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1208-1211 "metrics: - Transaction success rate - Latency metrics - Consistency score"`

---

## Sources Table

| Source | Repo | Commit | Path | Lines | Excerpt |
|--------|------|--------|------|-------|---------|
| Stage 27 definition | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1195-1240 | "id: 27, title: Actor Model & Saga..." |
| Entry gates | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1213-1215 | "entry: - Architecture approved - Patterns selected" |
| Inputs | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1200-1203 | "inputs: - Architecture design..." |
| Substage 27.1 | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1221-1226 | "Actor Implementation - done_when: - Actors defined..." |
| Substage 27.2 | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1227-1232 | "Saga Orchestration - done_when: - Sagas designed..." |
| Substage 27.3 | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1233-1238 | "Testing & Validation - done_when: - Failure scenarios tested..." |
| Exit gates | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1216-1219 | "exit: - Actors implemented - Sagas tested..." |
| Outputs | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1204-1207 | "outputs: - Actor system - Saga orchestration..." |
| Metrics | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1208-1211 | "metrics: - Transaction success rate..." |
| Rollback gap | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-27.md | 25 | "Unclear rollback procedures" |

---

**Next**: See `06_agent-orchestration.md` for proposed ActorSagaCrew automation.

<!-- Generated by Claude Code Phase 10 | EHG_Engineer@6ef8cf4 | 2025-11-06 -->
