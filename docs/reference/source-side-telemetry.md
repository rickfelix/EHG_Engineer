---
category: reference
status: approved
version: 1.0.0
author: SD-LEO-INFRA-WORKER-SOURCE-SIDE-001
last_updated: 2026-04-16
tags: [reference, fleet, telemetry, claude-sessions, hooks]
---

# Source-Side Worker Telemetry

Primary liveness signal for the Claude Code fleet. Shipped by **SD-LEO-INFRA-WORKER-SOURCE-SIDE-001** (PR #3108).

## TL;DR

Fleet liveness used to rely on sink-side inference (heartbeat timestamps + marker-file PID checks). Observed false-stale rate hovered near 40%. Workers now **actively report what they are doing, when they expect to next be heard from, and emit an independent 30-second process tick**. The sweep consults these source-side signals before falling back to heartbeat-based stale detection.

**Companion**: SD-LEO-INFRA-FLEET-LIVENESS-MONTE-001 remains as the Bayesian **fallback** for legacy / un-instrumented sessions.

## Signals

All signals live in `public.claude_sessions`. Every reader treats **NULL as "information not available"** and falls back to legacy logic — this is deliberate and makes the migration zero-downtime.

| Column | Type | Written by | Purpose |
|---|---|---|---|
| `current_tool` | TEXT | PreToolUse hook | Which tool the worker is executing right now (`Bash`, `Agent`, `Edit`, ...). Cleared on PostToolUse. |
| `current_tool_args_hash` | TEXT | PreToolUse hook | SHA-256 first-16 of the tool args — audit trail without leaking args. |
| `current_tool_expected_end_at` | TIMESTAMPTZ | PreToolUse hook | `now + tool.timeout + 30s buffer`. Sweep skips release while this is in the future. |
| `last_activity_kind` | TEXT (CHECK) | Pre/PostToolUse hooks | `executing`, `waiting_tool`, `waiting_agent`, `thinking`, `idle`, `exiting`. |
| `commits_since_claim` | INT | PostToolUse hook (throttled 30s) | Git commits on the SD branch since `claimed_at`. |
| `files_modified_since_claim` | INT | PostToolUse hook (throttled 30s) | Files touched since `claimed_at`. |
| `process_alive_at` | TIMESTAMPTZ | `scripts/session-tick.cjs` | Source-side fleet-liveness signal. Refreshed every 30s. Consumed by sweep dashboards. |
| `heartbeat_at` | TIMESTAMPTZ | `scripts/session-tick.cjs` + claim-guard | Claim-TTL authority. `lib/claim-guard.mjs` flags the claim as stale at 300s and releasable at 900s. Refreshed by the tick every 30s alongside `process_alive_at` (since SD-LEO-INFRA-PROTOCOL-ENFORCEMENT-001 FR-4). Before FR-4 the tick updated only `process_alive_at`, leaving long Edit/Write/Read sessions vulnerable to stale-claim cleanup. |
| `expected_silence_until` | TIMESTAMPTZ | PreToolUse hook | Worker-declared silent window. **Hard-capped at 30 minutes** in both hook and sweep. |

## Writers

### PreToolUse — `scripts/hooks/pre-tool-enforce.cjs` (ENFORCEMENT 10)

Runs before every tool call. Uses `scripts/hooks/lib/tool-timeout.cjs` to classify the tool and compute the silence window, then fires a non-blocking PATCH via `scripts/hooks/lib/session-telemetry-writer.cjs`. All errors are swallowed — the hook **never blocks tool execution**.

Tool-timeout rules:
- `Bash` — honors explicit `timeout` arg, defaults to 120s.
- `Agent` / `Task` — defaults to 30 minutes (fleet p95).
- `WebFetch` — defaults to 30 seconds.
- Everything else (`Edit`, `Read`, `Write`, `Glob`, `Grep`, ...) — treated as instant; no silence window is written.

Silence window is only written when the tool is **> 60 seconds**. Below that, the heartbeat is already sufficient and we avoid DB noise.

### PostToolUse — `scripts/hooks/post-tool-clear-telemetry.cjs`

Registered under `PostToolUse` in `.claude/settings.json`. Clears `current_tool`, `current_tool_expected_end_at`, `expected_silence_until`, sets `last_activity_kind='idle'`. On a 30-second throttle (`metadata.last_git_metric_at_ms`) it also runs:

```bash
git log --since="<claimed_at>" --oneline     # commits_since_claim
git log --since="<claimed_at>" --name-only   # unique files → files_modified_since_claim
```

### Background tick — `scripts/session-tick.cjs`

Detached Node process spawned by `scripts/hooks/capture-session-id.cjs` on `SessionStart`:

```javascript
spawn(process.execPath, [tickScript], {
  detached: true,
  stdio: 'ignore',
  env: { ...process.env, CLAUDE_SESSION_ID, CC_PARENT_PID },
  windowsHide: true,
}).unref();
```

The tick:
1. Writes marker at `.claude/pids/tick-<session_id>.json` so sweep can find orphans.
2. Every **30 seconds**: `UPDATE claude_sessions SET process_alive_at = NOW(), heartbeat_at = NOW()` via raw `fetch` (no SDK — keeps cold-start small). Both columns are written from a single `now` timestamp per SD-LEO-INFRA-PROTOCOL-ENFORCEMENT-001 FR-4 so claim-TTL (`heartbeat_at`) and fleet-liveness (`process_alive_at`) stay in lockstep.
3. Every **5 seconds**: `process.kill(CC_PARENT_PID, 0)` — on `ESRCH` it deletes its marker and `process.exit(0)` within seconds of the parent dying.

## Readers

### Sweep — `scripts/stale-session-sweep.cjs`

Decision tree evaluated **before** the existing heartbeat-based stale check:

```
expected_silence_until > now AND delta <= 30m → skip release (log: "silent until X")
process_alive_at > now - 90s                  → skip release (log: "tick alive Ns ago")
current_tool_expected_end_at > now            → skip release (log: "tool X expected until Y")
else                                          → fall through to legacy heartbeat/PID logic
```

The `MARKER FILES (alive)` section in sweep output is replaced with `PROCESS TICKS (fresh)` sourced from `process_alive_at` in the DB. Marker files are still scanned for identity-collision detection (Layer 1), but they are no longer the primary liveness display.

### Dashboard — `scripts/fleet-dashboard.cjs`

Workers table adds two columns:
- **Activity** — `Bash 4m`, `Agent 30m`, `thinking`, `idle`, or blank.
- **Silent until** — `+Nm` when `expected_silence_until` is in the future, `—` otherwise.

`FLEET HEALTH` panel adds a 4-line breakdown of the active sessions:

```
Confirmed alive (tick<90s): N
Recent activity (hb<5m):    N
Expected silent (≤30m):     N
Unknown (no signals):       N
```

## Hard Caps (Defense-in-Depth)

| Cap | Value | Enforced in |
|---|---|---|
| Silence window | 30 minutes | `tool-timeout.cjs` (`clampSilenceMs`) AND `stale-session-sweep.cjs` (`SILENCE_HARD_CAP_MS`) |
| Tick-alive window | 90 seconds | `stale-session-sweep.cjs` (`TICK_ALIVE_WINDOW_MS`) |
| Tick write interval | 30 seconds | `scripts/session-tick.cjs` (`TICK_MS`) |
| Parent-liveness poll interval | 5 seconds | `scripts/session-tick.cjs` (`PARENT_POLL_MS`) |
| Git metric throttle | 30 seconds | `post-tool-clear-telemetry.cjs` (via `metadata.last_git_metric_at_ms`) |
| HTTP fetch timeout | 1500 ms | `session-telemetry-writer.cjs` (`TELEMETRY_FETCH_TIMEOUT_MS`) |

The silence-window cap is **non-configurable per session** to prevent a misconfigured hook from masking a dead worker.

## Backward Compatibility

- All 8 new columns are nullable; the migration adds them non-blocking (`ALTER TABLE ADD COLUMN NULL`).
- All 2 indexes are partial (`WHERE process_alive_at IS NOT NULL`, `WHERE expected_silence_until IS NOT NULL`) and built `CONCURRENTLY`.
- Every reader (`stale-session-sweep.cjs`, `fleet-dashboard.cjs`, post-tool hook) wraps the telemetry query in `try/catch` and falls back to legacy heartbeat/PID logic if any of the new columns are missing, unreachable, or NULL.
- Missing tick process ≠ dead worker. The sweep will simply fall through to heartbeat-based logic as it always did.

## Troubleshooting

### `process_alive_at` never advances
Tick process failed to spawn. Check `.claude/pids/tick-<session_id>.json` — if the file is absent, inspect `SessionStart` hook output for `SessionStart:session-tick: spawn failed`. Common causes: `CC_PARENT_PID` env not set, `scripts/session-tick.cjs` not present at expected path.

### Sweep releases a long-running worker
1. Check `expected_silence_until` was actually written — set `LEO_TELEMETRY_DEBUG=1` and look for `[pre-tool-enforce] telemetry write swallowed: ...` in stderr.
2. Confirm the silence window is within the 30m cap. Windows > 30m are deliberately ignored.
3. Confirm the worker's session row has `CLAUDE_SESSION_ID` set correctly (sweep keys on `session_id`).

### Dashboard Activity column is blank for active workers
Workers that pre-date the migration (or sessions where PreToolUse hook hasn't yet fired) have NULL `current_tool`. This is expected — the column populates on the next tool call.

### Hook latency concerns
Telemetry writes are fire-and-forget via `fetch` with a 1.5-second abort. Measured overhead is well under the 5% p95 budget set in the SD. Enable `LEO_TELEMETRY_DEBUG=1` if you suspect the writer is blocking.

## Related

- **Migration**: `database/migrations/20260416_claude_sessions_source_side_telemetry.sql`
- **SD**: SD-LEO-INFRA-WORKER-SOURCE-SIDE-001
- **PR**: rickfelix/EHG_Engineer#3108 (merged `e8c7b3a1c9`)
- **Companion SD**: SD-LEO-INFRA-FLEET-LIVENESS-MONTE-001 (MC-based fallback)
- **Legacy heartbeat reference**: `docs/reference/heartbeat-manager.md`
- **Schema reference**: `docs/reference/schema/engineer/tables/claude_sessions.md`
