---
Category: Feature
Status: Draft
Version: 1.0.0
Author: LEO Orchestrator
Last Updated: 2026-03-05
Tags: eva, operations, venture-lifecycle, background-workers
---

# Feature: EVA Post-Pipeline Operations Mode

## Metadata
- **Category**: Feature
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: LEO Orchestrator
- **Last Updated**: 2026-03-05
- **Tags**: eva, operations, venture-lifecycle, background-workers

## Overview

Post-Pipeline Operations Mode is the phase of the EVA venture lifecycle that begins after a venture completes the 25-stage evaluation-build-launch pipeline. Once a venture is live, it moves from gate-driven progression to continuous automated monitoring. Six background workers run on scheduled cadences to keep venture health data current, classify incoming feedback, track financial status, and surface enhancement signals.

This document is written for developers building features against the Operations Mode API and for product stakeholders understanding what the system does for live ventures.

For operator-level runbook content (worker infrastructure, known gaps, startup sequence), see the [Operations Mode Runbook](../06_deployment/eva-operations-mode.md).

---

## Table of Contents

- [Feature Overview](#feature-overview)
- [Activation](#activation)
- [Continuous Services](#continuous-services)
- [API Reference](#api-reference)
- [Frontend Dashboard](#frontend-dashboard)
- [Related Documentation](#related-documentation)

---

## Feature Overview

When a venture completes Stage 25 (Launch Execution), the EVA pipeline hands off responsibility to the Operations Mode subsystem. From this point forward the venture is "live" — it has cleared every evaluation gate, been built, and been launched. The pipeline's job is done.

Operations Mode provides:

1. **Automated health monitoring** — the system continuously checks registered services for the venture and reports overall health.
2. **Financial contract verification** — an hourly check confirms the venture has a valid financial contract on record.
3. **Feedback classification** — incoming feedback items are automatically tagged with dimension codes so the product team can triage by category.
4. **Metrics collection** — pipeline throughput metrics are gathered every six hours and persisted for reporting.
5. **Enhancement detection** — daily scan of retrospectives surfaces improvement signals and queues them for the LEO protocol backlog.
6. **Operations snapshot** — an hourly status snapshot aggregates all subsystems into a single record for dashboard consumption.

A venture stays in Operations Mode indefinitely. Operators can manually set `pipeline_mode = 'parked'` to suspend workers for a venture or `pipeline_mode = 'killed'` to terminate it permanently.

---

## Implementation Status at a Glance

This section provides a clear picture of what works today, what partially works, and what still needs to be built.

### What Works Today

| Component | Details |
|-----------|---------|
| **Health Scoring** (`ops_health_score`) | Fully functional. Sweeps stale services, computes aggregate health status, runs hourly. |
| **Operations Snapshot** (`ops_status_snapshot`) | Fully functional. Aggregates all subsystems into a persisted snapshot, runs hourly. Gracefully handles individual subsystem failures. |
| **Worker Infrastructure** | `BaseWorker`, `WorkerScheduler`, circuit breaker (trips after 3 failures), graceful shutdown — all operational. |
| **Master Scheduler Integration** | `registerOperationsHandlers()` correctly wires all 6 handlers into the scheduler domain registry. |
| **REST API** | `GET /api/eva/operations/status` and `GET /api/eva/operations/workers` — mounted and returning data. |
| **Pipeline Mode Column** | `ventures.pipeline_mode` CHECK constraint enforced (`evaluation`, `build`, `launch`, `operations`, `parked`, `killed`). |

### What Partially Works

| Component | What Works | What's Missing |
|-----------|-----------|----------------|
| **Feedback Classifier** (`ops_feedback_classify`) | Keyword classifier module exists and assigns dimension codes. | `feedback_items` table has no migration — worker will circuit-break if table doesn't exist. |
| **Metrics Collector** (`ops_metrics_collect`) | Collects pipeline throughput (active ventures, stage completions). | Does not collect AARRR business metrics (Acquisition, Activation, Retention, Revenue, Referral). |
| **Enhancement Detector** (`ops_enhancement_detect`) | Signal detection from retrospectives works. | `captureSignals()` called with `{ supabase }` but function expects `{ sessionId, sdId }` — signals detected but not persisted. No auto-creation of SDs from signals. |
| **Financial Sync** (`ops_financial_sync`) | Checks whether `venture_financial_contract` record exists. | No Stripe or payment provider integration. No revenue/subscription/billing data pulled. |

### What Still Needs to Be Built

| Component | Description | Tracked By |
|-----------|-------------|------------|
| **Customer Service Agent** | Planned as a continuous service for retention monitoring and customer success outreach. Zero implementation — no handler, no module, no DB schema. | Not yet tracked as an SD |
| **Operations Dashboard UI** | Chairman pages for monitoring ventures in operations mode. Routes: `/chairman/operations`, `/chairman/operations/:ventureId`. Backend APIs are ready. | SD-LEO-FEAT-EVA-OPERATIONS-DASHBOARD-001 (planning) |
| **Pipeline-to-GUI Wiring** | Stage visualization including Stage 25 terminus handoff. Backend data layer exists. | SD-LEO-FEAT-EVA-PIPELINE-GUI-001 (planning) |
| **Stripe Integration** | Connect Financial Sync worker to Stripe for MRR/ARR/CAC/LTV tracking. | Not yet tracked as an SD |
| **AARRR Metrics Framework** | Per-venture business metrics (Acquisition, Activation, Retention, Revenue, Referral) from external analytics. | Not yet tracked as an SD |
| **`feedback_items` Migration** | Database migration to create the `feedback_items` table and unblock the feedback classifier. | Not yet tracked as an SD |
| **`captureSignals` Fix** | Fix parameter mismatch so enhancement signals are persisted to Supabase, not just detected in-memory. | Not yet tracked as an SD |

---

## Related: Software Factory Self-Healing Loop

The [Software Factory Self-Healing Loop](./software-factory-self-healing.md) complements Operations Mode by providing **runtime error detection** via Sentry. While Operations Mode monitors venture health through internal checks (health scoring, feedback classification), the Software Factory monitors **external runtime errors** from deployed venture code and auto-generates corrective SDs.

The Software Factory activates at Stage 18 (Build Execution) — earlier than Operations Mode — and feeds errors into the same `feedback` table that the Operations Mode feedback classifier processes.

---

## Activation

### Trigger

Operations Mode activates when Stage 25's completion handler writes `pipeline_mode = 'operations'` to the `ventures` table. This happens automatically; no manual step is required.

### Pipeline Mode Values

The `pipeline_mode` column on the `ventures` table tracks which phase owns the venture:

| Value | Meaning |
|---|---|
| `evaluation` | Stages 0–17 — idea screening and evaluation |
| `build` | Stages 18–22 — product development |
| `launch` | Stages 23–25 — marketing, readiness, and go-live |
| `operations` | Post-pipeline — continuous automated services active |
| `parked` | Suspended — workers paused, venture on hold |
| `killed` | Terminated — venture archived, no further processing |

### What Changes at Activation

Before Stage 25 completes, the venture is governed by stage gate logic (pass/fail gates, stage templates, analysis steps). After activation:

- Stage gate execution stops for this venture.
- The Master Scheduler begins including the venture in the worker processing scope (`status IN ('active', 'in_progress')` queries).
- The venture appears in the Operations dashboard (when SD-LEO-FEAT-EVA-OPERATIONS-DASHBOARD-001 is implemented).

---

## Continuous Services

Each worker runs independently on its own cadence. A worker failure (up to 3 consecutive) trips its circuit breaker; the worker resumes on the next successful run or after a manual `resetCircuitBreaker()` call.

### Financial Sync (Hourly)

**Handler**: `ops_financial_sync`

Queries `eva_ventures` for active and in-progress ventures and calls `getContract()` from `lib/eva/contracts/financial-contract.js` for each. Confirms a `venture_financial_contract` record exists.

What this means for your venture: the system will alert (via logs) if a financial contract record is missing. It does not currently verify contract terms, check payment processor status, or connect to Stripe.

**Current status**: stub implementation — contract existence check only.

### Feedback Classification (Every 10 minutes)

**Handler**: `ops_feedback_classify`

Fetches up to 20 `feedback_items` rows where `dimension_code IS NULL` and calls `classifyFeedback()` to assign each item a dimension code. The classifier assigns a category (e.g., UX, performance, reliability) so product teams can filter and prioritize feedback.

What this means for your venture: unclassified feedback submitted after the venture goes live is automatically categorized. Manual triage of raw feedback entries should decrease significantly once the classifier is running.

**Current status**: partial — classifier module exists; `feedback_items` table migration not confirmed.

### Metrics Collection (Every 6 hours)

**Handler**: `ops_metrics_collect`

Records pipeline throughput metrics: count of active ventures and count of stage gate passes in the prior 6-hour window. Persisted to `eva_scheduler_metrics` as `metric_type = 'ops_pipeline_throughput'`.

What this means for your venture: provides data for platform-level health dashboards. Per-venture AARRR business metrics (Acquisition, Activation, Retention, Revenue, Referral) are not yet collected.

**Current status**: partial — pipeline throughput only, no AARRR metrics.

### Health Scoring (Hourly)

**Handler**: `ops_health_score`

Calls `sweepStaleServices()` to remove expired service registrations, then `getSystemHealth()` to compute an overall health status across all registered services. Returns service count and a `healthy`/`unhealthy` status.

What this means for your venture: if services associated with the venture (e.g., integrations, background processors) go stale, they are swept and the health status reflects the current live service count. This is the most reliable of the six workers.

**Current status**: functional.

### Enhancement Detection (Daily)

**Handler**: `ops_enhancement_detect`

Scans retrospectives created in the prior 24 hours. For each retrospective, concatenates `what_went_well`, `what_needs_improvement`, and `key_learnings` and passes the text to `captureSignals()`. Detected signals are queued for the LEO protocol improvement backlog.

What this means for your venture: learnings captured in retrospectives during the venture's build and launch phases feed back into the broader LEO system, improving future evaluations and processes.

**Current status**: partial — signal capture may fail due to a parameter mismatch in `captureSignals()`.

### Operations Snapshot (Hourly)

**Handler**: `ops_status_snapshot`

Calls `getOperationsStatus()` which fans out to all six subsystems in parallel using `Promise.allSettled()`. The result is persisted to `eva_scheduler_metrics` as `metric_type = 'ops_status_snapshot'`. Individual subsystem failures do not fail the snapshot — they appear as `{ status: 'error' }` entries.

What this means for your venture: the operations dashboard can show a point-in-time status history without querying all subsystems on every page load. The snapshot is the data source for trend views.

**Current status**: functional.

---

## API Reference

Two REST endpoints are available for querying operations status programmatically. The base path is `/api/eva/operations`.

### GET /api/eva/operations/status

Returns the current aggregated status of all six operations subsystems. Use this endpoint to build dashboards, health monitors, or alerts.

**Authentication**: inherits the application's standard authentication middleware.

**Example request**:
```
GET /api/eva/operations/status
```

**Example response**:
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

The `overall` field summarizes all subsystems:
- `"healthy"` — every subsystem is `active` or `healthy`
- `"degraded"` — at least one subsystem is `error` or `unhealthy`
- `"unknown"` — mixed or unrecognized statuses

Individual subsystem errors appear inline as:
```json
{ "subsystem": "metrics-collector", "status": "error", "error": "relation does not exist" }
```

### GET /api/eva/operations/workers

Returns the static cadence configuration for all registered workers. Does not hit the database. Useful for building worker status UIs or verifying scheduler configuration.

**Example request**:
```
GET /api/eva/operations/workers
```

**Example response**:
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

### Querying Operations Status in React

Example using `@tanstack/react-query`:

```typescript
import { useQuery } from '@tanstack/react-query';

function useOperationsStatus() {
  return useQuery({
    queryKey: ['eva', 'operations', 'status'],
    queryFn: async () => {
      const res = await fetch('/api/eva/operations/status');
      if (!res.ok) throw new Error('Failed to fetch operations status');
      return res.json();
    },
    refetchInterval: 60_000, // refresh every minute
  });
}
```

---

## Frontend Dashboard

The Operations dashboard is planned under **SD-LEO-FEAT-EVA-OPERATIONS-DASHBOARD-001**. When implemented it will provide:

- **Overview page** (`/chairman/operations`) — list of all ventures in operations mode with overall health badges, last-seen timestamps for each worker, and a count of pending feedback items.
- **Venture detail page** (`/chairman/operations/:ventureId`) — per-venture breakdown of each worker's last run, subsystem health, pending enhancements, and financial contract status.
- **Real-time updates** — Supabase Realtime subscriptions on `eva_scheduler_metrics` to push worker run results without manual refresh.

The dashboard consumes `GET /api/eva/operations/status` for the health panel and `GET /api/eva/operations/workers` for the cadence reference panel.

A companion pipeline visualization GUI (**SD-LEO-FEAT-EVA-PIPELINE-GUI-001**) will show the Stage 25 terminus handoff that triggers operations mode activation, giving operators a visual record of when a venture transitioned from the pipeline.

---

## Related Documentation

- [EVA Operations Mode — Operational Runbook](../06_deployment/eva-operations-mode.md)
- [EVA Pipeline Redesign Architecture](../plans/eva-pipeline-redesign-architecture.md)

---

*Feature Documentation Version: 1.0.0 | Last Updated: 2026-03-05 | Source SD: SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-I*
