---
category: reference
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [reference, auto-generated]
---
# Agent Runtime Service Specification



## Table of Contents

- [Metadata](#metadata)
- [Overview](#overview)
  - [The Problem](#the-problem)
  - [The Solution](#the-solution)
- [Runtime Topology](#runtime-topology)
  - [2.1 Worker Types](#21-worker-types)
  - [2.2 Deployment Model](#22-deployment-model)
  - [2.3 Event-Driven vs Polling](#23-event-driven-vs-polling)
- [Claim and Lease Model](#claim-and-lease-model)
  - [3.1 Task Claiming](#31-task-claiming)
  - [3.2 Lease Heartbeat](#32-lease-heartbeat)
  - [3.3 Lease Expiration Recovery](#33-lease-expiration-recovery)
- [Idempotency and Replay](#idempotency-and-replay)
  - [4.1 Idempotency Keys](#41-idempotency-keys)
  - [4.2 Task Checkpoints](#42-task-checkpoints)
  - [4.3 Safe Replay](#43-safe-replay)
- [Failure Recovery](#failure-recovery)
  - [5.1 Retry Policy](#51-retry-policy)
  - [5.2 Poison Queue](#52-poison-queue)
  - [5.3 Dead Letter Queue](#53-dead-letter-queue)
- [Concurrency and Backpressure](#concurrency-and-backpressure)
  - [6.1 Global Concurrency Limits](#61-global-concurrency-limits)
  - [6.2 Admission Control](#62-admission-control)
  - [6.3 Backpressure Signals](#63-backpressure-signals)
- [Memory Management](#memory-management)
  - [7.1 CEO/VP Memory Architecture](#71-ceovp-memory-architecture)
  - [7.2 Memory Pruning Policy](#72-memory-pruning-policy)
  - [7.3 Summarization](#73-summarization)
- [Database Schema](#database-schema)
  - [8.1 Enhanced agent_task_contracts](#81-enhanced-agent_task_contracts)
  - [8.2 idempotent_actions](#82-idempotent_actions)
  - [8.3 dead_letter_queue](#83-dead_letter_queue)
  - [8.4 concurrency_limits](#84-concurrency_limits)
  - [8.5 agent_memory_archives](#85-agent_memory_archives)
- [Critical Questions for the Chairman](#critical-questions-for-the-chairman)
- [Related Specifications](#related-specifications)

## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-12
- **Tags**: database, schema, deployment, reference

**Vision v2 Chairman's OS - Production Agent Execution**

> "Reliable, observable, recoverable - at scale."

---

## Table of Contents

1. [Overview](#overview)
2. [Runtime Topology](#runtime-topology)
3. [Claim and Lease Model](#claim-and-lease-model)
4. [Idempotency and Replay](#idempotency-and-replay)
5. [Failure Recovery](#failure-recovery)
6. [Concurrency and Backpressure](#concurrency-and-backpressure)
7. [Memory Management](#memory-management)
8. [Database Schema](#database-schema)

---

## Overview

### The Problem

The architecture specifies agent lifecycle primitives but lacks production-grade details:

1. **No formal claim model** - How do workers avoid duplicate execution?
2. **Idempotency is mentioned but not specified** - What happens on retry?
3. **No poison queue handling** - How do permanently failing tasks get isolated?
4. **No backpressure controls** - What happens at 100 ventures with 50 concurrent tasks each?

### The Solution

The Agent Runtime Service provides:

- **Claim-with-lease model** for exclusive task ownership
- **Idempotency keys** and checkpoint-based resumption
- **Poison queue** with automatic isolation and alerting
- **Global and per-venture concurrency limits** with graceful degradation

---

## Runtime Topology

### 2.1 Worker Types

```typescript
type WorkerType =
  | 'ceo_handler'        // Long-lived, handles CEO agent events
  | 'vp_handler'         // Long-lived, handles VP agent events
  | 'crew_executor'      // Short-lived, executes crew tasks
  | 'message_router'     // Stateless, routes agent_messages
  | 'deadline_watchdog'  // Periodic, checks for stuck tasks
  | 'budget_enforcer';   // Periodic, enforces token/spend limits
```

### 2.2 Deployment Model

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Agent Runtime Service                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐     │
│  │ CEO Handler     │  │ VP Handler      │  │ Crew Executor   │     │
│  │ Pool (3-5)      │  │ Pool (5-10)     │  │ Pool (10-50)    │     │
│  │                 │  │                 │  │                 │     │
│  │ • Wake on msg   │  │ • Wake on msg   │  │ • Pull from     │     │
│  │ • Persistent    │  │ • Persistent    │  │   task queue    │     │
│  │   context       │  │   context       │  │ • Stateless     │     │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘     │
│           │                    │                    │               │
│           └────────────────────┼────────────────────┘               │
│                                │                                    │
│                                ▼                                    │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Message Router                            │   │
│  │  • Route to correct handler pool                             │   │
│  │  • Enforce authority checks                                  │   │
│  │  • Log correlation_id                                        │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                │                                    │
│  ┌─────────────────┐  ┌───────┴───────┐  ┌─────────────────┐       │
│  │ Deadline        │  │   Database    │  │ Budget          │       │
│  │ Watchdog        │  │   (Source of  │  │ Enforcer        │       │
│  │ (every 1 min)   │  │    Truth)     │  │ (every 5 min)   │       │
│  └─────────────────┘  └───────────────┘  └─────────────────┘       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.3 Event-Driven vs Polling

| Component | Trigger Method | Why |
|-----------|---------------|-----|
| CEO/VP Handlers | DB trigger → queue | Low latency, wake on demand |
| Crew Executors | Poll task queue | Stateless, horizontal scale |
| Message Router | HTTP/gRPC endpoint | Synchronous routing |
| Watchdogs | Cron/scheduled | Periodic cleanup |

```sql
-- Trigger to notify on new messages
CREATE OR REPLACE FUNCTION fn_notify_agent_message()
RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify(
    'agent_message',
    json_build_object(
      'to_agent_id', NEW.to_agent_id,
      'message_type', NEW.message_type,
      'priority', NEW.priority
    )::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_agent_message_notify
  AFTER INSERT ON agent_messages
  FOR EACH ROW EXECUTE FUNCTION fn_notify_agent_message();
```

---

## Claim and Lease Model

### 3.1 Task Claiming

Before executing, a worker MUST claim the task with a lease:

```typescript
interface TaskClaim {
  task_id: string;
  claimed_by: string;         // Worker instance ID
  claimed_at: string;
  lease_expires_at: string;   // claim + lease_duration
  lease_duration_ms: number;  // Default: 60000 (1 min)
}

async function claimTask(
  taskId: string,
  workerId: string,
  leaseDurationMs: number = 60000
): Promise<TaskClaim | null> {
  // Atomic claim with advisory lock
  const result = await db.query(`
    UPDATE agent_task_contracts
    SET
      status = 'claimed',
      claimed_by = $1,
      claimed_at = NOW(),
      lease_expires_at = NOW() + ($2 || ' milliseconds')::interval
    WHERE id = $3
      AND status = 'pending'
      AND (lease_expires_at IS NULL OR lease_expires_at < NOW())
    RETURNING *
  `, [workerId, leaseDurationMs, taskId]);

  return result.rows[0] || null;
}
```

### 3.2 Lease Heartbeat

Long-running tasks MUST heartbeat to extend their lease:

```typescript
async function heartbeat(
  taskId: string,
  workerId: string,
  checkpoint?: TaskCheckpoint
): Promise<boolean> {
  const result = await db.query(`
    UPDATE agent_task_contracts
    SET
      lease_expires_at = NOW() + '60 seconds'::interval,
      last_heartbeat_at = NOW(),
      checkpoint_data = COALESCE($3, checkpoint_data),
      updated_at = NOW()
    WHERE id = $1
      AND claimed_by = $2
      AND status IN ('claimed', 'in_progress')
    RETURNING id
  `, [taskId, workerId, checkpoint]);

  return result.rowCount > 0;
}

// Background heartbeat loop
async function runWithHeartbeat<T>(
  taskId: string,
  workerId: string,
  fn: () => Promise<T>,
  intervalMs: number = 30000
): Promise<T> {
  const heartbeatInterval = setInterval(() => {
    heartbeat(taskId, workerId).catch(console.error);
  }, intervalMs);

  try {
    return await fn();
  } finally {
    clearInterval(heartbeatInterval);
  }
}
```

### 3.3 Lease Expiration Recovery

The Deadline Watchdog reclaims expired leases:

```typescript
async function reclaimExpiredLeases(): Promise<number> {
  const result = await db.query(`
    UPDATE agent_task_contracts
    SET
      status = 'pending',
      claimed_by = NULL,
      claimed_at = NULL,
      lease_expires_at = NULL,
      retry_count = retry_count + 1,
      last_failure_reason = 'Lease expired (worker died or timed out)'
    WHERE status IN ('claimed', 'in_progress')
      AND lease_expires_at < NOW()
      AND retry_count < max_retries
    RETURNING id
  `);

  // Log for observability
  for (const row of result.rows) {
    await logEvent('lease_expired', { task_id: row.id });
  }

  return result.rowCount;
}
```

---

## Idempotency and Replay

### 4.1 Idempotency Keys

Every significant action has an idempotency key:

```typescript
interface IdempotentAction {
  idempotency_key: string;    // Hash of (task_id + step + inputs)
  action_type: string;
  inputs_hash: string;
  result?: any;
  executed_at?: string;
}

async function executeIdempotent<T>(
  key: string,
  actionType: string,
  inputsHash: string,
  fn: () => Promise<T>
): Promise<T> {
  // 1. Check if already executed
  const existing = await db.query(`
    SELECT result FROM idempotent_actions
    WHERE idempotency_key = $1
  `, [key]);

  if (existing.rows[0]) {
    return existing.rows[0].result;  // Return cached result
  }

  // 2. Execute
  const result = await fn();

  // 3. Store result
  await db.query(`
    INSERT INTO idempotent_actions (idempotency_key, action_type, inputs_hash, result, executed_at)
    VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (idempotency_key) DO NOTHING
  `, [key, actionType, inputsHash, result]);

  return result;
}
```

### 4.2 Task Checkpoints

For long-running tasks, use checkpoints for resumable execution:

```typescript
interface TaskCheckpoint {
  step: string;                // Current step name
  step_index: number;          // For ordered steps
  completed_steps: string[];   // Already done
  intermediate_state: any;     // State needed to resume
  created_at: string;
}

async function executeWithCheckpoints(
  taskId: string,
  steps: TaskStep[]
): Promise<TaskResult> {
  // 1. Load checkpoint
  const checkpoint = await loadCheckpoint(taskId);
  const startIndex = checkpoint?.step_index ?? 0;

  // 2. Execute from checkpoint
  let state = checkpoint?.intermediate_state ?? {};

  for (let i = startIndex; i < steps.length; i++) {
    const step = steps[i];

    // Execute step idempotently
    const result = await executeIdempotent(
      `${taskId}:${step.name}`,
      step.type,
      hashInputs(step.inputs, state),
      () => step.execute(state)
    );

    // Update state
    state = { ...state, ...result };

    // Save checkpoint after each step
    await saveCheckpoint(taskId, {
      step: step.name,
      step_index: i + 1,
      completed_steps: steps.slice(0, i + 1).map(s => s.name),
      intermediate_state: state,
      created_at: new Date().toISOString(),
    });
  }

  return state;
}
```

### 4.3 Safe Replay

Replay is only safe for idempotent steps:

```typescript
interface ReplayPolicy {
  task_id: string;
  replay_from: 'beginning' | 'last_checkpoint' | 'specific_step';
  specific_step?: string;

  // Safety checks
  allow_non_idempotent: boolean;
  require_approval: boolean;
}

async function replayTask(policy: ReplayPolicy): Promise<void> {
  const task = await getTask(policy.task_id);

  // 1. Check replay safety
  if (!policy.allow_non_idempotent) {
    const unsafeSteps = await findNonIdempotentSteps(task);
    if (unsafeSteps.length > 0) {
      throw new Error(`Cannot replay: non-idempotent steps found: ${unsafeSteps.join(', ')}`);
    }
  }

  // 2. Require approval for non-trivial replays
  if (policy.require_approval && task.replay_count > 0) {
    await requestReplayApproval(task);
    return;  // Wait for approval
  }

  // 3. Reset task state based on replay policy
  await resetTaskForReplay(task, policy);

  // 4. Mark for re-execution
  await db.query(`
    UPDATE agent_task_contracts
    SET status = 'pending', replay_count = replay_count + 1
    WHERE id = $1
  `, [policy.task_id]);
}
```

---

## Failure Recovery

### 5.1 Retry Policy

```typescript
interface RetryPolicy {
  max_retries: number;
  initial_delay_ms: number;
  max_delay_ms: number;
  backoff_multiplier: number;
  retryable_errors: string[];
  non_retryable_errors: string[];
}

const DEFAULT_RETRY_POLICY: RetryPolicy = {
  max_retries: 3,
  initial_delay_ms: 1000,
  max_delay_ms: 30000,
  backoff_multiplier: 2,
  retryable_errors: [
    'TIMEOUT',
    'RATE_LIMITED',
    'SERVICE_UNAVAILABLE',
    'LEASE_EXPIRED',
  ],
  non_retryable_errors: [
    'INVALID_INPUT',
    'PERMISSION_DENIED',
    'BUDGET_EXCEEDED',
    'POISON_TASK',
  ],
};

function calculateRetryDelay(
  retryCount: number,
  policy: RetryPolicy
): number {
  const delay = policy.initial_delay_ms * Math.pow(policy.backoff_multiplier, retryCount);
  return Math.min(delay, policy.max_delay_ms);
}
```

### 5.2 Poison Queue

Tasks that fail repeatedly are moved to the poison queue:

```typescript
interface PoisonTask {
  task_id: string;
  poisoned_at: string;
  failure_count: number;
  last_error: string;
  error_history: ErrorRecord[];

  // Manual intervention required
  resolution_status: 'pending' | 'investigating' | 'resolved' | 'abandoned';
  assigned_to?: string;
  resolution_notes?: string;
}

async function moveToPoison(taskId: string, error: Error): Promise<void> {
  await db.query(`
    UPDATE agent_task_contracts
    SET
      status = 'poisoned',
      poisoned_at = NOW(),
      last_failure_reason = $2,
      error_history = error_history || $3::jsonb
    WHERE id = $1
  `, [
    taskId,
    error.message,
    JSON.stringify({
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    }),
  ]);

  // Alert
  await createAlert({
    type: 'poison_task',
    severity: 'critical',
    task_id: taskId,
    message: `Task ${taskId} moved to poison queue: ${error.message}`,
  });
}

// Review poison queue (ops workflow)
async function reviewPoisonQueue(): Promise<PoisonTask[]> {
  return db.query(`
    SELECT * FROM agent_task_contracts
    WHERE status = 'poisoned'
    ORDER BY poisoned_at ASC
  `).then(r => r.rows);
}
```

### 5.3 Dead Letter Queue

For unprocessable messages:

```typescript
interface DeadLetter {
  original_message: AgentMessage;
  failure_reason: string;
  attempted_at: string;
  retry_count: number;
}

async function moveToDeadLetter(
  message: AgentMessage,
  reason: string
): Promise<void> {
  await db.query(`
    INSERT INTO dead_letter_queue (message_id, original_message, failure_reason, attempted_at)
    VALUES ($1, $2, $3, NOW())
  `, [message.id, message, reason]);

  // Mark original as dead
  await db.query(`
    UPDATE agent_messages SET status = 'dead_lettered' WHERE id = $1
  `, [message.id]);
}
```

---

## Concurrency and Backpressure

### 6.1 Global Concurrency Limits

```typescript
interface ConcurrencyConfig {
  // Global limits
  max_concurrent_tasks: number;         // Across all ventures
  max_concurrent_per_venture: number;   // Per venture
  max_concurrent_per_stage: number;     // Per stage type

  // Per-worker limits
  max_tasks_per_ceo_handler: number;
  max_tasks_per_vp_handler: number;
  max_tasks_per_crew_executor: number;

  // Queue limits
  max_pending_tasks: number;            // Total pending queue size
  max_pending_per_venture: number;
}

const DEFAULT_CONCURRENCY: ConcurrencyConfig = {
  max_concurrent_tasks: 200,
  max_concurrent_per_venture: 10,
  max_concurrent_per_stage: 20,
  max_tasks_per_ceo_handler: 5,
  max_tasks_per_vp_handler: 10,
  max_tasks_per_crew_executor: 1,
  max_pending_tasks: 1000,
  max_pending_per_venture: 50,
};
```

### 6.2 Admission Control

```typescript
async function canAcceptTask(
  task: TaskSubmission
): Promise<AdmissionResult> {
  const config = await getConcurrencyConfig();

  // 1. Check global limits
  const globalActive = await countActiveTasks();
  if (globalActive >= config.max_concurrent_tasks) {
    return { admitted: false, reason: 'Global concurrency limit reached' };
  }

  // 2. Check venture limits
  const ventureActive = await countActiveTasks(task.venture_id);
  if (ventureActive >= config.max_concurrent_per_venture) {
    return { admitted: false, reason: 'Venture concurrency limit reached' };
  }

  // 3. Check pending queue
  const pendingCount = await countPendingTasks(task.venture_id);
  if (pendingCount >= config.max_pending_per_venture) {
    return { admitted: false, reason: 'Venture queue full' };
  }

  return { admitted: true };
}
```

### 6.3 Backpressure Signals

```typescript
interface BackpressureStatus {
  level: 'normal' | 'elevated' | 'critical';
  global_utilization: number;       // 0-100%
  queue_depth: number;
  estimated_wait_time_seconds: number;

  recommendations: string[];
}

async function getBackpressureStatus(): Promise<BackpressureStatus> {
  const config = await getConcurrencyConfig();
  const activeTasks = await countActiveTasks();
  const pendingTasks = await countPendingTasks();

  const utilization = (activeTasks / config.max_concurrent_tasks) * 100;
  const queueRatio = pendingTasks / config.max_pending_tasks;

  let level: BackpressureStatus['level'];
  if (utilization > 90 || queueRatio > 0.8) {
    level = 'critical';
  } else if (utilization > 70 || queueRatio > 0.5) {
    level = 'elevated';
  } else {
    level = 'normal';
  }

  return {
    level,
    global_utilization: utilization,
    queue_depth: pendingTasks,
    estimated_wait_time_seconds: calculateWaitTime(pendingTasks, activeTasks),
    recommendations: generateRecommendations(level, utilization, queueRatio),
  };
}
```

---

## Memory Management

### 7.1 CEO/VP Memory Architecture

Persistent agents have structured memory:

```typescript
interface AgentMemory {
  agent_id: string;

  // Decision Journal (immutable)
  decision_journal: DecisionEntry[];   // Never pruned

  // Working Context (prunable)
  working_context: ContextEntry[];     // Active task context
  working_context_tokens: number;
  max_working_context_tokens: number;

  // Learned Patterns (summarizable)
  learned_patterns: PatternEntry[];

  // Last summarization
  last_summarized_at: string;
  summarization_count: number;
}

interface DecisionEntry {
  decision_id: string;
  timestamp: string;
  stage: number;
  decision: string;
  rationale: string;
  confidence: number;
  outcome?: 'correct' | 'incorrect' | 'unknown';
}

interface ContextEntry {
  entry_id: string;
  timestamp: string;
  content: string;
  tokens: number;
  importance: 'critical' | 'high' | 'medium' | 'low';
  expires_at?: string;
}
```

### 7.2 Memory Pruning Policy

```typescript
interface PruningPolicy {
  // Token thresholds
  trigger_threshold: number;     // Start pruning at this token count
  target_after_prune: number;    // Prune down to this level

  // Retention rules
  never_prune: string[];         // Entry types to never prune
  max_age_days: Record<string, number>;  // Max age by importance

  // Summarization
  summarize_before_prune: boolean;
  min_entries_before_summarize: number;
}

const DEFAULT_PRUNING_POLICY: PruningPolicy = {
  trigger_threshold: 150000,     // 150k tokens
  target_after_prune: 100000,    // 100k tokens

  never_prune: ['decision_journal', 'critical_context'],
  max_age_days: {
    critical: Infinity,
    high: 30,
    medium: 7,
    low: 1,
  },

  summarize_before_prune: true,
  min_entries_before_summarize: 10,
};

async function pruneAgentMemory(agentId: string): Promise<PruneResult> {
  const policy = await getPruningPolicy(agentId);
  const memory = await getAgentMemory(agentId);

  if (memory.working_context_tokens < policy.trigger_threshold) {
    return { pruned: false, reason: 'Below threshold' };
  }

  // 1. Summarize if needed
  if (policy.summarize_before_prune) {
    await summarizeWorkingContext(agentId, memory);
  }

  // 2. Calculate what to prune
  const toPrune = selectEntriesForPruning(
    memory.working_context,
    policy,
    memory.working_context_tokens - policy.target_after_prune
  );

  // 3. Archive pruned entries (don't delete)
  await archiveEntries(agentId, toPrune);

  // 4. Update memory
  await removeFromWorkingContext(agentId, toPrune);

  return {
    pruned: true,
    entries_pruned: toPrune.length,
    tokens_freed: toPrune.reduce((sum, e) => sum + e.tokens, 0),
  };
}
```

### 7.3 Summarization

```typescript
async function summarizeWorkingContext(
  agentId: string,
  memory: AgentMemory
): Promise<void> {
  // 1. Group entries by topic
  const groups = groupEntriesByTopic(memory.working_context);

  // 2. Generate summary for each group
  const summaries: SummaryEntry[] = [];
  for (const group of groups) {
    if (group.entries.length >= 10) {  // Worth summarizing
      const summary = await generateSummary(group.entries);
      summaries.push({
        topic: group.topic,
        summary: summary.text,
        original_entry_count: group.entries.length,
        original_tokens: group.entries.reduce((s, e) => s + e.tokens, 0),
        summary_tokens: countTokens(summary.text),
        key_facts: summary.key_facts,
        created_at: new Date().toISOString(),
      });
    }
  }

  // 3. Store summaries as learned patterns
  await addLearnedPatterns(agentId, summaries);
}
```

---

## Database Schema

### 8.1 Enhanced agent_task_contracts

```sql
ALTER TABLE agent_task_contracts ADD COLUMN IF NOT EXISTS
  claimed_by VARCHAR(100),
  claimed_at TIMESTAMPTZ,
  lease_expires_at TIMESTAMPTZ,
  last_heartbeat_at TIMESTAMPTZ,
  checkpoint_data JSONB,
  retry_count INT DEFAULT 0,
  max_retries INT DEFAULT 3,
  last_failure_reason TEXT,
  error_history JSONB DEFAULT '[]'::jsonb,
  poisoned_at TIMESTAMPTZ,
  replay_count INT DEFAULT 0,
  idempotency_key VARCHAR(255);

CREATE INDEX idx_task_contracts_claimable ON agent_task_contracts(status, lease_expires_at)
  WHERE status = 'pending' OR (status IN ('claimed', 'in_progress') AND lease_expires_at < NOW());
CREATE INDEX idx_task_contracts_poisoned ON agent_task_contracts(status)
  WHERE status = 'poisoned';
```

### 8.2 idempotent_actions

```sql
CREATE TABLE IF NOT EXISTS idempotent_actions (
  idempotency_key VARCHAR(255) PRIMARY KEY,
  action_type VARCHAR(100) NOT NULL,
  inputs_hash VARCHAR(64) NOT NULL,
  result JSONB,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days'
);

CREATE INDEX idx_idempotent_expires ON idempotent_actions(expires_at);

-- Cleanup job
CREATE OR REPLACE FUNCTION fn_cleanup_idempotent_actions()
RETURNS void AS $$
BEGIN
  DELETE FROM idempotent_actions WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;
```

### 8.3 dead_letter_queue

```sql
CREATE TABLE IF NOT EXISTS dead_letter_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL,
  original_message JSONB NOT NULL,
  failure_reason TEXT NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retry_count INT DEFAULT 0,
  resolution_status VARCHAR(20) DEFAULT 'pending',
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT
);

CREATE INDEX idx_dlq_pending ON dead_letter_queue(resolution_status)
  WHERE resolution_status = 'pending';
```

### 8.4 concurrency_limits

```sql
CREATE TABLE IF NOT EXISTS concurrency_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope VARCHAR(50) NOT NULL CHECK (scope IN ('global', 'portfolio', 'venture')),
  scope_id UUID,

  max_concurrent INT NOT NULL DEFAULT 10,
  current_active INT DEFAULT 0,
  max_pending INT NOT NULL DEFAULT 50,
  current_pending INT DEFAULT 0,

  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(scope, scope_id)
);

-- Atomic increment/decrement
CREATE OR REPLACE FUNCTION fn_adjust_concurrency(
  p_scope VARCHAR(50),
  p_scope_id UUID,
  p_active_delta INT,
  p_pending_delta INT
) RETURNS BOOLEAN AS $$
DECLARE
  v_result BOOLEAN;
BEGIN
  UPDATE concurrency_limits
  SET
    current_active = GREATEST(0, current_active + p_active_delta),
    current_pending = GREATEST(0, current_pending + p_pending_delta),
    updated_at = NOW()
  WHERE scope = p_scope AND (scope_id = p_scope_id OR (scope_id IS NULL AND p_scope_id IS NULL));

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;
```

### 8.5 agent_memory_archives

```sql
CREATE TABLE IF NOT EXISTS agent_memory_archives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agent_registry(id) ON DELETE CASCADE,

  entry_type VARCHAR(50) NOT NULL,
  original_entry_id UUID,
  content JSONB NOT NULL,
  tokens INT,
  importance VARCHAR(20),

  archived_at TIMESTAMPTZ DEFAULT NOW(),
  archive_reason VARCHAR(50),  -- 'pruned', 'summarized', 'expired'

  created_at TIMESTAMPTZ  -- Original creation time
);

CREATE INDEX idx_memory_archives_agent ON agent_memory_archives(agent_id, archived_at DESC);
```

---

## Critical Questions for the Chairman

1. **Always-on vs Event-driven CEOs?** Should CEO agents be always-running processes or wake on demand?

2. **Replay approval threshold?** How many automatic replays before requiring manual approval?

3. **Poison queue notification?** Who gets alerted immediately vs batched for poison tasks?

4. **Memory retention?** How long should archived memory entries be kept before permanent deletion?

---

## Related Specifications

- [06-hierarchical-agent-architecture.md](./06-hierarchical-agent-architecture.md) - Agent hierarchy
- [04-eva-orchestration.md](./04-eva-orchestration.md) - EVA dispatch logic
- [08-governance-policy-engine.md](./08-governance-policy-engine.md) - Authority checks
- [01-database-schema.md](./01-database-schema.md) - Foundation tables
