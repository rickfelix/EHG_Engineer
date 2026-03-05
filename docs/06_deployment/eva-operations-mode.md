---
Category: Deployment
Status: Draft
Version: 1.0.0
Author: LEO Orchestrator
Last Updated: 2026-03-05
Tags: eva, operations, background-workers, post-pipeline
---

# EVA Operations Mode — Operational Runbook

## Metadata
- **Category**: Deployment
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: LEO Orchestrator
- **Last Updated**: 2026-03-05
- **Tags**: eva, operations, background-workers, post-pipeline

## Overview

Operations Mode is the post-pipeline phase of the EVA venture lifecycle. It activates automatically when a venture completes Stage 25 (Launch Execution), the terminus of the 25-stage evaluation-build-launch pipeline. At that point the venture's `pipeline_mode` column transitions from `'launch'` to `'operations'` and six background workers take over ongoing venture management.

Operations Mode replaces the staged gate-driven evaluation model with a continuous, cadence-driven service layer. Workers run on fixed schedules managed by the EVA Master Scheduler. Unlike pipeline stages, there is no exit gate — a venture stays in Operations Mode until it is explicitly parked (`'parked'`) or killed (`'killed'`).

**Source SD**: SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-I
**Key modules**: `lib/eva/operations/`, `lib/eva/workers/`, `server/routes/eva-operations.js`

---

## Current Implementation Status

### Operational (Production-Ready)

- **Health Scorer** (`ops_health_score`) — sweeps stale services, reports aggregate health. Hourly cadence.
- **Operations Snapshot** (`ops_status_snapshot`) — persists full subsystem status to `eva_scheduler_metrics`. Hourly cadence.
- **Worker Infrastructure** — `BaseWorker` lifecycle, `WorkerScheduler` registry, circuit breaker, graceful shutdown all functional.
- **Master Scheduler Integration** — all 6 handlers registered via `registerOperationsHandlers()`.
- **REST API** — both endpoints (`/status`, `/workers`) mounted and returning data.

### Partially Implemented (Needs Fixes Before Reliable)

| Worker | What Works | Blocker |
|--------|-----------|---------|
| `ops_feedback_classify` | Classifier logic assigns dimension codes | `feedback_items` table migration missing — circuit-breaks if absent |
| `ops_metrics_collect` | Pipeline throughput collection | No AARRR business metrics; infrastructure metrics only |
| `ops_enhancement_detect` | Signal pattern detection | `captureSignals()` param mismatch — signals not persisted |
| `ops_financial_sync` | Contract existence check | No Stripe/payment provider integration |

### Not Yet Built

| Component | Description |
|-----------|-------------|
| Customer Service Agent | Continuous retention monitoring/outreach — no code exists |
| Operations Dashboard UI | Chairman pages at `/chairman/operations` — tracked by SD-LEO-FEAT-EVA-OPERATIONS-DASHBOARD-001 |
| Pipeline-to-GUI Wiring | Stage visualization UI — tracked by SD-LEO-FEAT-EVA-PIPELINE-GUI-001 |
| Stripe Integration | MRR/ARR/CAC/LTV sync for Financial Sync worker |
| AARRR Metrics | Per-venture Acquisition/Activation/Retention/Revenue/Referral collection |

---

## Pipeline Mode Lifecycle

The `pipeline_mode` column on the `ventures` table controls which phase of the EVA system is responsible for a venture. Valid values and their transitions are:

| Value | Phase | Entered when |
|---|---|---|
| `evaluation` | Stages 0–17 (Evaluation) | Venture is created and enters Stage 0 |
| `build` | Stages 18–22 (Build) | Venture passes Stage 17 promotion gate |
| `launch` | Stages 23–25 (Launch) | Venture passes Stage 22 release gate |
| `operations` | Post-pipeline Operations | Stage 25 (Launch Execution) completes |
| `parked` | Suspended | Manual operator action |
| `killed` | Terminated | Manual operator action or kill-gate failure |

**Transition rule**: only Stage 25's completion handler writes `pipeline_mode = 'operations'`. No other path should set this value directly.

**Parked vs. killed**:
- `parked` — workers stop running for this venture; the venture can be un-parked.
- `killed` — terminal state; venture is archived and workers will not process it.

---

## Background Workers

Six workers are registered with the EVA Master Scheduler via `registerOperationsHandlers()` in `lib/eva/operations/domain-handler.js`. Each is a domain handler (a plain async function) registered against a named key in the scheduler's domain registry, not a subclass of `BaseWorker`.

| Worker key | Cadence | What it does | Implementation status |
|---|---|---|---|
| `ops_financial_sync` | Hourly | Queries active/in-progress ventures and verifies each has a financial contract via `getContract()`. Logs contract presence; does **not** sync to Stripe or any payment provider. | **STUB** — contract existence check only. No Stripe integration. |
| `ops_feedback_classify` | Every 10 min (frequent) | Fetches unclassified rows from `feedback_items` (where `dimension_code IS NULL`, up to 20 per run) and calls `classifyFeedback()` to assign a dimension code. | **PARTIAL** — classifier logic exists but `feedback_items` table has no confirmed migration. May fail if table is absent. |
| `ops_metrics_collect` | Every 6 hours | Counts active ventures and stages completed in the prior 6 h window from `eva_stage_gate_results`, then inserts a `'ops_pipeline_throughput'` snapshot into `eva_scheduler_metrics`. Collects pipeline throughput only — not AARRR metrics. | **PARTIAL** — cadence mismatch: domain handler registers as `'six_hourly'` but the scheduler maps this interval inconsistently with other hourly workers. No AARRR (Acquisition, Activation, Retention, Revenue, Referral) metrics collected. |
| `ops_health_score` | Hourly | Calls `sweepStaleServices()` then `getSystemHealth()` from `hub-health-monitor.js`. Returns service count and overall health status. | **FUNCTIONAL** — health monitor is implemented and operational. |
| `ops_enhancement_detect` | Daily | Fetches retrospectives from the last 24 h and calls `captureSignals()` for each. Detected signals are enhancement candidates for the LEO backlog. | **PARTIAL** — `captureSignals()` is called with only `(text, { supabase })` but its signature may require additional params (param mismatch risk). |
| `ops_status_snapshot` | Hourly | Calls `getOperationsStatus()` (aggregates all subsystems) and persists the result to `eva_scheduler_metrics` as `'ops_status_snapshot'`. | **FUNCTIONAL** — depends on subsystem health; degrades gracefully if subsystems are unavailable. |

> Note: A seventh conceptual service — Customer Success Agent — was identified during architecture planning but **has no implementation**. It is not registered as a handler and does not run.

### Cadence Reference

Cadences are declared in the exported `OPERATIONS_CADENCES` constant in `domain-handler.js`:

```js
export const OPERATIONS_CADENCES = {
  ops_financial_sync:     'hourly',
  ops_feedback_classify:  'frequent',   // ~10 min
  ops_metrics_collect:    'six_hourly',
  ops_health_score:       'hourly',
  ops_enhancement_detect: 'daily',
  ops_status_snapshot:    'hourly',
};
```

---

## Worker Infrastructure

### BaseWorker (`lib/eva/workers/base-worker.js`)

All scheduled background work in EVA uses `BaseWorker` as the abstract base class. Domain handlers registered via `registerOperationsHandlers()` are wrapped by the scheduler; the `BaseWorker` class provides the lifecycle layer that any direct subclass would inherit.

Key properties and behavior:

| Property | Default | Description |
|---|---|---|
| `intervalMs` | 60 000 ms | How often `execute()` is called |
| `maxRetries` | 3 | Consecutive failures before circuit-breaker trips |
| `_consecutiveFailures` | 0 | Resets to 0 on any success |
| `_totalRuns` | 0 | Monotonic counter of all executions |
| `_totalErrors` | 0 | Monotonic counter of all errors |

**Start behavior**: `start()` calls `_tick()` immediately on startup, then sets an interval. Workers do not wait one full interval before the first run.

**Circuit breaker**: when `_consecutiveFailures >= maxRetries`, `_tick()` logs a `'circuit-broken'` event and skips execution. Call `resetCircuitBreaker()` to resume. The circuit breaker is per-instance and does not persist across process restarts.

**Health check**: `health()` returns:

```js
{
  name: string,
  running: boolean,
  lastRun: Date | null,
  lastError: string | null,
  consecutiveFailures: number,
  totalRuns: number,
  totalErrors: number,
  circuitBroken: boolean,
}
```

### WorkerScheduler (`lib/eva/workers/worker-scheduler.js`)

`WorkerScheduler` is a registry and lifecycle manager for `BaseWorker` instances.

**Key methods**:

| Method | Description |
|---|---|
| `register(worker)` | Add a worker. Throws if a worker with the same name is already registered. |
| `startAll()` | Call `start()` on every registered worker. |
| `stopAll()` | Call `stop()` on every registered worker. |
| `healthCheck()` | Return a map of `workerName → health()` for all workers. |
| `get(name)` | Retrieve a single worker by name (returns `null` if not found). |
| `list()` | Return an array of registered worker names. |
| `installShutdownHandlers()` | Register `SIGINT`/`SIGTERM` handlers that call `stopAll()` and run any `onShutdown()` callbacks. Call once after registering all workers. |
| `onShutdown(fn)` | Register an additional cleanup callback invoked during graceful shutdown. |

---

## Master Scheduler Integration

Operations handlers are registered with the EVA Master Scheduler via `registerOperationsHandlers(domainRegistry)` exported from `lib/eva/operations/domain-handler.js`.

The function accepts the scheduler's `domainRegistry` (a `ServiceRegistry` instance) and calls `domainRegistry.register(key, handler)` for each of the six workers. The scheduler is responsible for invoking each handler at the declared cadence with a `params` object containing at minimum `{ supabase, logger }`.

**Startup sequence** (expected):

1. Server process starts.
2. Supabase client is initialized and attached to `app.locals.supabase`.
3. `WorkerScheduler` is instantiated.
4. `registerOperationsHandlers(scheduler.domainRegistry)` is called.
5. `scheduler.startAll()` is called.
6. `scheduler.installShutdownHandlers()` is called.

**Important**: `registerOperationsHandlers` uses dynamic `import()` inside each handler to load subsystem modules lazily. This avoids circular dependency issues at startup but means the first invocation of each handler carries a module-load overhead.

---

## API Endpoints

The Operations REST API is mounted under `/api/eva/operations` via `server/routes/eva-operations.js`. The router must be wired into the Express application with `app.use('/api/eva/operations', evaOperationsRouter)`.

### GET /api/eva/operations/status

Returns aggregated status from all EVA operations subsystems. Calls `getOperationsStatus()` from `lib/eva/operations/index.js`, which fans out to six subsystem queries using `Promise.allSettled()`. Individual subsystem failures do not cause a 500 response — they surface as `{ status: 'error', error: '<message>' }` entries within the response.

**Response shape**:

```json
{
  "timestamp": "2026-03-05T14:00:00.000Z",
  "subsystems": {
    "health": {
      "subsystem": "health-monitor",
      "status": "healthy",
      "serviceCount": 4,
      "lastCheck": "2026-03-05T13:59:45.000Z"
    },
    "metrics": {
      "subsystem": "metrics-collector",
      "status": "active",
      "recentMetrics": 5,
      "lastCollected": "2026-03-05T12:01:00.000Z"
    },
    "feedback": {
      "subsystem": "feedback-classifier",
      "status": "active",
      "last24hItems": 12
    },
    "enhancements": {
      "subsystem": "enhancement-detector",
      "status": "active",
      "pendingEnhancements": 3
    },
    "financial": {
      "subsystem": "financial-sync",
      "status": "active",
      "lastSync": "2026-03-05T13:00:00.000Z"
    },
    "scheduler": {
      "subsystem": "scheduler",
      "status": "active",
      "instanceId": "scheduler-001",
      "lastHeartbeat": "2026-03-05T13:59:50.000Z",
      "pendingJobs": 0
    }
  },
  "overall": "healthy"
}
```

**`overall` values**:
- `"healthy"` — all subsystems report `active` or `healthy`
- `"degraded"` — at least one subsystem reports `error` or `unhealthy`
- `"unknown"` — mixed/unrecognized statuses

**Error response (500)**:
```json
{ "error": "Failed to get operations status", "message": "<detail>" }
```

---

### GET /api/eva/operations/workers

Returns the static cadence configuration for all registered workers. This endpoint reads directly from the `OPERATIONS_CADENCES` export in `domain-handler.js` and does not hit the database.

**Response shape**:

```json
{
  "workers": {
    "ops_financial_sync": "hourly",
    "ops_feedback_classify": "frequent",
    "ops_metrics_collect": "six_hourly",
    "ops_health_score": "hourly",
    "ops_enhancement_detect": "daily",
    "ops_status_snapshot": "hourly"
  }
}
```

**Error response (500)**:
```json
{ "error": "Failed to get worker config", "message": "<detail>" }
```

---

## Known Gaps and Recommended Actions

The following gaps were identified during the SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-I audit (2026-03-05). Each gap requires a follow-on SD or targeted fix before Operations Mode can be considered production-ready.

For the full "what exists vs. what's planned" breakdown, see the [Implementation Status section in the feature doc](../04_features/eva-post-pipeline-operations.md#implementation-status-at-a-glance).

### Gap 1 — Customer Service Agent is Missing

The architecture identified a Customer Success Agent as a continuous service for ventures in operations mode. No implementation exists. The handler key `ops_cs_agent` is not registered, and there is no corresponding module in `lib/eva/`.

**Impact**: Ventures in operations mode receive no automated customer success outreach or retention monitoring.
**Recommended action**: Create a new SD to implement the CS Agent worker, including DB schema for customer interaction tracking and the `ops_cs_agent` domain handler.

### Gap 2 — `feedback_items` Table Has No Confirmed Migration

The `ops_feedback_classify` worker queries `feedback_items` with `.from('feedback_items')`. There is no migration file in the repo confirming this table exists in the production schema. If the table is absent, the worker will error on every run, triggering its circuit breaker after 3 consecutive failures.

**Impact**: Feedback classification silently stops after 3 failures at startup.
**Recommended action**: Quick fix — create migration `database/migrations/YYYYMMDD_feedback_items.sql` with the required schema (at minimum: `id`, `venture_id`, `content`, `dimension_code`, `created_at`).

### Gap 3 — `captureSignals` Parameter Mismatch

The `ops_enhancement_detect` handler calls `captureSignals(text, { supabase })`. The `captureSignals` function in `lib/retrospective-signals/index.js` expects `{ sessionId, sdId }`. The `supabase` parameter is silently ignored, so signals are detected in-memory but never persisted.

**Impact**: Enhancement signals from retrospectives are not captured, starving the LEO enhancement backlog.
**Recommended action**: Quick fix — update the call in `lib/eva/operations/domain-handler.js` to pass the correct parameters, or update `captureSignals` to accept and use the `supabase` client for persistence.

### Gap 4 — No AARRR Metrics Collected

The `ops_metrics_collect` worker collects pipeline throughput (active venture count, stage completions per 6 h window). It does not collect any AARRR-framework metrics (Acquisition, Activation, Retention, Revenue, Referral) that would provide meaningful business health signals for ventures in live operation.

**Impact**: Operations dashboard has no customer-facing health data; metrics stored are infrastructure-level only.
**Recommended action**: Create a new SD to define the AARRR metrics schema, integrate with product analytics sources, and extend `ops_metrics_collect` or add a dedicated AARRR handler.

### Gap 5 — No Stripe Integration in Financial Sync

The `ops_financial_sync` worker verifies that a `venture_financial_contract` record exists for each venture. It does not connect to Stripe or any payment processor. Revenue data, subscription status, and billing health are not checked.

**Impact**: Financial health monitoring is a contract-existence check only. Revenue anomalies are undetectable.
**Recommended action**: Create a new SD to integrate Stripe webhooks and API polling into the financial sync worker. Requires Stripe API key configuration and a `venture_financial_metrics` table for MRR/ARR/CAC/LTV tracking.

---

## Follow-on SDs

The following SDs extend or build on Operations Mode:

- **SD-LEO-FEAT-EVA-OPERATIONS-DASHBOARD-001** — Frontend operations dashboard. Provides a Chairman UI for monitoring ventures in operations mode. Consumes `GET /api/eva/operations/status` and worker health data. Routes: `/chairman/operations` and `/chairman/operations/:ventureId`.

- **SD-LEO-FEAT-EVA-PIPELINE-GUI-001** — Pipeline visualization GUI. Provides stage-by-stage progress visualization for ventures moving through Evaluation → Build → Launch → Operations. Includes the Stage 25 terminus handoff visualization.

---

## Related Documentation

- [EVA Post-Pipeline Operations — Feature Documentation](../04_features/eva-post-pipeline-operations.md)
- [EVA Pipeline Redesign Architecture](../plans/eva-pipeline-redesign-architecture.md)
- [Infrastructure Hardening Runbook](./infrastructure-hardening-runbook.md)
- [Deployment Operations](./deployment_ops.md)

---

*Runbook Version: 1.0.0 | Last Updated: 2026-03-05 | Source SD: SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-I*
