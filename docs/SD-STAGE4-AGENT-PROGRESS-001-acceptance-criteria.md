# SD-STAGE4-AGENT-PROGRESS-001 - Detailed Acceptance Criteria & Definition of Done

## User Story 1: US-001 - Agent Execution Tracking Service (3 points)

### Story Summary
Implement core agent execution tracking service that records and retrieves agent execution records with full audit trail.

### Acceptance Criteria

#### AC 1.1: Execution Lifecycle Management
- [ ] System can create a new execution record for a venture
  - Given: venture_id and execution metadata
  - When: POST /api/agents/executions is called
  - Then: execution record is created with unique execution_id, initial status is "pending"

- [ ] System can update execution status through lifecycle
  - Given: execution_id and new status
  - When: status changes to "running", "completed", or "failed"
  - Then: timestamp is recorded, previous status is retained in audit trail

- [ ] System can retrieve execution history for a venture
  - Given: venture_id and optional filters (status, date_range)
  - When: GET /api/agents/execution-logs/:venture_id is called
  - Then: sorted list of executions is returned with pagination

#### AC 1.2: Execution Logging
- [ ] System can record execution logs with metadata
  - Given: execution_id, log_level, message, and optional context
  - When: log entry is added via API or service
  - Then: log is stored with timestamp and indexed for fast retrieval

- [ ] System can retrieve logs for specific execution
  - Given: execution_id
  - When: GET /api/agents/executions/:execution_id is called
  - Then: all logs for execution are returned sorted by timestamp, with pagination support

- [ ] System can filter logs by level (info, warning, error)
  - Given: execution_id and log_level filter
  - When: logs are retrieved with filter parameter
  - Then: only logs matching filter are returned

#### AC 1.3: Data Integrity
- [ ] All execution records have required fields
  - execution_id (UUID, unique, indexed)
  - venture_id (FK, indexed, required)
  - status (enum, required)
  - created_at, updated_at (timestamps)
  - metadata (JSONB, optional)

- [ ] All log records are immutable
  - Once created, logs cannot be modified
  - Log deletion cascades from execution deletion
  - Audit trail preserved for compliance

#### AC 1.4: Performance
- [ ] Execution retrieval returns within 500ms for 10k+ records
  - Index on execution_id and created_at validates performance
  - Query plans reviewed and optimized

- [ ] Concurrent execution tracking supports 100+ simultaneous executions
  - Load test with 100 concurrent executions
  - No deadlocks or performance degradation observed

### Definition of Done
- [ ] Code implemented in src/server/services/agent-tracking/ProgressTracker.ts
- [ ] Unit tests written with 80%+ coverage
- [ ] Integration tests passing (database + API)
- [ ] TypeScript strict mode: no errors
- [ ] PR approved by 2+ reviewers
- [ ] Database schema migration completed
- [ ] Performance tested and documented
- [ ] No regressions in existing tests

### Implementation Notes
- Use existing EHG connection pooling
- Follow existing error handling patterns
- Use Zustand for state if needed
- Consider caching for frequently accessed executions

---

## User Story 2: US-002 - Real-Time Status Broadcasting (2 points)

### Story Summary
Implement backend mechanism to broadcast execution status updates in real-time or near-real-time using PostgreSQL LISTEN/NOTIFY and establish foundation for WebSocket upgrades.

### Acceptance Criteria

#### AC 2.1: Status Broadcast Channel
- [ ] System establishes notification channels for execution events
  - Given: execution_id
  - When: status changes occur
  - Then: notification is published to channel: agents:execution:{execution_id}

- [ ] System supports subscription pattern for listeners
  - Given: execution_id
  - When: client requests status updates
  - Then: listener can subscribe to receive notifications

- [ ] System cleans up stale connections
  - Given: listener has not received data for 5 minutes
  - When: automatic cleanup runs
  - Then: connection is terminated and resources freed

#### AC 2.2: Broadcast Event Format
- [ ] Events include required fields
  - execution_id, status, timestamp, changed_fields, previous_values
  - Context/metadata for UI consumption
  - Idempotency key for deduplication

- [ ] Events are JSON serialized consistently
  - All timestamps in ISO-8601 format
  - Enum values normalized
  - No circular references or large objects

#### AC 2.3: Reliability
- [ ] Messages maintain ordering for single execution
  - Given: 3 status updates to same execution
  - When: updates are broadcast
  - Then: updates received in order with no duplicates

- [ ] System handles broadcast failures gracefully
  - Given: database LISTEN fails temporarily
  - When: connection recovers
  - Then: pending updates are replayed, no data loss

#### AC 2.4: WebSocket Foundation
- [ ] Database infrastructure ready for WebSocket upgrade
  - PostgreSQL LISTEN/NOTIFY channels established
  - Channel naming convention documented
  - Subscription pattern implemented (polling-based initially)

- [ ] Client subscription pattern implemented (polling stub)
  - API returns latest status on demand
  - Future WebSocket migration documented in ADR

### Definition of Done
- [ ] Code implemented in src/server/services/agent-tracking/StatusBroadcaster.ts
- [ ] Unit tests for channel management (80%+ coverage)
- [ ] Integration tests for publish/subscribe pattern
- [ ] TypeScript strict mode: no errors
- [ ] Performance: 1000+ broadcasts/second sustainable
- [ ] PR approved by 2+ reviewers
- [ ] Architecture Decision Record (ADR) created
- [ ] No memory leaks detected in long-running tests (24-hour load test)

### Implementation Notes
- Use PostgreSQL native LISTEN/NOTIFY
- Implement connection pooling to prevent leaks
- Log all broadcast events for debugging
- Consider Redis for scale-out in future

---

## User Story 3: US-003 - Polling Service & Data Transformation (2 points)

### Story Summary
Integrate progress tracking polling service into ventureResearch.ts and implement data transformation to format execution logs for frontend consumption.

### Acceptance Criteria

#### AC 3.1: Polling Service Integration
- [ ] ventureResearch.ts includes polling mechanism
  - Given: venture_id
  - When: research starts
  - Then: execution tracking polling starts with 2-second interval

- [ ] Polling gracefully handles network failures
  - Given: API temporarily unavailable
  - When: polling retries
  - Then: exponential backoff used (2s, 4s, 8s max)

- [ ] Polling stops when execution completes
  - Given: execution status changes to "completed" or "failed"
  - When: polling receives final status
  - Then: polling stops, remaining resources cleaned up

#### AC 3.2: Data Transformation
- [ ] Raw execution logs transformed to UI format
  - Input: database execution records and logs
  - Output: formatted progress object with:
    - stage_number, stage_name, progress_percentage
    - current_status, estimated_completion_time
    - error_details (if failed)
    - log_summary (recent logs)

- [ ] Progress percentage calculated accurately
  - Given: execution with 4 stages, currently on stage 3
  - When: progress is calculated
  - Then: percentage = 75% (3/4 complete)

- [ ] Time estimation handles edge cases
  - If execution just started: "Estimating..."
  - If no historical data: use default estimate
  - If behind schedule: show adjusted time
  - If complete: show actual duration

#### AC 3.3: Error Handling
- [ ] Transformation handles missing data gracefully
  - Given: execution with incomplete logs
  - When: transformation runs
  - Then: defaults used, no exceptions thrown

- [ ] Network errors are caught and logged
  - Given: API call fails
  - When: polling receives error
  - Then: error logged, user notified via UI, retry scheduled

#### AC 3.4: Performance
- [ ] Polling uses minimal bandwidth
  - Given: ongoing polling for 1 hour
  - When: network traffic measured
  - Then: <1MB total data transfer per execution

- [ ] Transformation completes in <100ms
  - Given: execution with 100+ log entries
  - When: transformation runs
  - Then: completes within 100ms

### Definition of Done
- [ ] Code implemented in src/services/ventureResearch.ts
- [ ] Data transformation utilities in src/utils/executionFormatters.ts
- [ ] Unit tests for polling service (80%+ coverage)
- [ ] Unit tests for transformation functions (80%+ coverage)
- [ ] Integration tests with real API
- [ ] TypeScript strict mode: no errors
- [ ] Performance benchmarks documented
- [ ] PR approved by 2+ reviewers
- [ ] Tested with 1+ hours of continuous polling
- [ ] No memory leaks in long-running scenarios

### Implementation Notes
- Use AbortController for clean polling shutdown
- Implement incremental updates (only fetch since last poll)
- Cache transformation results where possible
- Add detailed logging for debugging polling issues

---

## Cross-Story Acceptance Criteria

### AC-CROSS-1: Integration Between Services
- [ ] ProgressTracker and StatusBroadcaster work together
  - When: log is added via ProgressTracker
  - Then: StatusBroadcaster notifies listeners

- [ ] Polling service consumes broadcasted updates
  - When: execution status changes
  - Then: polling service receives notification and updates state

### AC-CROSS-2: Database Consistency
- [ ] No orphaned records after execution deletion
  - Given: execution_id with logs and metrics
  - When: execution is deleted
  - Then: all related logs and metrics deleted

- [ ] Foreign key constraints enforced
  - Given: invalid venture_id
  - When: execution created
  - Then: foreign key constraint prevents creation

### AC-CROSS-3: RLS Policy Enforcement
- [ ] User cannot access other users' execution logs
  - Given: user_id and execution from different user
  - When: user queries logs
  - Then: empty result or 403 forbidden

- [ ] Service accounts have appropriate permissions
  - Given: service account querying execution logs
  - When: query executed
  - Then: full access granted without RLS restrictions

### AC-CROSS-4: Backward Compatibility
- [ ] No breaking changes to existing API
  - Given: existing client code
  - When: new execution tracking deployed
  - Then: all existing endpoints function identically

- [ ] Database migration doesn't affect existing tables
  - Given: existing tables (ventures, agents, etc.)
  - When: migration runs
  - Then: new tables created, existing data unchanged

---

## Test Coverage Requirements

### Unit Tests (80%+ coverage minimum)
- [ ] ProgressTracker service: all public methods
- [ ] StatusBroadcaster service: all public methods
- [ ] AgentExecutionService service: all public methods
- [ ] Data transformation utilities: all functions
- [ ] Edge cases: null handling, invalid inputs, empty results

### Integration Tests
- [ ] Database: create, read, update, delete operations
- [ ] Database: RLS policy enforcement
- [ ] API: all 4 endpoints (request validation, response format)
- [ ] Services: cross-service communication
- [ ] Error paths: all error codes documented and tested

### E2E Tests
- [ ] Complete execution lifecycle (create -> running -> complete)
- [ ] Error scenario (create -> running -> failed)
- [ ] Multi-execution concurrent tracking
- [ ] Polling service integration with ventureResearch
- [ ] Long-running stability (24-hour test)

---

## Non-Functional Requirements

### Performance
- [ ] Query response time: <500ms (p95)
- [ ] Polling overhead: <1% CPU per execution
- [ ] Memory: <50MB for 1000 concurrent executions
- [ ] Throughput: >1000 logs/second
- [ ] Concurrent executions: support 100+

### Security
- [ ] RLS: users see only their venture data
- [ ] SQL injection: all queries parameterized
- [ ] Authentication: all endpoints require valid token
- [ ] Encryption: data in transit over TLS
- [ ] Audit: all modifications logged with user_id and timestamp

### Reliability
- [ ] Uptime: 99.9% SLA (4.3 minutes downtime/month)
- [ ] Data durability: no data loss on database failure
- [ ] Connection pooling: prevent connection exhaustion
- [ ] Graceful degradation: service degrades safely on errors
- [ ] Recovery: automatic recovery from transient failures

### Maintainability
- [ ] Code: TypeScript strict mode, ESLint passing
- [ ] Documentation: API docs, schema docs, ADRs
- [ ] Testing: unit + integration + E2E tests
- [ ] Logging: structured JSON logs with correlation IDs
- [ ] Monitoring: metrics for all critical operations

---

**Acceptance Criteria Version 1.0**  
**Generated**: 2025-11-08  
**Status**: Ready for PLAN phase refinement
