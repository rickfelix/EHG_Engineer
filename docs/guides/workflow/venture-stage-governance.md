---
category: Guide
status: Approved
version: 1.0.0
author: Claude Code
last_updated: 2026-03-23
tags: [governance, auto-proceed, chairman-config, workers, gates, venture-workflow]
---

# Venture Stage Governance

How ventures advance through the 26-stage lifecycle, how gates are evaluated, and how the chairman controls auto-approval behavior.

## Architecture Overview

```
Chairman Dashboard (frontend)
    │
    ├── StageSettingsSheet.tsx ──► chairman_dashboard_config (DB)
    │                                  │
    │                                  ├── global_auto_proceed (boolean)
    │                                  ├── hard_gate_stages (integer[])
    │                                  └── stage_overrides (JSONB)
    │
    ▼
Stage Execution Worker (backend)
    │
    ├── _loadChairmanConfig() ──► reads all 3 fields (cached 30s)
    ├── _shouldAutoApproveStage(N) ──► evaluates 3-layer model
    │
    ├── processStage() ──► orchestrator (eva-orchestrator.js)
    │       │
    │       ├── chairmanConfig bypass ──► skips gates when auto-approved
    │       ├── gate evaluation ──► kill gates, promotion gates, reality gates
    │       └── filter engine ──► AUTO_PROCEED / REQUIRE_REVIEW / STOP
    │
    └── _handleChairmanGate() ──► worker-level gate approval
```

## Three-Layer Governance Model

The chairman controls venture progression through three configurable layers in `chairman_dashboard_config`:

### Layer 1: Global Auto-Proceed (`global_auto_proceed`)

Master toggle. When `true`, ventures auto-advance through stages without pausing for chairman approval. When `false`, every gate stage blocks.

### Layer 2: Per-Stage Overrides (`stage_overrides`)

JSONB field set via the Settings panel (gear icon, top-right of venture detail page). Each stage can be individually paused:

```json
{
  "stage_3": {
    "auto_proceed": false,
    "reason": "Requires manual kill gate review",
    "set_by": "chairman",
    "set_at": "2026-03-23T06:00:00.000Z"
  }
}
```

When `auto_proceed: false`, that stage always blocks regardless of the global toggle.

### Layer 3: Hard Gate Stages (`hard_gate_stages`)

Integer array of stages that can **never** be auto-approved, regardless of both global toggle and per-stage overrides. Managed via the Chairman Settings page Gates tab.

```sql
-- Example: only stage 17 is a hard gate
UPDATE chairman_dashboard_config
SET hard_gate_stages = ARRAY[17]
WHERE config_key = 'default';
```

### Evaluation Priority

The worker evaluates `_shouldAutoApproveStage(stageNumber)`:

```
  1. global_auto_proceed = false?     → BLOCK (nothing auto-approves)
  2. stageNumber in hard_gate_stages? → BLOCK (never auto-approved)
  3. stage_overrides[stage_N].auto_proceed = false? → BLOCK (chairman paused)
  4. All checks pass                  → AUTO-APPROVE
```

**Important**: Autonomy levels (L2+) are evaluated separately in `_handleChairmanGate()` BEFORE the three-layer check. A venture at L2+ will auto-approve via autonomy even if `global_auto_proceed=false`. The chairman config is the fallback for L0/L1 ventures.

### Orchestrator Chairman Bypass

The orchestrator's chairman bypass checks BOTH the current stage and the next stage against `hard_gate_stages`. This means marking stage N as a hard gate prevents BOTH entering stage N and leaving stage N.

### Failure Recovery

Ventures in FAILED state are automatically recovered to IDLE by the worker on each poll cycle. This prevents transient errors (network timeouts, DB hiccups) from permanently stalling ventures.

## Gate Types

| Gate Type | Stages | Behavior |
|-----------|--------|----------|
| **Kill Gates** | 3, 5, 13, 24 | Go/no-go venture termination checkpoints |
| **Promotion Gates** | 10, 17, 18, 23, 25 | Phase boundary advancement approval |
| **Review-Mode** | 7, 8, 9, 11 | Pause for review before auto-advancing |
| **Existing Gates** | 5→6, 22→23, 23→24 | Artifact-based validation (financial viability, UAT, deployment health) |

Gate constants are defined in `lib/eva/gate-constants.js`.

## Orchestrator Chairman Bypass

When `global_auto_proceed=true` and the next stage is not a hard gate or paused stage, the orchestrator **skips gate evaluation entirely**:

- No kill/promotion gate evaluation (avoids BLOCKED return)
- No reality gate evaluation
- No devil's advocate LLM call (saves cost and time)
- processStage returns COMPLETED directly

This prevents the BLOCKED → fix-up cycle where the orchestrator returns BLOCKED and the worker has to override it.

## Stage Execution Worker

### Key Files

| File | Purpose |
|------|---------|
| `lib/eva/stage-execution-worker.js` | Worker class — polling, gate handling, stage advancement |
| `scripts/start-stage-worker.js` | Supervisor entry point — process management, dedup, circuit breaker |
| `lib/eva/eva-orchestrator.js` | Core stage processing — template execution, gate evaluation, filter engine |
| `lib/eva/gate-constants.js` | Gate stage definitions (kill, promotion, review, operating modes) |
| `lib/eva/autonomy-model.js` | L0-L4 autonomy levels and gate behavior matrix |
| `config/workers.json` | Worker registry for LEO stack |

### Worker Lifecycle

```
start-stage-worker.js (supervisor mode)
    │
    ├── killExistingWorkers() ──► finds & kills zombie workers (WMIC/pgrep)
    ├── writePid(process.pid) ──► tracks supervisor PID (not child)
    ├── fork('--direct') ──► spawns child worker
    │
    └── On child exit:
        ├── Circuit breaker (5 restarts in 10min → 60s cooldown)
        └── Exponential backoff (1s, 2s, 4s, 8s, 16s, capped 30s)
```

### Worker Version & Heartbeats

Every heartbeat includes version and start time for diagnosability:

```json
{
  "worker_id": "sew-Legion-Laptop-36152",
  "status": "online",
  "metadata": {
    "codeVersion": "1.3.0",
    "startedAt": "2026-03-23T06:22:29.429Z",
    "uptime": 3600,
    "activeVentures": 1,
    "pollIntervalMs": 30000
  }
}
```

Query live workers:
```sql
SELECT pid, status, metadata->>'codeVersion' as version,
       metadata->>'startedAt' as started,
       last_heartbeat_at
FROM worker_heartbeats
WHERE worker_type = 'stage-execution-worker'
  AND status = 'online'
ORDER BY last_heartbeat_at DESC;
```

### Zombie Worker Prevention

Three layers of defense:

1. **Startup dedup** (`killExistingWorkers` in `start-stage-worker.js`): On startup, finds all node processes running `start-stage-worker` via WMIC (Windows) or pgrep (Unix) and kills them with process tree kill.

2. **Stale heartbeat cleanup** (`_markStaleWorkersOnHost`): On startup, marks any "online" workers on the same host whose heartbeat is older than 2 poll intervals as "stopped".

3. **Process tree kill** (`leo-stack.ps1` / `leo-stack.sh`): Uses `taskkill /T /F` (Windows) or `kill -TERM -- -$pid` (Unix) to kill entire process trees, preventing orphaned children.

### PID File Tracking

The supervisor writes its **own** PID to the PID file (not the child's). When `leo-stack stop` kills the supervisor, the `process.on('exit')` handler propagates SIGKILL to the child.

## Venture Progression Flow

### Normal Stage (no gate)

```
Worker polls → acquires lock → processStage()
  → template execution → artifacts persisted
  → gates bypassed (chairman auto-approve)
  → filter engine → AUTO_PROCEED
  → advanceStage() → next stage
```

### Gate Stage (with auto-approve)

```
Worker polls → acquires lock → processStage()
  → template execution → artifacts persisted
  → chairman bypass active → gates skipped
  → filter engine → AUTO_PROCEED
  → advanceStage() → next stage
  → _handleChairmanGate auto-approves
  → stage_work updated to 'completed'
  → pending decisions approved
```

### Gate Stage (manual approval required)

```
Worker polls → acquires lock → processStage()
  → template execution → artifacts persisted
  → gate evaluation → BLOCKED
  → worker creates chairman_decisions row
  → venture released as BLOCKED
  → Chairman approves via UI
  → trg_chairman_decision_unblock trigger → sets orchestrator_state='idle'
  → Next poll picks up venture → advances
```

### Operating Mode Boundaries

Ventures pause at mode transitions:

| Mode | Stages | Entry Gate |
|------|--------|------------|
| EVALUATION | 1-5 | — |
| STRATEGY | 6-12 | Stage 5→6 boundary |
| PLANNING | 13-17 | Stage 12→13 boundary |
| BUILD | 18-22 | Stage 17→18 boundary |
| LAUNCH | 23-26 | Stage 22→23 boundary |

The worker detects mode changes and releases the venture as IDLE, picking it up again on the next poll cycle.

## Database Tables

### `chairman_dashboard_config`

| Column | Type | Purpose |
|--------|------|---------|
| `config_key` | text | Always `'default'` |
| `global_auto_proceed` | boolean | Master auto-approve toggle |
| `hard_gate_stages` | integer[] | Stages that never auto-approve |
| `stage_overrides` | JSONB | Per-stage pause/resume config |

### `chairman_decisions`

Created at gate stages when manual approval is required. The `trg_chairman_approval_unblock_orchestrator` trigger automatically sets `orchestrator_state='idle'` when a decision is approved.

### `worker_heartbeats`

Workers upsert heartbeats every poll cycle. Stale heartbeats (>2 poll intervals) indicate dead workers.

### `venture_stage_work`

Stage-level status tracking for the frontend. Updated by `_syncStageWork` after processStage returns.

### `stage_executions`

Per-attempt execution records with heartbeat tracking. Used for stale lock detection.

## Common Operations

### Check Fleet Status
```bash
# All active ventures with current state
SELECT name, current_lifecycle_stage, orchestrator_state, status
FROM ventures WHERE status = 'active'
ORDER BY current_lifecycle_stage DESC;
```

### Unblock a Stuck Venture
```bash
# 1. Approve any pending decisions
UPDATE chairman_decisions
SET status = 'approved', decision = 'proceed', blocking = false
WHERE venture_id = '<ID>' AND status = 'pending';

# 2. Reset orchestrator state
UPDATE ventures SET orchestrator_state = 'idle' WHERE id = '<ID>';
```

### Change Auto-Approve Configuration
```bash
# Auto-approve everything except stage 17
UPDATE chairman_dashboard_config
SET global_auto_proceed = true,
    hard_gate_stages = ARRAY[17],
    stage_overrides = '{}'
WHERE config_key = 'default';
```

### Check Worker Health
```bash
SELECT pid, metadata->>'codeVersion' as version,
       ROUND(EXTRACT(EPOCH FROM (NOW() - last_heartbeat_at))) as secs_since_heartbeat
FROM worker_heartbeats
WHERE worker_type = 'stage-execution-worker' AND status = 'online'
ORDER BY last_heartbeat_at DESC;
```

## Related Documentation

- [Worker Registry Guide](../../reference/worker-registry-guide.md) — adding/configuring workers
- [EVA Orchestrator](./cli-venture-lifecycle/02-eva-orchestrator.md) — processStage internals
- [Chairman Decisions](./cli-venture-lifecycle/reference/chairman-decisions.md) — decision model
- [Gate Thresholds](./cli-venture-lifecycle/reference/gate-thresholds.md) — filter engine thresholds
