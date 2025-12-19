# Ops Debugging Specification

**Vision v2 Chairman's OS - Trace Viewer & Replay Safety**

> "When something breaks at 3 AM, you need to understand why by 3:05 AM."

---

## Table of Contents

1. [Overview](#overview)
2. [End-to-End Traceability](#end-to-end-traceability)
3. [Trace Viewer Workflow](#trace-viewer-workflow)
4. [Black Box Recorder](#black-box-recorder)
5. [Safe Replay](#safe-replay)
6. [Dashboard Integration](#dashboard-integration)
7. [Database Schema](#database-schema)

---

## Overview

### The Problem

Current architecture has `agent_execution_traces` and correlation IDs, but lacks:
- **Defined trace viewer workflow** in the UI
- **Input/output snapshots** for replay
- **Safe replay mechanism** that handles side effects
- **Dashboard widgets** for circuit breakers and quotas

### The Solution

This spec defines:
- **correlation_id everywhere** - Mandatory on all records
- **Trace viewer UX** - From alert → trace graph → root cause
- **Black box recorder** - Full input/output snapshots
- **Replay safety** - Idempotent-only replay with approval workflow

---

## End-to-End Traceability

### 2.1 Correlation ID Contract

Every record MUST include correlation_id:

```typescript
interface TraceableRecord {
  correlation_id: string;  // UUID (RFC 4122) linking entire request chain
  parent_trace_id?: string; // For nested operations
  trace_sequence: number;  // Order within correlation
}

// Tables requiring correlation_id
const TRACEABLE_TABLES = [
  'chairman_directives',
  'directive_delegations',
  'agent_task_contracts',
  'agent_messages',
  'agent_execution_traces',
  'tool_usage_ledger',
  'venture_artifacts',
  'chairman_decisions',
];
```

### 2.2 Correlation ID Generation

```typescript
// Generate at command entry point
function generateCorrelationId(): string {
  // IMPORTANT: Must be a UUID string to match database schemas (UUID columns).
  return crypto.randomUUID();
}

// Pass through all operations
async function processChairmanCommand(
  command: ChairmanCommand
): Promise<void> {
  const correlationId = generateCorrelationId();

  // All downstream operations use this ID
  await createDirective({
    ...command,
    correlation_id: correlationId,
  });

  // Passed to EVA
  await dispatchToEVA(command, correlationId);

  // Passed to crews
  await dispatchToCrew(task, correlationId);
}
```

### 2.3 Trace Entry Points

```sql
-- Add correlation_id to all traceable tables
ALTER TABLE chairman_directives
  ADD COLUMN IF NOT EXISTS correlation_id UUID,
  ADD COLUMN IF NOT EXISTS parent_trace_id UUID,
  ADD COLUMN IF NOT EXISTS trace_sequence INT DEFAULT 0;

ALTER TABLE agent_task_contracts
  ADD COLUMN IF NOT EXISTS correlation_id UUID NOT NULL,
  ADD COLUMN IF NOT EXISTS parent_trace_id UUID,
  ADD COLUMN IF NOT EXISTS trace_sequence INT DEFAULT 0;

ALTER TABLE agent_messages
  ADD COLUMN IF NOT EXISTS correlation_id UUID NOT NULL,
  ADD COLUMN IF NOT EXISTS parent_trace_id UUID,
  ADD COLUMN IF NOT EXISTS trace_sequence INT DEFAULT 0;

-- Index for fast trace retrieval
CREATE INDEX idx_directive_correlation ON chairman_directives(correlation_id);
CREATE INDEX idx_task_correlation ON agent_task_contracts(correlation_id);
CREATE INDEX idx_message_correlation ON agent_messages(correlation_id);
```

### 2.4 Privileged Action Audit (Service Role)

Because `service_role` bypasses RLS, production safety requires **audit trails** for privileged actions:

- **Rule**: Every `service_role` write MUST be attributable to a trace chain:
  - include `correlation_id`
  - include the acting agent identity where applicable (e.g., `agent_id`, `task_contract_id`)
- **Rule**: Every privileged operation SHOULD emit an `agent_execution_traces` entry with:
  - `action` (`dispatch`, `claim`, `execute`, `complete`, `fail`)
  - `input_snapshot` / `output_snapshot` (redacted as needed)
  - `error_details` on failure
- **Rule**: Replay tooling MUST require chairman approval for any step that has side-effects beyond idempotent writes.

---

## Trace Viewer Workflow

### 3.1 User Journey

```
1. Alert appears (circuit breaker, poison task, failure)
      │
      ▼
2. Click "View Trace" on alert
      │
      ▼
3. Trace Timeline View
   ┌─────────────────────────────────────────────────────────────┐
   │  Correlation: 2d1d6e1a-2a5b-4b72-9f78-9a8c8b4fb2c1          │
   │                                                             │
   │  Timeline:                                                  │
   │  ├── 10:00:00 Chairman: "Pivot Solara to Enterprise"        │
   │  ├── 10:00:01 EVA: Interpreted command                      │
   │  ├── 10:00:02 EVA: Dispatched to Strategy Crew              │
   │  ├── 10:00:15 Crew: Started market research                 │
   │  ├── 10:00:45 Tool: web_search (success, 2.3s)              │
   │  ├── 10:01:12 Tool: competitor_lookup (timeout, 30s) ⚠️     │
   │  ├── 10:01:42 Crew: Retrying competitor_lookup              │
   │  └── 10:02:12 Crew: FAILED - max retries exceeded ❌        │
   │                                                             │
   │  [View Tool Outputs] [View Artifacts] [Replay Safe Steps]   │
   └─────────────────────────────────────────────────────────────┘
      │
      ▼
4. Drill down into specific step
   - View input snapshot
   - View output snapshot
   - See error details
      │
      ▼
5. Decision: Retry, Skip, or Escalate
```

### 3.2 API Endpoints

```typescript
// GET /api/traces/:correlationId
interface TraceResponse {
  correlation_id: string;
  started_at: string;
  ended_at?: string;
  status: 'in_progress' | 'completed' | 'failed' | 'poisoned';

  // Origin
  directive?: ChairmanDirective;
  venture?: VentureSummary;

  // Timeline
  events: TraceEvent[];

  // Summary
  total_duration_ms: number;
  total_tokens: number;
  total_cost_usd: number;
  failure_point?: TraceEvent;
}

interface TraceEvent {
  id: string;
  sequence: number;
  timestamp: string;
  event_type: 'directive' | 'dispatch' | 'task' | 'tool' | 'artifact' | 'decision' | 'error';
  agent_type?: string;
  agent_name?: string;
  action: string;
  status: 'pending' | 'in_progress' | 'success' | 'failure' | 'timeout';
  duration_ms?: number;
  details?: any;
}

// GET /api/traces/:correlationId/events/:eventId/snapshot
interface EventSnapshot {
  event_id: string;
  input_snapshot: any;
  output_snapshot?: any;
  error_details?: any;
  replay_safe: boolean;
  replay_requires_approval: boolean;
}
```

### 3.3 UI Component

```typescript
// TraceViewer.tsx
interface TraceViewerProps {
  correlationId: string;
  highlightEventId?: string;
}

const TraceViewer: React.FC<TraceViewerProps> = ({
  correlationId,
  highlightEventId
}) => {
  const { data: trace } = useTrace(correlationId);

  return (
    <div className="trace-viewer">
      <TraceHeader trace={trace} />

      <TraceTimeline
        events={trace.events}
        highlightId={highlightEventId}
        onEventClick={(event) => setSelectedEvent(event)}
      />

      {selectedEvent && (
        <EventDetailPanel
          event={selectedEvent}
          onReplay={() => handleReplay(selectedEvent)}
          onSkip={() => handleSkip(selectedEvent)}
        />
      )}

      <TraceActions
        trace={trace}
        onReplayAll={() => handleReplayAll(trace)}
        onAbandon={() => handleAbandon(trace)}
      />
    </div>
  );
};
```

---

## Black Box Recorder

### 4.1 Snapshot Storage

Store full input/output for debugging:

```typescript
interface ExecutionSnapshot {
  snapshot_id: string;
  trace_id: string;
  event_type: string;

  // Inputs
  input_snapshot: {
    type: string;
    data: any;
    tokens: number;
    hash: string;
  };

  // Outputs
  output_snapshot?: {
    type: string;
    data: any;
    tokens: number;
    hash: string;
  };

  // Error (if failed)
  error_snapshot?: {
    code: string;
    message: string;
    stack?: string;
    context?: any;
  };

  // Replay metadata
  is_idempotent: boolean;
  side_effects: string[];
  replay_prerequisites: string[];

  created_at: string;
  expires_at: string;  // Auto-delete after retention period
}
```

### 4.2 What Gets Recorded

```typescript
const SNAPSHOT_CONFIG = {
  // Always record full snapshots
  always_full: [
    'chairman_directive',
    'gate_decision',
    'critical_error',
    'poison_task',
  ],

  // Record input only (output too large)
  input_only: [
    'code_generation',
    'document_generation',
  ],

  // Record hash only (PII concerns)
  hash_only: [
    'customer_data_processing',
    'pii_handling',
  ],

  // Retention periods
  retention: {
    failed: '30 days',
    success: '7 days',
    critical: '1 year',
  },
};
```

### 4.3 Recording Wrapper

```typescript
async function recordedExecution<T>(
  config: RecordConfig,
  fn: () => Promise<T>
): Promise<T> {
  const snapshotId = generateSnapshotId();
  const startTime = Date.now();

  // Record input
  const inputSnapshot = await captureInput(config);

  try {
    const result = await fn();

    // Record output
    await saveSnapshot({
      snapshot_id: snapshotId,
      trace_id: config.correlationId,
      event_type: config.eventType,
      input_snapshot: inputSnapshot,
      output_snapshot: await captureOutput(result, config),
      is_idempotent: config.isIdempotent,
      side_effects: config.sideEffects,
      created_at: new Date().toISOString(),
      expires_at: calculateExpiry('success'),
    });

    return result;
  } catch (error) {
    // Record error
    await saveSnapshot({
      snapshot_id: snapshotId,
      trace_id: config.correlationId,
      event_type: config.eventType,
      input_snapshot: inputSnapshot,
      error_snapshot: captureError(error),
      is_idempotent: config.isIdempotent,
      side_effects: config.sideEffects,
      created_at: new Date().toISOString(),
      expires_at: calculateExpiry('failed'),
    });

    throw error;
  }
}
```

---

## Safe Replay

### 5.1 Replay Safety Classification

```typescript
type ReplaySafety =
  | 'safe'              // Pure computation, always replayable
  | 'idempotent'        // Has side effects but is idempotent
  | 'requires_approval' // Needs human approval before replay
  | 'never';            // Cannot be replayed (irreversible)

const REPLAY_CLASSIFICATION: Record<string, ReplaySafety> = {
  // Safe
  'market_research': 'safe',
  'competitive_analysis': 'safe',
  'financial_modeling': 'safe',

  // Idempotent
  'artifact_generation': 'idempotent',
  'stage_advance': 'idempotent',
  'decision_recording': 'idempotent',

  // Requires approval
  'budget_modification': 'requires_approval',
  'agent_creation': 'requires_approval',
  'external_api_call': 'requires_approval',

  // Never
  'payment_processing': 'never',
  'email_notification': 'never',
  'external_publication': 'never',
};
```

### 5.2 Replay Workflow

```typescript
interface ReplayRequest {
  correlation_id: string;
  replay_from: 'beginning' | 'failure_point' | 'specific_event';
  specific_event_id?: string;

  // Safety overrides
  skip_non_idempotent: boolean;
  force_replay: boolean;  // Requires chairman approval
}

async function requestReplay(
  request: ReplayRequest
): Promise<ReplayResult> {
  const trace = await getTrace(request.correlation_id);

  // 1. Classify events
  const events = trace.events.filter(e =>
    shouldReplay(e, request.replay_from, request.specific_event_id)
  );

  // 2. Check safety
  const unsafe = events.filter(e =>
    REPLAY_CLASSIFICATION[e.event_type] === 'never' ||
    (!request.skip_non_idempotent &&
     REPLAY_CLASSIFICATION[e.event_type] === 'requires_approval')
  );

  if (unsafe.length > 0 && !request.force_replay) {
    return {
      status: 'requires_approval',
      unsafe_events: unsafe,
      approval_request_id: await createApprovalRequest(request, unsafe),
    };
  }

  // 3. Execute replay
  return executeReplay(trace, events, request);
}

async function executeReplay(
  trace: Trace,
  events: TraceEvent[],
  request: ReplayRequest
): Promise<ReplayResult> {
  const newCorrelationId = generateCorrelationId();
  const results: EventReplayResult[] = [];

  for (const event of events) {
    // Skip unsafe events if requested
    if (request.skip_non_idempotent &&
        REPLAY_CLASSIFICATION[event.event_type] === 'requires_approval') {
      results.push({ event_id: event.id, status: 'skipped' });
      continue;
    }

    // Load snapshot
    const snapshot = await getSnapshot(event.id);

    // Replay with same inputs
    try {
      await replayEvent(event, snapshot, newCorrelationId);
      results.push({ event_id: event.id, status: 'success' });
    } catch (error) {
      results.push({ event_id: event.id, status: 'failed', error });
      break;  // Stop on first failure
    }
  }

  return {
    status: 'completed',
    original_correlation_id: trace.correlation_id,
    replay_correlation_id: newCorrelationId,
    results,
  };
}
```

---

## Dashboard Integration

### 6.1 Circuit Breaker Widget

```typescript
// GET /api/chairman/circuit-breakers
interface CircuitBreakerStatus {
  active_breakers: CircuitBreaker[];
  recent_triggers: CircuitBreakerEvent[];
  system_health: 'healthy' | 'degraded' | 'critical';
}

interface CircuitBreaker {
  venture_id: string;
  venture_name: string;
  trigger_type: 'hard_cap' | 'soft_cap' | 'burn_rate' | 'anomaly';
  triggered_at: string;
  reason: string;
  current_value: number;
  threshold: number;
  action_taken: 'paused' | 'warned' | 'rate_limited';
  requires_acknowledgment: boolean;
}
```

### 6.2 Quota Status Widget

```typescript
// GET /api/chairman/quotas
interface QuotaStatus {
  ecosystem_totals: {
    tokens_used_today: number;
    tokens_budget_today: number;
    cost_usd_mtd: number;
    cost_budget_mtd: number;
  };

  ventures_over_budget: VentureQuotaAlert[];
  tools_near_limit: ToolQuotaAlert[];
}

interface VentureQuotaAlert {
  venture_id: string;
  venture_name: string;
  metric: 'tokens' | 'cost';
  current: number;
  budget: number;
  percentage: number;
}
```

### 6.3 UI Components

```typescript
// Add to ChairmanDashboard
<CircuitBreakerWidget
  breakers={circuitBreakers}
  onAcknowledge={handleAcknowledge}
  onViewTrace={(b) => navigate(`/traces/${b.correlation_id}`)}
/>

<QuotaStatusWidget
  quotas={quotaStatus}
  onAdjustBudget={handleAdjustBudget}
  onDrillDown={(v) => navigate(`/ventures/${v.id}?tab=budget`)}
/>

// Add to VentureDetail
<TraceExplorer
  ventureId={ventureId}
  filterStatus={['failed', 'poisoned']}
  onSelectTrace={(correlationId) => setSelectedTrace(correlationId)}
/>

{selectedTrace && (
  <TraceViewer
    correlationId={selectedTrace}
    onClose={() => setSelectedTrace(null)}
  />
)}
```

---

## Database Schema

### 7.1 execution_snapshots

```sql
CREATE TABLE IF NOT EXISTS execution_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id UUID NOT NULL,
  trace_id UUID REFERENCES agent_execution_traces(id),
  event_type VARCHAR(100) NOT NULL,

  input_snapshot JSONB NOT NULL,
  output_snapshot JSONB,
  error_snapshot JSONB,

  is_idempotent BOOLEAN DEFAULT FALSE,
  side_effects TEXT[] DEFAULT '{}',
  replay_prerequisites TEXT[] DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_snapshots_correlation ON execution_snapshots(correlation_id);
CREATE INDEX idx_snapshots_expires ON execution_snapshots(expires_at);

-- Cleanup job
CREATE OR REPLACE FUNCTION fn_cleanup_expired_snapshots()
RETURNS void AS $$
BEGIN
  DELETE FROM execution_snapshots WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;
```

### 7.2 replay_requests

```sql
CREATE TABLE IF NOT EXISTS replay_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_correlation_id UUID NOT NULL,
  replay_correlation_id UUID,

  replay_from VARCHAR(50) NOT NULL,
  specific_event_id UUID,

  status VARCHAR(20) DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'executing', 'completed', 'failed')),

  unsafe_events JSONB DEFAULT '[]',
  requested_by UUID,
  approved_by UUID,
  approval_notes TEXT,

  results JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_replay_pending ON replay_requests(status)
  WHERE status = 'pending';
```

---

## Critical Questions for the Chairman

1. **Auto-pause on failures?** Should the system automatically pause ventures on certain failure types, or always ask?

2. **Partial completion tolerance?** Continue in degraded mode or "stop the line"?

3. **Snapshot retention?** How long to keep snapshots for debugging (storage vs auditability)?

4. **Raw artifact access?** Who can view raw artifacts that may contain sensitive data?

---

## Related Specifications

- [09-agent-runtime-service.md](./09-agent-runtime-service.md) - Task execution
- [04-eva-orchestration.md](./04-eva-orchestration.md) - Circuit breakers
- [03-ui-components.md](./03-ui-components.md) - Dashboard components
- [01-database-schema.md](./01-database-schema.md) - Trace tables
