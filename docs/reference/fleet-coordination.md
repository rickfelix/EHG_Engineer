---
category: Reference
status: Draft
version: 1.1.0
author: Claude Code
last_updated: 2026-04-16
tags: [fleet, coordinator, workers, sessions, coordination, monte-carlo, liveness]
---

# Fleet Coordination System

## Overview

The fleet coordination system manages multiple parallel Claude Code sessions ("workers") executing Strategic Directives. A dedicated **coordinator session** monitors workers, resolves conflicts, assigns identities, and forecasts completion.

## Architecture

> **Note:** The coordinator runs **eight** standard cron loops (`STANDARD_LOOPS` in `scripts/coordinator-startup-check.mjs`). The diagram below shows three representative 5-minute loops; see **Cron loops** under *Coordinator Workflow* for the full set (incl. the 2-min inbox, the 15-min 3-source audit, the 30-min executive email, and the daily feature-flag review).

```
┌─────────────────────────────────────────────────────────────┐
│                     COORDINATOR SESSION                       │
│  /coordinator start                                          │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ Sweep Loop   │  │ Dashboard    │  │ Identity Loop     │  │
│  │ (5 min)      │  │ Loop (5 min) │  │ (5 min, +4 offset)│  │
│  └──────┬───────┘  └──────┬───────┘  └───────┬───────────┘  │
│         │                 │                   │              │
│         └─────────────────┼───────────────────┘              │
│                           │                                   │
│                    ┌──────▼──────┐                            │
│                    │  Supabase   │                            │
│                    │ claude_     │                            │
│                    │ sessions +  │                            │
│                    │ session_    │                            │
│                    │coordination │                            │
│                    └──────┬──────┘                            │
│                           │                                   │
└───────────────────────────┼───────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
  ┌─────▼─────┐      ┌─────▼─────┐      ┌─────▼─────┐
  │  Worker A  │      │  Worker B  │      │  Worker C  │
  │  (Alpha)   │      │  (Bravo)   │      │  (Charlie) │
  │  blue      │      │  green     │      │  purple    │
  │  SD-X-001  │      │  SD-Y-002  │      │  SD-Z-003  │
  └────────────┘      └────────────┘      └────────────┘
```

## Key Components

### Database Tables

| Table | Purpose |
|-------|---------|
| `claude_sessions` | Session registry — tracks heartbeat, SD claim, metadata (fleet_identity) |
| `session_coordination` | Message queue — coordinator sends directives, workers read them |

### Scripts

| Script | Purpose |
|--------|---------|
| `scripts/fleet-dashboard.cjs` | Renders fleet status (workers, SDs, health, forecast) |
| `scripts/stale-session-sweep.cjs` | Releases dead claims, resolves conflicts, sends notifications |
| `scripts/assign-fleet-identities.cjs` | Assigns colors and NATO callsigns to workers |

### Hooks

| Hook | Event | Purpose |
|------|-------|---------|
| `scripts/hooks/coordination-inbox.cjs` | PostToolUse | Workers check for messages every 5 min |
| `scripts/hooks/session-state-sync.cjs` | PostToolUse | Syncs session state, heartbeat, claims |

## Coordinator Commands

```
/coordinator              Full dashboard (default)
/coordinator start        Initialize — sweep, dashboard, identity assignment, cron loops
/coordinator workers  (w) Active workers and their progress
/coordinator orch     (o) Orchestrator children progress
/coordinator available(a) SDs available for claim
/coordinator coord    (c) Pending coordination messages
/coordinator health   (h) Fleet health summary
/coordinator qa       (q) QA checks — completed claims, duplicates, orphans
/coordinator forecast (f) Burn rate, velocity, ETA
/coordinator predict  (p) Predictive signals — capacity, unlock forecast, aging
/coordinator sweep    (s) Run stale session sweep
/coordinator identity (id) Assign colors and callsigns to active workers
/coordinator help         Show usage help
```

## Fleet Identity System

Workers are assigned a **callsign** (NATO alphabet) and **color** for visual identification.

### Assignment Flow

1. Coordinator runs `assign-fleet-identities.cjs` during `/coordinator start`
2. Script queries active sessions (heartbeat < 5 min, not coordinator)
3. Workers without an existing identity get the next available callsign + color
4. Identity stored in `claude_sessions.metadata.fleet_identity`
5. `SET_IDENTITY` coordination message sent to worker
6. Worker's inbox hook writes `.claude/fleet-identity.json` locally
7. Statusline reads the file and displays `Callsign | ProjectName:branch`

### Identity Lifecycle

| Event | Behavior |
|-------|----------|
| New worker joins | Identity cron loop (every 5 min) detects and assigns |
| Worker switches SD | Cron loop detects display_name mismatch, sends updated identity |
| Worker exits | Identity preserved in metadata; callsign freed if worker doesn't return |
| `--force` flag | Reassigns all workers from scratch |

### Available Identities

| Callsign | Color |
|-----------|-------|
| Alpha | blue |
| Bravo | green |
| Charlie | purple |
| Delta | orange |
| Echo | cyan |
| Foxtrot | pink |
| Golf | yellow |
| Hotel | red |

## Coordination Message Types

| Type | Sender | Purpose |
|------|--------|---------|
| `WORK_ASSIGNMENT` | Sweep | Tells idle worker which SD to claim |
| `CLAIM_RELEASED` | Sweep | Notifies worker their claim was released |
| `CLAIM_REMINDER` | Sweep | Nudges idle session with no SD claim |
| `STALE_WARNING` | Sweep | Worker approaching stale threshold |
| `IDENTITY_COLLISION` | Sweep | Two sessions sharing same session_id |
| `SET_IDENTITY` | Coordinator | Assigns color + callsign to worker |
| `COACHING` | Coordinator | Periodic guidance |
| `SD_BLOCKED` | System | SD dependency not met |
| `SD_COMPLETED_NEARBY` | System | Related SD just completed |
| `PRIORITY_CHANGE` | System | Priority shifted |
| `INFO` | Any | General coordination info |

### Message Lifecycle

1. **Created** — inserted into `session_coordination` with `expires_at` (default 1 hour)
2. **Read** — worker's inbox hook sets `read_at` on next check (throttled to 5 min)
3. **Acknowledged** — set when worker acts on the message (or auto-ack for non-actionable types)
4. **Expired** — sweep cleans up messages past `expires_at`

## Coordinator Startup Flow

When `/coordinator start` runs:

1. **Sweep** — `stale-session-sweep.cjs` cleans dead claims, resolves conflicts
2. **Identity assignment** — `assign-fleet-identities.cjs` assigns colors/callsigns
3. **Dashboard** — `fleet-dashboard.cjs all` shows full fleet status
4. **Cron loops** — the coordinator runs **eight** standard loops (`STANDARD_LOOPS` in `scripts/coordinator-startup-check.mjs`):
   - Stale-session sweep — every 5 min
   - Fleet dashboard — every 5 min (offset +2 min)
   - Fleet identity refresh — every 5 min (offset +4 min)
   - Coordinator inbox — every 2 min
   - Coordinator 3-source audit — every 15 min
   - Executive email summary — every 30 min
   - Feature-flag governance review — daily at 09:00 (default-OFF)
   - Coordinator self-review (work-triggered tri-party) — every 5 min

## Worker Heartbeat Protocol

Workers update their heartbeat via the `session-state-sync.cjs` PostToolUse hook (throttled to 30s). The coordinator uses heartbeat age to determine worker status:

| Heartbeat Age | Status |
|---------------|--------|
| < 5 min | Active |
| 5-10 min | Likely idle or between tasks |
| > 10 min | Likely dead — flagged for release |

### Enriched Signals

The heartbeat system also tracks:
- **Phase** (LEAD/PLAN/EXEC) — used for phase-aware ETA
- **Fails** (handoff failure count) — flags struggling workers at > 3
- **WIP** (uncommitted changes) — prevents releasing sessions with unsaved work
- **Branch** — detects worktree conflicts (two workers on same branch)

## Claim System

Claims are tracked via `claude_sessions.sd_id`. A partial unique index enforces single active claim per SD.

| Operation | Method |
|-----------|--------|
| Claim SD | `UPDATE claude_sessions SET sd_id = 'SD-XXX-001' WHERE session_id = '...'` |
| Release claim | `UPDATE claude_sessions SET sd_id = NULL, released_at = NOW()` |
| Check claims | `SELECT * FROM claude_sessions WHERE sd_id IS NOT NULL AND status != 'terminated'` |
| Fix stuck | `UPDATE claude_sessions SET sd_id=NULL, status='idle', released_at=NOW() WHERE session_id='...'` |

## Probabilistic Liveness (Monte Carlo)

SD-LEO-INFRA-FLEET-LIVENESS-MONTE-001 layers a probabilistic model on top of the binary thresholds above so the dashboard and sweep can reason about worker liveness with uncertainty.

**Pipeline** (subprocess, runs per dashboard/sweep cycle):

```
v_active_sessions  ┐
claude_sessions    │   scripts/fleet-liveness-mc.cjs
  (phase, wt)      ├──▶  computeLiveness → {pAlive, ci_low, ci_high, samples}
marker files       │   runFleetMC       → {workers[], etaDistribution}
sub_agent_exec     │                          │
sd_phase_handoffs  │                          ▼
git log on wt      ┘                fleet_liveness_estimates (INSERT per cycle)
                                    + calibration back-fill (actual_liveness_t5 after 5m)
```

**Signals fused**: heartbeat age, joint `(pid_alive, port_open)` confusion matrix (correlation ~99% — independence would inflate), recent commit on worker branch (<3m short-circuit), fresh heartbeat (<5m short-circuit — matches legacy sweep behavior), sub-agent in flight, transition window (<5m since last handoff). Conditional priors (gap distributions per phase × scope bucket) are bootstrapped from the last 30 days of handoff + sub-agent telemetry, with sparse-bucket fallback to phase-level priors.

**Dashboard integration**: `fleet-dashboard.cjs` subprocess-invokes the MC script before rendering. Workers section shows `▓░░ 0.62`-style P(alive) bars. Fleet header changes from "Active: M" to "Effective: X.Y / N assigned" (sum of P(alive)). Forecast block shows p50/p80/p95 + probability table for 30/60/90/120 min horizons. Subprocess failure falls back to pre-MC display with a warning banner (no crash).

**Sweep gating**: `stale-session-sweep.cjs` consults the latest estimate per DEAD session within 5m. Decision tree:

| State | Action | released_reason |
|-------|--------|-----------------|
| `has_uncommitted_changes=true` | HOLD | `WIP_GUARD` (fires first, independent of MC) |
| `heartbeat ≥ 20m` | RELEASE | `SWEEP_HARD_CAP_20M` (hard cap overrides MC) |
| `heartbeat < 20m` and `p_alive > 0.3` | HOLD | `WIP_GUARD_MC` |
| Otherwise | RELEASE | `SWEEP_PID_DEAD` |

The 20-minute hard cap is the orthogonal safety net: even if the model mis-classifies a hung worker as alive, the claim is released before it strands the SD.

**Calibration loop**: Per cycle, `backfillCalibration()` updates rows with `observed_at` older than 5m, setting `actual_liveness_t5 = true` iff the worker emitted a heartbeat within 5m of the estimate or committed on its branch within 5m. Idempotent — second call in the same cycle updates 0 rows.

**Feature flags**:

| Env var | Default | Effect |
|---------|---------|--------|
| `FLEET_MC_ENABLED` | `true` | Disables MC invocation in dashboard; renders pre-MC display |
| `FLEET_MC_SWEEP_GATE` | `true` | Disables MC consultation in sweep; falls back to `SWEEP_PID_DEAD` |
| `FLEET_MC_DRAWS` | `1000` | Samples per worker per cycle |
| `FLEET_MC_PRIOR_FILE` | unset | Path to JSON file overriding empirical priors |
| `FLEET_MC_MARKER_DIR` | auto | Override `.claude/session-identity/` location (tests, worktrees) |
| `FLEET_MC_PALIVE_HOLD_THRESHOLD` | `0.3` | P(alive) above which sweep HOLDs release |
| `FLEET_MC_HARD_CAP_SEC` | `1200` | Heartbeat age at which sweep force-releases regardless of MC |

**Rollback**: Set `FLEET_MC_ENABLED=false` in the fleet shell → dashboard returns to binary classification, sweep returns to pre-MC behavior, all in <1 minute. No code revert needed. The `fleet_liveness_estimates` table is append-only and can remain in place.

**Observability to monitor** (from PRD):
- `actual_liveness_t5` TRUE/FALSE ratio (model accuracy proxy)
- `released_reason` distribution: WIP_GUARD_MC vs WIP_GUARD vs SWEEP_PID_DEAD vs SWEEP_HARD_CAP_20M
- MC wall-clock p95 (logged to stderr per cycle)
- Hard-cap fire count (>5% of releases indicates systematic overconfidence)

## Related Documentation

- [Worker Registry Guide](./worker-registry-guide.md) — LEO Stack background workers (different from Claude Code sessions)
- [Central Planner](./central-planner.md) — SD prioritization and queue ordering
- [Session Coordination Table](./schema/engineer/tables/session_coordination.md) — Database schema
- [Claude Sessions Table](./schema/engineer/tables/claude_sessions.md) — Database schema
- [Fleet Liveness Estimates Table](./schema/engineer/tables/fleet_liveness_estimates.md) — Monte Carlo output schema (SD-LEO-INFRA-FLEET-LIVENESS-MONTE-001)

---

[Back to Reference Index](./README.md)
