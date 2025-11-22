# SD-STAGE4-AGENT-PROGRESS-001: Refined Acceptance Criteria

**Document**: Refined Acceptance Criteria for All User Stories
**Strategic Directive**: SD-STAGE4-AGENT-PROGRESS-001
**Title**: Stage 4 Agent Progress Tracking Infrastructure
**Total Story Points**: 7 (US-001: 3, US-002: 2, US-003: 2)
**Generated**: 2025-11-08

---

## Overview

This document provides detailed, refined acceptance criteria for all 3 user stories within SD-STAGE4-AGENT-PROGRESS-001. Each story's acceptance criteria is based on:

1. **PRD Architecture**: Backend services, database schema, frontend hooks
2. **Implementation Approach**: 4-phase strategy (database → backend → WebSocket → frontend)
3. **System Design**: PostgreSQL LISTEN/NOTIFY, Zustand state management, structured logging
4. **Risk Mitigations**: Address identified risks (performance, message ordering, memory leaks)

---

## US-001: Agent Execution Tracking Service (3 Story Points)

**Priority**: HIGH
**User Role**: Backend Developer
**User Story**: "As a backend developer, I need to implement the Agent Execution Tracking Service so that the system can persist and retrieve agent execution state"

### Acceptance Criteria

#### AC1: Database Schema & Tables Created
- [ ] `agent_executions` table created with columns:
  - `id` (UUID, primary key)
  - `venture_id` (UUID, foreign key to ventures)
  - `execution_status` (ENUM: 'pending', 'running', 'completed', 'failed', 'cancelled')
  - `current_stage` (VARCHAR, e.g., 'stage_3_research', 'stage_4_competitive_intelligence')
  - `started_at` (TIMESTAMP)
  - `completed_at` (TIMESTAMP, nullable)
  - `total_steps` (INTEGER)
  - `completed_steps` (INTEGER)
  - `created_at` (TIMESTAMP, default: now())
  - `updated_at` (TIMESTAMP, default: now())
  - Indexes on: `venture_id`, `execution_status`, `updated_at`

- [ ] `agent_execution_logs` table created with columns:
  - `id` (UUID, primary key)
  - `execution_id` (UUID, foreign key to agent_executions)
  - `log_level` (ENUM: 'info', 'warning', 'error')
  - `message` (TEXT)
  - `step_number` (INTEGER)
  - `duration_ms` (INTEGER, nullable)
  - `error_details` (JSONB, nullable - for error stacks)
  - `correlation_id` (VARCHAR - for tracing)
  - `created_at` (TIMESTAMP, default: now())
  - Indexes on: `execution_id`, `created_at`, `correlation_id`

- [ ] `execution_metrics` table created with columns:
  - `id` (UUID, primary key)
  - `execution_id` (UUID, foreign key to agent_executions)
  - `execution_duration_ms` (INTEGER)
  - `stage_completion_rate` (NUMERIC, 0-100)
  - `error_frequency` (INTEGER - count of errors)
  - `last_step_timestamp` (TIMESTAMP)
  - `memory_usage_mb` (NUMERIC, nullable)
  - `created_at` (TIMESTAMP, default: now())
  - Indexes on: `execution_id`

#### AC2: AgentExecutionService Backend API
- [ ] `AgentExecutionService` class created with CRUD operations:
  - `createExecution(ventureId, currentStage, totalSteps)` → returns execution object
  - `getExecution(executionId)` → returns full execution with related logs
  - `updateExecutionStatus(executionId, status)` → updates and validates status transitions
  - `completeExecution(executionId, completedSteps)` → marks as completed
  - `failExecution(executionId, errorMessage)` → marks as failed with error
  - `addExecutionLog(executionId, logData)` → creates structured log entry
  - `getExecutionHistory(ventureId, limit = 50)` → retrieves past 50 executions

- [ ] All database queries use parameterized statements (prevents SQL injection)
- [ ] Proper error handling with specific exception types (ExecutionNotFound, InvalidStatus, etc.)
- [ ] Validation logic:
  - Status transitions: pending → running → (completed|failed|cancelled)
  - Step counts: completed_steps ≤ total_steps
  - Timestamps: started_at ≤ completed_at

#### AC3: Metrics Tracking & Aggregation
- [ ] Metrics calculated after execution completion:
  - `execution_duration_ms` = completed_at - started_at
  - `stage_completion_rate` = (completed_steps / total_steps) × 100
  - `error_frequency` = COUNT of logs where log_level = 'error'
  - `last_step_timestamp` = latest step's timestamp
- [ ] Metrics stored in `execution_metrics` table
- [ ] Supports querying metrics by execution_id and venture_id

#### AC4: Logging System (Structured JSON)
- [ ] Structured JSON logs with format:
  ```json
  {
    "correlation_id": "uuid",
    "execution_id": "uuid",
    "timestamp": "ISO-8601",
    "log_level": "info|warning|error",
    "message": "human-readable message",
    "step_number": 1,
    "duration_ms": 1234,
    "context": {
      "stage": "stage_4",
      "action": "analyzing_competitors"
    }
  }
  ```
- [ ] Correlation IDs for tracing related log entries
- [ ] Error logs include stack trace in `error_details` field

#### AC5: Data Validation & Security
- [ ] Input validation on all API methods
- [ ] Venture ownership verification (user can only track own venture executions)
- [ ] RLS (Row Level Security) policy on all tables restricting access by user/venture
- [ ] No sensitive data logged (passwords, API keys, etc.)

### Definition of Done

- [ ] All 5 tables created with proper indexes
- [ ] AgentExecutionService fully implemented with error handling
- [ ] Unit tests cover: create, read, update, delete, list operations (minimum 15 tests)
- [ ] Integration tests validate status transitions and constraints
- [ ] Database migrations created and tested
- [ ] Code reviewed and merged to main branch
- [ ] Documentation updated with API examples
- [ ] Zero regressions in existing tests

### Test Scenarios

| Scenario | Steps | Expected Result |
|----------|-------|-----------------|
| Create execution for new venture | Call `createExecution('venture-1', 'stage_4', 10)` | Returns execution object with status='pending' |
| Add log entry during execution | Call `addExecutionLog(id, {level: 'info', message: 'Started', step: 1})` | Log created with correlation_id |
| Update status to running | Call `updateExecutionStatus(id, 'running')` | Status changed, updated_at refreshed |
| Complete execution | Call `completeExecution(id, 10)` | Status='completed', metrics calculated |
| Fail execution | Call `failExecution(id, 'Network timeout')` | Status='failed', error log added |
| Invalid status transition | Call `updateExecutionStatus(id, 'pending')` when status='completed' | Throws InvalidStatus exception |
| Retrieve execution with logs | Call `getExecution(id)` | Returns execution + all related logs |
| Query execution history | Call `getExecutionHistory('venture-1', 50)` | Returns last 50 executions sorted by created_at DESC |
| Security: User can't access other's data | User A tries to getExecution(execution_created_by_user_B) | RLS policy blocks, returns null or error |

---

## US-002: Real-Time Status Broadcasting (2 Story Points)

**Priority**: MEDIUM
**User Role**: Backend Developer
**User Story**: "As a backend developer, I need to implement real-time status broadcasting using PostgreSQL LISTEN/NOTIFY so that frontend can receive live progress updates"

### Acceptance Criteria

#### AC1: PostgreSQL LISTEN/NOTIFY Channel Setup
- [ ] Notification trigger created on `agent_executions` table
- [ ] When `execution_status` or `completed_steps` changes, trigger fires NOTIFY:
  ```sql
  NOTIFY agent_execution_updates, json_build_object(
    'execution_id', NEW.id,
    'venture_id', NEW.venture_id,
    'status', NEW.execution_status,
    'completed_steps', NEW.completed_steps,
    'total_steps', NEW.total_steps,
    'timestamp', NEW.updated_at
  )
  ```
- [ ] Notification channel name: `agent_execution_updates`
- [ ] Payload includes only: execution_id, venture_id, status, completed_steps, total_steps, timestamp

#### AC2: StatusBroadcaster Service Implementation
- [ ] `StatusBroadcaster` class created with methods:
  - `subscribeToVentureUpdates(ventureId, callback)` → subscribes to LISTEN channel
  - `unsubscribeFromVentureUpdates(ventureId)` → cleanup subscription
  - `broadcastUpdate(executionId, updateData)` → sends NOTIFY message
  - `getActiveSubscriptions()` → returns count of active listeners

- [ ] Connection pooling implemented (max 10 concurrent listeners)
- [ ] Automatic cleanup of stale subscriptions after 5 minutes of inactivity
- [ ] Error handling for connection drops (attempt reconnect 3 times with exponential backoff)

#### AC3: Message Ordering & Integrity
- [ ] Timestamps on all messages (ISO-8601 format)
- [ ] Sequence numbers on messages to detect missing updates:
  ```json
  {
    "sequence": 42,
    "execution_id": "uuid",
    "status": "running",
    "timestamp": "2025-11-08T10:30:45.123Z"
  }
  ```
- [ ] Client detects sequence gaps and logs warning (not critical, but tracked)
- [ ] Messages guaranteed to be unique (deduplicate by execution_id + sequence)

#### AC4: Reliability & Monitoring
- [ ] Metrics collected:
  - Total notifications sent
  - Messages per second
  - Subscription count
  - Failed deliveries

- [ ] Logs include:
  - New subscriber connected: `{subscriber_count: N, venture_id: uuid}`
  - Subscriber disconnected: `{subscriber_count: N, venture_id: uuid}`
  - Message broadcast: `{execution_id: uuid, subscribers: N}`
  - Connection error: `{error: message, retry_attempt: N}`

#### AC5: Testing & Validation
- [ ] Mock PostgreSQL notifications for unit tests
- [ ] Integration test with real database LISTEN/NOTIFY
- [ ] Test message ordering under high-frequency updates (100+ messages/sec)
- [ ] Test recovery from connection failures

### Definition of Done

- [ ] StatusBroadcaster service fully implemented
- [ ] PostgreSQL trigger created and tested
- [ ] Connection pooling implemented with monitoring
- [ ] Unit tests: 10+ tests covering subscribe, unsubscribe, message ordering
- [ ] Integration tests: real LISTEN/NOTIFY with database
- [ ] Message loss scenario tested (e.g., brief disconnect)
- [ ] Metrics collected and logged
- [ ] Code reviewed and merged
- [ ] Documentation includes connection pooling limits and recovery strategy

### Test Scenarios

| Scenario | Steps | Expected Result |
|----------|-------|-----------------|
| Subscribe to venture updates | Call `subscribeToVentureUpdates('v1', callback)` | Subscription active, callback ready |
| Broadcast execution start | Trigger UPDATE on agent_executions | NOTIFY sent, callback receives data |
| Broadcast progress update | Update completed_steps from 3 → 4 | Message sent with sequence=2 |
| Multiple subscribers | Subscribe 3 clients to same venture | All 3 receive broadcast |
| Connection drop | Close WebSocket/connection mid-stream | Auto-reconnect triggered, messages buffered |
| High-frequency updates | Send 50 updates in 1 second | All messages delivered in order |
| Sequence detection | Miss message #5 in sequence | Client logs warning but continues |
| Subscription cleanup | Unsubscribe from venture | No more messages received |
| Pool limit reached | 11th subscriber connects | 11th request queued or returns error |

---

## US-003: Polling Service & Data Transformation (2 Story Points)

**Priority**: MEDIUM
**User Role**: Backend Developer + Integration Specialist
**User Story**: "As a backend developer, I need to implement a polling service that integrates with ventureResearch.ts to transform agent execution data into stage-specific progress metrics"

### Acceptance Criteria

#### AC1: ProgressTracker Service
- [ ] `ProgressTracker` class created with methods:
  - `trackProgress(executionId, stageMetrics)` → stores stage-specific progress
  - `getProgressByStage(executionId, stageName)` → retrieves stage progress
  - `calculateOverallProgress(executionId)` → returns weighted average progress
  - `estimateTimeRemaining(executionId, currentStage, historicalData)` → estimates ETA

- [ ] Stage definitions:
  - `stage_3_research`: Research data gathering
  - `stage_4_competitive_intelligence`: Competitive analysis
  - Extensible for future stages (stage_5, etc.)

#### AC2: Integration with ventureResearch.ts
- [ ] ventureResearch.ts polling service extended to:
  - Call ProgressTracker after each research step
  - Pass execution_id and step-specific metrics
  - Handle tracking errors gracefully (log but don't block research)

- [ ] Polling interval: 500ms (configurable via environment)
- [ ] Batch updates: Send max 10 progress updates per batch
- [ ] Retry logic: If tracking fails, retry up to 3 times before logging

#### AC3: Data Transformation & Normalization
- [ ] Transform raw execution logs into stage-specific metrics:
  ```
  Raw: {
    "correlation_id": "abc123",
    "step_number": 5,
    "message": "Fetched 50 competitor profiles",
    "duration_ms": 2500
  }

  Transformed: {
    "stage": "stage_4",
    "progress_percentage": 50,
    "current_task": "competitor_analysis",
    "items_processed": 50,
    "estimated_remaining": 30,
    "elapsed_ms": 12500
  }
  ```

- [ ] Handle different data types (strings, numbers, arrays)
- [ ] Null/undefined handling (use sensible defaults)
- [ ] Data validation (progress 0-100, durations non-negative)

#### AC4: Estimated Time Remaining (ETA)
- [ ] Algorithm: Use historical execution data from execution_metrics
- [ ] Formula: (avg_duration_per_step) × (remaining_steps)
- [ ] Fallback: If no historical data, use conservative estimate (2x current pace)
- [ ] Update ETA every 5 steps (reduce computation overhead)

#### AC5: Error Handling & Resilience
- [ ] If tracking service unavailable, research continues (non-blocking)
- [ ] Track failed updates in metrics for observability
- [ ] Log all errors with execution_id and stage context
- [ ] Rate limiting: max 1000 updates per minute per venture

### Definition of Done

- [ ] ProgressTracker service fully implemented
- [ ] Integration with ventureResearch.ts complete
- [ ] Data transformation logic handles all known data types
- [ ] ETA calculation tested with historical data
- [ ] Unit tests: 12+ tests covering tracking, transformation, ETA
- [ ] Integration tests with ventureResearch.ts (2+ tests)
- [ ] Error handling tested (service unavailable, bad data, etc.)
- [ ] Performance validated (polling overhead < 5% CPU)
- [ ] Code reviewed and merged
- [ ] Documentation updated with data transformation examples

### Test Scenarios

| Scenario | Steps | Expected Result |
|----------|-------|-----------------|
| Track simple progress | Call `trackProgress(id, {stage: 'stage_4', progress: 50})` | Progress stored, queryable |
| Transform raw log | Call transformation on raw execution log | Converted to stage-specific metrics |
| Calculate overall progress | 3 stages at 50%, 75%, 25% with weights [0.3, 0.5, 0.2] | Result = 51.25% |
| Estimate time remaining | 5 of 10 steps completed in 2500ms | ETA = 2500ms for remaining 5 steps |
| Polling with retries | First attempt fails, second succeeds | Retry triggered, no data loss |
| Tracking service down | ProgressTracker unavailable | Research continues, error logged |
| High-frequency updates | 100 updates sent | Batched into 10 payloads |
| Data validation | Invalid progress value (101) submitted | Clamped to 100, warning logged |
| Historical ETA | First execution has no history | Falls back to 2x current pace |
| Rate limiting | 1001 updates in 1 minute | 1001st rejected with rate limit error |

---

## Cross-Story Acceptance Criteria

### Integration Requirements
- [ ] All 3 services (AgentExecutionService, StatusBroadcaster, ProgressTracker) work together seamlessly
- [ ] Data flows: Execution → Tracking → Broadcasting → Frontend (no data loss)
- [ ] No circular dependencies between services
- [ ] Services are independently testable

### API Contract
- [ ] All services export TypeScript interfaces for type safety
- [ ] Error responses follow standard format: `{ error: string, code: string, details?: object }`
- [ ] Successful responses follow format: `{ success: true, data: object, timestamp: ISO-8601 }`

### Documentation
- [ ] README.md for SD-STAGE4-AGENT-PROGRESS-001 with:
  - Service architecture diagram
  - Database schema documentation
  - API endpoint list with request/response examples
  - Integration guide for ventureResearch.ts
  - Deployment checklist

### Performance Baselines
- [ ] AgentExecutionService: CRUD operations complete in < 50ms
- [ ] StatusBroadcaster: Messages delivered within 100ms of NOTIFY
- [ ] ProgressTracker: Transformation completes in < 10ms
- [ ] No database connections leak
- [ ] Memory usage remains stable under continuous polling

---

## Definition of Done (SD-Level)

All user stories must satisfy:

- [ ] Acceptance criteria for US-001, US-002, US-003 all completed
- [ ] Cross-story acceptance criteria all met
- [ ] Unit test coverage ≥ 80% (minimum 25 tests total)
- [ ] Integration tests demonstrate end-to-end data flow
- [ ] Code review completed by 2 reviewers
- [ ] All linting/format checks pass
- [ ] Database migrations tested on staging environment
- [ ] Performance tested under load (100 concurrent executions)
- [ ] Documentation updated and reviewed
- [ ] Zero security vulnerabilities (RLS, SQL injection, XSS)
- [ ] E2E tests created for frontend integration (stage 4 progress display)

---

## Notes

- **Phased Approach**: US-001 (database + service) → US-002 (broadcasting) → US-003 (transformation)
- **Dependency Chain**: US-003 depends on US-001 and US-002 being complete
- **Frontend Integration**: Stage 4 component (AIProgressCard from SD-STAGE4-UI-RESTRUCTURE-001) uses data from these services
- **Risk Mitigation**:
  - AC1-2 in US-002 address message ordering risk
  - Connection pooling in US-002 addresses memory leaks
  - AC4 in US-001 addresses database performance risk with indexes

---

*Document prepared for PLAN phase completion. Ready for EXEC phase handoff.*
