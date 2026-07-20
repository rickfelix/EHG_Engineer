---
category: Reference
status: Draft
version: 1.2.0
author: Claude Code
last_updated: 2026-07-10
tags: [fleet, coordinator, workers, sessions, coordination, monte-carlo, liveness, reservation-fence]
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

Identities are written by **two** cooperating writers that share one pool/picker
(`NATO`/`COLORS`/`nextAvailable`, exported from `assign-fleet-identities.cjs`):

- the **coordinator cron** (`assign-fleet-identities.cjs`, every 5 min) — the steady-state
  assigner and collision healer; and
- **worker check-in** (`worker-checkin.cjs`, `assignFleetIdentityAtCheckin`) — names a worker
  the moment it holds a claim, so a freshly-claimed worker is not nameless until the next cron
  pass (SD-LEO-INFRA-ASSIGN-FLEET-IDENTITY-001).

### Assignment Flow (coordinator cron)

1. Coordinator runs `assign-fleet-identities.cjs` during `/coordinator start`
2. Script queries active sessions (heartbeat < 5 min, not coordinator)
3. Workers without an existing identity get the next available callsign + color
4. Identity stored in `claude_sessions.metadata.fleet_identity`
5. `SET_IDENTITY` coordination message sent to worker
6. Worker's inbox hook writes `.claude/fleet-identity-<session_id>.json` locally
7. Statusline reads the file and displays `Callsign | ProjectName:branch`

### Assignment Flow (worker check-in — fast path)

`runCheckin` self-assigns when, and only when, the worker **holds a real claim** and has **no
existing identity** (and is not a coordinator or a test/ghost session — same exclusions the cron
applies). It reuses the cron's pool/picker, read-modify-merges its own metadata, and emits the
same `SET_IDENTITY` message. This is optimistic: two simultaneous check-ins can briefly pick the
same callsign, which the cron's `dedupeAssignedCallsigns` pass heals on its next run (heartbeat-DESC,
newest-wins) — the same class it already reconciles after session rotation. Fail-open: any error
leaves the worker nameless (named by the next cron pass), never breaking check-in.

### Identity Lifecycle

| Event | Behavior |
|-------|----------|
| New worker claims work | Named immediately at its next check-in (`assignFleetIdentityAtCheckin`); the 5-min cron is the fallback |
| Idle / never-claimed worker | NOT named (neither path burns a pool slot until a real claim is held) |
| Worker switches SD | Cron loop detects display_name mismatch, sends updated identity |
| Worker exits | Identity preserved in metadata; callsign freed if worker doesn't return |
| `--force` flag | Reassigns all workers from scratch (cron only) |

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

## Adam-Sourced Metadata Gates

SD-LEO-INFRA-BELT-CLAIM-ELIGIBILITY-001: two machine-readable `metadata` fields Adam
stamps at SD-sourcing time, wired into the same shared eligibility predicate rather
than left as prose the coordinator has to re-explain on every dispatch.

**Chairman ratification** — `chairmanRatificationPending(row)`, an axis in
`lib/fleet/claim-eligibility.cjs`'s `INELIGIBILITY_AXES` (and in
`CLAIM_WRITE_FENCE_AXES`, alongside `needs_coordinator_review`). Blocks dispatch only
when `metadata.chairman_ratified === false` — an SD Adam has explicitly marked as
awaiting chairman approval. Fail-open: absent field or `=== true` is unaffected, so
the overwhelming majority of SDs (which never set this field) behave unchanged.

**Soft dependencies** — `metadata.soft_depends_on` (single value or array) is folded
into the existing `draftDepsSatisfied()` live-status dependency re-check, the same
function that already handles `dependencies` and `metadata.blocked_on_sd` — not a
second predicate. Adam stamps this field as free-form prose in practice (e.g. `"D8
(SD-LEO-INFRA-OPERATOR-CONTRACT-GATE-001) provides merge-time enrollment..."`), so
`SD_KEY_TOKEN_RE` extracts the embedded `SD-XXX-YYY-NNN`-shaped token rather than
treating the whole sentence as a literal (non-matching) key.

## Coordinator Reservation Fence

SD-LEO-INFRA-DISPATCH-AUTH-AUTO-AUTHORIZE-001-C: a coordinator can fence a specific
SD to a specific session or worker tier for a time window, so the belt self-claim
loop cannot grab it out from under an intended claimant. Fixes a live incident where
a Fable-reserved worker seat belt-claimed a Sonnet-lane SD before a directed
assignment could land.

**Payload convention** — `payload.kind='coordinator_reservation'` on a
`session_coordination` row with `message_type='INFO'`, `target_sd` set to the
fenced SD key, `target_session=NULL` (broadcast — every candidate session must be
able to read it, and it must never be auto-consumed by the first reader), and the
native `expires_at` column for the window (default 1h). `payload` carries
`reserved_for_session` and/or `reserved_for_tier` (the exemption). Registered in
`PAYLOAD_KINDS` (`lib/fleet/worker-status.cjs`) — deliberately **not** in
`DIRECTIVE_KINDS`, since a fence is a standing state row, not an action-required
directive.

**Read path** — `lib/checkin/steps/drain-reservations.cjs`, a checkin pipeline step
positioned strictly after `adopt-orphan.cjs` and before `self-claim-gates.cjs` (so
directed `WORK_ASSIGNMENT` dispatch, stranded/orphan recovery, and own-claim resume
are structurally unaffected — they all run earlier). Read-only: never stamps
`read_at`/`acknowledged_at` on the row it reads. Only honors rows whose
`sender_session` matches the live active coordinator (`ctx.coordinatorId`) —
defense-in-depth against a buggy (not malicious) worker self-fencing a claim
monopoly. Fails open on any read error (never blocks the rest of self-claim).

**Enforcement** — `coordinatorReservation(row, ctx)`, an axis in
`lib/fleet/claim-eligibility.cjs`'s `INELIGIBILITY_AXES`, positioned before the
tier axes (a reservation is more specific than the general worker-tier ladder).
Self-compares `expires_at > now()` rather than trusting the row's continued
existence — `cleanup_expired_coordination()` GC lags to the next
stale-session-sweep tick, so an expired-but-not-yet-GC'd row must not still fence.
Ctx-gated: absent `ctx.reservations` is byte-identical to pre-SD behavior for every
other classifier caller (sweep, sd-start, directed-assign).

**Worker breadcrumb** — when a tick actually skips a candidate due to an active
fence, `worker-checkin.cjs`'s JSON output gains a `reservation_fences_skipped[]`
array and the top-level `message` gets an explicit "deliberate, working as
intended, no action needed" note, so an autonomous worker doesn't mistake a fence
for a stuck belt and file a false RCA/`/signal stuck`. Purely additive — no new
`action` enum value.

## Seat-Busy Fence (Directed Non-SD Work)

SD-LEO-INFRA-NON-SD-WORK-CLAIM-FENCE-001: fences the *seat*, not an SD. The
Coordinator Reservation Fence above only fires when `target_sd` is set —
directed non-SD work (a console assessment, an audit sweep, an open-loop
gather) is dispatched with no `target_sd` at all, so it was structurally
invisible to every per-SD eligibility check. Live incident 683617ed
(Alpha-3, 2026-07-10): mid a directed console assessment, checkin
auto-self-claimed a belt SD out from under the seat.

**Payload convention** — `payload.kind='seat_busy_reservation'` on a
`session_coordination` row with `message_type='INFO'`, `target_session` set
to the busy worker's session id, `target_sd=NULL`, and the native
`expires_at` column for the window. Registered in `PAYLOAD_KINDS`
(`lib/fleet/worker-status.cjs`) — same rationale as `coordinator_reservation`:
a standing fence, not an action-required directive, so deliberately **not**
in `DIRECTIVE_KINDS`.

**Read + enforce path** — `lib/checkin/steps/seat-busy-fence.cjs`, a single
consolidated checkin pipeline step positioned strictly after
`directed-assignment.cjs` (so a `WORK_ASSIGNMENT` this tick is claimed before
the fence could ever apply) and strictly before `recover-stranded-final.cjs`
(so recovery/adoption/QF-jump/self-claim-gates/self-claim-qf all
short-circuit in one place). Mirrors `self-claim-gates.cjs`'s own
idle-short-circuit idiom rather than threading a new ctx field through each
tier's own eligibility check. Only honors rows whose `sender_session` matches
the live active coordinator — fails closed (no fence) when coordinator
identity is unresolved this tick. Fails open on any read error.

**Enforcement** — `isSeatBusyOnDirectedWork(ctx)` in
`lib/fleet/claim-eligibility.cjs`: a pure, TTL-aware predicate (kept
standalone, not folded into `INELIGIBILITY_AXES`, since it is seat-scoped
rather than row/SD-scoped). Self-compares `expires_at` against `Date.now()`
the same way `coordinatorReservation` does; an expired reservation fails open
to claimable and emits a `console.warn` naming the reservation so the expiry
is loud, not silent.

**Not yet wired** — this SD builds the mechanism a coordinator *can* use; it
does not itself wire any coordinator-side dispatch tooling to write a
`seat_busy_reservation` row automatically when directing non-SD work. A
future SD should call this out explicitly as a follow-up if repeat incidents
of this shape recur.

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

**Badges, cap chip, attention strip** (SD-LEO-INFRA-FLEET-VIEW-BADGES-001): the WORKERS header also shows a per-account capacity chip (`cap=NN%`, from `lib/fleet/account-capacity-gauge.cjs`'s recorded weekly-headroom readings — `cap=--` when no reading exists yet for the active account). Each row gets a compact `Badge` column (`HEALTHY`/`STALLED`/`SILENT`/`STRUGGLING`/`UNKNOWN`), a pure rollup of the row's own already-rendered `LoopState`/P(alive)/`Silent until`/fail-count columns (`lib/fleet/fleet-view-badges.cjs::computeSessionBadge`) — deliberately not a new liveness-classification state machine, since `SD-LEO-INFRA-FLEET-WATCHDOG-001` owns a separate heartbeat-staleness taxonomy (`ALIVE`/`STOPPED`/`AUTH-LOST`/`CRASHED`) on this same surface; the two are meant to converge later, not compete now. An `ATTENTION` section (only rendered when non-empty) lists sessions flagged via `lib/fleet/attention-flag-writer.js` — an atomic JSONB-merge writer/reader against `claude_sessions.metadata`, read-only at render time, zero notification/paging side-effect by design (the Adam advisory inbox lane is the sole consumer that acts on it). `npm run fleet:dashboard` runs the dashboard directly (all sections).

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
